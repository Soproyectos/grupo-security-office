import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { HierarchyService } from '../../../common/hierarchy/hierarchy.service';
import { isPersonalSeller } from '../../../common/rbac/personal-seller';
import { AuditService } from '../../audit/audit.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';

/**
 * Módulo comercial — clientes y leads (mismo registro, distinguidos por
 * `status`). La conversión lead→cliente es una actualización in-place para no
 * romper referencias de cotizaciones creadas sobre el mismo registro.
 *
 * Scoping de acceso:
 * - Super Admin / Admin Comercial (`isListasAdmin`) → ven TODOS los clientes.
 * - Vendedor sin rol de gestión → solo su propia cartera.
 * - Cualquier otro rol → solo clientes cuyo `ownerId` es el propio usuario o
 *   uno de sus subordinados (HierarchyService.getSubordinateIds incluyéndose).
 */
@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private hierarchy: HierarchyService,
    private audit: AuditService,
  ) {}

  /**
   * Condición de visibilidad por jerarquía. Devuelve `null` para admins
   * (sin filtro), cartera propia para Vendedor o jerarquía para los otros roles.
   */
  private async scopeWhere(
    ctx: AccessContext,
  ): Promise<Prisma.CustomerWhereInput | null> {
    if (this.acl.isListasAdmin(ctx.roles)) return null;
    if (isPersonalSeller(ctx.roles)) {
      return { ownerId: { in: ctx.userId ? [ctx.userId] : [] } };
    }
    const ids = ctx.userId
      ? await this.hierarchy.getSubordinateIds(ctx.userId, { includeSelf: true })
      : [];
    return { ownerId: { in: ids } };
  }

  async findAll(query: CustomerQueryDto, ctx: AccessContext) {
    const { search, status, ownerId, skip = 0, take = 50 } = query;

    const and: Prisma.CustomerWhereInput[] = [{ isActive: true }];

    const scope = await this.scopeWhere(ctx);
    if (scope) and.push(scope);
    if (ownerId) and.push({ ownerId });
    if (status) and.push({ status });
    if (search?.trim()) {
      const q = search.trim();
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { documentId: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.CustomerWhereInput = { AND: and };

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data,
      meta: { total, skip, take, totalPages: Math.max(1, Math.ceil(total / take)) },
    };
  }

  async findOne(id: string, ctx: AccessContext) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer || !customer.isActive) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const scope = await this.scopeWhere(ctx);
    if (scope) {
      const scoped = scope.ownerId as { in: string[] };
      if (!customer.ownerId || !scoped.in.includes(customer.ownerId)) {
        // 404 (no 403) para no revelar la existencia del registro fuera de scope.
        throw new NotFoundException('Cliente no encontrado');
      }
    }

    return customer;
  }

  async create(dto: CreateCustomerDto, ctx: AccessContext) {
    this.assertOwnCustomerOwner(dto.ownerId, ctx);
    const data: Prisma.CustomerCreateInput = {
      code: await this.generateCode(),
      name: dto.name.trim(),
      documentType: dto.documentType ?? null,
      documentId: dto.documentId ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      city: dto.city ?? null,
      address: dto.address ?? null,
      status: dto.status ?? 'LEAD',
      source: dto.source ?? null,
      sourceDetail: dto.sourceDetail ?? null,
      notes: dto.notes ?? null,
      owner: dto.ownerId
        ? { connect: { id: dto.ownerId } }
        : ctx.userId
          ? { connect: { id: ctx.userId } }
          : undefined,
      createdBy: ctx.userId ? { connect: { id: ctx.userId } } : undefined,
    };

    let customer;
    try {
      customer = await this.prisma.customer.create({ data });
    } catch (error) {
      this.throwOnUniqueViolation(error);
    }

    await this.audit.log({
      userId: ctx.userId,
      action: 'create',
      entity: 'Customer',
      entityId: customer.id,
      newValues: {
        code: customer.code,
        name: customer.name,
        status: customer.status,
        ownerId: customer.ownerId,
      },
    });

    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, ctx: AccessContext) {
    const existing = await this.findOne(id, ctx);
    this.assertOwnCustomerOwner(dto.ownerId, ctx);

    const data: Prisma.CustomerUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.documentType !== undefined) data.documentType = dto.documentType;
    if (dto.documentId !== undefined) data.documentId = dto.documentId;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.sourceDetail !== undefined) data.sourceDetail = dto.sourceDetail;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.ownerId !== undefined) {
      data.owner = dto.ownerId
        ? { connect: { id: dto.ownerId } }
        : { disconnect: true };
    }
    if (dto.lastContactAt !== undefined) {
      data.lastContactAt = dto.lastContactAt ? new Date(dto.lastContactAt) : null;
    }

    let customer;
    try {
      customer = await this.prisma.customer.update({ where: { id }, data });
    } catch (error) {
      this.throwOnUniqueViolation(error);
    }

    await this.audit.log({
      userId: ctx.userId,
      action: 'update',
      entity: 'Customer',
      entityId: id,
      oldValues: existing,
      newValues: customer,
    });

    return customer;
  }

  /** Conversión MANUAL LEAD → CLIENTE. Marca `convertedAt`. */
  async convert(id: string, ctx: AccessContext) {
    const existing = await this.findOne(id, ctx);
    if (existing.status !== 'LEAD') {
      throw new ConflictException(
        `Solo se puede convertir un lead (status LEAD); status actual: ${existing.status}`,
      );
    }

    const customer = await this.prisma.customer.update({
      where: { id },
      data: { status: 'CLIENTE', convertedAt: new Date() },
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'convert',
      entity: 'Customer',
      entityId: id,
      oldValues: { status: existing.status },
      newValues: { status: customer.status, convertedAt: customer.convertedAt },
    });

    return customer;
  }

  /** Soft delete: isActive = false (nunca borrado físico). */
  async remove(id: string, ctx: AccessContext) {
    const existing = await this.findOne(id, ctx);

    await this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'delete',
      entity: 'Customer',
      entityId: id,
      oldValues: {
        code: existing.code,
        name: existing.name,
        status: existing.status,
        ownerId: existing.ownerId,
      },
    });
  }

  /**
   * Código secuencial CL-0001, CL-0002, ... basado en el último código CL-<num>
   * existente (reintentos ante carrera por unique(code)). Sigue el patrón del
   * generador de PO (módulo suppliers eliminado): prefijo + sufijo calculado.
   */
  private async generateCode(attempt = 0): Promise<string> {
    if (attempt >= 5) {
      return `CL-${Date.now().toString(36).toUpperCase()}`;
    }

    const last = await this.prisma.customer.findFirst({
      where: { code: { startsWith: 'CL-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const lastNum = last?.code ? parseInt(last.code.slice(3), 10) : 0;
    const next = Number.isFinite(lastNum) ? lastNum + 1 : 1;
    const candidate = `CL-${String(next).padStart(4, '0')}`;

    const exists = await this.prisma.customer.findUnique({
      where: { code: candidate },
      select: { id: true },
    });
    if (exists) return this.generateCode(attempt + 1);
    return candidate;
  }

  private assertOwnCustomerOwner(ownerId: string | null | undefined, ctx: AccessContext): void {
    if (isPersonalSeller(ctx.roles) && ownerId !== undefined && ownerId !== ctx.userId) {
      throw new ForbiddenException('Solo puedes gestionar clientes de tu propia cartera');
    }
  }

  private throwOnUniqueViolation(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = (error.meta?.target as string[]) ?? [];
      if (target.includes('documentType') || target.includes('documentId')) {
        throw new ConflictException(
          'Ya existe un cliente/lead con ese tipo y número de documento',
        );
      }
      throw new ConflictException('Conflicto de unicidad');
    }
    throw error;
  }
}
