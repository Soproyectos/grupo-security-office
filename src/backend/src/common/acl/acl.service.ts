import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { decideCatalogResourceAccessFromGrants } from '../security/catalog-resource-access';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ACCESS_CATALOG_VERSION,
  getActionDefinition,
} from '../security/access-catalog';
import {
  resolveAccess,
  type AccessDecision,
  type AccessIdentity,
  type ScopedGrant,
} from '../security/data-scope';

/**
 * Niveles de acceso reales (checklist 29/30) y su ranking.
 * Un assignment de nivel superior implica los niveles inferiores.
 *
 *  view:0           → ver Lista SIN precios.
 *  view_prices:1    → view + ver precios.
 *  edit_prices:2    → view_prices + editar precios.
 *  edit_products:3  → edit_prices + editar productos.
 *  edit:3           → ALIAS legacy de edit_products (compatibilidad OLA 4/7A).
 *  manage:4         → todo + archivar/duplicar/eliminar Lista + gestionar accesos de nivel inferior.
 *  manage_access:5  → manage + administrar accesos (otorgar manage/manage_access).
 *
 * El ranking se deriva de LEVEL_ORDER (nunca literales numéricos)
 * para que insertar un nivel nuevo no desincronice las comparaciones.
 */
export const LEVEL_ORDER = [
  'view',
  'view_prices',
  'edit_prices',
  'edit_products',
  'manage',
  'manage_access',
] as const;

export const LEVEL_RANK: Record<string, number> = {
  ...Object.fromEntries(LEVEL_ORDER.map((l, i) => [l, i])),
  edit: LEVEL_ORDER.indexOf('edit_products'), // alias legacy, siempre sincronizado
};

export const ASSIGNMENT_LEVELS = Object.keys(LEVEL_RANK);

/** Convierte un nivel a su forma canónica (edit → edit_products). */
export function normalizeLevel(level?: string | null): string | null {
  if (!level) return null;
  if (level === 'edit') return 'edit_products';
  return LEVEL_RANK[level] !== undefined ? level : null;
}

export interface AccessContext {
  userId?: string;
  roles: string[];
}

/** Prefijo para assignments por rol: resourceId = 'ROLE:{nombreDelRol}'. */
export const ROLE_ASSIGNMENT_PREFIX = 'ROLE:';

/**
 * Servicio centralizado de autorización por Lista (ACL).
 *
 * Política:
 *  - Super Admin → acceso total (sin filtro, incluye Listas inactivas/archivadas).
 *  - Admin Comercial (isListasAdmin) → mismo comportamiento que Super Admin sobre
 *    Listas/Productos/Precios (contenedor de compras): ve/administra TODAS las Listas.
 *    NO aplica a recursos globales (usuarios, roles, grants por rol, tipos legacy).
 *  - Usuario autenticado sin assignment activo a una Lista → deny (no ve Lista,
 *    Producto ni Precio asociado; se devuelve 404 para ocultar existencia).
 *  - Assignment inactivo → tratado como inexistente (salvo excepciones por PRODUCTO,
 *    donde isActive=false es una RESTRICCIÓN EXPLÍCITA que prevalece sobre la Lista).
 *  - Grants por rol: un assignment con resourceId='ROLE:{rol}' (resourceType LISTA)
 *    otorga ese nivel al usuario en TODAS las Listas. Convención documentada (OLA 1B):
 *    el modelo Assignment no permite userId null (schema), así que los grants por rol
 *    se materializan con resourceId especial y userId = actor que los creó.
 */
@Injectable()
export class AclService {
  constructor(private prisma: PrismaService) {}

  isSuperAdmin(roles: string[] | undefined): boolean {
    return !!roles && roles.includes('Super Admin');
  }

  /**
   * Admin del área comercial (contenedor de compras): es el "Super Admin de Listas/
   * Productos/Precios". Ve/administra TODAS las listas como Super Admin, pero NO
   * gestiona recursos globales (usuarios, roles, grants por rol, tipos legacy).
   */
  isListasAdmin(roles: string[] | undefined): boolean {
    // El cargo Admin Comercial no sustituye asignaciones individuales.
    return this.isSuperAdmin(roles);
  }

  /** Niveles con ranking >= al nivel solicitado. */
  levelsAtLeast(level: string): string[] {
    const target = LEVEL_RANK[level] ?? 0;
    return Object.keys(LEVEL_RANK).filter((l) => LEVEL_RANK[l] >= target);
  }

