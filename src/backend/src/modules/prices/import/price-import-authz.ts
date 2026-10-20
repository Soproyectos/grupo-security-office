import type { AccessContext } from '../../../common/acl/acl.service';
import { decideCatalogResourceAccessFromGrants, type CatalogResource } from '../../../common/security/catalog-resource-access';
import type { ScopedGrant } from '../../../common/security/data-scope';
import { ROLE } from '../../../common/rbac/roles.constants';

/** Minimal product reference needed to authorize a price operation. */
export interface ProductRef {
  id: string;
  listaId: string | null;
}

/**
 * Per-request authorization of price operations over products of SEVERAL listas.
 *
 * It evaluates a CURRENT grant snapshot with `decideCatalogResourceAccessFromGrants`
 * exactly as `AclService.assertListaAction` does, so the answer for one lista is
 * the same as for a single-lista request:
 *  - a product with a lista is checked against `{ kind: 'lista', id: listaId, listId: listaId }`;
 *  - a product WITHOUT a lista is checked as a `product` resource with no `listId`,
 *    which only a GLOBAL-scope grant can cover.
 * Every action in `actionIds` must be allowed (for products without a lista,
 * every action in `unlistedActionIds`, which defaults to the same list). Never cache an instance across
 * requests: the snapshot must be fresh for each request.
 */
export class PriceImportAccess {
  private readonly byLista = new Map<string, boolean>();
  private readonly byUnlistedProduct = new Map<string, boolean>();

  constructor(
    private readonly rows: readonly ScopedGrant[],
    private readonly ctx: AccessContext,
    private readonly actionIds: readonly string[],
    private readonly unlistedActionIds: readonly string[] = actionIds,
  ) {}

  /** Whether the caller holds every action on this lista. */
  allowsLista(listaId: string): boolean {
    const hit = this.byLista.get(listaId);
    if (hit !== undefined) return hit;
    const resource: CatalogResource = { id: listaId, kind: 'lista', listId: listaId };
    const allowed = this.decide(resource, this.actionIds);
    this.byLista.set(listaId, allowed);
    return allowed;
  }

  /** Whether the caller holds every action on a product that belongs to no lista. */
  allowsUnlistedProduct(productId: string): boolean {
    const hit = this.byUnlistedProduct.get(productId);
    if (hit !== undefined) return hit;
    const resource: CatalogResource = { id: productId, kind: 'product', productId };
    const allowed = this.decide(resource, this.unlistedActionIds);
    this.byUnlistedProduct.set(productId, allowed);
    return allowed;
  }

  allows(product: ProductRef): boolean {
    return product.listaId ? this.allowsLista(product.listaId) : this.allowsUnlistedProduct(product.id);
  }

  /** Ids of the products the caller may use. */
  allowedProductIds(products: readonly ProductRef[]): Set<string> {
    return new Set(products.filter((p) => this.allows(p)).map((p) => p.id));
  }

  private decide(resource: CatalogResource, actionIds: readonly string[]): boolean {
    return actionIds.every((actionId) => decideCatalogResourceAccessFromGrants(this.rows, actionId, this.ctx, resource).allowed);
  }
}

export function isSuperAdmin(ctx: AccessContext): boolean {
  return ctx.roles?.includes(ROLE.SUPER_ADMIN) === true;
}
