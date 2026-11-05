import api from '../../services/api'
import type { UsageReport } from './masters-rules'

export const mastersKeys = {
  categories: ['masters', 'categories'] as const,
  subcategories: ['masters', 'subcategories'] as const,
  brands: ['masters', 'brands'] as const,
  tariffs: ['masters', 'tariffs'] as const,
  definitions: ['masters', 'spec-definitions'] as const,
  template: (subcategoryId: string) => ['masters', 'spec-template', subcategoryId] as const,
  templateUsage: (subcategoryId: string) => ['masters', 'spec-template-usage', subcategoryId] as const,
}

const enc = encodeURIComponent

// ------------------------------------------------------------ subcategories

export interface MasterSubcategory {
  id: string
  categoryId: string
  name: string
  slug: string
  sortOrder?: number
  isActive: boolean
  searchTerms?: string[]
  productCount?: number
  category?: { id: string; name: string } | null
}

export interface SubcategoryPayload {
  categoryId?: string
  name?: string
  slug?: string
  isActive?: boolean
  confirmImpact?: boolean
}

export async function fetchSubcategories(params: { q?: string; categoryId?: string; isActive?: boolean } = {}): Promise<MasterSubcategory[]> {
  const res = await api.get('/subcategories', { params: { ...params, pageSize: 200 } })
  const data = res.data as { data?: MasterSubcategory[] } | MasterSubcategory[]
  return Array.isArray(data) ? data : (data.data ?? [])
}

export async function createSubcategory(payload: Required<Pick<SubcategoryPayload, 'categoryId' | 'name'>> & { slug?: string }): Promise<MasterSubcategory> {
  return (await api.post('/subcategories', payload)).data as MasterSubcategory
}

export async function updateSubcategory(id: string, payload: SubcategoryPayload): Promise<MasterSubcategory> {
  return (await api.put(`/subcategories/${enc(id)}`, payload)).data as MasterSubcategory
}

export async function setSubcategoryActive(id: string, isActive: boolean): Promise<MasterSubcategory> {
  return (await api.patch(`/subcategories/${enc(id)}/active`, { isActive })).data as MasterSubcategory
}

export async function deleteSubcategory(id: string): Promise<void> {
  await api.delete(`/subcategories/${enc(id)}`)
}

export async function fetchSubcategoryUsage(id: string): Promise<UsageReport> {
  return (await api.get(`/subcategories/${enc(id)}/usage`)).data as UsageReport
}

// -------------------------------------------------- categories / brands / tariffs

export async function setCategoryActive(id: string, isActive: boolean): Promise<unknown> {
  return (await api.patch(`/categories/${enc(id)}/active`, { isActive })).data
}

export async function fetchCategoryUsage(id: string): Promise<UsageReport> {
  return (await api.get(`/categories/${enc(id)}/usage`)).data as UsageReport
}

/** Category update with the impact-confirmation flag (parent change). */
export async function updateCategoryWithImpact(id: string, payload: Record<string, unknown>, confirmImpact: boolean): Promise<unknown> {
  return (await api.put(`/categories/${enc(id)}`, confirmImpact ? { ...payload, confirmImpact: true } : payload)).data
}

export async function fetchBrandUsage(id: string): Promise<UsageReport> {
  return (await api.get(`/brands/${enc(id)}/usage`)).data as UsageReport
}

export async function fetchPriceListUsage(id: string): Promise<UsageReport> {
  return (await api.get(`/prices/lists/${enc(id)}/usage`)).data as UsageReport
}

/** Tariff update with the impact-confirmation flag (currency change with prices). */
export async function updatePriceListWithImpact(id: string, payload: Record<string, unknown>, confirmImpact: boolean): Promise<unknown> {
  return (await api.put(`/prices/lists/${enc(id)}`, confirmImpact ? { ...payload, confirmImpact: true } : payload)).data
}

// ---------------------------------------------------------------- dictionary

export type SpecDataType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'OPTION' | 'MULTI_OPTION'

export interface SpecOptionView {
  key: string
  label: string
  sortOrder?: number
  isActive: boolean
}

export interface SpecDefinitionView {
  id: string
  key: string
  label: string
  dataType: SpecDataType
  unit: string | null
  isActive: boolean
  options: SpecOptionView[]
}

export interface SpecDefinitionCreate {
  key: string
  label: string
  dataType: SpecDataType
  unit?: string | null
  options?: { key: string; label: string; sortOrder?: number; isActive?: boolean }[]
}

export interface SpecDefinitionUpdate {
  label?: string
  unit?: string | null
  isActive?: boolean
  options?: { key: string; label: string; sortOrder?: number; isActive?: boolean }[]
  confirmImpact?: boolean
}

export async function fetchSpecDefinitions(q?: string): Promise<SpecDefinitionView[]> {
  const res = await api.get('/library/spec-definitions', { params: { includeInactive: 'true', ...(q ? { q } : {}) } })
  return (Array.isArray(res.data) ? res.data : []) as SpecDefinitionView[]
}

export async function createSpecDefinition(payload: SpecDefinitionCreate): Promise<SpecDefinitionView> {
  return (await api.post('/library/spec-definitions', payload)).data as SpecDefinitionView
}

export async function updateSpecDefinition(idOrKey: string, payload: SpecDefinitionUpdate): Promise<SpecDefinitionView & { voidedApprovals?: number }> {
  return (await api.patch(`/library/spec-definitions/${enc(idOrKey)}`, payload)).data as SpecDefinitionView & { voidedApprovals?: number }
}

export async function fetchSpecDefinitionUsage(idOrKey: string): Promise<UsageReport> {
  return (await api.get(`/library/spec-definitions/${enc(idOrKey)}/usage`)).data as UsageReport
}

// -------------------------------------------------------------------- molds

export interface MoldEntry {
  specKey: string
  label: string
  dataType: SpecDataType
  unit: string | null
  status: 'PROPOSED' | 'APPROVED' | 'RETIRED'
  isRequired: boolean
  isFilterable: boolean
  requiredReason: string | null
  sortOrder: number
  approvedAt?: string | null
}

export interface MoldView {
  subcategoryId: string
  entries: MoldEntry[]
  summary?: { proposed: number; approved: number; retired: number }
}

export interface MoldUsage {
  id?: string
  counts: { proposed: number; approved: number; retired: number; products: number; storedValues: number }
}

export async function fetchMold(subcategoryId: string): Promise<MoldView> {
  return (await api.get(`/library/subcategories/${enc(subcategoryId)}/spec-template`)).data as MoldView
}

export async function fetchMoldUsage(subcategoryId: string): Promise<MoldUsage> {
  return (await api.get(`/library/subcategories/${enc(subcategoryId)}/spec-template/usage`)).data as MoldUsage
}

/** Needs products:approveSpecs on the server; the approver is the signed-in user. */
export async function approveMoldEntry(subcategoryId: string, specKey: string, reason?: string): Promise<unknown> {
  return (await api.post(`/library/subcategories/${enc(subcategoryId)}/spec-template/${enc(specKey)}/approve`, reason ? { reason } : {})).data
}
