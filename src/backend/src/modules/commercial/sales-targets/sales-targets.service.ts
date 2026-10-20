import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isPersonalSeller } from '../../../common/rbac/personal-seller';
import { ROLE } from '../../../common/rbac/roles.constants';
import { PrismaService } from '../../../prisma/prisma.service';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { HierarchyService } from '../../../common/hierarchy/hierarchy.service';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import { resolveAccess } from '../../../common/security/data-scope';
import type { AccessIdentity } from '../../../common/security/data-scope';
import { AuditService } from '../../audit/audit.service';
import { periodStartFromString } from '../../../common/date/month-range-bogota';
import { SalesTargetQueryDto } from './dto/sales-target-query.dto';
import { UpsertSalesTargetDto } from './dto/upsert-sales-target.dto';

/**
 * Catálogo de monedas admitidas para metas (regla 3, decisión G3): patrón
 * `ALLOWED_CURRENCIES` de `prices.service.ts:10` — no existe catálogo
 * compartido, así que el módulo declara el suyo (COP/USD/EUR).
 */
const ALLOWED_CURRENCIES = ['COP', 'USD', 'EUR'] as const;

/**
 * Contexto de acceso del módulo (patrón COM-02/COM-03): `AccessContext` +
 * `jti` de la sesión viva que Passport atestiguó en ESTA petición y que
 * alimenta `AccessIdentity` de `resolveAccess`.
 */
export type SalesTargetsAccessContext = AccessContext & { jti?: string };

