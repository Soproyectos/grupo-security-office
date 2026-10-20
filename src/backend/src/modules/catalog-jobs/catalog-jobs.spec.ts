/**
 * CAT-07 — Trabajos persistidos: contrato común en PostgreSQL.
 *
 * Aceptaciones de la ficha que acreditan estas pruebas (idénticas en backend):
 *   1. «Reinicio recupera checkpoint; mismo item/operación no duplica cambios
 *      ni conteos.»  → reclamo con lease, re-clamo tras lease vencido, unidades
 *      DONE no se reprocesan, resumen DERIVADO de unidades.
 *   2. «Revocar mientras espera impide ejecución; trabajo ajeno no revela
 *      datos.»       → re-verificación de permisos AL ejecutar (no al encolar);
 *      lectura/cancel de trabajo ajeno = 404 idéntico al inexistente.
 *   3. «Selección por filtro cubre todo lo autorizado más allá de la página
 *      visible.»     → resolveUnits(mode:'filters') con alcance real (lista).
 *
 * Ejecuta contra PostgreSQL DESECHABLE `grupo_security_tanda_t07` con
 * DATABASE_URL INLINE (nunca `.env`, que apunta a Neon de PRODUCCIÓN):
 *
 *   docker exec gs-tanda-db psql -U postgres -d postgres \
 *     -c "CREATE DATABASE grupo_security_tanda_t07;"
 *   DATABASE_URL='postgresql://postgres:tanda-test-2026@localhost:54331/grupo_security_tanda_t07?schema=public' \
 *     npx prisma migrate deploy --schema prisma/schema.prisma
 *
 * Fixtures 100 % ficticias con prefijo `t07-spec-`. El test de SKIP LOCKED usa
 * DOS conexiones reales a la misma BD (un mock no ejerce bloqueos).
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AclService } from '../../common/acl/acl.service';


import { ProductRevisionsService } from '../products/product-revisions.service';
import { ProductValidationService } from '../products/validation/validation.service';
import { CatalogJobsService } from './catalog-jobs.service';

jest.setTimeout(180_000);

const DATABASE_URL =
  'postgresql://postgres:tanda-test-2026@localhost:54331/grupo_security_tanda_t07?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
// Segunda conexión REAL: ejerce el SKIP LOCKED de verdad (caso de dos workers).
const prisma2 = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

let seq = 0
const next = () => (seq += 1)

type Ctx = { userId: string; roles: string[] }
let admin: Ctx
let vendedor: Ctx
let listaOwned = ''
let listaAjena = ''
let prodA = ''
let prodB = ''
let prodAjeno = ''
let accessSourceId = ''

const grantsStub = { grantsForUser: jest.fn().mockResolvedValue([]) }

function buildService(client: PrismaClient): CatalogJobsService {
  const acl = new AclService(client as never)
  const revisions = new ProductRevisionsService(client as never, acl as never)
  const validation = new ProductValidationService(client as never, acl as never, grantsStub as never, revisions as never)
  return new CatalogJobsService(client as never, acl as never, grantsStub as never, validation as never)
}

const service = buildService(prisma)
const worker2 = buildService(prisma2)

async function seed() {
  const cat = await prisma.category.create({ data: { name: `t07-cat-${next()}`, slug: `t07-cat-${next()}` } })
  const brand = await prisma.brand.create({ data: { name: `t07-brand-${next()}`, slug: `t07-brand-${next()}` } })
  const l1 = await prisma.lista.create({ data: { code: `T07L${next()}`, name: 't07-spec-lista', isActive: true } })
  const l2 = await prisma.lista.create({ data: { code: `T07L${next()}`, name: 't07-spec-ajena', isActive: true } })
  listaOwned = l1.id
  listaAjena = l2.id
  const mk = async (listaId: string) =>
    (await prisma.product.create({ data: { sku: `T07P${next()}`, name: `t07-spec-producto-${next()}`, categoryId: cat.id, brandId: brand.id, listaId, lifecycleStatus: 'DRAFT', isActive: true, isVisible: false } })).id
  prodA = await mk(l1.id)
  prodB = await mk(l1.id)
  prodAjeno = await mk(l2.id)
  // Roles REALES: process() recarga las del usuario (loadActor); sin ellos el
  // ACL no reconocería al admin. upsert idempotente (t07 es limpia).
  const sa = await prisma.role.upsert({ where: { name: 'Super Admin' }, create: { name: 'Super Admin' }, update: {} })
  const vd = await prisma.role.upsert({ where: { name: 'Vendedor' }, create: { name: 'Vendedor' }, update: {} })
  const u = await prisma.user.create({ data: { email: `t07-admin-${next()}@example.test`, name: 't07 admin', password: 'x', roles: { create: [{ roleId: sa.id }] } } })
  const v = await prisma.user.create({ data: { email: `t07-vend-${next()}@example.test`, name: 't07 vendedor', password: 'x', roles: { create: [{ roleId: vd.id }] } } })
  // Vendedor con acceso de lectura a su lista (assignment real del ACL):
  await prisma.assignment.create({ data: { userId: v.id, resourceType: 'LISTA', resourceId: l1.id, level: 'view' } })
  await prisma.accessState.create({ data: { userId: v.id } })
  const source = await prisma.accessSource.create({ data: {
    userId: v.id, kind: 'manual', catalogVersion: 'panels-20261019-3',
    grantedById: u.id, reason: 'fixture t07',
  } })
  accessSourceId = source.id
  await prisma.accessGrant.createMany({ data: ['listas:read', 'products:read'].map((actionId) => ({
    sourceId: source.id, actionId, scopeKind: 'list', resourceId: l1.id,
  })) })
  admin = { userId: u.id, roles: ['Super Admin'] }
  vendedor = { userId: v.id, roles: ['Vendedor'] }
}

async function cleanupJobs() {
  const jobs = await prisma.catalogJob.findMany({ select: { id: true } })
  if (jobs.length) {
    await prisma.catalogJobUnit.deleteMany({ where: { jobId: { in: jobs.map((j) => j.id) } } })
    await prisma.catalogJob.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } })
  }
}

/** Re-crea prodA si un test previo lo eliminó (los tests comparten el seed). */
async function ensureProdA() {
  if (prodA && (await prisma.product.findUnique({ where: { id: prodA }, select: { id: true } }))) return
  const cat = await prisma.category.findFirst({ where: { slug: { startsWith: 't07-cat-' } } })
  const brand = await prisma.brand.findFirst({ where: { slug: { startsWith: 't07-brand-' } } })
  prodA = (await prisma.product.create({ data: { sku: `T07P${next()}`, name: 't07-spec-prodA2', categoryId: cat!.id, brandId: brand!.id, listaId: listaOwned, lifecycleStatus: 'DRAFT', isActive: true, isVisible: false } })).id
}

