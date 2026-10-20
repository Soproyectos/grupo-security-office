import api from './api'

// ---------------------------------------------------------------------------
// CAT-01 frontend — errores tipados de las operaciones conservacionistas
// (patrón agenda.service): 400/403/404/409 con el mensaje del servidor tal
// cual, para que la UI muestre el motivo real (p. ej. el 409 de cotizaciones
// al eliminar una Lista).
// ---------------------------------------------------------------------------

export type ListaErrorCode =
  | 'invalid'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'unknown'

export class ListaServiceError extends Error {
  readonly code: ListaErrorCode
  readonly status: number

  constructor(code: ListaErrorCode, message: string, status: number) {
    super(message)
    this.name = 'ListaServiceError'
    this.code = code
    this.status = status
  }
}

const LISTA_DEFAULT_ERROR = 'No se pudo completar la operación sobre la Lista. Vuelve a intentarlo.'

const LISTA_STATUS_FALLBACK: Record<number, string> = {
  400: 'La solicitud no es válida para esta Lista.',
  401: 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.',
  403: 'No tienes permiso para esta acción sobre la Lista.',
  404: 'La Lista o el recurso ya no está disponible.',
  409: 'La operación entra en conflicto con el estado actual de la Lista.',
}

/** Fallbacks por familia: el mensaje del servidor manda, estos solo cubren su ausencia. */
const DELETE_STATUS_FALLBACK: Record<number, string> = {
  ...LISTA_STATUS_FALLBACK,
  400: 'Debes confirmar el borrado físico con confirm: true',
  409: 'La Lista no se puede eliminar mientras exista un conflicto pendiente.',
}

const UNLINK_STATUS_FALLBACK: Record<number, string> = {
  ...LISTA_STATUS_FALLBACK,
  404: 'Producto no encontrado en esta Lista',
  409: 'No se puede desvincular de una Lista con solicitud de eliminación pendiente.',
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' ? status : undefined
}

