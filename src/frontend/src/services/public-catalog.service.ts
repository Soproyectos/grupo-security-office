import api from './api'
import type { MenuCategory } from '../features/storefront/types/categoryMenu'
import type {
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

  const response = await api.get(PRODUCTS_ENDPOINT, { params })
  return toListing(response.data, offset, limit)
}
