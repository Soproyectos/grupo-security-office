import type { Product } from '../types/product.types'
import { deserializeSpecFields, serializeSpecFields, type SpecField } from '../components/SpecEditor'

/**
 * Pure model of the form the product sheet editor page owns: every field here is saved by one
 * `PUT /products/:id`. Sections that persist on their own (photos, move, public sheet) are not part
 * of it and are never counted as unsaved changes.
 */
export const EDITOR_FIELDS = ['name', 'description', 'brandId', 'categoryId', 'subcategoryId', 'technicalSpecs', 'extraAttributes'] as const
export type EditorField = (typeof EDITOR_FIELDS)[number]

export interface EditorValues {
  name: string
  description: string
  brandId: string
  categoryId: string
  /** Empty while the product is still to be classified. */
  subcategoryId: string
  technicalSpecs: SpecField[]
  extraAttributes: SpecField[]
}

export const EDITOR_FIELD_LABELS: Record<EditorField, string> = {
  name: 'Nombre',
  description: 'Descripción',
  brandId: 'Marca',
  categoryId: 'Categoría',
  subcategoryId: 'Subcategoría',
  technicalSpecs: 'Especificaciones técnicas',
  extraAttributes: 'Atributos extra',
}

type EditableProduct = Pick<Product, 'name' | 'description' | 'brandId' | 'categoryId' | 'technicalSpecs' | 'extraAttributes'> & { subcategoryId?: string | null }

/** Values the server currently holds for the editable fields. */
export function valuesOfProduct(product: EditableProduct): EditorValues {
  return {
    name: product.name,
    description: product.description ?? '',
    brandId: product.brandId ?? '',
    categoryId: product.categoryId ?? '',
    subcategoryId: product.subcategoryId ?? '',
    technicalSpecs: deserializeSpecFields(product.technicalSpecs ?? null),
    extraAttributes: deserializeSpecFields(product.extraAttributes ?? null),
  }
}

/** Specs compare by what would be sent: rows without a key are dropped, exactly as on save. */
function comparable(values: EditorValues, field: EditorField): string {
  if (field === 'technicalSpecs' || field === 'extraAttributes') {
    return JSON.stringify(serializeSpecFields(values[field]))
  }
  return values[field]
}

/** Fields whose current value differs from the baseline. A whole spec block counts as one field. */
export function changedFields(baseline: EditorValues, current: EditorValues): EditorField[] {
  return EDITOR_FIELDS.filter((field) => comparable(baseline, field) !== comparable(current, field))
}

export function unsavedChangesLabel(count: number): string {
  if (count <= 0) return 'Sin cambios'
  return count === 1 ? '1 cambio sin guardar' : `${count} cambios sin guardar`
}

/** Body of `PUT /products/:id`: only the fields that changed. */
export function buildUpdatePayload(current: EditorValues, changed: readonly EditorField[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of changed) {
    if (field === 'technicalSpecs' || field === 'extraAttributes') payload[field] = serializeSpecFields(current[field])
    else if (field === 'name') payload.name = current.name.trim()
    // The server derives the root category from the subcategory: never send both.
    // Empty means "none yet": the server stores null (never a placeholder brand or category).
    else if (field === 'subcategoryId') payload.subcategoryId = current.subcategoryId || null
    else if (field === 'categoryId' && changed.includes('subcategoryId')) continue
    else if (field === 'brandId' || field === 'categoryId') payload[field] = current[field] || null
    else payload[field] = current[field]
  }
  return payload
}

function specFieldsProblem(fields: SpecField[]): string | null {
  const keys = fields.map((field) => field.key.trim())
  if (keys.some((key) => !key)) return 'las claves no pueden estar vacías.'
  if (new Set(keys).size !== keys.length) return 'hay claves duplicadas.'
  if (fields.some((field) => field.type === 'SELECT' && (!field.options || field.options.length === 0))) {
    return 'las listas de selección necesitan opciones.'
  }
  return null
}

/** First problem in the changed fields (what the server would reject), or null when it can be saved. */
export function validateEditorValues(current: EditorValues, changed: readonly EditorField[]): string | null {
  if (changed.includes('name') && current.name.trim().length < 2) return 'El nombre debe tener al menos 2 caracteres.'
  // Brand and category are optional on a draft ("por clasificar"); publishing is what requires them.
  for (const field of ['technicalSpecs', 'extraAttributes'] as const) {
    if (!changed.includes(field)) continue
    const problem = specFieldsProblem(current[field])
    if (problem) return `${EDITOR_FIELD_LABELS[field]}: ${problem}`
  }
  return null
}
