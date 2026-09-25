import api from './api'
import type { MenuCategory } from '../features/storefront/types/categoryMenu'

const MENU_ENDPOINT = '/public/categories/menu'

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
function toMenuArray(payload: unknown): MenuCategory[] {
  let value = payload

  for (let depth = 0; depth < 3; depth += 1) {
    if (Array.isArray(value)) break
    if (typeof value !== 'object' || value === null || !('data' in value)) return []
    value = (value as { data: unknown }).data
  }

  return Array.isArray(value) ? (value as MenuCategory[]) : []
}

export async function fetchCategoryMenu(): Promise<MenuCategory[]> {
  const response = await api.get(MENU_ENDPOINT)
  return toMenuArray(response.data)
}