  /**
   * IDs de Listas a las que el usuario puede acceder con nivel >= `level`.
   * Tres resultados DISTINTOS (enmienda de seguridad 2026-10-18, hallazgo 2):
   *  - `null` → acceso global reservado a Super Admin.
   *  - `[ids]` → alcance restringido a esas Listas (puede ser `[]`).
   *  - La AUSENCIA de identidad NUNCA equivale a "sin filtro": se devuelve
   *    `[]` (cero listas = denegado). Un llamador no debe interpretar `null`
   *    como "mostrar todo" sin haber autenticado identidad con rol global.
   * Incluye los grants por rol ('ROLE:{rol}') del usuario.
   */
  async getAllowedListaIds(
    userId: string | undefined,
    roles: string[],
    level: string = 'view',
  ): Promise<string[] | null> {
    if (!userId?.trim()) return [];
    if (this.isSuperAdmin(roles)) return null;
    const grants = await this.currentGrants(userId);
    const actions = level === 'view' ? ['listas:read'] : this.actionsAtLevel(level);
    const context = { userId, roles };
    const candidates = grants.filter((g) => actions.includes(g.actionId));
    const canRead = (id: string) => actions.some((actionId) =>
      decideCatalogResourceAccessFromGrants(grants, actionId, context,
        { id, kind: 'lista', listId: id }).allowed);
    const global = candidates.some((g) => g.scope === 'global' && canRead('__global_scope_probe__'));
    if (global) return null;
    const listIds = [...new Set(candidates.filter((g) => g.scope === 'list' && g.resourceId).map((g) => g.resourceId!))];
    return listIds.filter(canRead);
  }

  /**
   * Nivel máximo efectivo del usuario sobre una Lista concreta (null si no tiene
   * assignment activo). Considera assignments por usuario y grants por rol.
   */
  async getUserLevel(
    userId: string,
    listaId: string,
    roles: string[] = [],
  ): Promise<string | null> {
    if (!userId?.trim()) return null;
    if (this.isSuperAdmin(roles)) return 'manage_access';
    const grants = await this.currentGrants(userId);
    const context = { userId, roles };
    for (const level of [...LEVEL_ORDER].reverse()) {
      if (this.actionsAtLevel(level).some((actionId) =>
        decideCatalogResourceAccessFromGrants(grants, actionId, context,
          { id: listaId, kind: 'lista', listId: listaId }).allowed)) return level;
    }
    return null;
  }

  private actionsAtLevel(level: string): string[] {
    switch (normalizeLevel(level)) {
      case 'view': return ['listas:read'];
      case 'view_prices': return ['prices:read'];
      case 'edit_prices': return ['prices:apply'];
      case 'edit_products': return ['products:write'];
      // Legacy level adapter represents one action only. Callers that perform
      // another operation must authorize its own action ID.
      case 'manage': return ['listas:update'];
      case 'manage_access': return ['assignments:manage'];
      default: return [];
    }
  }

  private async currentGrants(userId: string): Promise<ScopedGrant[]> {
    const rows = await this.prisma.accessGrant.findMany({
      where: { source: { userId } },
      select: { sourceId: true, actionId: true, scopeKind: true, resourceId: true },
    });
    return rows.map((row) => ({ sourceId: row.sourceId, actionId: row.actionId,
      scope: row.scopeKind as ScopedGrant['scope'], resourceId: row.resourceId ?? undefined }));
  }

  /**
   * Verifica acceso a una Lista concreta por las acciones exactas del nivel
   * solicitado. Los niveles legacy no implican acciones hermanas.
   * - Super Admin: siempre autorizado (ve incluso Listas inactivas/archivadas).
   * - Sin assignment activo → NotFoundException (se oculta la existencia).
   * - Assignment activo pero nivel insuficiente → ForbiddenException.
   * - Lista inactiva/archivada para no-admin → NotFoundException.
   */
  async assertListaAccess(
    listaId: string,
    ctx: AccessContext,
    level: string = 'view',
  ): Promise<void> {
    const actions = this.actionsAtLevel(level);
    if (actions.length !== 1) throw new ForbiddenException('Nivel ACL inválido');
    return this.assertListaAction(listaId, ctx, actions[0]);
  }

