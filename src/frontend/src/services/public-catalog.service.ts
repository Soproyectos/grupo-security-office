import api from './api'
import type { MenuCategory } from '../features/storefront/types/categoryMenu'
import type {
  PublicBrandSummary,
  PublicProductFilters,
  PublicProductListing,
  PublicProductResult,
} from '../features/storefront/types/publicProduct'

const MENU_ENDPOINT = '/public/categories/menu'
const PRODUCTS_ENDPOINT = '/public/products'

/**
 * The endpoint arrives DOUBLE wrapped: the controller returns `{ data: [...] }`
 * and the global `TransformInterceptor` wraps the response one more time, so the
 * wire payload is `{ data: { data: [...] } }`. The `api` client interceptor peels
 * the outer layer, but a stale backend or a direct call to this service can
 * still hand us either shape, so unwrap until the array shows up instead of
 * assuming a single layer.
 *
 * An unexpected shape is an empty menu, not a crash: only HTTP failures reject,
 * so the consumer can offer a retry.
 */
/**
 * The endpoint arrives DOUBLE wrapped: the controller returns `{ data: [...] }`
 * and the global `TransformInterceptor` wraps the response one more time, so the
 * wire payload is `{ data: { data: [...] } }`. The `api` client interceptor peels
 * the outer layer, but a stale backend or a direct call to this service can
 * still hand us either shape, so unwrap until the array shows up instead of
 * assuming a single layer.
 *
 * An unexpected shape is an empty menu, not a crash: only HTTP failures reject,
 * so the consumer can offer a retry.
 */
function toDataArray(payload: unknown): unknown[] {
  let value = payload

  for (let depth = 0; depth < 3; depth += 1) {
    if (Array.isArray(value)) break
    if (typeof value !== 'object' || value === null || !('data' in value)) return []
    value = (value as { data: unknown }).data
  }

  return Array.isArray(value) ? (value as unknown[]) : []
}

function toMenuArray(payload: unknown): MenuCategory[] {
  return toDataArray(payload) as MenuCategory[]
}

export async function fetchCategoryMenu(): Promise<MenuCategory[]> {
  const response = await api.get(MENU_ENDPOINT)
  return toMenuArray(response.data)
}

/** Page size of the storefront listings, mirroring the backend default. */
export const PRODUCT_PAGE_SIZE = 24

export interface PublicKeySpecFacet {
  specKey: string
  label: string
  dataType: string
  unit: string | null
  values: Array<{ value: string; label: string; count: number }>
}

export interface PublicKeySpecFacets {
  subcategoryId: string
  products: number
  facets: PublicKeySpecFacet[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Finds the `{ data: [...], meta }` envelope of the listing. Same tolerance as
 * `toDataArray`: the payload may arrive double wrapped or already peeled by the
 * client interceptor. An unexpected shape is an empty listing, not a crash.
 */
function toListing(payload: unknown, offset: number, limit: number): PublicProductListing {
  let value = payload

  for (let depth = 0; depth < 3; depth += 1) {
    if (Array.isArray(value)) return { items: value as PublicProductResult[], total: value.length, offset, limit }
    if (!isRecord(value) || !('data' in value)) break
    if (Array.isArray(value.data)) {
      const items = value.data as PublicProductResult[]
      const meta = isRecord(value.meta) ? value.meta : {}
      return { items, total: typeof meta.total === 'number' ? meta.total : items.length, offset, limit }
    }
    value = value.data
  }

  return { items: [], total: 0, offset, limit }
}

/**
 * Public product listing of the storefront (search and category pages). Only
 * HTTP failures reject, so the page can offer a retry.
 */
export async function fetchPublicProducts(
  filters: PublicProductFilters,
  offset = 0,
  limit = PRODUCT_PAGE_SIZE,
): Promise<PublicProductListing> {
  const params: Record<string, string | number> = { offset, limit }
  if (filters.q) params.q = filters.q
  if (filters.category) params.category = filters.category
  if (filters.subcategory) params.subcategory = filters.subcategory
  if (filters.brand) params.brand = filters.brand
  if (filters.sort) params.sort = filters.sort
  if (filters.keySpec?.length || filters.requirement?.length || filters.sku?.length) {
    const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))
    for (const sku of filters.sku ?? []) query.append('sku', sku)
    for (const filter of filters.keySpec ?? []) query.append('keySpec', filter)
    for (const filter of filters.requirement ?? []) query.append('requirement', filter)
    const response = await api.get(`${PRODUCTS_ENDPOINT}?${query.toString()}`)
    return toListing(response.data, offset, limit)
  }