async function cleanFixtures() {
  await cleanupJobs()
  const prods = await prisma.product.findMany({ where: { sku: { startsWith: 'T07P' } }, select: { id: true } })
  if (prods.length) {
    const ids = prods.map((p) => p.id)
    await prisma.productRevision.deleteMany({ where: { productId: { in: ids } } })
    await prisma.productCatalogResource.deleteMany({ where: { productId: { in: ids } } })
    await prisma.productCatalogSpecGroup.deleteMany({ where: { productId: { in: ids } } }).catch(() => undefined)
    await prisma.productImage.deleteMany({ where: { productId: { in: ids } } })
    await prisma.stock.deleteMany({ where: { productId: { in: ids } } })
    await prisma.price.deleteMany({ where: { productId: { in: ids } } })
    await prisma.publicationEvent.deleteMany({ where: { productId: { in: ids } } })
    await prisma.product.deleteMany({ where: { id: { in: ids } } })
  }
  await prisma.lista.deleteMany({ where: { code: { startsWith: 'T07L' } } })
  const users = await prisma.user.findMany({ where: { email: { startsWith: 't07-' } }, select: { id: true } })
  if (users.length) {
    const uids = users.map((u) => u.id)
    await prisma.userRole.deleteMany({ where: { userId: { in: uids } } })
    await prisma.assignment.deleteMany({ where: { userId: { in: uids } } })
    await prisma.accessGrant.deleteMany({ where: { source: { userId: { in: uids } } } })
    await prisma.accessSource.deleteMany({ where: { userId: { in: uids } } })
    await prisma.accessState.deleteMany({ where: { userId: { in: uids } } })
    await prisma.auditLog.deleteMany({ where: { userId: { in: uids } } })
    await prisma.user.deleteMany({ where: { id: { in: uids } } })
  }
  await prisma.category.deleteMany({ where: { slug: { startsWith: 't07-cat-' } } })
  await prisma.brand.deleteMany({ where: { slug: { startsWith: 't07-brand-' } } })
}

