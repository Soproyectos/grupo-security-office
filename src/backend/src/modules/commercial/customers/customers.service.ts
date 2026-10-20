import {
  BadRequestException,
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { HierarchyService } from '../../../common/hierarchy/hierarchy.service';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import { resolveAccess } from '../../../common/security/data-scope';
import type { AccessIdentity } from '../../../common/security/data-scope';
import { AuditService } from '../../audit/audit.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ReassignCustomerDto } from './dto/reassign-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';

/**
 * Contexto de acceso del módulo: `AccessContext` + `jti` de la sesión viva
 * (Passport ya la atestiguó en esta petición; alimenta `AccessIdentity` de
 * `resolveAccess`, patrón workflow.service.ts:55-63).
 */
export type CustomersAccessContext = AccessContext & { jti?: string };

/** Campos de contacto cuyo VALOR nunca se copia a auditoría (COM-02 §3 F4,
 * PANELES:48): solo se registra el metadato de que cambiaron. */
const AUDIT_PII_FIELDS = ['email', 'phone', 'address', 'notes', 'documentId'] as const;
/** Campos no sensibles de la edición general: se auditan por valor, pero solo
 * cuando realmente cambiaron (patrón selectivo de create/delete). */
const AUDIT_VALUE_FIELDS = [
  'name',
  'documentType',
  'city',
  'source',
  'sourceDetail',
  'lastContactAt',
] as const;

/**
 * Módulo comercial — clientes y leads (mismo registro, distinguidos por
 * `status`). La conversión lead→cliente es una actualización in-place para no
 * romper referencias de cotizaciones creadas sobre el mismo registro.
 *
 * El cargo no otorga acciones: cada llamada consulta grants vigentes y aplica
 * el alcance propio/equipo/global mediante resolveAccess.
 */
@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private hierarchy: HierarchyService,
    private audit: AuditService,
    private grants: AccessAssignmentsService,
  ) {}

  /**
   * Condición de visibilidad derivada del grant customers:read.
   */
  private async identity(ctx: CustomersAccessContext, grants: Awaited<ReturnType<AccessAssignmentsService['grantsForUser']>>): Promise<AccessIdentity> {
    if (!ctx.userId) throw new ForbiddenException('Usuario sin identificar');
    return { userId: ctx.userId, ...(ctx.jti ? { jti: ctx.jti } : {}), verified: true,
      active: true, sessionValid: true, sessionUserId: ctx.userId,
      superAdmin: ctx.roles.includes('Super Admin'),
      teamOwnerIds: ctx.roles.includes('Super Admin') || !grants.some((grant) => grant.scope === 'team')
        ? [] : await this.hierarchy.getSubordinateIds(ctx.userId) };
  }

  private async decide(actionId: string, ctx: CustomersAccessContext, resource?: {id:string; kind:'customer'; ownerId?:string|null}) {
    const grants = await this.grants.grantsForUser(ctx.userId!);
    return resolveAccess({ identity: await this.identity(ctx, grants), actionId, grants,
      ...(resource ? { resource: { ...resource, ownerId: resource.ownerId ?? undefined } } : {}) });
  }

  private async scopeWhere(ctx: CustomersAccessContext): Promise<Prisma.CustomerWhereInput> {
    const decision = await this.decide('customers:read', ctx);
    if (!decision.allowed) throw new ForbiddenException('Sin permiso customers:read');
    if (decision.scope === 'global') return {};
    if (decision.scope === 'team') return { ownerId: { in: [...new Set([ctx.userId!, ...(await this.hierarchy.getSubordinateIds(ctx.userId!))])] } };
    return { ownerId: ctx.userId };
  }

  async findAll(query: CustomerQueryDto, ctx: CustomersAccessContext) {
    const { search, status, ownerId, skip = 0, take = 50 } = query;

    const and: Prisma.CustomerWhereInput[] = [{ isActive: true }];

    const scope = await this.scopeWhere(ctx);
    if (Object.keys(scope).length > 0) and.push(scope);
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

  async findOne(id: string, ctx: CustomersAccessContext) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer || !customer.isActive) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const decision = await this.decide('customers:read', ctx as CustomersAccessContext, {id, kind:'customer', ownerId:customer.ownerId});
    if (!decision.allowed) {
      // 404 para no revelar la existencia fuera de alcance.
      throw new NotFoundException('Cliente no encontrado');
    }

    return customer;
  }

  async create(dto: CreateCustomerDto, ctx: CustomersAccessContext) {
    const decision = await this.decide('customers:create', ctx as CustomersAccessContext);
    if (!decision.allowed) throw new ForbiddenException('Sin permiso customers:create');
    if (decision.scope === 'own' && dto.ownerId && dto.ownerId !== ctx.userId) throw new ForbiddenException('Alcance propio');
    if (decision.scope === 'team' && dto.ownerId && dto.ownerId !== ctx.userId && !(await this.hierarchy.getSubordinateIds(ctx.userId!).then(ids=>ids.includes(dto.ownerId!)))) throw new ForbiddenException('Fuera del equipo');
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

  /**
   * Edición GENERAL de contacto/notas (COM-02 §3). Orden de validación:
   * (1) guarda preexistente de cartera personal (§6, solo vendedor);
   * (2) campos prohibidos `ownerId`/`status`/`isActive` → 400 rechazando la
   *     petición ENTERA, antes de leer o escribir (§5.1 «sin cambio parcial»;
   *   en HTTP el ValidationPipe ya la rechaza con el mismo código);
   * (3) 404 si el cliente está fuera del alcance de LECTURA;
   * (4) `customers:edit` por CONCESIÓN sobre el recurso (§4): leer el equipo
   *     no concede editar el equipo.
   */
  async update(id: string, dto: UpdateCustomerDto, ctx: CustomersAccessContext) {
    this.assertGeneralEditOnlyFields(dto);
    const existing = await this.findOne(id, ctx);
    await this.assertActionAllowed('customers:edit', existing, ctx);

    const data: Prisma.CustomerUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.documentType !== undefined) data.documentType = dto.documentType;
    if (dto.documentId !== undefined) data.documentId = dto.documentId;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.sourceDetail !== undefined) data.sourceDetail = dto.sourceDetail;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.lastContactAt !== undefined) {
      data.lastContactAt = dto.lastContactAt ? new Date(dto.lastContactAt) : null;
    }

    let customer;
    try {
      customer = await this.prisma.customer.update({ where: { id }, data });
    } catch (error) {
      this.throwOnUniqueViolation(error);
    }

    // Auditoría selectiva SIN PII por valor (§3, F4): solo campos cambiados;
    // email/phone/address/notes/documentId únicamente como metadato.
    const { oldValues, newValues } = this.updateAuditTrail(existing, customer, dto);
    await this.audit.log({
      userId: ctx.userId,
      action: 'update',
      entity: 'Customer',
      entityId: id,
      oldValues,
      newValues,
    });

    return customer;
  }

  /**
   * Reasignación de cartera — endpoint DEDICADO (COM-02 §3): exige la
   * concesión `customers:reassign` (catálogo team|global, depende de
   * `customers:read`) resuelta con `resolveAccess` sobre el recurso. Sustituye
   * a la guarda de cartera personal del PATCH general (decisión reportada: la
   * capacidad deja de inferirse del rol WRITE_ROLES y pasa a la concesión;
   * `assertOwnCustomerOwner` se conserva en `create`, donde `ownerId` sigue
   * siendo legal). F6 (pendiente): no admite «sin responsable» — `ownerId` es
   * requerido por el DTO.
   */
  async reassign(id: string, dto: ReassignCustomerDto, ctx: CustomersAccessContext) {
    const existing = await this.findOne(id, ctx); // 404 fuera del scope de lectura
    const reassignScope = await this.assertActionAllowed('customers:reassign', existing, ctx); // 403 sin cobertura

    const newOwner = await this.prisma.user.findUnique({
      where: { id: dto.ownerId },
      select: { id: true, isActive: true },
    });
    if (!newOwner || !newOwner.isActive) {
      throw new BadRequestException(
        'owner-not-found: el nuevo responsable no existe o está inactivo',
      );
    }
    if (reassignScope === 'team' && dto.ownerId !== ctx.userId &&
        !(await this.hierarchy.getSubordinateIds(ctx.userId!).then((ids) => ids.includes(dto.ownerId)))) {
      throw new ForbiddenException('El nuevo responsable está fuera de tu equipo');
    }

    const customer = await this.prisma.customer.update({
      where: { id },
      data: { owner: { connect: { id: dto.ownerId } } },
    });

    // Trazabilidad (§5.3): actor, antes/después de ownerId y motivo. Selectiva
    // por diseño — NUNCA contactos ni notas del cliente (F4 / PANELES:48).
    await this.audit.log({
      userId: ctx.userId,
      action: 'reassign',
      entity: 'Customer',
      entityId: id,
      oldValues: { ownerId: existing.ownerId },
      newValues: {
        ownerId: customer.ownerId,
        ...(dto.motivo ? { motivo: dto.motivo } : {}),
      },
    });

    return customer;
  }

  /** Conversión MANUAL LEAD → CLIENTE. Marca `convertedAt`. */
  async convert(id: string, ctx: CustomersAccessContext) {
    const existing = await this.findOne(id, ctx);
    await this.assertActionAllowed('customers:edit', existing, ctx as CustomersAccessContext);
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
  async remove(id: string, ctx: CustomersAccessContext) {
    const existing = await this.findOne(id, ctx);
    await this.assertActionAllowed('customers:edit', existing, ctx as CustomersAccessContext);

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

  /** Campos prohibidos en la edición GENERAL (COM-02 §5.1): la petición se
   *  rechaza ENTERA con 400 — ni una escritura parcial. En HTTP el
   *  ValidationPipe ya la rechaza con el mismo código (update-customer.dto);
   *  esta guarda protege también las llamadas internas al servicio. */
  private assertGeneralEditOnlyFields(dto: UpdateCustomerDto): void {
    if (dto.ownerId !== undefined) {
      throw new BadRequestException(
        'owner-not-allowed-in-general-edit: use PATCH /:id/reassign (customers:reassign)',
      );
    }
    if (dto.status !== undefined) {
      throw new BadRequestException(
        'status-not-allowed-in-general-edit: use PATCH /:id/convert o DELETE (soft delete)',
      );
    }
    if (dto.isActive !== undefined) {
      throw new BadRequestException('isActive-not-allowed-in-general-edit');
    }
  }

  /**
   * Decide `customers:edit`/`customers:reassign` SOBRE el recurso con
   * `resolveAccess` (COM-02 §4; patrón workflow.service.ts:55-63): la
   * identidad se construye en servidor (los guards atestiguaron la sesión en
   * ESTA petición), las concesiones salen de `grantsForUser` y el alcance
   * `team` se cubre con la jerarquía actual (`HierarchyService`). Sin
   * cobertura → 403 con el motivo del resolver; no se inventa ningún permiso
   * global — Super Admin es excepción EXPLÍCITA del propio resolver.
   */
  private async assertActionAllowed(
    actionId: 'customers:edit' | 'customers:reassign',
    customer: { id: string; ownerId: string | null },
    ctx: CustomersAccessContext,
  ): Promise<'own' | 'team' | 'global'> {
    const grants = await this.grants.grantsForUser(ctx.userId!);
    const decision = resolveAccess({
      identity: await this.identity(ctx, grants),
      actionId,
      grants,
      resource: { id: customer.id, kind: 'customer', ownerId: customer.ownerId ?? undefined },
    });
    if (!decision.allowed) {
      throw new ForbiddenException(
        `Sin permiso ${actionId} sobre este cliente (${decision.reason ?? 'denegado'})`,
      );
    }
    return decision.scope === 'global' || decision.scope === 'team' ? decision.scope : 'own';
  }

  /** Auditoría selectiva de un update (COM-02 §3, F4): solo los campos que
   *  realmente cambiaron; los PII (email/phone/address/notes/documentId)
   *  únicamente como metadato `changedPiiFields` — su valor NUNCA se copia a
   *  AuditLog (PANELES:48 «sin copias innecesarias de datos personales»). */
  private updateAuditTrail(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    dto: UpdateCustomerDto,
  ): { oldValues: Record<string, unknown>; newValues: Record<string, unknown> } {
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    const changedPii: string[] = [];
    for (const field of AUDIT_VALUE_FIELDS) {
      if (dto[field] !== undefined && String(before[field] ?? '') !== String(after[field] ?? '')) {
        oldValues[field] = before[field] ?? null;
        newValues[field] = after[field] ?? null;
      }
    }
    for (const field of AUDIT_PII_FIELDS) {
      if (dto[field] !== undefined && String(before[field] ?? '') !== String(after[field] ?? '')) {
        changedPii.push(field); // solo metadato: jamás el valor
      }
    }
    if (changedPii.length) {
      oldValues.changedPiiFields = changedPii;
      newValues.changedPiiFields = changedPii;
    }
    return { oldValues, newValues };
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
