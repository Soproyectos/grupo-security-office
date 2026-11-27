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
import { CITY_INVALID_MESSAGE, isValidCity } from '../../../common/geo/municipalities';
import { generateCustomerCode } from './customer-code';
import {
  findCustomersByIdentity,
  nitDvForDisplay,
  normalizeDocumentForType,
  normalizeDocumentId,
  normalizeDocumentType,
  normalizeEmail,
} from './customer-identity';

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
      data: data.map((customer) => this.withDocumentDv(customer)),
      meta: { total, skip, take, totalPages: Math.max(1, Math.ceil(total / take)) },
    };
  }

  /** Read-only `documentDv`: NIT verification digit calculated on the fly (never stored); null when not applicable. */
  private withDocumentDv<T extends { documentType?: string | null; documentId?: string | null }>(customer: T): T & { documentDv: number | null } {
    return { ...customer, documentDv: nitDvForDisplay(customer.documentType, customer.documentId) };
  }

  async findOne(id: string, ctx: CustomersAccessContext) {
    return this.withDocumentDv(await this.loadCustomer(id, ctx));
  }

  private async loadCustomer(id: string, ctx: CustomersAccessContext) {
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
    const city = this.normalizeCityForSave(dto.city);
    if (city && !isValidCity(city)) throw this.invalidCity();
    // Same identity rules as the web-account approval: the document is stored normalized (so the base unique
    // protects every spelling) and a document without type is a NIT. A NIT is stored without verification digit.
    const documentType = normalizeDocumentType(dto.documentType, !!normalizeDocumentId(dto.documentId));
    const documentId = this.documentForSave(dto.documentId, documentType) || null;
    const email = normalizeEmail(dto.email) || null;
    await this.assertNoDuplicate({ documentId, email }, ctx);
    const data: Prisma.CustomerCreateInput = {
      code: await generateCustomerCode(this.prisma),
      name: dto.name.trim(),
      documentType,
      documentId,
      email,
      phone: dto.phone ?? null,
      city,
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

    return this.withDocumentDv(customer);
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
    const existing = await this.loadCustomer(id, ctx);
    await this.assertActionAllowed('customers:edit', existing, ctx);

    const data: Prisma.CustomerUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    const changed: { documentId?: string; email?: string } = {};
    if (dto.documentId !== undefined) {
      const documentType = dto.documentType?.trim().toUpperCase() || existing.documentType || 'NIT';
      const documentId = this.documentForSave(dto.documentId, documentType) || null;
      data.documentId = documentId;
      if (documentId) data.documentType = documentType;
      if (documentId && documentId !== normalizeDocumentId(existing.documentId)) changed.documentId = documentId;
    }
    if (dto.documentType !== undefined && dto.documentId === undefined) {
      data.documentType = normalizeDocumentType(dto.documentType, !!existing.documentId);
    }
    if (dto.email !== undefined) {
      const email = normalizeEmail(dto.email) || null;
      data.email = email;
      if (email && email !== normalizeEmail(existing.email)) changed.email = email;
    }
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.city !== undefined) {
      // Old customers keep a free-text city: only a city that actually changes must come from the DIVIPOLA list.
      const city = this.normalizeCityForSave(dto.city);
      if (city !== (existing.city ?? null)) {
        if (city && !isValidCity(city)) throw this.invalidCity();
        data.city = city;
      }
    }
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.sourceDetail !== undefined) data.sourceDetail = dto.sourceDetail;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.lastContactAt !== undefined) {
      data.lastContactAt = dto.lastContactAt ? new Date(dto.lastContactAt) : null;
    }

    await this.assertNoDuplicate(changed, ctx, id);

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

    return this.withDocumentDv(customer);
  }

  /**
   * Reasignación de cartera — endpoint DEDICADO (COM-02 §3): exige la
   * concesión `customers:reassign` (catálogo own|team|global, depende de
   * `customers:read`) resuelta con `resolveAccess` sobre el recurso. Sustituye
   * a la guarda de cartera personal del PATCH general (decisión reportada: la
   * capacidad deja de inferirse del rol WRITE_ROLES y pasa a la concesión;
   * `assertOwnCustomerOwner` se conserva en `create`, donde `ownerId` sigue
   * siendo legal). F6 (pendiente): no admite «sin responsable» — `ownerId` es
   * requerido por el DTO.
   */
  async reassign(id: string, dto: ReassignCustomerDto, ctx: CustomersAccessContext) {
    const existing = await this.loadCustomer(id, ctx); // 404 fuera del scope de lectura
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
    // Own and team scope can only hand the customer to the person or to someone in their team;
    // only global scope can pick anyone.
    if (reassignScope !== 'global' && dto.ownerId !== ctx.userId &&
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

    return this.withDocumentDv(customer);
  }

  /** Conversión MANUAL LEAD → CLIENTE. Marca `convertedAt`. */
  async convert(id: string, ctx: CustomersAccessContext) {
    const existing = await this.loadCustomer(id, ctx);
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

    return this.withDocumentDv(customer);
  }

  /** Soft delete: isActive = false (nunca borrado físico). */
  async remove(id: string, ctx: CustomersAccessContext) {
    const existing = await this.loadCustomer(id, ctx);
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

  private normalizeCityForSave(city: string | undefined | null): string | null {
    return city?.trim() || null;
  }

  /**
   * Document to store for the given type. A NIT is stored as its base number (without verification digit);
   * a typed digit that does not match the calculated one is a 400. No digit typed is never an error, and other
   * document types are not touched.
   */
  private documentForSave(raw: unknown, documentType: string | null): string {
    const { documentId, dvStatus } = normalizeDocumentForType(raw, documentType);
    if (dvStatus === 'invalid') {
      throw new BadRequestException({
        code: 'INVALID_NIT_DV',
        field: 'documentId',
        message: 'El dígito de verificación no coincide con el NIT. Revisa el número.',
      });
    }
    return documentId;
  }

  private invalidCity(): BadRequestException {
    return new BadRequestException({ code: 'INVALID_CITY', message: CITY_INVALID_MESSAGE });
  }

  /**
   * 409 CUSTOMER_DUPLICATE when another customer already has this document or email (any document type,
   * any spelling). The existing customer's id and name go in the body ONLY when the caller may read it
   * (customers:read scope), so the screen can offer to open it; otherwise the message is generic.
   */
  private async assertNoDuplicate(
    identity: { documentId?: string | null; email?: string | null },
    ctx: CustomersAccessContext,
    excludeId?: string,
  ): Promise<void> {
    const matches = await findCustomersByIdentity(this.prisma, {
      documentId: identity.documentId ?? '',
      email: identity.email ?? '',
      excludeId,
    });
    if (!matches.length) return;
    const hit = matches.find((m) => m.byDocument) ?? matches[0];
    const field = hit.byDocument ? 'documentId' : 'email';
    const what = field === 'documentId' ? 'NIT o documento' : 'correo';
    let existing: { id: string; name: string } | undefined;
    if (hit.isActive) {
      const decision = await this.decide('customers:read', ctx, { id: hit.id, kind: 'customer', ownerId: hit.ownerId });
      if (decision.allowed) existing = { id: hit.id, name: hit.name };
    }
    throw new ConflictException({
      code: 'CUSTOMER_DUPLICATE',
      field,
      message: existing
        ? `Ya existe un cliente con ese ${what}. Puedes abrirlo y trabajar sobre él.`
        : `Ya existe un cliente con ese ${what}. Pídele a su responsable que te lo comparta o escribe a tu supervisor.`,
      ...(existing ? { existing } : {}),
    });
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
        throw new ConflictException({
          code: 'CUSTOMER_DUPLICATE',
          field: 'documentId',
          message: 'Ya existe un cliente con ese NIT o documento. Pídele a su responsable que te lo comparta o escribe a tu supervisor.',
        });
      }
      throw new ConflictException('Conflicto de unicidad');
    }
    throw error;
  }
}