  /** Authorizes one exact catalog action on a server-resolved Lista. */
  async assertListaAction(
    listaId: string,
    ctx: AccessContext,
    actionId: string,
    options: { allowInactive?: boolean } = {},
  ): Promise<void> {
    if (!ctx.userId?.trim()) throw new NotFoundException('Lista no encontrada');
    if (this.isListasAdmin(ctx.roles)) return;

    const grants = await this.currentGrants(ctx.userId!);
    const resource = { id: listaId, kind: 'lista' as const, listId: listaId };
    const decision = decideCatalogResourceAccessFromGrants(grants, actionId, ctx, resource);
    if (!decision.allowed) throw new NotFoundException('Lista no encontrada');

    const lista = await this.prisma.lista.findUnique({
      where: { id: listaId },
      select: { isActive: true, archivedAt: true },
    });
    if (!lista) throw new NotFoundException('Lista no encontrada');
    if (!options.allowInactive && (!lista.isActive || lista.archivedAt)) {
      throw new NotFoundException('Lista no encontrada');
    }
  }

/**
   * Verifica acceso para restaurar/actualizar una Lista archivada.
   * Valida SOLO: existencia de la lista (404 si no existe) y nivel suficiente
   * (getUserLevel >= 'manage' o Super Admin). **No exige** isActive/archivedAt,
   * por lo que una Lista archivada (isActive=false, archivedAt set) puede restaurarse.
   * Este método está pensado para restore/update donde body incluye archivedAt: null.
   *
   * A diferencia de assertListaAccess: este NO lanza 404 si la lista está archivada,
   * permite la operación sobre Listas archivadas/inactivas.
   */
  async assertListaRestoreAccess(
    listaId: string,
    ctx: AccessContext,
    level: string = 'manage',
  ): Promise<void> {
    if (!ctx.userId?.trim()) throw new NotFoundException('Lista no encontrada');
    if (this.isListasAdmin(ctx.roles)) return;
    const actions = this.actionsAtLevel(level);
    if (actions.length !== 1) throw new ForbiddenException('Nivel ACL inválido');
    await this.assertListaAction(listaId, ctx, actions[0], { allowInactive: true });
  }

