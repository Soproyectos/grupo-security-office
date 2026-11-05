import type { ClassificationRoot, ClassificationSubcategory } from '../types/key-specs.types'

/** Plain-language text for each classification error code the server can answer with. */
export const CLASSIFICATION_ERROR_MESSAGES: Record<string, string> = {
  CLASSIFICATION_CONFLICT: 'La categoría y la subcategoría no coinciden. Elige solo la subcategoría y se ajusta la categoría.',
  SUBCATEGORY_NOT_FOUND: 'Esa subcategoría ya no existe. Elige otra de la lista.',
  SUBCATEGORY_INACTIVE: 'Esa subcategoría está desactivada. Elige otra de la lista.',
  SUBCATEGORY_PARENT_INVALID: 'Esa subcategoría no pertenece a una categoría válida. Elige otra de la lista.',
  SUBCATEGORY_UNSUPPORTED: 'Este producto no admite subcategoría. Deja la clasificación como está.',
  CATEGORY_REQUIRED: 'Falta la categoría. Elige una subcategoría para clasificar el producto.',
  CATEGORY_DEPTH_INVALID: 'Solo se puede elegir una categoría principal o una subcategoría, no un nivel intermedio.',
  CATEGORY_NOT_FOUND: 'La categoría ya no existe. Recarga la página y elige otra.',
}

const codeOf = (error: unknown): string | undefined => {
  const data = (error as { response?: { data?: { code?: unknown } } } | null)?.response?.data
  return typeof data?.code === 'string' ? data.code : undefined
}

/** Spanish message for a known classification error code, or null when the error is something else. */
export function classificationErrorMessage(error: unknown): string | null {
  const code = codeOf(error)
  return code ? (CLASSIFICATION_ERROR_MESSAGES[code] ?? null) : null
}

export interface SubcategoryLookup {
  subcategory: ClassificationSubcategory
  root: ClassificationRoot
}

/** Finds a subcategory in the tree together with its root category. */
export function findSubcategory(tree: ClassificationRoot[], subcategoryId: string | null | undefined): SubcategoryLookup | null {
  if (!subcategoryId) return null
  for (const root of tree) {
    const subcategory = root.subcategories.find((sub) => sub.id === subcategoryId)
    if (subcategory) return { subcategory, root }
  }
  return null
}

/** A product is "Por clasificar" while its subcategory or its brand is missing. */
export function isClassificationIncomplete(values: { subcategoryId?: string | null; brandId?: string | null }): boolean {
  return !values.subcategoryId || !values.brandId
}

/** What is missing, in plain words, for the incomplete badge. */
export function classificationMissingParts(values: { subcategoryId?: string | null; brandId?: string | null }): string[] {
  const parts: string[] = []
  if (!values.subcategoryId) parts.push('subcategoría')
  if (!values.brandId) parts.push('marca')
  return parts
}
