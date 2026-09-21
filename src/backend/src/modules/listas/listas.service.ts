import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AclService, AccessContext, LEVEL_RANK } from '../../common/acl/acl.service';
import { AuditService } from '../audit/audit.service';
import { CreateListaDto } from './dto/create-lista.dto';
import { UpdateListaDto } from './dto/update-lista.dto';
import { DeleteListaDto } from './dto/delete-lista.dto';
import { FilesService } from '../files/files.service';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ListasService {
  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private audit: AuditService,
    private files: FilesService,
  ) {}

  /** Lista de Listas autorizadas (deny-by-default). */
  async findAll(ctx: AccessContext, params?: { isActive?: boolean; includeExpired?: boolean }) {
    const allowed = await this.acl.getAllowedListaIds(ctx.userId, ctx.roles, 'view');

    const where: {
      isActive?: boolean;
      id?: { in: string[] };
      OR?: Array<{ validUntil: null } | { validUntil: { gte: Date } }>;
    } = {
      ...(params?.isActive !== undefined && { isActive: params.isActive }),
      // deny-by-default: usuario no-admin sin assignments → id: { in: [] } (0 resultados).
      // Super Admin: allowed === null → sin filtro de id (ve todo).
      ...(allowed !== null && { id: { in: allowed.length ? allowed : [] } }),
    };

    // Decisión documentada (OLA 6): el frontend actual NO espera filtrado por vencimiento
    // en el listado, por lo que POR DEFECTO se devuelven TODAS las Listas (incluidas las
    // vencidas) para no romper el consumo existente. El filtrado de vencidas se deja como
    // opción explícita (includeExpired: false) y NO se activa por defecto. Se conservan las
    // Listas sin validUntil (no tienen vigencia → no están vencidas).
    if (params?.includeExpired === false) {
      where.OR = [{ validUntil: null }, { validUntil: { gte: new Date() } }];
    }

    const listas = await this.prisma.lista.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      data: listas.map((l) => ({
        ...l,
        productCount: l._count.products,
        ...this.computeExpiry(l.validUntil),
      })),
    };
  }

  /** Detalle de Lista (deny-by-default; admin ve incluso inactivas/archivadas). */
  async findOne(id: string, ctx: AccessContext) {
    await this.acl.assertListaAccess(id, ctx, 'view');
    const lista = await this.prisma.lista.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!lista) throw new NotFoundException('Lista no encontrada');
    return {
      ...lista,
      productCount: lista._count.products,
      ...this.computeExpiry(lista.validUntil),
    };
  }

  /** Productos de una Lista (scoped + deny-by-default). */
  async findProducts(
    id: string,
    ctx: AccessContext,
    params?: { search?: string; categoryId?: string; isActive?: boolean; isVisible?: boolean },
  ) {
    await this.acl.assertListaAccess(id, ctx, 'view');

    const where: Record<string, unknown> = { listaId: id };
    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { sku: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params?.categoryId) where.categoryId = params.categoryId;
    if (params?.isActive !== undefined) where.isActive = params.isActive;
    if (params?.isVisible !== undefined) where.isVisible = params.isVisible;

    // Niveles (checklist 29/30): view ve la Lista SIN precios; los precios solo se
    // incluyen si el usuario tiene edit_prices o superior sobre la Lista.
    const canSeePrices = await this.userCanSeePrices(id, ctx);

    const include: Record<string, unknown> = {
      category: { select: { id: true, name: true, slug: true } },
      brand: { select: { id: true, name: true, slug: true } },
      images: { where: { isPrimary: true }, take: 1 },
    };
    if (canSeePrices) {
      include.prices = { include: { priceList: true } };
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data: products, meta: { total } };
  }

  /** Precios de productos de una Lista (scoped + deny-by-default; exige view_prices). */
  async findPrices(id: string, ctx: AccessContext) {
    await this.acl.assertListaAccess(id, ctx, 'view_prices');

    const prices = await this.prisma.price.findMany({
      where: { product: { listaId: id } },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        priceList: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: prices };
  }

  /**
   * Precios de una Lista próximos a vencer (scoped + deny-by-default).
   * Solo precios con validUntil dentro de [now, now + days]; devuelve cada uno
   * con `daysRemaining` (ceil). El interceptor global envuelve la respuesta en `{ data }`.
   */
  async findExpiringPrices(listaId: string, ctx: AccessContext, days = 30) {
    await this.acl.assertListaAccess(listaId, ctx, 'view_prices');

    const lista = await this.prisma.lista.findUnique({
      where: { id: listaId },
      select: { id: true },
    });
    if (!lista) throw new NotFoundException('Lista no encontrada');

    const now = Date.now();
    const prices = await this.prisma.price.findMany({
      where: {
        listaId,
        validUntil: { not: null, lte: new Date(now + days * 86400000), gte: new Date(now) },
      },
      include: {
        product: { select: { id: true, sku: true, name: true } },
        priceList: { select: { id: true, name: true, code: true } },
      },
      orderBy: { validUntil: 'asc' },
    });

    return {
      data: prices.map((p) => ({
        ...p,
        daysRemaining: Math.ceil((new Date(p.validUntil!).getTime() - now) / 86400000),
      })),
      count: prices.length,
      days,
    };
  }

  /**
   * Campos calculados de vigencia (OLA 6) — solo en la respuesta, no en schema.
   * - isExpired: validUntil ya pasó.
   * - isExpiringSoon: no vencida y vence en <= 30 días.
   * - daysUntilExpiry: ceil de días restantes (negativo si venció); null sin validUntil.
   */
  private computeExpiry(validUntil: Date | null) {
    if (!validUntil) {
      return { isExpired: false, isExpiringSoon: false, daysUntilExpiry: null };
    }
    const diffMs = new Date(validUntil).getTime() - Date.now();
    return {
      isExpired: diffMs < 0,
      isExpiringSoon: diffMs >= 0 && diffMs <= 30 * 86400000,
      daysUntilExpiry: Math.ceil(diffMs / 86400000),
    };
  }

  /** Accesos (assignments LISTA) de una Lista — requiere manage_access (checklist 30). */
  async findAssignments(id: string, ctx: AccessContext) {
    await this.acl.assertListaAccess(id, ctx, 'manage_access');
    const assignments = await this.prisma.assignment.findMany({
      where: { resourceType: 'LISTA', resourceId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { data: assignments };
  }

  /** Auditoría de una Lista — requiere manage. */
  async findAudit(id: string, ctx: AccessContext) {
    await this.assertManage(id, ctx);
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { entity: 'LISTA', entityId: id },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where: { entity: 'LISTA', entityId: id } }),
    ]);
    return { data: logs, meta: { total } };
  }

  /** Crear Lista — Super Admin y Admin Comercial (el creador queda auto-asignado con manage_access; otros accesos los gestiona después el Super Admin). */
  async create(dto: CreateListaDto, ctx: AccessContext) {
    const canCreate = ['Super Admin', 'Admin Comercial'].some((r) => ctx.roles?.includes(r));
    if (!canCreate) {
      throw new ForbiddenException('Solo Super Admin o Admin Comercial pueden crear Listas');
    }

    const existing = await this.prisma.lista.findUnique({
      where: { code: dto.code },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Ya existe una Lista con ese código');

    if (dto.codigo) {
      const dupCodigo = await this.prisma.lista.findUnique({
        where: { codigo: dto.codigo },
        select: { id: true },
      });
      if (dupCodigo) throw new ConflictException('Ya existe una Lista con ese código de identificación');
    }

    await this.validateResponsible(dto.responsibleId);
    this.assertCoherentValidity(dto.validFrom, dto.validUntil);

    const created = await this.prisma.lista.create({
      data: {
        code: dto.code,
        codigo: dto.codigo ?? null,
        name: dto.name,
        description: dto.description ?? null,
        currency: dto.currency ?? 'COP',
        isActive: dto.isActive ?? true,
        type: dto.type ?? null,
        defaultVisibility: dto.defaultVisibility ?? false,
        responsibleId: dto.responsibleId ?? null,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        createdById: ctx.userId,
      },
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'create',
      entity: 'LISTA',
      entityId: created.id,
      newValues: {
        code: created.code,
        codigo: created.codigo,
        name: created.name,
        currency: created.currency,
        isActive: created.isActive,
        type: created.type,
        defaultVisibility: created.defaultVisibility,
        responsibleId: created.responsibleId,
        validFrom: created.validFrom,
        validUntil: created.validUntil,
      },
    });

    // Auto-asignación del creador (deny-by-default del findAll): sin este
    // assignment, una Lista creada por un Admin Comercial no aparece en su
    // propio listado. Es su recurso recién creado, no un otorgamiento a
    // terceros (la anti-escalada del módulo assignments aplica a terceros).
    await this.prisma.assignment.upsert({
      where: {
        userId_resourceType_resourceId: {
          userId: ctx.userId,
          resourceType: 'LISTA',
          resourceId: created.id,
        },
      },
      create: {
        userId: ctx.userId,
        resourceType: 'LISTA',
        resourceId: created.id,
        level: 'manage_access',
        isActive: true,
      },
      update: { level: 'manage_access', isActive: true },
    });

    return created;
  }

  // Límites prudenciales (schema sin maxLength en code/name; Postgres text sin tope).
  private readonly LISTA_NAME_MAX = 120;
  private readonly LISTA_CODE_MAX = 60;
  private readonly COPIA_SUFFIX = '-COPIA-';

  /**
   * Duplicar una Lista — requiere edit+ sobre la Lista origen (mismo patrón de
   * escritura del módulo). Crea una copia de CONFIGURACIÓN:
   * - Mismo name + " (copia)", code único nuevo (`code + "-COPIA-XXXX"`).
   * - Mismos currency/description/type/defaultVisibility/validFrom/validUntil/responsibleId.
   * - isActive: false — decisión documentada (OLA 6): la copia nace INACTIVA, es un molde
   *   que el operador debe revisar y activar explícitamente antes de publicar precios.
   * - NO copia productos, precios ni assignments: es un molde de configuración que se
   *   puebla después a conveniencia (evita duplicar datos transaccionales por error).
   */
  async duplicateLista(id: string, ctx: AccessContext) {
    const source = await this.prisma.lista.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Lista no encontrada');
    await this.acl.assertListaAccess(id, ctx, 'manage');

    const nameSuffix = ' (copia)';
    const name = `${source.name.slice(0, this.LISTA_NAME_MAX - nameSuffix.length)}${nameSuffix}`;
    const code = await this.generateUniqueCode(source.code);

    const created = await this.prisma.lista.create({
      data: {
        code,
        name,
        description: source.description,
        currency: source.currency,
        type: source.type,
        defaultVisibility: source.defaultVisibility,
        validFrom: source.validFrom,
        validUntil: source.validUntil,
        responsibleId: source.responsibleId,
        isActive: false,
        createdById: ctx.userId ?? null,
        updatedById: ctx.userId ?? null,
      },
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'duplicate',
      entity: 'LISTA',
      entityId: created.id,
      oldValues: { sourceId: id },
      newValues: { code, name, isActive: created.isActive, currency: created.currency },
    });

    return { ...created, productCount: 0, ...this.computeExpiry(created.validUntil) };
  }

  /** Genera un code único `base-COPIA-XXXX` (4 chars alfanuméricos sin ambiguos). */
  private async generateUniqueCode(sourceCode: string): Promise<string> {
    const base = sourceCode.slice(0, this.LISTA_CODE_MAX - this.COPIA_SUFFIX.length - 4);
    let candidate = `${base}${this.COPIA_SUFFIX}${this.randomSuffix()}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await this.prisma.lista.findUnique({
        where: { code: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
      candidate = `${base}${this.COPIA_SUFFIX}${this.randomSuffix()}`;
    }
    // Último recurso (colisión improbable): sufijo timestamp para garantizar unicidad.
    return `${base}${this.COPIA_SUFFIX}${Date.now().toString(36).toUpperCase()}`;
  }

  private randomSuffix(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I,O,0,1 (evita ambigüedad visual)
    const bytes = randomBytes(4);
    let out = '';
    for (let i = 0; i < 4; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  /** Editar Lista (campos) — requiere edit+. Archivar (archivedAt) — requiere manage. */
  async update(id: string, dto: UpdateListaDto, ctx: AccessContext) {
    // CHECK: Lista bloqueada por eliminación pendiente
    if (await this.isBlockedByDeletion(id)) {
      throw new ConflictException('No se puede editar una Lista con solicitud de eliminación pendiente');
    }

    const lista = await this.prisma.lista.findUnique({ where: { id } });
    if (!lista) throw new NotFoundException('Lista no encontrada');

    const oldValues = {
      name: lista.name,
      code: lista.code,
      codigo: lista.codigo,
      description: lista.description,
      currency: lista.currency,
      isActive: lista.isActive,
      archivedAt: lista.archivedAt,
      type: lista.type,
      defaultVisibility: lista.defaultVisibility,
      responsibleId: lista.responsibleId,
      validFrom: lista.validFrom,
      validUntil: lista.validUntil,
    };

    // El nivel requerido depende de si se está archivando/restaurando.
    // Niveles (checklist 29/30): editar campos → edit_products; archivar/restaurar → manage.
    // Para archivar/restaurar se usa assertListaRestoreAccess: NO exige isActive/archivedAt,
    // así una Lista ya archivada (isActive=false) puede restaurarse (BUG-3).
    const requiresManage = dto.archivedAt !== undefined;
    if (requiresManage) {
      await this.acl.assertListaRestoreAccess(id, ctx, 'manage');
    } else {
      await this.acl.assertListaAccess(id, ctx, 'edit_products');
    }

    if (dto.code && dto.code !== lista.code) {
      const dup = await this.prisma.lista.findUnique({ where: { code: dto.code }, select: { id: true } });
      if (dup) throw new ConflictException('Ya existe una Lista con ese código');
    }

    if (dto.codigo !== undefined && dto.codigo !== lista.codigo) {
      if (dto.codigo) {
        const dup = await this.prisma.lista.findUnique({ where: { codigo: dto.codigo }, select: { id: true } });
        if (dup) throw new ConflictException('Ya existe una Lista con ese código de identificación');
      }
    }

    await this.validateResponsible(dto.responsibleId);
    this.assertCoherentValidity(dto.validFrom, dto.validUntil);

    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name;
    if (dto.code) data.code = dto.code;
    if (dto.codigo !== undefined) data.codigo = dto.codigo ?? null;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.currency) data.currency = dto.currency;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.archivedAt !== undefined) {
      data.archivedAt = dto.archivedAt ? new Date(dto.archivedAt) : null;
      if (dto.archivedAt) data.isActive = false;
    }
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.defaultVisibility !== undefined) data.defaultVisibility = dto.defaultVisibility;
    if (dto.responsibleId !== undefined) data.responsibleId = dto.responsibleId ?? null;
    if (dto.validFrom !== undefined) data.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    if (dto.validUntil !== undefined) data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;

    const updated = await this.prisma.lista.update({ where: { id }, data });

    await this.audit.log({
      userId: ctx.userId,
      action: requiresManage ? (dto.archivedAt ? 'archive' : 'restore') : 'update',
      entity: 'LISTA',
      entityId: id,
      oldValues,
      newValues: data,
    });

    return updated;
  }

  /** Activar / desactivar Lista — requiere edit_products (checklist 29/30). */
  async toggleActive(id: string, ctx: AccessContext) {
    // CHECK: Lista bloqueada por eliminación pendiente
    if (await this.isBlockedByDeletion(id)) {
      throw new ConflictException('No se puede activar/desactivar una Lista con solicitud de eliminación pendiente');
    }

    const lista = await this.prisma.lista.findUnique({ where: { id } });
    if (!lista) throw new NotFoundException('Lista no encontrada');
    await this.acl.assertListaAccess(id, ctx, 'edit_products');

    const updated = await this.prisma.lista.update({
      where: { id },
      data: { isActive: !lista.isActive },
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'toggleActive',
      entity: 'LISTA',
      entityId: id,
      oldValues: { isActive: lista.isActive },
      newValues: { isActive: updated.isActive },
    });

    return updated;
  }

  /** Archivar lógicamente — requiere manage. */
  async archive(id: string, ctx: AccessContext) {
    // CHECK: Lista bloqueada por eliminación pendiente
    if (await this.isBlockedByDeletion(id)) {
      throw new ConflictException('No se puede archivar una Lista con solicitud de eliminación pendiente');
    }

    const lista = await this.prisma.lista.findUnique({ where: { id } });
    if (!lista) throw new NotFoundException('Lista no encontrada');
    await this.acl.assertListaAccess(id, ctx, 'manage');

    const updated = await this.prisma.lista.update({
      where: { id },
      data: { archivedAt: new Date(), isActive: false },
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'archive',
      entity: 'LISTA',
      entityId: id,
      oldValues: { archivedAt: lista.archivedAt, isActive: lista.isActive },
      newValues: { archivedAt: updated.archivedAt, isActive: updated.isActive },
    });

    return updated;
  }

  /** Restaurar (desarchivar) — requiere manage (assertListaRestoreAccess: la Lista archivada/inactiva no bloquea). */
  async restore(id: string, ctx: AccessContext) {
    // CHECK: Solo permitir restaurar si la Lista está en PENDING_DELETION
    const isBlocked = await this.isBlockedByDeletion(id);
    if (!isBlocked) {
      // Si no está pendiente de eliminación, el flujo normal se aplica
      // (puede archivarse/restaurarse normalmente)
    }

    const lista = await this.prisma.lista.findUnique({ where: { id } });
    if (!lista) throw new NotFoundException('Lista no encontrada');
    await this.acl.assertListaRestoreAccess(id, ctx, 'manage');

    const updated = await this.prisma.lista.update({
      where: { id },
      data: { archivedAt: null },
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'restore',
      entity: 'LISTA',
      entityId: id,
      oldValues: { archivedAt: lista.archivedAt, isActive: lista.isActive },
      newValues: { archivedAt: updated.archivedAt, isActive: updated.isActive },
    });

    return updated;
  }

  /**
   * Eliminación física de una Lista — Super Admin y Admin Comercial (isListasAdmin).
   *
   * Comportamiento por impacto:
   * - SIN datos asociados (products=0, prices=0, assignments activos=0): borra normal,
   *   sin pedir clave maestra (flujo histórico).
   * - CON datos asociados y SIN `dto.masterKey` → 409 (exige la clave maestra).
   * - CON datos asociados y clave maestra inválida/no configurada → 403.
   * - CON datos asociados y clave maestra válida → borrado FORZADO en cascada dentro
   *   de una transacción (orden por FKs: stock → productImage → price(product) →
   *   price(lista) → product → assignment → lista).
   *
   * El historial de auditoría NO bloquea (decisión de negocio): al borrar la Lista se
   * conserva como rastro la tabla AuditLog (no se borra con la lista), y el evento
   * `delete` se registra ANTES del borrado físico para dejar constancia del código/
   * nombre. En el borrado forzado se anota `forced: true` con los counts previos.
   *
   * Fix H9: solo los accesos ACTIVOS de terceros bloquean. Las assignments
   * soft-deleted (isActive=false) son ruido interno y NO bloquean el borrado,
   * y al eliminar la Lista se hace hard-delete de TODAS sus assignments
   * (Assignment no tiene FK a Lista) para no dejar registros huérfanos.
   */
  /**
   * Elimina una Lista físicamente y, en la misma transacción, sus productos
   * huérfanos con todo lo que cuelga de ellos (precios, imágenes, inventario,
   * accesos). El inventario (`Stock`) no se borra a mano: su FK tiene
   * `onDelete: Cascade` y desaparece solo al borrar el producto.
   *
   * Antes este método dejaba los productos vivos con `listaId = null` — la FK
   * de `Product.listaId` es `ON DELETE SET NULL`, así que Postgres los
   * desconectaba en vez de borrarlos — contradiciendo el comentario que decía
   * "se eliminan en cascada". `prisma/cleanup-orphaned-list-products.ts` existe
   * porque ese hueco dejaba huérfanos que había que limpiar a mano después.
   *
   * `AuditLog.productId` y `QuoteItem.productId` son opcionales con
   * `onDelete: SetNull`: sobreviven al borrado, sin bloquear la transacción.
   */
  async removeLista(id: string, dto: DeleteListaDto, ctx: AccessContext) {
    // CHECK: Lista bloqueada por eliminación pendiente
    if (await this.isBlockedByDeletion(id)) {
      throw new ConflictException('No se puede eliminar físicamente una Lista con solicitud de eliminación pendiente. Use los endpoints de cancelación o restauración.');
    }

    if (!this.acl.isListasAdmin(ctx.roles)) {
      throw new ForbiddenException('Solo Super Admin o Admin Comercial pueden eliminar Listas');
    }

    const lista = await this.prisma.lista.findUnique({
      where: { id },
      select: { id: true, name: true, code: true },
    });
    if (!lista) throw new NotFoundException('Lista no encontrada');

    const productIds = (
      await this.prisma.product.findMany({ where: { listaId: id }, select: { id: true } })
    ).map((p) => p.id);

    const [prices, assignments] = await Promise.all([
      this.prisma.price.count({
        where: { OR: [{ listaId: id }, { productId: { in: productIds } }] },
      }),
      // Fix H9: solo accesos ACTIVOS de terceros bloquean. La auto-asignación del
      // propio actor (create → manage_access del creador) y las assignments
      // soft-deleted (isActive=false) son ruido interno y NO bloquean, de modo que
      // el creador (Super Admin o Admin Comercial) puede eliminar su Lista vacía.
      this.prisma.assignment.count({
        where: {
          resourceType: 'LISTA',
          resourceId: id,
          isActive: true,
          ...(ctx.userId ? { NOT: { userId: ctx.userId } } : {}),
        },
      }),
    ]);

    const impact: string[] = [];
    if (productIds.length > 0) impact.push(`${productIds.length} producto${productIds.length === 1 ? '' : 's'}`);
    if (prices > 0) impact.push(`${prices} precio${prices === 1 ? '' : 's'}`);
    if (assignments > 0) impact.push(`${assignments} accesos`);

    // Borrado físico destructivo: exige confirmación explícita, igual que el
    // borrado de un producto (`DeleteProductDto`). Sin ella no se ejecuta
    // ninguna escritura.
    if (dto?.confirm !== true) {
      throw new BadRequestException(
        impact.length > 0
          ? `Esta Lista tiene datos asociados que se eliminarán en cascada: ${impact.join(', ')}. Confirma con confirm: true.`
          : 'Debes confirmar el borrado físico con confirm: true',
      );
    }

    // Las imágenes se borran del almacenamiento después de confirmar el commit
    // en BD, no antes: si el archivo se borrara primero y la transacción
    // fallara, quedaría una fila ProductImage apuntando a un archivo inexistente.
    const images = await this.prisma.productImage.findMany({
      where: { productId: { in: productIds } },
      select: { url: true },
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'delete',
      entity: 'LISTA',
      entityId: lista.id,
      oldValues: { name: lista.name, code: lista.code },
      newValues: { code: lista.code, name: lista.name, productosEliminados: productIds.length },
    });

    await this.prisma.$transaction([
      // Fix H9: hard-delete de las assignments de la Lista (Assignment no tiene FK a
      // Lista) para no dejar registros huérfanos, sean activos o soft-deleted.
      this.prisma.assignment.deleteMany({ where: { resourceType: 'LISTA', resourceId: id } }),
      this.prisma.assignment.deleteMany({
        where: { resourceType: 'PRODUCT', resourceId: { in: productIds } },
      }),
      this.prisma.productImage.deleteMany({ where: { productId: { in: productIds } } }),
      this.prisma.price.deleteMany({
        where: { OR: [{ listaId: id }, { productId: { in: productIds } }] },
      }),
      this.prisma.product.deleteMany({ where: { id: { in: productIds } } }),
      this.prisma.lista.delete({ where: { id } }),
    ]);

    for (const image of images) {
      await this.files.deleteByUrl(image.url);
    }

    return { message: 'Lista eliminada exitosamente', productosEliminados: productIds.length };
  }

  /** Alias interno: require manage (incluye deny-by-default por inactiva/archivada). */
  private async assertManage(id: string, ctx: AccessContext): Promise<void> {
    await this.acl.assertListaAccess(id, ctx, 'manage');
  }

  /**
   * ¿El usuario puede ver precios sobre una Lista? Requiere view_prices o superior
   * (checklist 29/30). Super Admin siempre.
   */
  private async userCanSeePrices(listaId: string, ctx: AccessContext): Promise<boolean> {
    if (this.acl.isListasAdmin(ctx.roles)) return true;
    const level = await this.acl.getUserLevel(ctx.userId!, listaId, ctx.roles);
    return !!level && (LEVEL_RANK[level] ?? 0) >= (LEVEL_RANK['view_prices'] ?? 0);
  }

  /**
   * Valida que el responsable exista cuando se envía responsableId (no aplica a null).
   */
  private async validateResponsible(responsibleId?: string | null): Promise<void> {
    if (!responsibleId) return;
    const responsible = await this.prisma.user.findUnique({
      where: { id: responsibleId },
      select: { id: true },
    });
    if (!responsible) throw new NotFoundException('Usuario responsable no encontrado');
  }

/**
   * Coherencia de vigencias: si vienen ambas (validFrom y validHasta),
   * validFrom debe ser <= validHasta. Validación manual en el service
   * (más simple que @ValidateIf en los DTOs, evita duplicar lógica en create/update).
   */
  private assertCoherentValidity(validFrom?: string | null, validUntil?: string | null): void {
    if (validFrom && validUntil) {
      const from = new Date(validFrom).getTime();
      const until = new Date(validUntil).getTime();
      if (from > until) {
        throw new BadRequestException('validFrom debe ser menor o igual que validHasta');
      }
    }
  }

  /**
   * Ejecuta la solicitud de eliminación diferida interna.
   * - Marca deletionStatus = 'PENDING_DELETION'
   * - Establece deletionRequestedAt = ahora
   * - Establece deletionPurgeAt = ahora + 90 días (America/Bogota)
   * - Almacena el motivo y el actor (ctx.userId)
   * - Registra auditoría con snapshot y resultado SUCCESS
   * - No borra ni desvincula productos, precios, imágenes, stock, etc.
   *
   * @param id Identificador de la Lista
   * @param reason Motivo obligatorio de la solicitud
   * @param ctx Contexto de autenticación y autorización
   */
  private async requestDeletion(id: string, reason: string, ctx: AccessContext): Promise<void> {
    const now = new Date();
    const purgeAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 días en ms

    await this.prisma.lista.update({
      where: { id },
      data: {
        deletionStatus: 'PENDING_DELETION' as const,
        deletionRequestedAt: now,
        deletionPurgeAt: purgeAt,
        deletionReason: reason,
        deletionRequestedById: ctx.userId,
      } as Prisma.ListaUpdateInput,
    });

    await this.audit.log({
      userId: ctx.userId,
      action: 'request_deletion',
      entity: 'LISTA',
      entityId: id,
      oldValues: {},
      newValues: {
        deletionStatus: 'PENDING_DELETION',
        deletionReason: reason,
      },
    });
  }

  /**
   * Solicita una eliminación diferida de Lista (90 días).
   * - Exige permiso global `listas:delete`.
   * - Exige acceso `manage` sobre la Lista, salvo Super Admin.
   * - Rechaza Lista inexistente, archivada o ya pendiente de eliminación.
   * - Reutiliza la lógica interna `requestDeletion()` de Fase 1.
   * - Calcula y persiste purga a exactamente 90 días.
   * - Registra auditoría con contexto/snapshot y resultado SUCCESS.
   * - No borra ni desvincula productos, precios, imágenes, stock, etc.
   *
   * @param id Identificador de la Lista
   * @param reason Motivo obligatorio de la solicitud
   * @param ctx Contexto de autenticación y autorización (inyectado por guardia)
   */
  async deletionRequest(id: string, reason: string, ctx: AccessContext): Promise<void> {
    // CHECK: Usuario autenticado.
    if (!ctx.userId) throw new ForbiddenException('Usuario no autenticado');

    // CHECK: Permiso global `listas:delete`.
    if (!ctx.roles?.includes('Super Admin') && !ctx.roles?.includes('Admin Comercial')) {
      throw new ForbiddenException('Se requiere permiso global listas:delete');
    }

    // CHECK: Acceso `manage` sobre la Lista, salvo Super Admin.
    if (!this.acl.isListasAdmin(ctx.roles)) {
      await this.acl.assertListaAccess(id, ctx, 'manage');
    }

    // CHECK: Rechazar Lista inexistente, archivada o ya pendiente de eliminación.
    const lista = await this.prisma.lista.findUnique({
      where: { id },
      select: { id: true, isActive: true, archivedAt: true },
    });
    if (!lista) throw new NotFoundException('Lista no encontrada');
    if (!lista.isActive || lista.archivedAt) throw new NotFoundException('Lista no encontrada');
    if (await this.isBlockedByDeletion(id)) {
      throw new ConflictException('Lista ya pendiente de eliminación');
    }

    // Ejecutar solicitud interna.
    await this.requestDeletion(id, reason, ctx);
  }

  /**
   * Determina si una Lista está bloqueada por eliminación pendiente.
   * Una Lista con deletionStatus = 'PENDING_DELETION' no permite
   * operaciones de escritura (editar, archivar, toggles, publicar).
   * Solo usuarios con manage + listas:delete pueden restaurar o cancelar.
   *
   * @param id Identificador de la Lista
   * @returns true si la Lista está pendiente de eliminación
   */
  private async isBlockedByDeletion(id: string): Promise<boolean> {
    const lista = await this.prisma.lista.findUnique({
      where: { id },
    });
    return (lista as any)?.deletionStatus === 'PENDING_DELETION';
  }

  /**
   * Prepara un snapshot de auditoría de una Lista antes de una futura purga.
   * El snapshot contiene el identificador, nombre/código y conteos
   * de hijos (productos, precios, assignments) sin borrar los registros.
   * Este snapshot se conservará incluso después de la purga física.
   *
   * @param id Identificador de la Lista
   * @returns Objeto con los datos del snapshot
   */
  private async prepareAuditSnapshot(id: string): Promise<{
    listaId: string;
    name: string;
    code: string | null;
    productCount: number;
    priceCount: number;
    assignmentCount: number;
  }> {
    const [lista, products, prices, assignments] = await Promise.all([
      this.prisma.lista.findUnique({
        where: { id },
        select: { id: true, name: true, codigo: true },
      }),
      this.prisma.product.count({ where: { listaId: id } }),
      this.prisma.price.count({ where: { listaId: id } }),
      this.prisma.assignment.count({ where: { resourceType: 'LISTA', resourceId: id } }),
    ]);

    return {
      listaId: lista?.id ?? id,
      name: lista?.name ?? '',
      code: lista?.codigo ?? null,
      productCount: products,
      priceCount: prices,
      assignmentCount: assignments,
    };
  }
}