@Injectable()
export class SalesTargetsService {
  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private hierarchy: HierarchyService,
    private audit: AuditService,
    private grants: AccessAssignmentsService,
  ) {}

  /**
   * Lista metas por usuario y rango de periodos `YYYY-MM` (ambos inclusivos).
   *
   * El alcance de lectura procede de la concesión vigente y la jerarquía actual.
   */
  async findAll(query: SalesTargetQueryDto, ctx: SalesTargetsAccessContext) {
    if (!ctx.userId) throw new ForbiddenException('Usuario sin identificar');
    let effectiveUserId = query.userId;
    let userIds: string[] | undefined;
    if (effectiveUserId) {
      await this.assertActionAllowed('targets:read', effectiveUserId, query.from ?? query.to ?? '*', ctx);
    } else {
      const scope = await this.assertActionAllowed('targets:read', ctx.userId, query.from ?? query.to ?? '*', ctx);
      if (scope === 'own') effectiveUserId = ctx.userId;
      if (scope === 'team') userIds = [...new Set([ctx.userId, ...await this.hierarchy.getSubordinateIds(ctx.userId)])];
    }

    const where: Prisma.SalesTargetWhereInput = {};
    if (effectiveUserId) where.userId = effectiveUserId;
    else if (userIds) where.userId = { in: userIds };
    if (query.from || query.to) {
      where.period = {};
      if (query.from) where.period.gte = periodStartFromString(query.from);
      if (query.to) where.period.lte = periodStartFromString(query.to);
    }

    return this.prisma.salesTarget.findMany({
      where,
      orderBy: [{ period: 'desc' }],
      include: {
        user: { select: { id: true, name: true, email: true } },
        setBy: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Fija (upsert) la meta de un usuario para un periodo `YYYY-MM`.
   *
   * Autorización por capas (COM-04 §4, decisión G2 abajo):
   *  1. `targets:edit` + alcance vía `resolveAccess` sobre el dueño de la
   *     meta — «lector no escribe; editor no cambia integrantes ajenos».
   *  2. Team scope se limita a la jerarquía actual; own/global conserva su
   *     alcance declarado por la concesión.
   * Ningún payload inválido o denegado produce fila ni auditoría: validación
   * y autorización ocurren ANTES del `upsert` (§3).
   *
   * Auditoría (§3/G4): solo si la meta CAMBIÓ — una operación confirmada =
   * un evento; el reintento idéntico no duplica auditoría (§5.2).
   */
  async upsert(dto: UpsertSalesTargetDto, ctx: SalesTargetsAccessContext) {
    if (!ctx.userId) throw new ForbiddenException('Usuario sin identificar');

    await this.assertActionAllowed('targets:edit', dto.userId, dto.period, ctx);

    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('amount debe ser un numero >= 0');
    }

    const period = periodStartFromString(dto.period);
    const currency = (dto.currency ?? '').toUpperCase();
    if (!(ALLOWED_CURRENCIES as readonly string[]).includes(currency)) {
      throw new BadRequestException(
        `Moneda no permitida. Use una de: ${ALLOWED_CURRENCIES.join(', ')}`,
      );
    }

    // COM-04 §3: la auditoría antes/después necesita la fila previa; el
    // upsert existente NO se reescribe (regla 1).
    const before = await this.prisma.salesTarget.findUnique({
      where: { userId_period: { userId: dto.userId, period } },
    });

    const result = await this.prisma.salesTarget.upsert({
      where: { userId_period: { userId: dto.userId, period } },
      create: {
        userId: dto.userId,
        period,
        amount,
        currency,
        notes: dto.notes ?? null,
        setById: ctx.userId ?? null,
      },
      update: {
        amount,
        currency,
        notes: dto.notes ?? null,
        setById: ctx.userId ?? null,
      },
    });

    // G4: «solo audita si hubo cambio» — amount/currency/notes son los campos
    // de meta; `setById` solo cambia por quién confirma y NO genera evento.
    // Notas solo como presencia/ausencia (sin contenido, sin PII).
    const notesChanged = (before?.notes ?? null) !== (dto.notes ?? null);
    const changed =
      !before ||
      Number(before.amount) !== amount ||
      before.currency !== currency ||
      notesChanged;

    if (changed) {
      await this.audit.log({
        userId: ctx.userId,
        action: 'target_upsert',
        entity: 'SalesTarget',
        entityId: result.id,
        oldValues: before
          ? { amount: Number(before.amount), currency: before.currency }
          : { amount: null, currency: null },
        newValues: { amount, currency, notesChanged },
      });
    }

    return result;
  }

  /**
   * Decide `targets:read`/`targets:edit` SOBRE la meta con `resolveAccess`
   * (patrón COM-02 §4 `customers.service.ts:395`): identidad de servidor
   * construida aquí (los guards atestiguaron la sesión en ESTA petición),
   * concesiones de `grantsForUser` y alcance `team` cubierto con la
   * jerarquía actual. Sin cobertura → 403 con el motivo del resolver; Super
   * Admin es excepción EXPLÍCITA del propio resolver (auditable).
   *
   * `resource.kind` se OMITE a propósito: el union está cerrado en
   * `data-scope.ts` (fuera del writePath de COM-04) y `kind` solo distingue
   * la excepción de cuenta propia, que NO aplica a metas.
   */
  private async assertActionAllowed(
    actionId: 'targets:read' | 'targets:edit',
    ownerId: string,
    periodLabel: string,
    ctx: SalesTargetsAccessContext,
  ): Promise<'own' | 'team' | 'global'> {
    const superAdmin = ctx.roles.includes(ROLE.SUPER_ADMIN);
    const identity: AccessIdentity = {
      userId: ctx.userId!,
      ...(ctx.jti ? { jti: ctx.jti } : {}),
      verified: true,
      active: true,
      sessionValid: true,
      sessionUserId: ctx.userId!,
      superAdmin,
      // La exención Super Admin no evalúa grants ni alcance: no hace falta
      // consultar la jerarquía.
      teamOwnerIds: superAdmin
        ? []
        : ctx.userId
          ? await this.hierarchy.getSubordinateIds(ctx.userId)
          : [],
    };
    const decision = resolveAccess({
      identity,
      actionId,
      grants: await this.grants.grantsForUser(ctx.userId!),
      resource: { id: `${ownerId}:${periodLabel}`, ownerId },
    });
    if (!decision.allowed) {
      throw new ForbiddenException(
        `Sin permiso ${actionId} sobre esta meta (${decision.reason ?? 'denegado'})`,
      );
    }
    return decision.scope as 'own' | 'team' | 'global';
  }
}
