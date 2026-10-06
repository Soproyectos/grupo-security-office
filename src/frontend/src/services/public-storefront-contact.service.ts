import api from './api'
import type { StorefrontContact } from './storefront-contact.service'

/**
 * Contacto público del storefront (`GET /api/public/storefront/contact`, sin
 * JWT y con throttle). Devuelve el mismo registro que lee el panel desde
 * `storefront-contact.service.ts`, así que se reutiliza su tipo: los siete
 * campos son idénticos. El interceptor de `api` despeja el `{ data }` del
 * `TransformInterceptor`, de modo que `response.data` ya es el registro.
 *
 * El endpoint responde siempre 200 (si la tabla está vacía devuelve los valores
 * demo del backend); solo un fallo HTTP real rechaza, y eso lo resuelve el hook
 * con sus constantes.
 */
export async function fetchPublicStorefrontContact(): Promise<StorefrontContact> {
  const response = await api.get('/public/storefront/contact')
  return response.data as StorefrontContact
}
