import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessContext } from '../../../common/acl/acl.service';
import { HierarchyService } from '../../../common/hierarchy/hierarchy.service';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import { resolveAccess } from '../../../common/security/data-scope';
import type { AccessIdentity } from '../../../common/security/data-scope';
import { AuditService } from '../../audit/audit.service';
import { SalesOrderQueryDto } from './dto/sales-order-query.dto';
import { UpdateSalesOrderInvoiceDto } from './dto/update-sales-order-invoice.dto';

/** `AccessContext` + `jti` de la sesión viva (alimenta la identidad de `resolveAccess`). */
export type SalesOrdersAccessContext = AccessContext & { jti?: string };

@Injectable()
export class SalesOrdersService {
  constructor(
    private prisma: PrismaService,
    private hierarchy: HierarchyService,
    private audit: AuditService,
    private grants: AccessAssignmentsService,
  ) {}

  /**
   * Decisión sobre una acción de pedidos (`salesOrders:read` / `salesOrders:invoice`) con el
   * alcance concedido (propio / equipo / global). Super Admin conserva su excepción.
   */
  private async decide(
    actionId: string,
    ctx: SalesOrdersAccessContext,
    resource?: { id: string; ownerId: string },
  ) {
    if (!ctx.userId) throw new ForbiddenException('Usuario sin identificar');
    const grants = await this.grants.grantsForUser(ctx.userId);
    const superAdmin = ctx.roles?.includes('Super Admin') === true;
    const identity: AccessIdentity = {
      userId: ctx.userId,
      ...(ctx.jti ? { jti: ctx.jti } : {}),
      verified: true,
      active: true,
      sessionValid: true,
      sessionUserId: ctx.userId,
      superAdmin,
      teamOwnerIds: superAdmin || !grants.some((grant) => grant.scope === 'team')
        ? []
        : await this.hierarchy.getSubordinateIds(ctx.userId),
    };
    return resolveAccess({ identity, actionId, grants, ...(resource ? { resource } : {}) });
  }

  /**
   * Scope de visibilidad derivado de `salesOrders:read`: `null` si ve todo (global) o un
   * WhereInput con ownerId en [self] o [self + subordinados]. 403 sin la acción.
   */
  private async scopeWhere(
    ctx: SalesOrdersAccessContext,
  ): Promise<Prisma.SalesOrderWhereInput | null> {
    const decision = await this.decide('salesOrders:read', ctx);
    if (!decision.allowed) throw new ForbiddenException('Sin permiso salesOrders:read');
    if (decision.scope === 'global') return null;
    if (decision.scope === 'team') {
      const ids = await this.hierarchy.getSubordinateIds(ctx.userId!, { includeSelf: true });
      return { ownerId: { in: ids } };
    }
    return { ownerId: { in: [ctx.userId!] } };
  }

  async findAll(query: SalesOrderQueryDto, ctx: SalesOrdersAccessContext) {
    const { search, customerId, ownerId, skip = 0, take = 50 } = query;

    const and: Prisma.SalesOrderWhereInput[] = [];

    const scope = await this.scopeWhere(ctx);
    if (scope) and.push(scope);
    if (customerId) and.push({ customerId });
    if (ownerId) and.push({ ownerId });
    if (search?.trim()) {
      and.push({ code: { contains: search.trim(), mode: 'insensitive' } });
    }

    const where: Prisma.SalesOrderWhereInput = and.length ? { AND: and } : {};

    const [data, total] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where,
        include: {
          customer: { select: { id: true, code: true, name: true } },
          owner: { select: { id: true, name: true, email: true } },
          quote: { select: { id: true, code: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.salesOrder.count({ where }),
    ]);

    return {
      data,
      meta: { total, skip, take, totalPages: Math.max(1, Math.ceil(total / take)) },
    };
  }

  async findOne(id: string, ctx: SalesOrdersAccessContext) {
    // Sin la acción: 403 antes de consultar (nunca distinto según exista o no el pedido).
    const scope = await this.scopeWhere(ctx);
    const salesOrder = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        quote: {
          select: {
            id: true,
            code: true,
            status: true,
            total: true,
            currency: true,
            items: true,
          },
        },
      },
    });
    if (!salesOrder) throw new NotFoundException('Pedido de venta no encontrado');

    if (scope) {
      const scoped = scope.ownerId as { in: string[] };
      if (!scoped.in.includes(salesOrder.ownerId)) {
        // 404 (no 403) para no revelar existencia fuera del scope.
        throw new NotFoundException('Pedido de venta no encontrado');
      }
    }

    return salesOrder;
  }

  /**
   * Registro manual de la factura externa de Yéminus (número/fecha).
   * No hay integración automática con el ERP: solo se persiste la referencia.
   * Muta campos de negocio ⇒ se audita como `update` (patrón CustomersService).
   */
  async updateInvoice(
    id: string,
    dto: UpdateSalesOrderInvoiceDto,
    ctx: SalesOrdersAccessContext,
  ) {
    // Sin la acción en ningún alcance: 403 antes de tocar el pedido.
    if (!(await this.decide('salesOrders:invoice', ctx)).allowed) {
      throw new ForbiddenException('Sin permiso salesOrders:invoice');
    }
    const existing = await this.findOne(id, ctx); // aplica scope de lectura (404 si fuera de scope)
    // El alcance de `salesOrders:invoice` también limita DE QUIÉN son los pedidos que puede facturar.
    if (!(await this.decide('salesOrders:invoice', ctx, { id, ownerId: existing.ownerId })).allowed) {
      throw new NotFoundException('Pedido de venta no encontrado');
    }

    const updateData: Prisma.SalesOrderUpdateInput = {};
    if (dto.externalInvoiceNumber !== undefined) {
      updateData.externalInvoiceNumber = dto.externalInvoiceNumber;
    }
    if (dto.externalInvoiceDate !== undefined) {
      // Mismo patrón que CustomersService: string ISO 8601 → Date para Prisma.
      updateData.externalInvoiceDate = dto.externalInvoiceDate
        ? new Date(dto.externalInvoiceDate)
        : null;
    }

    const updated = await this.prisma.salesOrder.update({
      where: { id },
      data: updateData,
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'update',
      entity: 'SalesOrder',
      entityId: id,
      oldValues: {
        externalInvoiceNumber: existing.externalInvoiceNumber,
        externalInvoiceDate: existing.externalInvoiceDate,
      },
      newValues: {
        externalInvoiceNumber: updated.externalInvoiceNumber,
        externalInvoiceDate: updated.externalInvoiceDate,
      },
    });

    return updated;
  }
}
