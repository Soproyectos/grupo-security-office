import api from './api'
import type { MenuCategory } from '../features/storefront/types/categoryMenu'
import type { PublicProductResult } from '../features/storefront/types/publicProduct'

const MENU_ENDPOINT = '/public/categories/menu'
const SEARCH_ENDPOINT = '/public/products'

/** Default cap of the search results, mirroring the backend limit. */
export const SEARCH_RESULTS_LIMIT = 24

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

function toProductArray(payload: unknown): PublicProductResult[] {
  return toDataArray(payload) as PublicProductResult[]
}

export async function fetchCategoryMenu(): Promise<MenuCategory[]> {
  const response = await api.get(MENU_ENDPOINT)
  return toMenuArray(response.data)
}

/**
 * Public product search of the storefront (`/catalogo/buscar`). Only HTTP
 * failures reject, so the results page can offer a retry; an unexpected
 * payload shape is an empty result set, not a crash (same contract as
 * `fetchCategoryMenu`).
 */
export async function searchPublicProducts(q: string): Promise<PublicProductResult[]> {
  const response = await api.get(SEARCH_ENDPOINT, {
    params: { q, limit: SEARCH_RESULTS_LIMIT },
  })
  return toProductArray(response.data)
}
