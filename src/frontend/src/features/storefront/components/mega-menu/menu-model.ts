import type { MenuCategory } from '../../types/categoryMenu'

/** Landing route of a category, rendered by the category page (MENU-05). */
export const CATEGORY_ROUTE = '/catalogo/categoria'

/** Id of the region the trigger controls, referenced by `aria-controls`. */
export const MENU_PANEL_ID = 'category-mega-menu'

export function categoryHref(slug: string): string {
  return `${CATEGORY_ROUTE}/${slug}`
}

/**
 * Roots the mega menu is able to present.
 *
 * `GET /api/public/categories/menu` also returns the flat categories imported
 * from the library (35 of them, `sortOrder` 0, no children). The Homecenter
 * layout is a sidebar of *families* next to an area of columns, so a root with
 * no children has nothing to show beside its name and only adds a scroll row
 * that can lead nowhere. Those categories stay reachable from the catalog link
 * at the bottom of the panel; the families with children are the menu.
 */
export function navigableRoots(categories: MenuCategory[]): MenuCategory[] {
  return categories.filter((root) => root.children.length > 0)
}

/** Keeps the wanted root when it still exists, otherwise falls back to the first. */
export function resolveRootId(roots: MenuCategory[], preferredId: string | null): string | null {
  if (preferredId !== null && roots.some((root) => root.id === preferredId)) return preferredId
  return roots[0]?.id ?? null
}

export function findRoot(roots: MenuCategory[], rootId: string | null): MenuCategory | null {
  if (rootId === null) return null
  return roots.find((root) => root.id === rootId) ?? null
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
      if (node.isFeatured) tiles.push(node)
      visit(node.children)
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
