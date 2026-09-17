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
}

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private acl: AclService,
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
      const [recentActivityCount, recentActivity, commercial] =
        await Promise.all([
          this.getRecentActivityCount(userId, since),
          this.getRecentActivity(userId),
          this.getCommercialBlock(userId, scope),
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
