import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Origen del backend (sin el sufijo /api), para resolver rutas relativas
// devueltas por la API (ej. imágenes de producto, logos de marca:
// /api/files/:id) en un `<img src>`. En dev, VITE_API_URL no está
// definida y baseURL cae a '/api' relativo (proxy de Vite) — el origen
// queda vacío y la ruta se usa tal cual. En producción, frontend y
// backend viven en subdominios distintos (dev.* / api-dev.*), así que una
// ruta relativa sin resolver apuntaría al origen equivocado (el propio
// frontend, que nunca sirve esos archivos).
const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '')

/** Resuelve una ruta relativa devuelta por la API a una URL absoluta usable en <img src>. */
export function resolveAssetUrl(path?: string | null): string {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `${BACKEND_ORIGIN}${path}`
}

api.interceptors.request.use(
  (config) => {
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
})

// Public storefront visitors have no staff session, so a 401 must not send them to the staff login.
export function shouldRedirectOn401(pathname: string): boolean {
  return !pathname.includes('/login') && !pathname.startsWith('/tienda')
}

api.interceptors.response.use(
  (response) => {
    if (
      response.data &&
      typeof response.data === 'object' &&
      'data' in response.data
    ) {
      response.data = response.data.data
    }
    return response
  },
  (error) => {
    if (
      error.response?.status === 401 &&
      shouldRedirectOn401(window.location.pathname)
    ) {
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
