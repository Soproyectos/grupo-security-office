import type { MenuCategory } from '../../types/categoryMenu'

/** Landing route of a category, rendered by the category page (MENU-05). */
export const CATEGORY_ROUTE = '/catalogo/categoria'

/** Public product sheet route, rendered by the storefront product page. */
export const PRODUCT_ROUTE = '/catalogo/productos'

/** Id of the region the trigger controls, referenced by `aria-controls`. */
export const MENU_PANEL_ID = 'category-mega-menu'

export function categoryHref(slug: string): string {
  return `${CATEGORY_ROUTE}/${slug}`
}

/** A persisted subcategory is a filter on its parent category route, not a Category route. */
export function categoryNodeHref(node: MenuCategory, parentSlug?: string): string {
  if (node.subcategoryId && parentSlug) {
    return `${categoryHref(parentSlug)}?tipo=${encodeURIComponent(node.subcategorySlug ?? node.slug)}`
  }
  return categoryHref(node.slug)
}

export function productHref(id: string): string {
  return `${PRODUCT_ROUTE}/${id}`
}

/**
 * Roots the mega menu is able to present.
 *
 * Every root that has products is listed, in the order the backend sends
 * them, whether or not it has subcategories. Roots without products are left
 * out. If no root has products (empty catalog), show all of them so the
 * catalog navigation never ends up empty.
 */
export function navigableRoots(categories: MenuCategory[]): MenuCategory[] {
  const stocked = categories.filter((root) => root.productCount > 0)
  return stocked.length > 0 ? stocked : categories
}

/** "1 producto" / "378 productos". */
export function productCountLabel(count: number): string {
  return count === 1 ? '1 producto' : `${count} productos`
}

/** Keeps the selected root, or starts with a root that offers subcategories. */
export function resolveRootId(roots: MenuCategory[], preferredId: string | null): string | null {
  if (preferredId !== null && roots.some((root) => root.id === preferredId)) return preferredId
  return roots.find((root) => root.children.length > 0)?.id ?? roots[0]?.id ?? null
}

export function findRoot(roots: MenuCategory[], rootId: string | null): MenuCategory | null {
  if (rootId === null) return null
  return roots.find((root) => root.id === rootId) ?? null
}

/**
 * True while there are covers left to reveal on the right of the circles
 * track: the row arrow is only rendered in that case, so it never shows up
 * as an idle button. Exported for the no-DOM test suite.
 */
export function hasForwardOverflow(
  track: Pick<HTMLElement, 'scrollLeft' | 'clientWidth' | 'scrollWidth'>,
): boolean {
  return track.scrollLeft + track.clientWidth < track.scrollWidth - 1
}

/**
 * Covers of the circles row: every featured node below the root (levels 2 and
 * 3) in the order the backend sends them. Featured nodes are the only ones
 * that carry an `imageUrl`, which is exactly what the circles need.
 */
export function featuredTiles(root: MenuCategory | null): MenuCategory[] {
  if (root === null) return []

  const tiles: MenuCategory[] = []
  const visit = (nodes: MenuCategory[]): void => {
    for (const node of nodes) {
      if (node.productCount > 0 && node.isFeatured) tiles.push(node)
      visit(node.children.filter((child) => child.productCount > 0))
    }
  }
  visit(root.children)

  return tiles
}

const NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End'])

/**
 * Root reached with the keyboard, wrapping at both ends. Returns `null` for any
 * key the sidebar does not handle, so the caller keeps its default behaviour.
 */
export function nextRootId(roots: MenuCategory[], currentId: string | null, key: string): string | null {
  if (roots.length === 0 || !NAVIGATION_KEYS.has(key)) return null

  const found = roots.findIndex((root) => root.id === currentId)
  const from = found === -1 ? 0 : found
  const offset = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
  const index =
    key === 'Home' ? 0 : key === 'End' ? roots.length - 1 : (from + offset + roots.length) % roots.length

  return roots[index]?.id ?? null
}