function serverMessageOf(error: unknown): string | undefined {
  const message = (error as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message
  if (Array.isArray(message)) return message.join(', ')
  return typeof message === 'string' && message.trim() ? message : undefined
}

function codeFor(status: number): ListaErrorCode {
  if (status === 400) return 'invalid'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  return 'unknown'
}

/** Mensaje para la UI: el del servidor si existe, si no uno claro por estado. */
export function listaErrorMessage(error: unknown, fallback = LISTA_DEFAULT_ERROR): string {
  if (error instanceof ListaServiceError) return error.message
  const status = statusOf(error)
  if (status !== undefined) return serverMessageOf(error) ?? LISTA_STATUS_FALLBACK[status] ?? fallback
  return fallback
}

/** Envuelve los errores HTTP en `ListaServiceError`; la red se propaga tal cual. */
function toListaError(
  error: unknown,
  statusFallback: Record<number, string> = LISTA_STATUS_FALLBACK,
  fallback = LISTA_DEFAULT_ERROR,
): unknown {
  if (error instanceof ListaServiceError) return error
  const status = statusOf(error)
  if (status === undefined) return error
  return new ListaServiceError(
    codeFor(status),
    serverMessageOf(error) ?? statusFallback[status] ?? fallback,
    status,
  )
}

/**
 * Envoltorio `{ data: … }` defensivo: el interceptor de `api` ya peló una
 * capa, aquí se pelen las que queden (mismo criterio que agenda.service).
 */
function unwrapBody<T>(payload: unknown): T {
  let data = payload
  while (
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'data' in data &&
    !('id' in data) &&
    !('message' in data) &&
    !('productosConservados' in data)
  ) {
    data = (data as { data: unknown }).data
  }
  return data as T
}

/** Copy conservacionista compartido por el diálogo de eliminación (ListasPage). */
export const LISTA_DELETE_CONSERVATION_NOTICE =
  'Los productos, imágenes y precios se conservan; la lista desaparece.'

/** Copy conservacionista del desvincular (ListaDetailPage). */
export const LISTA_UNLINK_CONSERVATION_NOTICE =
  'El producto se conserva con su ficha, imágenes y precios; no se añade a otra lista.'

export interface Lista {
  id: string
  code: string
  /** Código de identificación de negocio (contrato nuevo; opcional). */
  codigo?: string | null
  name: string
  description: string | null
  currency: string
  isActive: boolean
  archivedAt: string | null
  /** Estado de eliminación diferida (PENDING_DELETION) si el servidor lo trae. */
  deletionStatus?: string | null
  isExpired?: boolean
  isExpiringSoon?: boolean
  daysUntilExpiry?: number | null
  type?: string | null
  defaultVisibility?: boolean
  responsibleId?: string | null
  validFrom?: string | null
  validUntil?: string | null
  createdAt: string
  updatedAt: string
  productCount?: number
}

export interface ListaPayload {
  name: string
  code: string
  codigo?: string | null
  description?: string | null
  currency?: string
  isActive?: boolean
  archivedAt?: string | null
  type?: string | null
  defaultVisibility?: boolean
  responsibleId?: string | null
  validFrom?: string | null
  validUntil?: string | null
}

interface ListaListResponse {
  data: Lista[]
}

export const fetchListas = async (): Promise<Lista[]> => {
  const res = await api.get('/listas')
  const body = res.data as ListaListResponse
  return body.data ?? []
}

export const fetchListaById = async (id: string): Promise<Lista> => {
  const res = await api.get(`/listas/${id}`)
  return res.data as Lista
}

/**
 * Defensivo: el backend usa ValidationPipe con forbidNonWhitelisted=true.
 * Si el runtime aún no acepta codigo (campos nuevos en desarrollo),
 * reintenta sin ellos en lugar de fallar.
 */
function isNonWhitelistedError(err: unknown, fields: string[]): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status
  if (status !== 400) return false
  const data = JSON.stringify((err as { response?: { data?: unknown } })?.response?.data ?? '')
  return fields.some((f) => data.includes(f))
}

export const createLista = async (payload: ListaPayload): Promise<Lista> => {
  try {
    const res = await api.post('/listas', payload)
    return res.data as Lista
  } catch (err) {
    if (
      isNonWhitelistedError(err, ['codigo']) &&
      (payload.codigo !== undefined)
    ) {
      const { codigo, ...rest } = payload
      const res = await api.post('/listas', rest)
      return res.data as Lista
    }
    throw err
  }
}

export const updateLista = async (id: string, payload: Partial<ListaPayload>): Promise<Lista> => {
  try {
    const res = await api.patch(`/listas/${id}`, payload)
    return res.data as Lista
  } catch (err) {
    if (
      isNonWhitelistedError(err, ['codigo']) &&
      (payload.codigo !== undefined)
    ) {
      const { codigo, ...rest } = payload
      const res = await api.patch(`/listas/${id}`, rest)
      return res.data as Lista
    }
    throw err
  }
}

export const toggleListaActive = async (id: string, isActive: boolean): Promise<Lista> => {
  const res = await api.patch(`/listas/${id}/toggle-active`, { isActive })
  return res.data as Lista
}

export const archiveLista = async (id: string): Promise<Lista> => {
  try {
    const res = await api.patch(`/listas/${id}/archive`)
    return unwrapBody<Lista>(res.data)
  } catch (err) {
    throw toListaError(err)
  }
}

export const restoreLista = async (id: string): Promise<Lista> => {
  try {
    const res = await api.patch(`/listas/${id}/restore`)
    return unwrapBody<Lista>(res.data)
  } catch (err) {
    throw toListaError(err)
  }
}

