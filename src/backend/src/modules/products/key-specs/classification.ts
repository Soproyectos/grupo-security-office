/**
 * Classification tree rules: a subcategory hangs from a ROOT category, and the
 * visible path is built from that tree (doc section 1, "Ruta"). Pure functions.
 */

export interface Subcategory {
  id: string
  categoryId: string
  name: string
  slug: string
  sortOrder: number
  isActive: boolean
}

export interface CategoryRef {
  id: string
  name: string
  slug: string
  parentId: string | null
}

export interface ClassificationIssue {
  code: 'category_not_root' | 'category_missing'
  message: string
}

export interface ClassificationPathStep {
  label: string
  slug: string
}

/** Service-level rule of `subcategories.categoryId`: the parent must be a root category. */
export function validateSubcategoryParent(
  subcategory: Subcategory,
  categoriesById: ReadonlyMap<string, CategoryRef>,
): ClassificationIssue[] {
  const category = categoriesById.get(subcategory.categoryId)
  if (!category) {
    return [{ code: 'category_missing', message: `Category "${subcategory.categoryId}" of subcategory "${subcategory.slug}" does not exist.` }]
  }
  if (category.parentId !== null) {
    return [{ code: 'category_not_root', message: `Category "${category.slug}" is not a root category; subcategories hang only from root categories.` }]
  }
  return []
}

/**
 * Category > Subcategory. A product without subcategory is "Por clasificar" and
 * has no path. A subcategory whose category cannot be resolved, or is not a root
 * category, also yields no path, because a half or misleading path would
 * misinform; `validateSubcategoryParent` reports why.
 */
export function classificationPath(
  subcategory: Subcategory | null,
  categoriesById: ReadonlyMap<string, CategoryRef>,
): ClassificationPathStep[] {
  if (!subcategory) return []
  if (validateSubcategoryParent(subcategory, categoriesById).length > 0) return []
  const category = categoriesById.get(subcategory.categoryId)!
  return [
    { label: category.name, slug: category.slug },
    { label: subcategory.name, slug: subcategory.slug },
  ]
}
