import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { currentMonthRangeBogota } from '../../common/date/month-range-bogota';

export interface CatalogInsights {
  products: number;
  published: number;
  pendingPublication: number;
  categories: number;
  updatedToday: number;
  missingImages: number;
  latest: Array<{
    id: string;
    sku: string;
    name: string;
    category: string;
    updatedAt: Date;
    lifecycleStatus: string;
    hasImage: boolean;
  }>;
}

export interface UsersInsights {
  total: number;
  active: number;
  byRole: Array<{ role: string; count: number }>;
  recent: Array<{ id: string; name: string; email: string; roles: string[]; isActive: boolean }>;
}

export interface CustomerInsights {
  topCustomers: Array<{
    id: string;
    name: string;
    invoiced: string;
    currency: string;
    orders: number;
  }>;
}

export interface CategorySales {
  categories: Array<{ category: string; amount: string; currency: string; units: number }>;
}

/**
 * Agregados del dashboard que no cubre `getMyWorkspace`.
 *
 * Van en un servicio y un endpoint aparte, no dentro de `/dashboard/me`, porque
 * sólo hacen falta para ciertos bloques: incluirlos en la llamada general
 * costaría estas consultas a todos los usuarios, vean o no esos bloques.
 *
 * Toda cifra sale de la base de datos. Un bloque sin fuente real se declara
 * pendiente en el catálogo del frontend y se muestra como tal; no se rellenan
 * huecos con valores inventados.
 */
@Injectable()
export class DashboardInsightsService {
  constructor(private prisma: PrismaService) {}

  private startOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  async getCatalogInsights(take = 6): Promise<CatalogInsights> {
    const [products, published, pendingPublication, categories, updatedToday, missingImages, latest] =
      await Promise.all([
        this.prisma.product.count(),
        this.prisma.product.count({ where: { lifecycleStatus: 'PUBLISHED' } }),
        this.prisma.product.count({ where: { lifecycleStatus: 'READY' } }),
        this.prisma.category.count(),
        this.prisma.product.count({ where: { updatedAt: { gte: this.startOfToday() } } }),
        this.prisma.product.count({ where: { images: { none: {} } } }),
        this.prisma.product.findMany({
          take,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            sku: true,
            name: true,
            updatedAt: true,
            lifecycleStatus: true,
            category: { select: { name: true } },
            _count: { select: { images: true } },
          },
        }),
      ]);

    return {
      products,
      published,
      pendingPublication,
      categories,
      updatedToday,
      missingImages,
      latest: latest.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category?.name ?? '—',
        updatedAt: p.updatedAt,
        lifecycleStatus: p.lifecycleStatus,
        hasImage: p._count.images > 0,
      })),
    };
  }

  async getUsersInsights(take = 6): Promise<UsersInsights> {
    const [total, active, roles, recent] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.role.findMany({
        select: { name: true, _count: { select: { users: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      }),
    ]);

    return {
      total,
      active,
      byRole: roles.map((r) => ({ role: r.name, count: r._count.users })),
      recent: recent.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        isActive: u.isActive,
        roles: u.roles.map((ur) => ur.role.name),
      })),
    };
  }

  /**
   * Mejores clientes por facturación del mes en curso.
   *
   * `ownerId` acota el resultado al pipeline de un vendedor; omitirlo devuelve
   * el consolidado de la empresa. Es la misma consulta con distinto alcance —
   * exactamente el caso que el compositor del frontend resuelve mostrando un
   * solo bloque con el alcance más amplio.
   */
  async getTopCustomers(opts: { ownerId?: string; take?: number } = {}): Promise<CustomerInsights> {
    const { start, end } = currentMonthRangeBogota();

    const grouped = await this.prisma.salesOrder.groupBy({
      by: ['customerId', 'currency'],
      where: {
        externalInvoiceNumber: { not: null },
        externalInvoiceDate: { gte: start, lt: end },
        ...(opts.ownerId && { ownerId: opts.ownerId }),
      },
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: 'desc' } },
      take: opts.take ?? 5,
    });

    if (grouped.length === 0) return { topCustomers: [] };

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: grouped.map((g) => g.customerId) } },
      select: { id: true, name: true },
    });

    const nameById = new Map(customers.map((c) => [c.id, c.name]));

    return {
      topCustomers: grouped.map((g) => ({
        id: g.customerId,
        name: nameById.get(g.customerId) ?? 'Cliente',
        invoiced: g._sum.total?.toString() ?? '0',
        currency: g.currency,
        orders: g._count._all,
      })),
    };
  }

  /**
   * Ventas del mes por categoría de producto.
   *
   * Se calcula sobre las líneas de las cotizaciones que derivaron en pedido
   * facturado: `SalesOrder` guarda el total pero no su desglose, así que la
   * categoría sólo puede salir de `QuoteItem → Product → Category`.
   */
  async getSalesByCategory(opts: { ownerId?: string } = {}): Promise<CategorySales> {
    const { start, end } = currentMonthRangeBogota();

    const orders = await this.prisma.salesOrder.findMany({
      where: {
        externalInvoiceNumber: { not: null },
        externalInvoiceDate: { gte: start, lt: end },
        ...(opts.ownerId && { ownerId: opts.ownerId }),
      },
      select: { quoteId: true, currency: true },
    });

    if (orders.length === 0) return { categories: [] };

    const items = await this.prisma.quoteItem.findMany({
      where: { quoteId: { in: orders.map((o) => o.quoteId) }, productId: { not: null } },
      select: {
        lineTotal: true,
        quantity: true,
        currency: true,
        product: { select: { category: { select: { name: true } } } },
      },
    });

    const totals = new Map<string, { amount: number; units: number; currency: string }>();

    for (const item of items) {
      const category = item.product?.category?.name ?? 'Sin categoría';
      const current = totals.get(category) ?? { amount: 0, units: 0, currency: item.currency };

      current.amount += Number(item.lineTotal);
      current.units += item.quantity;
      totals.set(category, current);
    }

    return {
      categories: [...totals.entries()]
        .map(([category, v]) => ({
          category,
          amount: v.amount.toFixed(2),
          currency: v.currency,
          units: v.units,
        }))
        .sort((a, b) => Number(b.amount) - Number(a.amount)),
    };
  }
}
