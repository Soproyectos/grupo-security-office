import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { HierarchyService } from '../../../common/hierarchy/hierarchy.service';
import { AuditService } from '../../audit/audit.service';
import { SalesOrderQueryDto } from './dto/sales-order-query.dto';
import { UpdateSalesOrderInvoiceDto } from './dto/update-sales-order-invoice.dto';

@Injectable()
export class SalesOrdersService {
  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private hierarchy: HierarchyService,
    private audit: AuditService,
  ) {}

  /**
   * Scope de visibilidad por jerarquía: `null` para admins (sin filtro) o un
   * WhereInput con ownerId en [self + subordinados] (mismo patrón que Quotes).
   */
  private async scopeWhere(
    ctx: AccessContext,
  ): Promise<Prisma.SalesOrderWhereInput | null> {
    if (this.acl.isListasAdmin(ctx.roles)) return null;
    const ids = ctx.userId
      ? await this.hierarchy.getSubordinateIds(ctx.userId, { includeSelf: true })
      : [];
    return { ownerId: { in: ids } };
  }

  async findAll(query: SalesOrderQueryDto, ctx: AccessContext) {
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

  async findOne(id: string, ctx: AccessContext) {
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

    const scope = await this.scopeWhere(ctx);
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
    ctx: AccessContext,
  ) {
    const existing = await this.findOne(id, ctx); // aplica scope (404 si fuera de scope)

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
