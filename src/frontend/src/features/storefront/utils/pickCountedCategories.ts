import type { MenuCategory } from '../types/categoryMenu'

export interface CountedCategory {
  category: MenuCategory
  count: number
}

/**
 * Categories of the home tiles: only those that really hold products, the most
 * stocked first, capped. Counts come from the menu (`productCount`, descendants
 * included). Ties keep the order of the menu.
 */
export function pickCountedCategories(categories: MenuCategory[], cap: number): CountedCategory[] {
  return categories
    .map((category, position) => ({ category, count: category.productCount, position }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.position - b.position)
    .slice(0, cap)
    .map(({ category, count }) => ({ category, count }))
}
