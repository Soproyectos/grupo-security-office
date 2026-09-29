import type { MenuCategory } from '../types/categoryMenu'

export interface CountedCategory {
  category: MenuCategory
  count: number
}

/**
 * Categories of the home tiles: only those that really hold products, the most
 * stocked first, capped. Ties keep the order of the menu. A category whose
 * count is unknown (`undefined`, e.g. its request failed) is left out rather
 * than shown with a made-up number.
 */
export function pickCountedCategories(
  categories: MenuCategory[],
  counts: ReadonlyMap<string, number>,
  cap: number,
): CountedCategory[] {
  return categories
    .map((category, position) => ({ category, count: counts.get(category.slug) ?? 0, position }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.position - b.position)
    .slice(0, cap)
    .map(({ category, count }) => ({ category, count }))
}
