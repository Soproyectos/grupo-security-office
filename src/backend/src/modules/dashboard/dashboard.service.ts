import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  bogotaYearMonth,
  currentMonthRangeBogota,
  periodStartFromString,
} from '../../common/date/month-range-bogota';
import {
  AclService,
  AccessContext,
  LEVEL_RANK,
  ROLE_ASSIGNMENT_PREFIX,
  normalizeLevel,
} from '../../common/acl/acl.service';
import { HierarchyService } from '../../common/hierarchy/hierarchy.service';

export const MY_LISTAS_DEFAULT_TAKE = 12;
export const RECENT_ACTIVITY_TAKE = 10;
export const RECENT_ACTIVITY_WINDOW_DAYS = 30;

export interface MyListaSummary {
  id: string;
  code: string;
  name: string;
  currency: string;
  level: string | null;
  isResponsible: boolean;
  productCount: number;
  updatedAt: Date;
}

export interface MyActivityEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  result: string | null;
  createdAt: Date;
}

export interface MoneyAmount {
  amount: string;
  currency: string;
}

export interface MyCommercialWorkspace {
  /** Meta del mes actual (Bogotá); null si el usuario no tiene meta fijada. */
  target: MoneyAmount | null;
  /** Facturado del mes: pedidos con externalInvoiceNumber registrado este mes. */
  invoiced: MoneyAmount & { mixedCurrency: boolean };
  /** target - invoiced; null cuando no hay meta. */
  remaining: MoneyAmount | null;
  /** Quotes abiertas (enviada/negociacion) en la moneda de referencia. */
  pipeline: { amount: string; count: number };
  myCustomers: { total: number; leads: number; clientes: number };
  myQuotes: {
    borrador: number;
    enviada: number;
    negociacion: number;
    ganada: number;
    perdida: number;
  };
}

export interface TeamMemberSummary {
  userId: string;
  name: string;
  target: MoneyAmount | null;
  invoiced: MoneyAmount & { mixedCurrency: boolean };
  remaining: MoneyAmount | null;
  pipeline: { amount: string; count: number };
  customers: { total: number; leads: number; clientes: number };
  quotesByStatus: Record<string, number>;
}

export interface MyTeamBlock {
  members: TeamMemberSummary[];
  totals: {
    target: MoneyAmount & { mixedCurrency: boolean };
    invoiced: MoneyAmount & { mixedCurrency: boolean };
  };
}

