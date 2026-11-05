import api from '../../../services/api'
import type {
  ClassificationRoot,
  KeySpecMissing,
  KeySpecProjection,
  KeySpecValues,
  KeySpecWriteEntry,
  KeySpecWriteResult,
  SpecTemplate,
  SubcategoryChangePreview,
} from '../types/key-specs.types'

export const classificationKeys = {
  tree: ['classification-tree'] as const,
}

export const keySpecKeys = {
  all: (productId: string) => ['key-specs', productId] as const,
  values: (productId: string) => ['key-specs', productId, 'values'] as const,
  missing: (productId: string) => ['key-specs', productId, 'missing'] as const,
  projection: (productId: string) => ['key-specs', productId, 'projection'] as const,
  template: (subcategoryId: string) => ['key-specs', 'template', subcategoryId] as const,
  changePreview: (productId: string, subcategoryId: string) =>
    ['key-specs', productId, 'change-preview', subcategoryId] as const,
}

/** GET /categories/classification-tree: active roots with their active subcategories. */
export async function fetchClassificationTree(): Promise<ClassificationRoot[]> {
  const res = await api.get('/categories/classification-tree')
  return (res.data?.data ?? []) as ClassificationRoot[]
}

/** GET /library/subcategories/:id/spec-template */
export async function fetchSpecTemplate(subcategoryId: string): Promise<SpecTemplate> {
  const res = await api.get(`/library/subcategories/${subcategoryId}/spec-template`)
  return res.data as SpecTemplate
}

/** GET /products/:id/key-specs */
export async function fetchKeySpecValues(productId: string): Promise<KeySpecValues> {
  const res = await api.get(`/products/${productId}/key-specs`)
  return res.data as KeySpecValues
}

/** PUT /products/:id/key-specs: partial save, one result per entry. */
export async function saveKeySpecValues(productId: string, entries: KeySpecWriteEntry[]): Promise<KeySpecWriteResult[]> {
  const res = await api.put(`/products/${productId}/key-specs`, { entries })
  return ((res.data as { results?: KeySpecWriteResult[] })?.results ?? []) as KeySpecWriteResult[]
}

/** GET /products/:id/key-specs/missing?stage=WORKING */
export async function fetchMissingKeySpecs(productId: string): Promise<KeySpecMissing> {
  const res = await api.get(`/products/${productId}/key-specs/missing`, { params: { stage: 'WORKING' } })
  return res.data as KeySpecMissing
}

/** GET /products/:id/key-specs/subcategory-change-preview: no writes. */
export async function fetchSubcategoryChangePreview(productId: string, subcategoryId: string): Promise<SubcategoryChangePreview> {
  const res = await api.get(`/products/${productId}/key-specs/subcategory-change-preview`, { params: { subcategoryId } })
  return res.data as SubcategoryChangePreview
}

/** GET /products/:id/key-specs/projection: what the sheet would show from published and from draft values. */
export async function fetchKeySpecProjection(productId: string): Promise<KeySpecProjection> {
  const res = await api.get(`/products/${productId}/key-specs/projection`)
  return res.data as KeySpecProjection
}