  /**
   * Verifica acceso a un Producto con prioridad de restricción explícita (checklist 17/31).
   *
   * Algoritmo:
   *  1. El producto debe existir y tener Lista dueña (404 si no).
   *  2. Asignaciones PRODUCT del usuario sobre el producto (activas e inactivas).
   *  3. RESTRICCIÓN EXPLÍCITA PREVALE: si existe assignment PRODUCT con isActive=false
   *     → 403, aunque la Lista del producto permita.
   *  4. Excepción positiva: si existe assignment PRODUCT activo con nivel >= requerido
   *     → permite (usa el más alto), aunque la Lista deniegue.
   *  5. Sin assignment de producto → cae al acceso de la Lista dueña (legacy).
   */
  async assertProductAccess(
    productId: string,
    ctx: AccessContext,
    level: string = 'view',
  ): Promise<{ listaId: string | null }> {
    if (!ctx.userId?.trim()) throw new NotFoundException('Producto no encontrado');
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { listaId: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    if (this.isListasAdmin(ctx.roles)) return { listaId: product.listaId };

    // 1. Excepciones por producto del usuario (activas e inactivas).
    const productAssignments = await this.prisma.assignment.findMany({
      where: {
        userId: ctx.userId,
        resourceType: 'PRODUCT',
        resourceId: productId,
      },
      select: { level: true, isActive: true },
    });

    // 2. Restricción explícita (isActive=false) prevalece sobre la Lista.
    if (productAssignments.some((a) => !a.isActive)) {
      throw new ForbiddenException('Acceso restringido a este producto');
    }

    const grants = await this.currentGrants(ctx.userId);
    const requestedActions = level === 'view' ? ['products:read'] : this.actionsAtLevel(level);
    const allowed = requestedActions.length > 0 && requestedActions.every((actionId) =>
      decideCatalogResourceAccessFromGrants(grants, actionId, ctx,
        { id: productId, kind: 'product', productId, listId: product.listaId ?? undefined }).allowed);
    if (!allowed) throw new NotFoundException('Producto no encontrado');
    return { listaId: product.listaId };
  }

  /**
   * Verifica acceso a un Precio exigiendo `level` sobre la Lista del producto dueño.
   * No revela existencia del precio si la Lista no está autorizada.
   */
  async assertPriceAccess(
    priceId: string,
    ctx: AccessContext,
    level: string = 'view',
  ): Promise<{ listaId: string }> {
    const price = await this.prisma.price.findUnique({
      where: { id: priceId },
      select: { product: { select: { listaId: true } } },
    });
    if (!price) throw new NotFoundException('Precio no encontrado');
    const listaId = price.product?.listaId;
    if (!listaId) throw new NotFoundException('Precio no encontrado');
    await this.assertListaAccess(listaId, ctx, level);
    return { listaId };
  }

  /** Devuelve true si el contexto (usuario/rol) puede operar sobre recursos de la Lista. */
  async can(
    listaId: string,
    ctx: AccessContext,
    level: string,
  ): Promise<boolean> {
    if (!ctx.userId?.trim()) return false;
    if (this.isListasAdmin(ctx.roles)) return true;
    const grants = await this.currentGrants(ctx.userId!);
    const actions = this.actionsAtLevel(level);
    if (actions.length !== 1) return false;
    const resource = { id: listaId, kind: 'lista' as const, listId: listaId };
    return decideCatalogResourceAccessFromGrants(grants, actions[0], ctx, resource).allowed;
  }

  /**
   * ¿El contexto puede ADMINISTRAR ACCESOS sobre una Lista (manage_access)?
   * Super Admin siempre. Se usa para matrix/preview y audit de accesos.
   */
  async canManageAccessOnLista(
    listaId: string,
    ctx: AccessContext,
  ): Promise<boolean> {
    if (!ctx.userId?.trim()) return false;
    if (this.isListasAdmin(ctx.roles)) return true;
    return this.can(listaId, ctx, 'manage_access');
  }

  /**
   * ¿El contexto puede ADMINISTRAR ACCESOS sobre un Producto (manage_access sobre
   * la Lista dueña)? Super Admin siempre.
   */
  async canManageAccessOnProduct(
    productId: string,
    ctx: AccessContext,
  ): Promise<boolean> {
    if (!ctx.userId?.trim()) return false;
    if (this.isListasAdmin(ctx.roles)) return true;
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { listaId: true },
    });
    if (!product?.listaId) return false;
    return this.canManageAccessOnLista(product.listaId, ctx);
  }

  /**
   * ¿El contexto puede GESTIONAR ACCESOS sobre una Lista (manage o superior)?
   * Mínimo para crear/actualizar/revocar assignments (anti-escalada lo acota).
   */
  async canAdministerAccessOnLista(
    listaId: string,
    ctx: AccessContext,
  ): Promise<boolean> {
    if (!ctx.userId?.trim()) return false;
    if (this.isListasAdmin(ctx.roles)) return true;
    return this.can(listaId, ctx, 'manage');
  }

  /** Acciones permitidas para un nivel efectivo (matrix viewer). */
  actionsForLevel(level?: string | null) {
    const rank = level ? (LEVEL_RANK[level] ?? -1) : -1;
    const at = (l: string) => rank >= LEVEL_RANK[l];
    return {
      ver: at('view'),
      verPrecios: at('view_prices'),
      editarPrecios: at('edit_prices'),
      editarProductos: at('edit_products'),
      administrar: at('manage'),
      administrarAccesos: at('manage_access'),
    };
  }

  /**
   * Puente ACL (niveles por Lista) → resolver BASE-04 (acción+alcance).
   *
   * Traduce el nivel efectivo del usuario sobre una Lista concreta en el grant
   * de alcance `list` que el resolver entiende, y delega en `resolveAccess`
   * para que las reglas duras (identidad, acción deshabilitada, dependencias,
   * scope del navegador irrelevante) se apliquen en un solo sitio.
   *
   * - Super Admin o Admin Comercial → grant `global` con procedencia
   *   `acl:listas-admin` (la excepción es explícita y auditable).
   * - Con assignment activo de nivel >= view → grant `list` con
   *   `resourceId = listaId`.
   * - Sin nivel → el resolver devuelve `no-covering-grant`; el consumidor lo
   *   traduce a 404/403 como ya hace `assertListaAccess`.
   */
  async resolveListaAction(
    actionId: string,
    listaId: string,
    identity: AccessIdentity,
    roles: string[],
  ): Promise<AccessDecision> {
    const resource = { id: listaId, kind: 'lista' as const, listId: listaId };
    const definition = getActionDefinition(actionId);

    // Acción desconocida o deshabilitada: se deniega sin tocar la BD.
    if (!definition || !definition.enabled) {
      return resolveAccess({ identity, actionId, grants: [], resource });
    }

    const grants = await this.currentGrants(identity.userId);
    return resolveAccess({ identity: { ...identity, superAdmin: this.isSuperAdmin(roles) && Boolean(identity.userId) }, actionId, grants, resource });
  }

}
