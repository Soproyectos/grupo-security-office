import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { directLegacyProductLibrary } from '../products/product-library';
import {
  AclService,
  AccessContext,
  LEVEL_RANK,
  normalizeLevel,
  ROLE_ASSIGNMENT_PREFIX,
} from '../../common/acl/acl.service';
import { AuditService } from '../audit/audit.service';
import { CreateAssignmentDto, ASSIGNMENT_RESOURCE_TYPES } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private acl: AclService,
    private audit: AuditService,
    /** Lectura de Lista, producto, tarifa y categoría (biblioteca). Los accesos (Assignment) siguen siendo operativos. */
    @Inject(BibliotecaPrismaService) private readonly library: BibliotecaPrismaService = directLegacyProductLibrary(prisma),
  ) {}

  /** Contrato compartido de los modelos de biblioteca: el cliente de biblioteca se usa con los tipos operativos. */
  private get db(): PrismaService { return this.library.client as unknown as PrismaService; }

  /**
   * Lista asignaciones.
   * - Super Admin (o ctx ausente: legacy/test) → todas.
   * - Admin Comercial (isListasAdmin) → todas: ve/administra TODAS las Listas,
   *   así que su scope de assignments es el mismo que el de Super Admin (solo lectura
   *   sobre grants por rol, cuya administración sigue siendo exclusiva de Super Admin).
   * - Resto → solo sobre las Listas que administra (level manage o superior), o deny.
   */
  async findAll(
    filters: { userId?: string; resourceType?: string } = {},
    ctx?: AccessContext,
  ) {
    if (!ctx || !ctx.userId || this.acl.isListasAdmin(ctx.roles)) {
      const where: { userId?: string; resourceType?: string } = {};
      if (filters.userId) where.userId = filters.userId;
      if (filters.resourceType) where.resourceType = filters.resourceType;
      const assignments = await this.prisma.assignment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      return { data: assignments };
    }

    // Non-Super Admin: scope a las Listas bajo su administración (manage o superior).
    const manageLevel = this.acl.levelsAtLeast('manage');
    const allowed = await this.prisma.assignment.findMany({
      where: {
        userId: ctx.userId,
        resourceType: 'LISTA',
        isActive: true,
        level: { in: manageLevel },
      },
      select: { resourceId: true },
    });

    if (allowed.length === 0) {
      return { data: [] };
    }

    const where: {
      userId?: string;
      resourceType?: string;
      resourceId: { in: string[] };
    } = { resourceId: { in: allowed.map((a) => a.resourceId) } };
    if (filters.userId) where.userId = filters.userId;
    if (filters.resourceType) where.resourceType = filters.resourceType;

    const assignments = await this.prisma.assignment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return { data: assignments };
  }

  async create(dto: CreateAssignmentDto, ctx?: AccessContext) {
    const rawLevel = dto.level ?? 'view';
    const level = normalizeLevel(rawLevel);
    if (!level) {
      throw new BadRequestException(`Nivel no válido: ${rawLevel}`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    await this.validateResource(dto.resourceType, dto.resourceId);
    await this.authorizeAssignmentMutation(dto.resourceType, dto.resourceId, ctx, level);

    const existing = await this.prisma.assignment.findUnique({
      where: {
        userId_resourceType_resourceId: {
          userId: dto.userId,
          resourceType: dto.resourceType,
          resourceId: dto.resourceId,
        },
      },
    });

    if (existing?.isActive) {
      throw new ConflictException('Ya existe una asignación activa para ese recurso');
    }

    if (existing) {
      const reactivated = await this.prisma.assignment.update({
        where: { id: existing.id },
        data: { isActive: true, level },
      });

      await this.audit.log({
        userId: ctx?.userId,
        action: 'update',
        entity: 'Assignment',
        entityId: existing.id,
        oldValues: { level: existing.level, isActive: existing.isActive },
        newValues: { level, isActive: true },
      });

      return reactivated;
    }

    const created = await this.prisma.assignment.create({
      data: {
        userId: dto.userId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        level,
      },
    });

    await this.audit.log({
      userId: ctx?.userId,
      action: 'create',
      entity: 'Assignment',
      entityId: created.id,
      newValues: {
        userId: created.userId,
        resourceType: created.resourceType,
        resourceId: created.resourceId,
        level: created.level,
      },
    });

    return created;
  }

  async update(id: string, dto: UpdateAssignmentDto, ctx?: AccessContext) {
    const existing = await this.prisma.assignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Asignación no encontrada');

    const nextLevel = dto.level !== undefined ? normalizeLevel(dto.level) : existing.level;
    if (!nextLevel) {
      throw new BadRequestException(`Nivel no válido: ${dto.level}`);
    }

    await this.authorizeAssignmentMutation(
      existing.resourceType,
      existing.resourceId,
      ctx,
      dto.level !== undefined ? nextLevel : undefined,
    );

    const data: { level?: string; isActive?: boolean } = {};
    if (dto.level !== undefined) data.level = nextLevel;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.assignment.update({ where: { id }, data });

    await this.audit.log({
      userId: ctx?.userId,
      action: 'update',
      entity: 'Assignment',
      entityId: id,
      oldValues: { level: existing.level, isActive: existing.isActive },
      newValues: data,
    });

    return updated;
  }

  /**
   * Elimina físicamente una asignación (hard-delete), activa o inactiva.
   * - Permisos intactos: authorizeAssignmentMutation + NotFoundException si no existe.
   * - Se registra el audit ANTES del borrado (patrón del repo) para conservar la
   *   trazabilidad en el AuditLog aunque el registro físico desaparezca.
   */
  async remove(id: string, ctx?: AccessContext) {
    const existing = await this.prisma.assignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Asignación no encontrada');

    await this.authorizeAssignmentMutation(
      existing.resourceType,
      existing.resourceId,
      ctx,
      undefined,
    );

    await this.audit.log({
      userId: ctx?.userId,
      action: 'delete',
      entity: 'Assignment',
      entityId: id,
      oldValues: {
        resourceType: existing.resourceType,
        resourceId: existing.resourceId,
        level: existing.level,
        isActive: existing.isActive,
      },
      newValues: { deleted: true },
    });

    await this.prisma.assignment.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // TAREA 5 — Matriz de accesos y vista previa (checklist 32/33)
  // ---------------------------------------------------------------------------

  /**
   * GET /api/assignments/matrix?entity=LISTA|PRODUCT
   * Super Admin y Admin Comercial (isListasAdmin) → todos los recursos; resto → solo
   * los que administra (manage_access).
   */
  async matrix(entity: string, ctx: AccessContext) {
    if (!entity || !['LISTA', 'PRODUCT'].includes(entity)) {
      throw new BadRequestException('entity debe ser LISTA o PRODUCT');
    }

    const isAdmin = this.acl.isListasAdmin(ctx.roles);

    // Recursos visibles en la matriz.
    let resources: { id: string; name: string }[] = [];
    if (entity === 'LISTA') {
      const listas = isAdmin
        ? await this.db.lista.findMany({ select: { id: true, name: true } })
        : await this.db.lista.findMany({
            where: { id: { in: (await this.getManagedListaIds(ctx)) } },
            select: { id: true, name: true },
          });
      resources = listas;
    } else {
      const products = isAdmin
        ? await this.db.product.findMany({ select: { id: true, name: true } })
        : await this.db.product.findMany({
            where: { listaId: { in: (await this.getManagedListaIds(ctx)) } },
            select: { id: true, name: true },
          });
      resources = products;
    }

    const ids = resources.map((r) => r.id);
    const assignments =
      ids.length > 0
        ? await this.prisma.assignment.findMany({
            where: { resourceType: entity, resourceId: { in: ids } },
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
          })
        : [];

    // Trazabilidad del creador vía auditoría (el modelo Assignment no tiene createdById).
    const assignIds = assignments.map((a) => a.id);
    const creators =
      assignIds.length > 0
        ? await this.prisma.auditLog.findMany({
            where: { entity: 'Assignment', action: 'create', entityId: { in: assignIds } },
            select: { entityId: true, userId: true },
          })
        : [];
    const creatorByAssignId = new Map(creators.map((c) => [c.entityId, c.userId]));

    const byResource = new Map<string, typeof assignments>();
    for (const a of assignments) {
      if (!byResource.has(a.resourceId)) byResource.set(a.resourceId, []);
      byResource.get(a.resourceId)!.push(a);
    }

    return {
      data: await Promise.all(
        resources.map(async (r) => {
          const list = byResource.get(r.id) ?? [];
          const viewerLevel = await this.viewerLevelOnResource(entity, r.id, ctx);
          return {
            resourceType: entity,
            resourceId: r.id,
            resourceName: r.name,
            asignaciones: list.map((a) => ({
              assigneeType: a.resourceId.startsWith(ROLE_ASSIGNMENT_PREFIX)
                ? 'rol'
                : 'usuario',
              userId: a.userId,
              userName: a.user?.name ?? null,
              level: normalizeLevel(a.level),
              isActive: a.isActive,
              createdAt: a.createdAt,
              asignadoPor: creatorByAssignId.get(a.id) ?? null,
            })),
            viewer: {
              userId: ctx.userId,
              acciones: this.acl.actionsForLevel(viewerLevel),
            },
          };
        }),
      ),
    };
  }

  /**
   * GET /api/assignments/preview?userId=&roleName=&entity=LISTA|PRODUCT&entityId=
   * Resumen legible de las reglas efectivas de un principal (usuario o rol) sobre una
   * entidad. NO persiste nada. Requiere Super Admin o manage_access sobre la entidad.
   */
  async preview(
    params: { userId?: string; roleName?: string; entity?: string; entityId?: string },
    ctx: AccessContext,
  ) {
    const { userId, roleName, entity, entityId } = params;

    if (!entity || !['LISTA', 'PRODUCT'].includes(entity)) {
      throw new BadRequestException('entity debe ser LISTA o PRODUCT');
    }
    if (!entityId) throw new BadRequestException('entityId requerido');
    if (!userId && !roleName) throw new BadRequestException('Se requiere userId o roleName');
    if (userId && roleName) {
      throw new BadRequestException('Proporciona solo uno de userId o roleName');
    }

    // Autorización del viewer. Admin Comercial queda autorizado vía isListasAdmin
    // (canManageAccessOnLista/Product ya devuelven true por el ACL).
    const authed = this.acl.isListasAdmin(ctx.roles)
      ? true
      : entity === 'LISTA'
        ? await this.acl.canManageAccessOnLista(entityId, ctx)
        : await this.acl.canManageAccessOnProduct(entityId, ctx);
    if (!authed) {
      throw new ForbiddenException('Requiere manage_access sobre la entidad');
    }

    // Nombre y Lista dueña.
    const listaId =
      entity === 'LISTA'
        ? entityId
        : (
            await this.db.product.findUnique({
              where: { id: entityId },
              select: { listaId: true },
            })
          )?.listaId;
    if (!listaId) throw new NotFoundException('Entidad sin Lista asociada');

    const entityName =
      entity === 'LISTA'
        ? (await this.db.lista.findUnique({ where: { id: entityId }, select: { name: true } }))
            ?.name
        : (
            await this.db.product.findUnique({
              where: { id: entityId },
              select: { name: true },
            })
          )?.name;
    if (!entityName) throw new NotFoundException('Entidad no encontrada');

    // Roles del principal.
    let roleNames: string[] = [];
    if (roleName) {
      roleNames = [roleName];
    } else if (userId) {
      const urs = await this.prisma.userRole.findMany({
        where: { userId },
        include: { role: { select: { name: true } } },
      });
      roleNames = urs.map((u) => u.role.name);
    }

    // Nivel efectivo sobre la Lista (assignments usuario + grants por rol).
    const nivelLista = await this.acl.getUserLevel(userId ?? '', listaId, roleNames);
    const preciosVisibles =
      !!nivelLista &&
      (LEVEL_RANK[nivelLista] ?? 0) >= (LEVEL_RANK['view_prices'] ?? 0);

    // Productos de la Lista con restricción explícita (PRODUCT isActive=false) del usuario.
    let restricciones: {
      productId: string;
      productName: string;
      nivel: string | null;
    }[] = [];
    if (entity === 'LISTA' && userId) {
      const productsOfLista = await this.db.product.findMany({
        where: { listaId },
        select: { id: true, name: true },
      });
      const restrictedAssignments = await this.prisma.assignment.findMany({
        where: {
          userId,
          resourceType: 'PRODUCT',
          isActive: false,
          resourceId: { in: productsOfLista.map((p) => p.id) },
        },
        select: { resourceId: true, level: true },
      });
      const nameById = new Map(productsOfLista.map((p) => [p.id, p.name]));
      restricciones = restrictedAssignments.map((r) => ({
        productId: r.resourceId,
        productName: nameById.get(r.resourceId) ?? 'Producto',
        nivel: normalizeLevel(r.level),
      }));
    }

    return {
      data: {
        entity,
        entityId,
        entityName,
        principal: {
          userId: userId ?? null,
          roleName: roleName ?? null,
          roles: roleNames,
        },
        nivelListaEfectivo: nivelLista
          ? normalizeLevel(nivelLista)
          : 'sin_acceso',
        preciosVisibles,
        productosRestringidos: restricciones,
        origen: [
          ...(nivelLista
            ? [{ fuente: 'assignment', descripcion: `Nivel ${nivelLista} sobre la Lista (usuario o rol)` }]
            : []),
          ...(roleNames.length
            ? [{ fuente: 'rbac', descripcion: `Roles del principal: ${roleNames.join(', ')}` }]
            : []),
        ],
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /** Listas donde el viewer tiene manage_access (scope de matrix). */
  private async getManagedListaIds(ctx: AccessContext): Promise<string[]> {
    const allowed = await this.acl.getAllowedListaIds(ctx.userId, ctx.roles, 'manage_access');
    return allowed ?? [];
  }

  private async viewerLevelOnResource(
    entity: string,
    resourceId: string,
    ctx: AccessContext,
  ): Promise<string | null> {
    if (this.acl.isListasAdmin(ctx.roles)) return 'manage_access';
    if (entity === 'LISTA') {
      return this.acl.getUserLevel(ctx.userId!, resourceId, ctx.roles);
    }
    const product = await this.db.product.findUnique({
      where: { id: resourceId },
      select: { listaId: true },
    });
    return product?.listaId
      ? this.acl.getUserLevel(ctx.userId!, product.listaId, ctx.roles)
      : null;
  }

  /**
   * Autoriza mutaciones sobre una asignación según su tipo de recurso + anti-escalada.
   *
   * - LISTA / PRODUCT → el asignador debe tener `manage` o superior sobre la Lista
   *   destino (Super Admin exento; Admin Comercial exento por isListasAdmin, con
   *   nivel efectivo 'manage_access' para la anti-escalada). La anti-escalada
   *   (checklist 34) acota el nivel que puede otorgar: nunca mayor al suyo, y
   *   manage_access solo lo otorgan quienes tienen manage_access.
   * - Grants por rol ('ROLE:{rol}') → exclusivo Super Admin (Admin Comercial NO).
   * - Tipos legacy (PRICE_LIST/CATEGORY) → Super Admin exclusivamente.
   * - ctx ausente (legacy/tests) → permitir (la capa de RolesGuard controla acceso).
   */
  private async authorizeAssignmentMutation(
    resourceType: string,
    resourceId: string,
    ctx: AccessContext | undefined,
    grantedLevel?: string,
  ): Promise<void> {
    if (!ctx || !ctx.userId || this.acl.isSuperAdmin(ctx.roles)) return;

    // Grants por rol: solo Super Admin.
    if (resourceId.startsWith(ROLE_ASSIGNMENT_PREFIX)) {
      throw new ForbiddenException('Solo Super Admin puede administrar asignaciones por rol');
    }

    if (resourceType !== 'LISTA' && resourceType !== 'PRODUCT') {
      throw new ForbiddenException(
        'Solo Super Admin puede administrar asignaciones de este tipo de recurso',
      );
    }

    const listaId =
      resourceType === 'PRODUCT'
        ? (
            await this.db.product.findUnique({
              where: { id: resourceId },
              select: { listaId: true },
            })
          )?.listaId
        : resourceId;
    if (!listaId) throw new NotFoundException('Recurso no encontrado');

    // Autorización mínima: gestionar accesos (manage o superior) sobre la Lista destino.
    if (!(await this.acl.canAdministerAccessOnLista(listaId, ctx))) {
      throw new ForbiddenException('No tienes permisos de administración sobre la Lista destino');
    }

    // Anti-escalada (checklist 34). El Admin Comercial (isListasAdmin) tiene
    // manage_access IMPLÍCITO sobre todas las Listas: su nivel efectivo para la
    // anti-escalada es 'manage_access' (puede otorgar hasta manage_access, nunca más).
    if (grantedLevel) {
      const assignerLevel = this.acl.isListasAdmin(ctx.roles)
        ? 'manage_access'
        : await this.acl.getUserLevel(ctx.userId, listaId, ctx.roles);
      this.assertNoEscalation(assignerLevel, grantedLevel);
    }
  }

  /**
   * Anti-escalada (checklist 34): el asignador no puede otorgar un nivel mayor al que
   * tiene, y manage_access solo puede otorgarlo quien tiene manage_access (o Super Admin).
   */
  private assertNoEscalation(assignerLevel: string | null, grantedLevel: string): void {
    if (!assignerLevel) {
      throw new ForbiddenException('No tienes nivel de acceso sobre la Lista destino');
    }
    const assignerRank = LEVEL_RANK[assignerLevel] ?? 0;
    const grantedRank = LEVEL_RANK[grantedLevel] ?? 0;

    if (grantedRank > assignerRank) {
      throw new ForbiddenException('No puedes otorgar un nivel de acceso mayor al que tienes');
    }
    if (
      grantedRank >= (LEVEL_RANK['manage_access'] ?? 0) &&
      assignerRank < (LEVEL_RANK['manage_access'] ?? 0)
    ) {
      throw new ForbiddenException('Solo quien tiene manage_access puede otorgar manage_access');
    }
  }

  /**
   * Valida que el recurso exista (404 si no). Soporta:
   *  - LISTA / PRICE_LIST / CATEGORY / PRODUCT (existencias reales).
   *  - Grants por rol: resourceId = 'ROLE:{nombreDelRol}' (valida que el rol exista).
   */
  private async validateResource(resourceType: string, resourceId: string) {
    if (!(ASSIGNMENT_RESOURCE_TYPES as readonly string[]).includes(resourceType)) {
      throw new NotFoundException(`Tipo de recurso no soportado: ${resourceType}`);
    }

    // Grant por rol: resourceId = 'ROLE:{nombreDelRol}'.
    if (resourceId.startsWith(ROLE_ASSIGNMENT_PREFIX)) {
      const roleName = resourceId.slice(ROLE_ASSIGNMENT_PREFIX.length).trim();
      if (!roleName) {
        throw new NotFoundException('Formato inválido: use ROLE:{nombreDelRol}');
      }
      const role = await this.prisma.role.findUnique({
        where: { name: roleName },
        select: { id: true },
      });
      if (!role) throw new NotFoundException(`El rol ${roleName} no existe`);
      return;
    }

    let resource: { id: string } | null = null;

    if (resourceType === 'PRODUCT') {
      resource = await this.db.product.findUnique({
        where: { id: resourceId },
        select: { id: true },
      });
    } else if (resourceType === 'PRICE_LIST') {
      resource = await this.db.priceList.findUnique({
        where: { id: resourceId },
        select: { id: true },
      });
    } else if (resourceType === 'CATEGORY') {
      resource = await this.db.category.findUnique({
        where: { id: resourceId },
        select: { id: true },
      });
    } else if (resourceType === 'LISTA') {
      resource = await this.db.lista.findUnique({
        where: { id: resourceId },
        select: { id: true },
      });
    }

    if (!resource) {
      throw new NotFoundException(`El recurso ${resourceType} no existe`);
    }
  }
}