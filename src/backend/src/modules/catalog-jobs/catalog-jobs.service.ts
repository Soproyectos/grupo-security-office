/**
 * CAT-07 — Trabajos persistidos e historial por recurso.
 *
 * Contrato COMÚN en PostgreSQL (diseño :314 sin broker externo):
 *  * `enqueue` valida la acción SUBYACENTE del kind y materializa las unidades
 *    DENTRO del alcance (caso 3: cubre todo lo autorizado, más allá de la
 *    página visible); `retryKey` deduplica reintentos (:339).
 *  * El trabajador reclama con `FOR UPDATE SKIP LOCKED` + arriendo temporal
 *    (:343): si el proceso muere, el lease vence y OTRO tick reanuda desde el
 *    `checkpoint`; una unidad `DONE` no se procesa dos veces y los contadores
 *    del resumen se DERIVAN de las unidades (caso 1).
 *  * Los permisos se re-verifican AL EJECUTAR, no solo al encolar (regla 3):
 *    revocada la acción, el trabajo queda `CANCELLED (permission-revoked)` y
 *    no ejecuta más unidades (caso 2); el trabajo ajeno devuelve 404 sin
 *    revelar existencia.
 *  * `VALIDATION_SCAN` reutiliza el motor CAT-05 (`validation.runFresh`) —
 *    ninguna regla duplicada.
 */
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AclService } from '../../common/acl/acl.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { concessionCanAction } from '../../common/security/d5-action';
import { ProductValidationService } from '../products/validation/validation.service';

export type JobKind = 'VALIDATION_SCAN' | 'EXPORT_BUNDLE'

/** Acción subyacente que gobierna cada kind (regla: permisos al ejecutar). */
const KIND_ACTION: Record<JobKind, string> = {
  VALIDATION_SCAN: 'products:validate',
  EXPORT_BUNDLE: 'prices:preview', // CAT-08 lo hará explícito; reservado sin consumidor
}

const UNIT_CAP = 5000
const LEASE_MINUTES = 2

export interface EnqueueDto {
  kind: string
  scope: { mode: 'ids'; ids: string[] } | { mode: 'filters'; listaId?: string; search?: string; lifecycleStatus?: string }
  retryKey?: string
}

export interface JobView {
  id: string
  kind: string
  state: string
  progressDone: number
  progressTotal: number
  error: string | null
  resultSummary: unknown
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
  mine: boolean
}