beforeAll(async () => {
  await prisma.$connect()
  const check = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`
  if (check[0]?.db !== 'grupo_security_tanda_t07') {
    throw new Error(`GUARD: spec requiere grupo_security_tanda_t07, conectado a ${check[0]?.db}`)
  }
  await cleanFixtures()
  await seed()
})

afterAll(async () => {
  await cleanFixtures()
  await prisma.$disconnect()
  await prisma2.$disconnect()
})

beforeEach(async () => {
  grantsStub.grantsForUser.mockResolvedValue([])
  await cleanupJobs()
})

// ─── ENCOLADO / ALCANCE / DEDUPE ─────────────────────────────────────────────

describe('enqueue (regla 1: permisos al encolar por la accion subyacente; dedupe por retryKey)', () => {
  it('ids: materializa SOLO las unidades autorizadas (sin tope de pagina)', async () => {
    const r = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA, prodB, prodAjeno] } } as never, admin)
    expect(r.reused).toBe(false)
    expect(r.job.progressTotal).toBe(3)
    const units = await prisma.catalogJobUnit.findMany({ where: { jobId: r.job.id }, orderBy: { unitId: 'asc' } })
    // Super Admin → todo autorizado; la lista ajena TAMPOCO se oculta (es admin).
    expect(units.map((u) => u.state)).toEqual(expect.arrayContaining(['PENDING', 'PENDING', 'PENDING']))
  })

  it('un no-admin solo encola lo de su alcance (caso 3: cubre TODO lo autorizado)', async () => {
    grantsStub.grantsForUser.mockResolvedValue([{ sourceId: 's1', actionId: 'prices:read', scope: 'global' }])
    // Con grants de otra accion → sin products:validate: encolar se niega (403).
    await expect(service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA] } } as never, vendedor)).rejects.toBeInstanceOf(ForbiddenException)
    grantsStub.grantsForUser.mockResolvedValue([
      { sourceId: 's1', actionId: 'products:validate', scope: 'global' },
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
    ]) // ENMIENDA: sin concesiones el rol ya no autoriza (se prueba arriba el 403)
    const r = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'filters', listaId: listaOwned } } as never, vendedor)
    expect(r.job.progressTotal).toBe(2) // sus dos productos
    const units = await prisma.catalogJobUnit.findMany({ where: { jobId: r.job.id } })
    expect(units.map((u) => u.unitId).sort()).toEqual([prodA, prodB].sort())
  })

  it('retryKey: reencolar lo mismo devuelve el trabajo existente (nunca un duplicado)', async () => {
    const first = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA] }, retryKey: 't07-k1' } as never, admin)
    const second = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA] }, retryKey: 't07-k1' } as never, admin)
    expect(second.reused).toBe(true)
    expect(second.job.id).toBe(first.job.id)
    expect(await prisma.catalogJob.count({ where: { retryKey: 't07-k1' } })).toBe(1)
  })

  it('kind desconocido o alcance sin unidades → 400', async () => {
    await expect(service.enqueue({ kind: 'NO_EXISTE', scope: { mode: 'ids', ids: [prodA] } } as never, admin)).rejects.toThrow(/kind/)
    await expect(service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [] } } as never, admin)).rejects.toThrow(/unidades/)
  })
})

// ─── CASO 1: CHECKPOINT, LEASE, REANUDACIÓN ──────────────────────────────────

describe('caso 1 — reinicio recupera checkpoint; la misma unidad no se procesa dos veces', () => {
  it('claim atómico con SKIP LOCKED: dos workers NO reclaman el mismo trabajo', async () => {
    await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA, prodB] } } as never, admin)
    const [a, b] = await Promise.all([service.claimNext(), worker2.claimNext()])
    expect(a).not.toBeNull()
    expect(b).toBeNull() // el segundo worker espera: el lease protege la exclusión
    const job = await prisma.catalogJob.findFirst()
    expect(job?.state).toBe('RUNNING')
    expect(job?.attempt).toBe(1)
    expect(job?.leaseUntil).toBeInstanceOf(Date)
  })

  it('lease vencido (proceso muerto) → otro tick re-clama y REANUDA desde checkpoint sin repetir unidades', async () => {
    const enq = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA, prodB] } } as never, admin)
    const jobId = enq.job.id
    // Simula crash tras procesar prodA: unidad DONE + lease vencido + RUNNING.
    await prisma.catalogJobUnit.update({ where: { jobId_unitId: { jobId, unitId: prodA } }, data: { state: 'DONE' } })
    await prisma.catalogJob.update({ where: { id: jobId }, data: { state: 'RUNNING', leaseUntil: new Date(Date.now() - 60_000), checkpoint: { lastUnitId: prodA }, progressDone: 1 } })

    const spy = jest.spyOn(prisma.catalogJobUnit, 'update')
    const claimed = await service.claimNext()
    expect(claimed?.id).toBe(jobId)
    expect(claimed?.attempt).toBe(1) // attempt ya era 0 +1 en el reclamo
    await service.process(claimed!)

    const job = await prisma.catalogJob.findUnique({ where: { id: jobId } })
    expect(job?.state).toBe('COMPLETED')
    expect(job?.progressDone).toBe(2) // DERIVADO de unidades, no doble-contado
    // prodA (ya DONE) NO fue re-procesada: la unica escritura de unidad es prodB.
    const touched = spy.mock.calls.map((c) => (c[0] as { where: { jobId_unitId: { unitId: string } } }).where.jobId_unitId.unitId)
    expect(touched).toEqual([prodB])
    spy.mockRestore()
  })

  it('resumen con contadores DERIVADOS: examined coincide con unidades marcadas', async () => {
    const enq = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA, prodB] } } as never, admin)
    const claimed = await service.claimNext()
    expect(claimed?.id).toBe(enq.job.id)
    await service.process(claimed!)
    const job = await prisma.catalogJob.findUnique({ where: { id: enq.job.id } })
    const summary = job?.resultSummary as { examined: number; failed: number; omitted: number }
    expect(summary.examined).toBe(2)
    expect(summary.failed).toBe(0)
    expect(summary.omitted).toBe(0)
  })
})

// ─── CASO 2: PERMISOS AL EJECUTAR Y TRABAJO AJENO ────────────────────────────

describe('caso 2 — revocar impide ejecutar; el trabajo ajeno no revela existencia', () => {
  it('acción revocada con unidades pendientes → CANCELLED(permission-revoked), cero ejecución', async () => {
    // Encola un Vendedor CON la acción vigente… y antes de ejecutar, sus grants
    // quedan SIN products:validate (revocación real mientras espera).
    grantsStub.grantsForUser.mockResolvedValue([
      { sourceId: 's1', actionId: 'products:validate', scope: 'global' },
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
    ])
    const enq = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA] } } as never, vendedor)
    grantsStub.grantsForUser.mockResolvedValue([]); // revocacion TOTAL, misma identidad
    const claimed = await service.claimNext();
    await service.process(claimed!);
    const job = await prisma.catalogJob.findUnique({ where: { id: enq.job.id } });
    expect(job?.state).toBe('CANCELLED');
    expect(job?.error).toBe('permission-revoked');
    const pend = await prisma.catalogJobUnit.count({ where: { jobId: enq.job.id, state: 'PENDING' } })
    expect(pend).toBe(1) // NO ejecutó ninguna unidad
  })

  it('actor inexistente/inactivo al ejecutar → CANCELLED actor-inactive', async () => {
    const enq = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA] } } as never, admin)
    await prisma.catalogJob.update({ where: { id: enq.job.id }, data: { actorId: 'no-existe-usuario' } })
    const claimed = await service.claimNext()
    await service.process(claimed!)
    const job = await prisma.catalogJob.findUnique({ where: { id: enq.job.id } })
    expect(job?.state).toBe('CANCELLED')
    expect(job?.error).toBe('actor-inactive')
  })

  it('lectura/cancel de trabajo AJENO = 404 idéntico al inexistente (no revela)', async () => {
    const enq = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA] } } as never, admin)
    await expect(service.get(enq.job.id, vendedor)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.cancel(enq.job.id, vendedor)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.get('inexistente-id', admin)).rejects.toBeInstanceOf(NotFoundException)
    // Dueño sí puede:
    expect((await service.get(enq.job.id, admin)).kind).toBe('VALIDATION_SCAN')
  })

  it('cancelar QUEUED es inmediato; RUNNING es cooperativo; terminal es 409', async () => {
    const a = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA] } } as never, admin)
    expect((await service.cancel(a.job.id, admin)).state).toBe('CANCELLED')
    await expect(service.cancel(a.job.id, admin)).rejects.toBeInstanceOf(ConflictException)

    const b = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodB] } } as never, admin)
    await service.claimNext() // RUNNING
    const c = await service.cancel(b.job.id, admin)
    expect(c.state).toBe('RUNNING') // cooperativo: cancelRequested
    const raw = await prisma.catalogJob.findUnique({ where: { id: b.job.id }, select: { cancelRequested: true } })
    expect(raw?.cancelRequested).toBe(true)
  })
})

// ─── UNIDADES OMITTED + HISTORIAL POR RECURSO ────────────────────────────────

describe('unidades fuera de alcance al ejecutar → OMITTED; historial por recurso', () => {
  it('producto desaparecido entre encolado y ejecución → unidad OMITTED (ocultar, no revelar)', async () => {
    const enq = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA] } } as never, admin)
    // El producto deja de existir: el re-check por unidad lo oculta sin error.
    await prisma.product.delete({ where: { id: prodA } })
    prodA = ''
    const claimed = await service.claimNext()
    await service.process(claimed!)
    const unit = await prisma.catalogJobUnit.findFirst({ where: { jobId: enq.job.id } })
    expect(unit?.state).toBe('OMITTED')
    const job = await prisma.catalogJob.findUnique({ where: { id: enq.job.id } })
    const summary = job?.resultSummary as { omitted: number; failed: number }
    expect(summary.omitted).toBe(1)
    expect(summary.failed).toBe(0)
    expect(job?.state).toBe('COMPLETED')
  })

  it('kind EXPORT_BUNDLE sin implementador (CAT-08) → unidad FAILED explícita, nunca encolado en silencio', async () => {
    await ensureProdA()
    const enq = await service.enqueue({ kind: 'EXPORT_BUNDLE', scope: { mode: 'ids', ids: [prodA] } } as never, admin)
    const claimed = await service.claimNext()
    await service.process(claimed!)
    const unit = await prisma.catalogJobUnit.findFirst({ where: { jobId: enq.job.id } })
    expect(unit?.state).toBe('FAILED')
    expect(unit?.error).toContain('reservado')
    const job = await prisma.catalogJob.findUnique({ where: { id: enq.job.id } })
    expect(job?.state).toBe('COMPLETED_WITH_ERRORS')
  })

  it('alcance caído entre encolado y ejecución → unidad OMITTED sin revelar (re-check por unidad)', async () => {
    await ensureProdA()
    grantsStub.grantsForUser.mockResolvedValue([
      { sourceId: 's1', actionId: 'products:validate', scope: 'global' },
      { sourceId: 's1', actionId: 'products:read', scope: 'global' },
    ])
    const enq = await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA] } } as never, vendedor)
    // El admin le retira el grant de vista mientras espera (la acción del
    // kind sigue vigente → el re-check POR UNIDAD es el que debe omitirla).
    await prisma.accessGrant.deleteMany({ where: { sourceId: accessSourceId, actionId: 'products:read' } })
    const claimed = await service.claimNext()
    await service.process(claimed!)
    const unit = await prisma.catalogJobUnit.findFirst({ where: { jobId: enq.job.id } })
    expect(unit?.state).toBe('OMITTED')
    const job = await prisma.catalogJob.findUnique({ where: { id: enq.job.id } })
    const summary = job?.resultSummary as { omitted: number; failed: number }
    expect(summary.omitted).toBe(1)
    expect(summary.failed).toBe(0)
    expect(job?.state).toBe('COMPLETED')
    // Devuelve la concesión para los tests siguientes (historial).
    await prisma.accessGrant.create({ data: { sourceId: accessSourceId, actionId: 'products:read', scopeKind: 'list', resourceId: listaOwned } })
  })

  it('GET job-history de un recurso: muestra trabajos y estados SIN exponer errores a no-admin', async () => {
    // Requiere un producto vivo: recreate prodA si fue borrado.
    if (!prodA) {
      const cat = await prisma.category.findFirst({ where: { slug: { startsWith: 't07-cat-' } } })
      const brand = await prisma.brand.findFirst({ where: { slug: { startsWith: 't07-brand-' } } })
      prodA = (await prisma.product.create({ data: { sku: `T07P${next()}`, name: 't07-spec-prodA2', categoryId: cat!.id, brandId: brand!.id, listaId: listaOwned, lifecycleStatus: 'DRAFT', isActive: true, isVisible: false } })).id
    }
    await service.enqueue({ kind: 'VALIDATION_SCAN', scope: { mode: 'ids', ids: [prodA] } } as never, admin)
    const claimed = await service.claimNext()
    await service.process(claimed!)
    const asAdmin = await service.historyForProduct(prodA, admin)
    expect(asAdmin.length).toBeGreaterThanOrEqual(1)
    expect(asAdmin[0].kind).toBe('VALIDATION_SCAN')
    const asVend = await service.historyForProduct(prodA, vendedor)
    expect(asVend.length).toBeGreaterThanOrEqual(1)
    expect(asVend[0].error).toBeNull() // errores solo a la vista de administradores
  })
})