  const response = await api.get(PRODUCTS_ENDPOINT, { params })
  return toListing(response.data, offset, limit)
}

export interface PublicRequirementsResult {
  products: number
  facets: PublicKeySpecFacet[]
  truncated?: boolean
}

/** A facet is usable when it has a key and a list of values; anything else is malformed. */
function isKeySpecFacet(value: unknown): value is PublicKeySpecFacet {
  return isRecord(value) && typeof value.specKey === 'string' && Array.isArray(value.values)
}

/** Minimum real shape of a facets payload: `facets` is an array of usable facets. */
function isKeySpecFacets(value: unknown): value is PublicKeySpecFacets {
  return isRecord(value) && Array.isArray(value.facets) && value.facets.every(isKeySpecFacet)
}

/** Same minimum shape as `isKeySpecFacets`, for the requirements payload. */
function isRequirementsPayload(value: unknown): value is PublicRequirementsResult {
  return isRecord(value) && Array.isArray(value.facets) && value.facets.every(isKeySpecFacet)
}

/** A missing or non-numeric product count is zero, never a crash. */
function toProductCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Public facets of approved key specs for a persisted subcategory. */
export async function fetchPublicKeySpecFacets(subcategoryId: string): Promise<PublicKeySpecFacets> {
  const response = await api.get('/public/catalog/key-spec-facets', { params: { subcategoryId } })
  let value: unknown = response.data
  for (let depth = 0; depth < 3; depth += 1) {
    if (isKeySpecFacets(value)) {
      return {
        subcategoryId: typeof value.subcategoryId === 'string' ? value.subcategoryId : subcategoryId,
        products: toProductCount(value.products),
        facets: value.facets,
      }
    }
    if (!isRecord(value) || !('data' in value)) break
    value = value.data
  }
  return { subcategoryId, products: 0, facets: [] }
}

export async function fetchPublicRequirements(
  category: string,
  subcategory?: string,
  filters: { q?: string; brand?: string; keySpec?: string[]; requirement?: string[] } = {},
): Promise<PublicRequirementsResult> {
  const query = new URLSearchParams({ category })
  if (subcategory) query.set('subcategory', subcategory)
  if (filters.q) query.set('q', filters.q)
  if (filters.brand) query.set('brand', filters.brand)
  for (const value of filters.keySpec ?? []) query.append('keySpec', value)
  for (const value of filters.requirement ?? []) query.append('requirement', value)
  const response = await api.get(`/public/catalog/requirements?${query.toString()}`)
  let value: unknown = response.data
  for (let depth = 0; depth < 3; depth += 1) {
    if (isRequirementsPayload(value)) {
      return {
        products: toProductCount(value.products),
        facets: value.facets,
        truncated: typeof value.truncated === 'boolean' ? value.truncated : undefined,
      }
    }
    if (!isRecord(value) || !('data' in value)) break
    value = value.data
  }
  throw new Error('No se pudieron leer los requisitos de esta categoría')
}

/**
 * Fetches the list of public brands with their product counts.
 * Used for brand banners on the homepage.
 */
export async function fetchPublicBrands(): Promise<PublicBrandSummary[]> {
  const response = await api.get('/public/products/brands')
  // Handle double-wrapped response
  let value = response.data
  for (let depth = 0; depth < 3; depth += 1) {
    if (Array.isArray(value)) return value as PublicBrandSummary[]
    if (!isRecord(value) || !('data' in value)) return []
    value = (value as { data: unknown }).data
  }
  return Array.isArray(value) ? (value as PublicBrandSummary[]) : []
}