@Injectable()
export class CatalogJobsService {
  private readonly logger = new Logger(CatalogJobsService.name)
  /** Lock anti-solape del tick (patrón products.scheduler). */
  private ticking = false

  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private grants: AccessAssignmentsService,
    private validation: ProductValidationService,
  ) {}

  // ─── Encolado ──────────────────────────────────────────────────────────────

  async enqueue(dto: EnqueueDto, ctx: { userId: string; roles: string[] }): Promise<{ job: JobView; reused: boolean }> {
    const kind = dto.kind as JobKind
    if (!KIND_ACTION[kind]) throw new BadRequestException('kind de trabajo no reconocido')
    // Regla 1/3: gobernar por la acción SUBYACENTE del kind (con D5); sin acción, ni encolar.
    if (!(await concessionCanAction(this.grants, KIND_ACTION[kind], ctx)).allowed) {
      throw new ForbiddenException(`Sin permiso ${KIND_ACTION[kind]} para este trabajo`)
    }

    // Dedupe por clave de reintento (mismo kind+actor+retryKey → el existente).
    if (dto.retryKey) {
      const existing = await this.prisma.catalogJob.findFirst({
        where: { kind, actorId: ctx.userId, retryKey: dto.retryKey },
        orderBy: { createdAt: 'desc' },
      })
      if (existing) return { job: await this.viewOf(existing, ctx), reused: true }
    }

    const unitIds = await this.resolveUnits(dto.scope, ctx)
    if (unitIds.length === 0) throw new BadRequestException('El alcance no produjo unidades autorizadas')

    const job = await this.prisma.catalogJob.create({
      data: {
        kind,
        actorId: ctx.userId,
        scope: dto.scope as object,
        progressTotal: unitIds.length,
        retryKey: dto.retryKey ?? null,
        units: { create: unitIds.map((unitId) => ({ unitId })) },
      },
    })
    return { job: await this.viewOf(job, ctx), reused: false }
  }

  /** Unidades DENTRO del alcance, sin tope de página (caso 3). */
  private async resolveUnits(scope: EnqueueDto['scope'], ctx: { userId: string; roles: string[] }): Promise<string[]> {
    if (scope.mode === 'ids') {
      const ids = [...new Set(scope.ids ?? [])].slice(0, UNIT_CAP)
      const out: string[] = []
      for (const id of ids) {
        try {
          await this.acl.assertProductAccess(id, ctx, 'view')
          out.push(id)
        } catch {
          /* fuera de alcance: se omite sin revelar (misma semántica del batch) */
        }
      }
      return out
    }
    const listaIds = await this.acl.getAllowedListaIds(ctx.userId, ctx.roles, 'view')
    const where: Record<string, unknown> = { lifecycleStatus: { not: 'ARCHIVED' } }
    if (listaIds !== null) where.listaId = { in: listaIds }
    if (scope.listaId) where.listaId = listaIds === null || listaIds.includes(scope.listaId) ? scope.listaId : { in: [] }
    if (scope.lifecycleStatus) where.lifecycleStatus = scope.lifecycleStatus
    if (scope.search) {
      where.OR = [
        { sku: { contains: scope.search, mode: 'insensitive' } },
        { name: { contains: scope.search, mode: 'insensitive' } },
        { catalogName: { contains: scope.search, mode: 'insensitive' } },
      ]
    }
    const rows = await this.prisma.product.findMany({ where: where as never, select: { id: true }, take: UNIT_CAP })
    return rows.map((r) => r.id)
  }

  // ─── Trabajador (tick) ─────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      for (let i = 0; i < 5; i++) {
        const claimed = await this.claimNext()
        if (!claimed) break
        await this.process(claimed).catch((error) => {
          this.logger.warn(`[catalog-jobs] job ${claimed.id} falló: ${error instanceof Error ? error.message : 'error'}`)
        })
      }
    } finally {
      this.ticking = false
    }
  }

  /** Reclamo atómico con arriendo; un lease vencido (proceso muerto) se re-clama y reanuda. */
  async claimNext(): Promise<{ id: string; kind: string; actorId: string; attempt: number; maxAttempts: number; checkpoint: unknown } | null> {
    const leaseUntil = new Date(Date.now() + LEASE_MINUTES * 60_000)
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE catalog_jobs
      SET state = 'RUNNING',
          "leaseUntil" = ${leaseUntil},
          attempt = attempt + 1,
          "startedAt" = COALESCE("startedAt", now()),
          "updatedAt" = now()
      WHERE id IN (
        SELECT id FROM catalog_jobs
        WHERE (state = 'QUEUED' OR (state = 'RUNNING' AND "leaseUntil" < now()))
          AND "cancelRequested" = false
        ORDER BY "createdAt"
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `
    const id = rows[0]?.id
    if (!id) return null
    const job = await this.prisma.catalogJob.findUnique({
      where: { id },
      select: { id: true, kind: true, actorId: true, attempt: true, maxAttempts: true, checkpoint: true },
    })
    return job ?? null
  }

  /** Procesa un trabajo reclamado desde su checkpoint. */
  async process(job: { id: string; kind: string; actorId: string; attempt: number; maxAttempts: number; checkpoint: unknown }): Promise<void> {
    try {
      // Regla 3 / caso 2: PERMISOS AL EJECUTAR — re-verificar la acción del kind.
      const actor = await this.loadActor(job.actorId)
      if (!actor) {
        await this.finish(job.id, 'CANCELLED', { error: 'actor-inactive' })
        return
      }
      if (!(await concessionCanAction(this.grants, KIND_ACTION[job.kind as JobKind], actor)).allowed) {
        await this.finish(job.id, 'CANCELLED', { error: 'permission-revoked' })
        return
      }

      const handler = this.handlerFor(job.kind)
      let processed = 0
      for (;;) {
        // Cancelación cooperativa entre unidades.
        const flag = await this.prisma.catalogJob.findUnique({ where: { id: job.id }, select: { cancelRequested: true } })
        if (flag?.cancelRequested) {
          await this.finish(job.id, 'CANCELLED', { error: 'cancelled-by-user' })
          return
        }
        const unit = await this.prisma.catalogJobUnit.findFirst({
          where: { jobId: job.id, state: 'PENDING' },
          orderBy: { unitId: 'asc' },
        })
        if (!unit) break
        let state = 'DONE'
        let error: string | null = null
        try {
          const authorized = await this.unitAuthorized(unit.unitId, actor)
          if (!authorized) state = 'OMITTED'
          else await handler(unit.unitId)
        } catch (e) {
          state = 'FAILED'
          error = e instanceof Error ? e.message.slice(0, 300) : 'error'
        }
        await this.prisma.$transaction([
          this.prisma.catalogJobUnit.update({ where: { jobId_unitId: { jobId: job.id, unitId: unit.unitId } }, data: { state, error, attempts: { increment: 1 } } }),
          this.prisma.catalogJob.update({
            where: { id: job.id },
            // El checkpoint (cursor) y el progreso se persisten JUNTO a la unidad:
            // tras un crash, lo DONE no se repite (caso 1).
            data: { checkpoint: { lastUnitId: unit.unitId }, leaseUntil: new Date(Date.now() + LEASE_MINUTES * 60_000) },
          }),
        ])
        processed++
        if (processed % 25 === 0) {
          const done = await this.prisma.catalogJobUnit.count({ where: { jobId: job.id, state: { not: 'PENDING' } } })
          await this.prisma.catalogJob.update({ where: { id: job.id }, data: { progressDone: done } })
        }
      }

      const counts = await this.prisma.catalogJobUnit.groupBy({ by: ['state'], where: { jobId: job.id }, _count: { _all: true } })
      const tally = Object.fromEntries(counts.map((c) => [c.state, c._count._all]))
      const summary = {
        examined: (tally.DONE ?? 0) + (tally.OMITTED ?? 0) + (tally.FAILED ?? 0),
        valid: (tally.DONE ?? 0) + (tally.OMITTED ?? 0) === 0 ? 0 : await this.countValid(job.id),
        withErrors: await this.countErrors(job.id),
        omitted: tally.OMITTED ?? 0,
        failed: tally.FAILED ?? 0,
      }
      const done = await this.prisma.catalogJobUnit.count({ where: { jobId: job.id, state: { not: 'PENDING' } } })
      await this.finish(job.id, (tally.FAILED ?? 0) > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED', { resultSummary: summary, progressDone: done })
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : 'error interno'
      if (job.attempt >= job.maxAttempts) {
        await this.finish(job.id, 'FAILED', { error: `agotados ${job.maxAttempts} intentos: ${message}` })
      } else {
        // Vuelve a la cola con el checkpoint a salvo: el retry continúa, no reinicia.
        await this.prisma.catalogJob.update({
          where: { id: job.id },
          data: { state: 'QUEUED', leaseUntil: null, error: `reintento tras ${message}`.slice(0, 300) },
        })
      }
    }
  }

  /** Primer consumidor: escaneo de validación con el motor CAT-05 intacto. */
  private handlerFor(kind: string): (unitId: string) => Promise<unknown> {
    if (kind === 'VALIDATION_SCAN') {
      // runFresh persiste el informe en la revisión de trabajo: re-ejecutar la
      // misma unidad tras un crash solo re-escribe el mismo informe (idempotente).
      return async (unitId) => {
        const exists = await this.prisma.product.findUnique({ where: { id: unitId }, select: { id: true } })
        if (!exists) throw new Error('producto inexistente al ejecutar')
        await this.validation.runFresh(unitId)
      }
    }
    // EXPORT_BUNDLE (CAT-08) no tiene consumidor todavía: fallar claro, nunca colar en silencio.
    return async () => {
      throw new Error('kind reservado sin implementador (CAT-08)')
    }
  }

  /** ACL por unidad al ejecutar (la lista del producto pudo cambiar desde el encolado). */
  private async unitAuthorized(productId: string, actor: { userId: string; roles: string[] }): Promise<boolean> {
    try {
      await this.acl.assertProductAccess(productId, actor, 'view')
      return true
    } catch {
      return false
    }
  }

  private async loadActor(userId: string): Promise<{ userId: string; roles: string[] } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, roles: { select: { role: { select: { name: true } } } } },
    })
    if (!user || !user.isActive) return null
    return { userId: user.id, roles: (user.roles ?? []).map((r) => r.role.name).filter(Boolean) }
  }

  private async countValid(jobId: string): Promise<number> {
    // Mismo criterio que el batch: la revisión de trabajo con status LISTA.
    const units = await this.prisma.catalogJobUnit.findMany({ where: { jobId, state: 'DONE' }, select: { unitId: true } })
    if (units.length === 0) return 0
    const rows = await this.prisma.productRevision.findMany({
      where: { productId: { in: units.map((u) => u.unitId) }, status: { not: 'PUBLICADA' as never }, validatedAt: { not: null } },
      select: { productId: true, status: true },
      orderBy: { version: 'desc' },
    })
    const latest = new Map<string, string>()
    for (const r of rows) if (!latest.has(r.productId)) latest.set(r.productId, r.status)
    let n = 0
    for (const s of latest.values()) if (s === 'LISTA_PARA_PUBLICAR') n++
    return n
  }

  private async countErrors(jobId: string): Promise<number> {
    const units = await this.prisma.catalogJobUnit.findMany({ where: { jobId, state: 'DONE' }, select: { unitId: true } })
    let withErr = 0
    for (const u of units) {
      const rev = await this.prisma.productRevision.findFirst({
        where: { productId: u.unitId, validatedAt: { not: null } },
        orderBy: { validatedAt: 'desc' },
        select: { status: true },
      })
      if (rev?.status === 'CON_PROBLEMAS') withErr++
    }
    return withErr
  }

  private async finish(id: string, state: string, extra: Record<string, unknown>): Promise<void> {
    await this.prisma.catalogJob.update({
      where: { id },
      data: { state, leaseUntil: null, finishedAt: new Date(), ...extra },
    })
  }

  // ─── Lectura / cancelación (dueño o admin; ajeno = 404 sin revelar) ──────

  private async viewOf(job: {
    id: string; kind: string; state: string; progressDone: number; progressTotal: number
    error: string | null; resultSummary: unknown; createdAt: Date; startedAt: Date | null; finishedAt: Date | null; actorId: string
  }, ctx: { userId: string; roles: string[] }): Promise<JobView> {
    return {
      id: job.id, kind: job.kind, state: job.state, progressDone: job.progressDone, progressTotal: job.progressTotal,
      error: job.error ?? null, resultSummary: job.resultSummary ?? null, createdAt: job.createdAt,
      startedAt: job.startedAt, finishedAt: job.finishedAt, mine: job.actorId === ctx.userId,
    }
  }

  private async ownedOrAdmin(id: string, ctx: { userId: string; roles: string[] }) {
    const job = await this.prisma.catalogJob.findUnique({ where: { id } })
    // Trabajo ajeno: 404 idéntico al inexistente — no revela existencia (caso 2).
    if (!job || (job.actorId !== ctx.userId && !this.acl.isListasAdmin(ctx.roles))) {
      throw new NotFoundException('Trabajo no encontrado')
    }
    return job
  }

  async get(id: string, ctx: { userId: string; roles: string[] }): Promise<JobView> {
    return this.viewOf(await this.ownedOrAdmin(id, ctx), ctx)
  }

  async listMine(ctx: { userId: string; roles: string[] }): Promise<JobView[]> {
    const where = this.acl.isListasAdmin(ctx.roles) ? {} : { actorId: ctx.userId }
    const jobs = await this.prisma.catalogJob.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 })
    return Promise.all(jobs.map((j) => this.viewOf(j, ctx)))
  }

  async cancel(id: string, ctx: { userId: string; roles: string[] }): Promise<JobView> {
    const job = await this.ownedOrAdmin(id, ctx)
    if (['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'].includes(job.state)) {
      throw new ConflictException({ code: 'job-state-conflict', message: 'El trabajo ya terminó; nada que cancelar.' })
    }
    if (job.state === 'QUEUED') {
      const updated = await this.prisma.catalogJob.update({ where: { id }, data: { state: 'CANCELLED', finishedAt: new Date(), error: 'cancelled-by-user' } })
      return this.viewOf(updated, ctx)
    }
    const updated = await this.prisma.catalogJob.update({ where: { id }, data: { cancelRequested: true } })
    return this.viewOf(updated, ctx)
  }

  /** Historial de un RECURSO: qué trabajos le tocaron, sin acceso global a auditoría. */
  async historyForProduct(productId: string, ctx: { userId: string; roles: string[] }) {
    await this.acl.assertProductAccess(productId, ctx, 'view')
    const units = await this.prisma.catalogJobUnit.findMany({
      where: { unitId: productId },
      include: { job: { select: { id: true, kind: true, state: true, createdAt: true, actorId: true } } },
      orderBy: { job: { createdAt: 'desc' } },
      take: 50,
    })
    const admin = this.acl.isListasAdmin(ctx.roles)
    return units.map((u) => ({
      jobId: u.job.id,
      kind: u.job.kind,
      jobState: u.job.state,
      unitState: u.state,
      error: admin ? u.error ?? null : null,
      at: u.job.createdAt,
    }))
  }
}