/**
 * CAT-01 — eliminar Lista de forma conservacionista (`DELETE /api/listas/:id`).
 * El servidor exige `confirm: true`; en éxito responde
 * `{ message, productosConservados }` y SOLO desaparece la Lista (productos,
 * imágenes y precios sobreviven con `listaId = null`). Un 409 (cotizaciones o
 * eliminación pendiente) llega tipado con el motivo tal cual.
 */
export interface DeleteListaResult {
  message?: string
  productosConservados: number
}

export const deleteLista = async (
  id: string,
  options: { confirm: boolean },
): Promise<DeleteListaResult> => {
  try {
    const res = await api.delete(`/listas/${id}`, { data: { confirm: options.confirm } })
    const body = unwrapBody<Partial<DeleteListaResult>>(res.data)
    return {
      message: body?.message,
      productosConservados: typeof body?.productosConservados === 'number' ? body.productosConservados : 0,
    }
  } catch (err) {
    throw toListaError(err, DELETE_STATUS_FALLBACK)
  }
}

/**
 * CAT-01 — desvincular producto de la Lista (`PATCH /api/listas/:id/products/:productId/unlink`).
 * Acción explícita sin cuerpo: el cliente NUNCA envía otra lista destino
 * (sin reasignación implícita, regla 3). Pone `listaId = null` conservando
 * ficha, imágenes y precios. 404/403/409 llegan tipados con el mensaje del
 * servidor.
 */
export interface UnlinkedProduct {
  id: string
  listaId: string | null
  sku?: string
  name?: string
}

export const unlinkProduct = async (
  listaId: string,
  productId: string,
): Promise<UnlinkedProduct> => {
  try {
    const res = await api.patch(`/listas/${listaId}/products/${productId}/unlink`)
    return unwrapBody<UnlinkedProduct>(res.data)
  } catch (err) {
    throw toListaError(err, UNLINK_STATUS_FALLBACK)
  }
}

export const fetchListaProducts = async (id: string): Promise<any[]> => {
  const res = await api.get(`/listas/${id}/products`)
  return (res.data as any)?.data ?? []
}

export const fetchListaPrices = async (id: string): Promise<any[]> => {
  const res = await api.get(`/listas/${id}/prices`)
  return (res.data as any)?.data ?? []
}

export const fetchListaAssignments = async (id: string): Promise<any[]> => {
  const res = await api.get(`/listas/${id}/assignments`)
  return (res.data as any)?.data ?? []
}

export const fetchListaAudit = async (id: string): Promise<any[]> => {
  const res = await api.get(`/listas/${id}/audit`)
  return (res.data as any)?.data ?? []
}

export function productCountOf(lista: Lista | undefined | null): number {
  if (!lista) return 0
  return lista.productCount ?? 0
}

/** Headers estándar del import de productos (coinciden con los sinónimos de header-detection). */
export const LISTA_TEMPLATE_HEADERS = [
  'SKU',
  'Nombre',
  'Descripción',
  'Categoría',
  'Marca',
  'Especificaciones Técnicas',
  'Precio Instalador (IVA)',
  'Precio Tienda (IVA)',
  'Precio DPP Oro (IVA)',
  'Precio DPP Platino (IVA)',
  'Precio Cliente Final (IVA)',
  'Oro sin IVA',
  'Installer sin IVA',
] as const

const LISTA_TEMPLATE_EXAMPLE_ROW = [
  'SKU-EJEMPLO',
  'Producto de ejemplo',
  '',
  'Categoría ejemplo',
  'Marca ejemplo',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
]

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-')
}

export function buildListaTemplateCsv(): string {
  return [LISTA_TEMPLATE_HEADERS, LISTA_TEMPLATE_EXAMPLE_ROW]
    .map((row) => row.map(csvCell).join(','))
    .join('\n')
}

/** Genera y descarga la plantilla estándar de productos como CSV (con BOM para Excel). */
export function downloadListaTemplateCsv(fileName: string): void {
  const blob = new Blob(['\uFEFF' + buildListaTemplateCsv()], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sanitizeFileName(fileName)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