export interface MyWorkspace {
  scope: 'GLOBAL' | 'ASSIGNED';
  kpis: {
    listas: number;
    products: number;
    pendingPublication: number;
    recentActivity: number;
  };
  listas: MyListaSummary[];
  recentActivity: MyActivityEntry[];
  /**
   * Bloque comercial operativo: solo presente para usuarios en scope ASSIGNED
   * (Supervisor/Operador/Consulta). Los admins (Super Admin/Admin Comercial)
   * tienen su dashboard GLOBAL y no reciben este bloque.
   */
  commercial?: MyCommercialWorkspace;
  /**
   * Bloque de equipo del supervisor (issue #27): solo presente cuando el
   * usuario tiene al menos un subordinado (directo o indirecto) en
   * User.supervisorId — independiente del rol o del scope. Cada miembro se
   * resume con EXACTAMENTE las mismas fórmulas del bloque `commercial`, pero
   * agregadas con groupBy/In-arrays sobre todos los subordinados a la vez
   * (sin N+1: getSubordinateIds se resuelve UNA vez por request).
   */
  team?: MyTeamBlock;
}

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private hierarchy: HierarchyService,
  ) {}

  /**
   * Resumen del espacio de trabajo del usuario autenticado, resuelto en una sola
   * llamada HTTP (el dashboard anterior componia varias desde el frontend, patron
   * que ya provoco 429s en el wizard de importacion).
   *
   * El scope depende del rol: `GLOBAL` para admins de Listas (Super Admin y
   * Admin Comercial, que ven todas), `ASSIGNED` para el resto, que solo ve las
   * Listas donde tiene un assignment activo (directo o por rol).
   */
  async getMyWorkspace(
    ctx: AccessContext,
    params: { take?: number } = {},
  ): Promise<MyWorkspace> {
    const take = params.take ?? MY_LISTAS_DEFAULT_TAKE;
    const userId = ctx.userId;
    const allowedListaIds = await this.acl.getAllowedListaIds(
      userId,
      ctx.roles,
      'view',
    );
    const scope: 'GLOBAL' | 'ASSIGNED' =
      allowedListaIds === null ? 'GLOBAL' : 'ASSIGNED';

    // Solo Listas operables: activas y no archivadas (misma regla que el listado
    // de productos, ver FIX-PRODUCTS-ACTIVE-LISTA-FILTER-001).
    const listaWhere = {
      isActive: true,
      archivedAt: null,
      ...(allowedListaIds !== null && { id: { in: allowedListaIds } }),
    };

    const since = new Date(
      Date.now() - RECENT_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    // Sin ninguna Lista accesible no hay nada que agregar sobre el catalogo, pero
    // la actividad del usuario sigue siendo suya: se omiten solo las queries de
    // Listas/productos y se devuelve el resto coherente.
    if (allowedListaIds !== null && allowedListaIds.length === 0) {
      const [recentActivityCount, recentActivity, commercial, team] =
        await Promise.all([
          this.getRecentActivityCount(userId, since),
          this.getRecentActivity(userId),
          this.getCommercialBlock(userId, scope),
          this.getTeamBlock(userId),
        ]);
      return {
        scope,
        kpis: {
          listas: 0,
          products: 0,
          pendingPublication: 0,
          recentActivity: recentActivityCount,
        },
        listas: [],
        recentActivity,
        ...(commercial ? { commercial } : {}),
        ...(team ? { team } : {}),
      };
    }

    const [
      listasCount,
      listas,
      productsCount,
      pendingPublication,
      recentActivityCount,
      recentActivity,
      commercial,
      team,
    ] = await Promise.all([
      this.prisma.lista.count({ where: listaWhere }),
      this.prisma.lista.findMany({
        where: listaWhere,
        orderBy: { updatedAt: 'desc' },
        take,
        select: {
          id: true,
          code: true,
          name: true,
          currency: true,
          responsibleId: true,
          updatedAt: true,
        },
      }),
      this.prisma.product.count({ where: { lista: listaWhere } }),
      this.prisma.product.count({
        where: { lista: listaWhere, isVisible: false },
      }),
      this.getRecentActivityCount(userId, since),
      this.getRecentActivity(userId),
      this.getCommercialBlock(userId, scope),
      this.getTeamBlock(userId),
    ]);

    const listaIds = listas.map((l) => l.id);
    const [counts, levelByLista] = await Promise.all([
      listaIds.length
        ? this.prisma.product.groupBy({
            by: ['listaId'],
            where: { listaId: { in: listaIds } },
            _count: { _all: true },
          })
        : Promise.resolve([] as Array<{ listaId: string | null; _count: { _all: number } }>),
      this.getLevelsForListas(listaIds, ctx),
    ]);

    const countByLista = new Map<string, number>();
    for (const row of counts) {
      if (row.listaId) countByLista.set(row.listaId, row._count._all);
    }

    return {
      scope,
      kpis: {
        listas: listasCount,
        products: productsCount,
        pendingPublication,
        recentActivity: recentActivityCount,
      },
      listas: listas.map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        currency: l.currency,
        level: levelByLista.get(l.id) ?? null,
        isResponsible: !!userId && l.responsibleId === userId,
        productCount: countByLista.get(l.id) ?? 0,
        updatedAt: l.updatedAt,
      })),
      recentActivity,
      ...(commercial ? { commercial } : {}),
      ...(team ? { team } : {}),
    };
  }

  /**
   * Bloque comercial del espacio personal (issue #26): meta del mes, facturado,
   * faltante, pipeline abierto y cartera del usuario. Solo para scope ASSIGNED
   * (roles operativos comerciales) — los admins tienen su dashboard GLOBAL y
   * no reciben este bloque.
   *
   * Sin N+1: una query por dimensión (meta, pedidos del mes, quotes abiertas,
   * groupBy de customers, groupBy de quotes), todo en un solo Promise.all.
   */
  private async getCommercialBlock(
    userId: string | undefined,
    scope: 'GLOBAL' | 'ASSIGNED',
  ): Promise<MyCommercialWorkspace | undefined> {
    if (scope !== 'ASSIGNED' || !userId) return undefined;

    const range = currentMonthRangeBogota();
    const { year, month } = bogotaYearMonth();
    const currentPeriod = periodStartFromString(
      `${year}-${String(month).padStart(2, '0')}`,
    );

    const [target, invoicedOrders, openQuotes, customersByStatus, quotesByStatus] =
      await Promise.all([
        this.prisma.salesTarget.findUnique({
          where: { userId_period: { userId, period: currentPeriod } },
          select: { amount: true, currency: true },
        }),
        this.prisma.salesOrder.findMany({
          where: {
            ownerId: userId,
            externalInvoiceNumber: { not: null },
            externalInvoiceDate: { gte: range.start, lt: range.end },
          },
          select: { total: true, currency: true },
        }),
        this.prisma.quote.findMany({
          where: { ownerId: userId, status: { in: ['enviada', 'negociacion'] } },
          select: { total: true, currency: true },
        }),
        this.prisma.customer.groupBy({
          by: ['status'],
          where: { ownerId: userId },
          _count: { _all: true },
        }),
        this.prisma.quote.groupBy({
          by: ['status'],
          where: { ownerId: userId },
          _count: { _all: true },
        }),
      ]);

    return this.summarizeCommercial({
      target,
      invoicedOrders,
      openQuotes,
      customersByStatus,
      quotesByStatus,
    });
  }

  /**
   * Cálculo puro del bloque commercial a partir de las filas ya traídas de la
   * BD. Lo comparten getCommercialBlock (1 usuario) y getTeamBlock (N
   * subordinados, mismo algoritmo agregado por ownerId) para que el número por
   * miembro del team sea idéntico al que ese comercial vería por su cuenta.
   */
  private summarizeCommercial(rows: {
    target: { amount: { toString(): string }; currency: string } | null;
    invoicedOrders: Array<{
      total: { toString(): string };
      currency: string;
    }>;
    openQuotes: Array<{ total: { toString(): string }; currency: string }>;
    customersByStatus: Array<{ status: string; _count: { _all: number } }>;
    quotesByStatus: Array<{ status: string; _count: { _all: number } }>;
  }): MyCommercialWorkspace {
    const { target, invoicedOrders, openQuotes, customersByStatus, quotesByStatus } =
      rows;

    // Moneda de referencia: la de la meta; si no hay meta, la primera moneda
    // facturada; si no hay nada, COP.
    const refCurrency =
      target?.currency ??
      invoicedOrders[0]?.currency ??
      'COP';

    // JAMÁS sumar monedas distintas: solo se suman montos en la moneda de
    // referencia; si aparece otra, se marca mixedCurrency (decisión issue #26).
    let invoicedTotal = 0;
    let mixedCurrency = false;
    for (const order of invoicedOrders) {
      if (order.currency === refCurrency) {
        invoicedTotal += Number(order.total);
      } else {
        mixedCurrency = true;
      }
    }

    let pipelineAmount = 0;
    let pipelineCount = 0;
    for (const quote of openQuotes) {
      if (quote.currency === refCurrency) {
        pipelineAmount += Number(quote.total);
        pipelineCount += 1;
      }
    }

    const customerCounts = { total: 0, leads: 0, clientes: 0 };
    for (const row of customersByStatus) {
      const n = row._count._all;
      customerCounts.total += n;
      if (row.status === 'LEAD') customerCounts.leads = n;
      else if (row.status === 'CLIENTE') customerCounts.clientes = n;
    }

    const emptyQuotes = {
      borrador: 0,
      enviada: 0,
      negociacion: 0,
      ganada: 0,
      perdida: 0,
    };
    for (const row of quotesByStatus) {
      if (row.status in emptyQuotes) {
        emptyQuotes[row.status as keyof typeof emptyQuotes] = row._count._all;
      }
    }

    const fmt = (n: number): string => n.toFixed(2);

    const invoiced: MyCommercialWorkspace['invoiced'] = {
      amount: fmt(invoicedTotal),
      currency: refCurrency,
      mixedCurrency,
    };
    const targetBlock: MoneyAmount | null = target
      ? { amount: target.amount.toString(), currency: target.currency }
      : null;

    return {
      target: targetBlock,
      invoiced,
      // remaining null sin meta (mes sin meta fijada); con moneda mixta se
      // sigue calculando sobre los montos en la moneda de la meta.
      remaining: target
        ? {
            amount: fmt(Number(target.amount) - invoicedTotal),
            currency: target.currency,
          }
        : null,
      pipeline: { amount: fmt(pipelineAmount), count: pipelineCount },
      myCustomers: customerCounts,
      myQuotes: emptyQuotes,
    };
  }

  /**
   * Bloque team del supervisor (issue #27): resumen agregado de TODOS los
   * subordinados (directos e indirectos, vía User.supervisorId) del usuario,
   * calculando por miembro EXACTAMENTE las mismas fórmulas del bloque
   * `commercial` (reuso de summarizeCommercial).
   *
   * Sin N+1: `getSubordinateIds` se resuelve UNA sola vez por request y todas
   * las consultas operan sobre el conjunto completo con `ownerId: { in: ids }`
   * / `groupBy(['ownerId', ...])` — número FIJO de queries (7) sin importar
   * cuántos subordinados haya. Mismo patrón que getLevelsForListas.
   *
   * Devuelve undefined cuando el usuario no tiene subordinados: el bloque
   * team simplemente no existe para un comercial sin gente a cargo (los
   * tests fijan este comportamiento).
   */
  private async getTeamBlock(
    userId: string | undefined,
  ): Promise<MyTeamBlock | undefined> {
    if (!userId) return undefined;

    const subordinateIds = await this.hierarchy.getSubordinateIds(userId);
    if (subordinateIds.length === 0) return undefined;

    const range = currentMonthRangeBogota();
    const { year, month } = bogotaYearMonth();
    const currentPeriod = periodStartFromString(
      `${year}-${String(month).padStart(2, '0')}`,
    );

    // 7 queries fijas — ninguna por miembro.
    const [users, targets, invoicedOrders, openQuotes, customersByStatus, quotesByStatus] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { id: { in: subordinateIds } },
          select: { id: true, name: true },
        }),
        this.prisma.salesTarget.findMany({
          where: { userId: { in: subordinateIds }, period: currentPeriod },
          select: { userId: true, amount: true, currency: true },
        }),
        this.prisma.salesOrder.findMany({
          where: {
            ownerId: { in: subordinateIds },
            externalInvoiceNumber: { not: null },
            externalInvoiceDate: { gte: range.start, lt: range.end },
          },
          select: { ownerId: true, total: true, currency: true },
        }),
        this.prisma.quote.findMany({
          where: {
            ownerId: { in: subordinateIds },
            status: { in: ['enviada', 'negociacion'] },
          },
          select: { ownerId: true, total: true, currency: true },
        }),
        this.prisma.customer.groupBy({
          by: ['ownerId', 'status'],
          where: { ownerId: { in: subordinateIds } },
          _count: { _all: true },
        }),
        this.prisma.quote.groupBy({
          by: ['ownerId', 'status'],
          where: { ownerId: { in: subordinateIds } },
          _count: { _all: true },
        }),
      ]);

    // Índices en memoria por miembro (reagrupación de las filas traídas).
    const nameByUserId = new Map(users.map((u) => [u.id, u.name]));
    const targetByUserId = new Map(targets.map((t) => [t.userId, t]));

    const invoicedByUserId = new Map<string, typeof invoicedOrders>();
    for (const order of invoicedOrders) {
      const list = invoicedByUserId.get(order.ownerId) ?? [];
      list.push(order);
      invoicedByUserId.set(order.ownerId, list);
    }
    const pipelineByUserId = new Map<string, typeof openQuotes>();
    for (const quote of openQuotes) {
      const list = pipelineByUserId.get(quote.ownerId) ?? [];
      list.push(quote);
      pipelineByUserId.set(quote.ownerId, list);
    }
    const customersByUserId = new Map<string, typeof customersByStatus>();
    for (const row of customersByStatus) {
      const list = customersByUserId.get(row.ownerId) ?? [];
      list.push(row);
      customersByUserId.set(row.ownerId, list);
    }
    const quotesByUserId = new Map<string, typeof quotesByStatus>();
    for (const row of quotesByStatus) {
      const list = quotesByUserId.get(row.ownerId) ?? [];
      list.push(row);
      quotesByUserId.set(row.ownerId, list);
    }

    const computed = new Map<string, MyCommercialWorkspace>();
    const members: TeamMemberSummary[] = [];
    for (const memberId of subordinateIds) {
      const summary = this.summarizeCommercial({
        target: targetByUserId.get(memberId) ?? null,
        invoicedOrders: invoicedByUserId.get(memberId) ?? [],
        openQuotes: pipelineByUserId.get(memberId) ?? [],
        customersByStatus: customersByUserId.get(memberId) ?? [],
        quotesByStatus: quotesByUserId.get(memberId) ?? [],
      });
      computed.set(memberId, summary);

      const quotesByStatusRecord: Record<string, number> = {};
      for (const row of quotesByUserId.get(memberId) ?? []) {
        quotesByStatusRecord[row.status] = row._count._all;
      }

      members.push({
        userId: memberId,
        name: nameByUserId.get(memberId) ?? '',
        target: summary.target,
        invoiced: summary.invoiced,
        remaining: summary.remaining,
        pipeline: summary.pipeline,
        customers: summary.myCustomers,
        quotesByStatus: quotesByStatusRecord,
      });
    }

    // Totales: suma sobre la moneda de referencia del conjunto (la moneda de
    // meta más frecuente; fallback 'COP'), MISMA regla anti cross-currency del
    // bloque commercial: lo que no está en la moneda de referencia NO se suma
    // y se reporta con mixedCurrency: true.
    const currencyCount = new Map<string, number>();
    for (const summary of computed.values()) {
      if (summary.target) {
        currencyCount.set(
          summary.target.currency,
          (currencyCount.get(summary.target.currency) ?? 0) + 1,
        );
      }
    }
    let totalsCurrency = 'COP';
    let best = -1;
    for (const [currency, n] of currencyCount) {
      if (n > best) {
        best = n;
        totalsCurrency = currency;
      }
    }

    let targetTotal = 0;
    let invoicedTotal = 0;
    let targetMixed = false;
    let invoicedMixed = false;
    for (const summary of computed.values()) {
      if (summary.target) {
        if (summary.target.currency === totalsCurrency) {
          targetTotal += Number(summary.target.amount);
        } else {
          targetMixed = true;
        }
      }
      if (summary.invoiced.currency === totalsCurrency) {
        invoicedTotal += Number(summary.invoiced.amount);
      } else {
        invoicedMixed = true;
      }
    }

    const fmt = (n: number): string => n.toFixed(2);

    return {
      members,
      totals: {
        target: {
          amount: fmt(targetTotal),
          currency: totalsCurrency,
          mixedCurrency: targetMixed,
        },
        invoiced: {
          amount: fmt(invoicedTotal),
          currency: totalsCurrency,
          mixedCurrency: invoicedMixed,
        },
      },
    };
  }

  /**
   * Drill-down (issue #27, punto 2 — opción endpoint): el bloque `commercial`
   * EXACTO que el usuario consultado vería en su propio dashboard, accesible
   * solo si la jerarquía lo permite (Super Admin, el propio usuario, o un
   * ancestro directo/indirecto vía assertCanViewUser — 403/404 por el helper).
   * Los member summaries del bloque team quedan resumidos a propósito; el
   * detalle completo por comercial vive solo aquí.
   */
  async getTeamMemberCommercial(
    ctx: AccessContext,
    targetUserId: string,
  ): Promise<MyCommercialWorkspace> {
    await this.hierarchy.assertCanViewUser(ctx, targetUserId);
    // El scope ASSIGNED es una propiedad del caller, no del objetivo: aquí
    // pedimos el bloque del USUARIO OBJETIVO sin importar el scope del viewer.
    const block = await this.getCommercialBlock(targetUserId, 'ASSIGNED');
    if (!block) {
      // Inalcanzable en la práctica (ASSIGNED + userId siempre construyen el
      // bloque), pero el tipo lo exige.
      throw new Error(
        `No se pudo construir el bloque comercial del usuario ${targetUserId}`,
      );
    }
    return block;
  }

  private async getRecentActivityCount(
    userId: string | undefined,
    since: Date,
  ): Promise<number> {
    if (!userId) return 0;
    return this.prisma.auditLog.count({
      where: { userId, createdAt: { gte: since } },
    });
  }

  private async getRecentActivity(
    userId: string | undefined,
  ): Promise<MyActivityEntry[]> {
    if (!userId) return [];
    const logs = await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_ACTIVITY_TAKE,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        result: true,
        createdAt: true,
      },
    });
    return logs;
  }

  /**
   * Mejor nivel efectivo del usuario sobre cada Lista, en una sola query.
   * Los admins de Listas no tienen assignments propios: su nivel efectivo es
   * `manage_access` por rol, no por asignacion.
   */
  private async getLevelsForListas(
    listaIds: string[],
    ctx: AccessContext,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!listaIds.length) return result;

    if (this.acl.isListasAdmin(ctx.roles)) {
      for (const id of listaIds) result.set(id, 'manage_access');
      return result;
    }
    if (!ctx.userId) return result;

    const roleResourceIds = ctx.roles.map(
      (r) => `${ROLE_ASSIGNMENT_PREFIX}${r}`,
    );
    const assignments = await this.prisma.assignment.findMany({
      where: {
        resourceType: 'LISTA',
        isActive: true,
        OR: [
          { userId: ctx.userId, resourceId: { in: listaIds } },
          ...(roleResourceIds.length
            ? [{ resourceId: { in: roleResourceIds } }]
            : []),
        ],
      },
      select: { resourceId: true, level: true },
    });

    // Los grants por rol aplican a toda Lista accesible, no a un resourceId concreto.
    let bestRoleLevel: string | null = null;
    for (const a of assignments) {
      const level = normalizeLevel(a.level);
      if (!level) continue;

      if (a.resourceId.startsWith(ROLE_ASSIGNMENT_PREFIX)) {
        if ((LEVEL_RANK[level] ?? 0) > (LEVEL_RANK[bestRoleLevel ?? ''] ?? -1)) {
          bestRoleLevel = level;
        }
        continue;
      }
      const current = result.get(a.resourceId);
      if (!current || (LEVEL_RANK[level] ?? 0) > (LEVEL_RANK[current] ?? 0)) {
        result.set(a.resourceId, level);
      }
    }

    if (bestRoleLevel) {
      for (const id of listaIds) {
        const current = result.get(id);
        if (
          !current ||
          (LEVEL_RANK[bestRoleLevel] ?? 0) > (LEVEL_RANK[current] ?? 0)
        ) {
          result.set(id, bestRoleLevel);
        }
      }
    }

    return result;
  }
}
