import type { QueryClient } from '@tanstack/react-query'
import api from './api'
import type {
  AddQuoteItemPayload,
  CreateQuotePayload,
  Quote,
  QuoteFilters,
  QuoteListResponse,
  UpdateQuoteItemPayload,
  UpdateQuoteStatusPayload,
} from '../features/quotes/types/quote.types'

const BASE = '/commercial/quotes'

/**
 * Vía GENERAL de alta/edición de ítem (COM-03 §3): `discountPct` queda FUERA
 * del contrato — el servidor responde 400 `discount-not-allowed-in-add` /
 * `discount-not-allowed-in-general-edit` si aparece, rechazando la petición
 * ENTERA sin escritura parcial. El descuento vive SOLO en la operación
 * dedicada `updateQuoteItemDiscount` (`PATCH /:id/items/:itemId/discount`
 * con `quotes:discount`). El `Omit` hace que TypeScript rechace el campo
 * ANTES de la red.
 */
export type QuoteItemAddPayload = Omit<AddQuoteItemPayload, 'discountPct'>
export type QuoteItemEditPayload = Omit<UpdateQuoteItemPayload, 'discountPct'>

/** Body del endpoint dedicado de descuento (COM-03 §3): 0–100. */
export interface UpdateQuoteItemDiscountPayload {
  discountPct: string
}

/**
 * Retira `discountPct` de cualquier payload de ítem (defensa en capa
 * servicio además del `Omit` de la firma): si llegara, el 400 del servidor
 * rechazaría la petición ENTERA (COM-03 §5.1, sin cambio parcial).
 */
export function toQuoteItemPayload(
  payload:
    | QuoteItemAddPayload
    | QuoteItemEditPayload
    | AddQuoteItemPayload
    | UpdateQuoteItemPayload,
): QuoteItemAddPayload | QuoteItemEditPayload {
  const body: Record<string, unknown> = { ...payload }
  delete body.discountPct
  return body as QuoteItemAddPayload | QuoteItemEditPayload
}

export type QuoteErrorCode =
  | 'invalid'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'unknown'

/** Error tipado de la superficie de cotizaciones (patrón customers.service). */
export class QuoteServiceError extends Error {
  readonly code: QuoteErrorCode
  readonly status: number

  constructor(code: QuoteErrorCode, message: string, status: number) {
    super(message)
    this.name = 'QuoteServiceError'
    this.code = code
    this.status = status
  }
}

const DEFAULT_ERROR = 'No se pudo guardar el cambio. Vuelve a intentarlo.'

/**
 * Reserva del 403 de descuento (F1): `quotes:discount` no la recibe NADIE
 * por defecto (solo Super Admin por excepción del resolver), así que el 403
 * es el caso esperado hasta que el coordinador decida quién la recibe. El
 * mensaje del servidor, si viene, manda siempre.
 */
const DISCOUNT_FORBIDDEN_FALLBACK =
  'No tienes permiso para modificar descuentos (concesión quotes:discount pendiente)'

const STATUS_FALLBACK: Record<number, string> = {
  400: 'El servidor rechazó la petición: revisa los campos enviados.',
  401: 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.',
  403: 'No tienes permiso para esta acción. Contacta al administrador.',
  404: 'El recurso ya no existe o está fuera de tu alcance.',
  409: 'La cotización cambió en el servidor; recarga y vuelve a intentarlo.',
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' ? status : undefined
}

/** El servidor manda `message` como string (exceptions) o array (class-validator). */
function serverMessageOf(error: unknown): string | undefined {
  const message = (error as { response?: { data?: { message?: unknown } } } | null)?.response
    ?.data?.message
  if (typeof message === 'string' && message.trim()) return message
  if (Array.isArray(message)) {
    const joined = message
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .join(' ')
    if (joined) return joined
  }
  return undefined
}

function codeFor(status: number): QuoteErrorCode {
  if (status === 400) return 'invalid'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  return 'unknown'
}

/**
 * Envuelve los errores HTTP; la red (sin `response`) se propaga tal cual para
 * que la UI ofrezca reintentar. `preferredFallback` se usa SOLO cuando el
 * servidor no manda texto (403 de descuento sin concesión).
 */
function toQuoteError(error: unknown, preferredFallback?: string): unknown {
  if (error instanceof QuoteServiceError) return error
  const status = statusOf(error)
  if (status === undefined) return error
  return new QuoteServiceError(
    codeFor(status),
    serverMessageOf(error) ?? preferredFallback ?? STATUS_FALLBACK[status] ?? DEFAULT_ERROR,
    status,
  )
}

/** Mensaje para la UI: el del servidor si existe, si no uno claro por estado. */
export function quoteErrorMessage(error: unknown, fallback = DEFAULT_ERROR): string {
  if (error instanceof QuoteServiceError) return error.message
  const status = statusOf(error)
  if (status !== undefined) {
    return serverMessageOf(error) ?? STATUS_FALLBACK[status] ?? fallback
  }
  return fallback
}

/** Estado HTTP del error (tipado o axios) — la UI decide refetch por 409. */
export function quoteErrorStatus(error: unknown): number | undefined {
  if (error instanceof QuoteServiceError) return error.status
  return statusOf(error)
}

/** 409 de cotización: estado/pedido — la UI refetchea para pintar la verdad. */
export function isQuoteConflict(error: unknown): boolean {
  return quoteErrorStatus(error) === 409
}

export const fetchQuotes = async (
  filters: QuoteFilters = {},
  page = 1,
  pageSize = 20
): Promise<QuoteListResponse> => {
  const params = new URLSearchParams()
  params.set('skip', String((page - 1) * pageSize))
  params.set('take', String(pageSize))
  if (filters.search?.trim()) params.set('search', filters.search.trim())
  if (filters.status) params.set('status', filters.status)
  if (filters.customerId) params.set('customerId', filters.customerId)
  if (filters.ownerId) params.set('ownerId', filters.ownerId)

  const res = await api.get(`${BASE}?${params}`)
  return res.data as QuoteListResponse
}

export const fetchQuote = async (id: string): Promise<Quote> => {
  const res = await api.get(`${BASE}/${id}`)
  return res.data as Quote
}

export const createQuote = async (
  payload: CreateQuotePayload
): Promise<Quote> => {
  const res = await api.post(BASE, payload)
  return res.data as Quote
}

/**
 * Alta de línea SOLO con `productId` + `quantity` (COM-03 §3): la línea nace
 * con descuento 0 y aplicarlo es la operación dedicada. Errores tipados:
 * 403/404 de producto/lista ajeno y 409 de tarifa salen con el mensaje del
 * servidor tal cual.
 */
export const addQuoteItem = async (
  quoteId: string,
  payload: QuoteItemAddPayload
): Promise<Quote> => {
  try {
    const res = await api.post(
      `${BASE}/${quoteId}/items`,
      toQuoteItemPayload(payload)
    )
    return res.data as Quote
  } catch (error) {
    throw toQuoteError(error)
  }
}

/**
 * Edición GENERAL de la línea (COM-03 §3): SOLO `quantity` — el servidor
 * conserva el descuento previo y rechaza con 400 cualquier payload que traiga
 * `discountPct` (aquí se retira antes de enviarlo).
 */
export const updateQuoteItem = async (
  quoteId: string,
  itemId: string,
  payload: QuoteItemEditPayload
): Promise<Quote> => {
  try {
    const res = await api.patch(
      `${BASE}/${quoteId}/items/${itemId}`,
      toQuoteItemPayload(payload)
    )
    return res.data as Quote
  } catch (error) {
    throw toQuoteError(error)
  }
}

/**
 * Operación DEDICADA de descuento por línea (COM-03 §3): `PATCH
 * /:id/items/:itemId/discount` con `quotes:discount`. Errores tipados
 * 400 (rango) / 403 (sin concesión) / 404 (fuera de alcance) / 409 (estado
 * no editable) con el mensaje del servidor tal cual; sin concesión y sin
 * texto, la reserva clara sobre F1.
 */
export const updateQuoteItemDiscount = async (
  quoteId: string,
  itemId: string,
  discountPct: string
): Promise<Quote> => {
  try {
    const res = await api.patch(
      `${BASE}/${quoteId}/items/${itemId}/discount`,
      { discountPct } satisfies UpdateQuoteItemDiscountPayload
    )
    return res.data as Quote
  } catch (error) {
    throw toQuoteError(error, DISCOUNT_FORBIDDEN_FALLBACK)
  }
}

export const removeQuoteItem = async (
  quoteId: string,
  itemId: string
): Promise<Quote> => {
  const res = await api.delete(`${BASE}/${quoteId}/items/${itemId}`)
  return res.data as Quote
}

export const updateQuoteStatus = async (
  quoteId: string,
  payload: UpdateQuoteStatusPayload
): Promise<Quote> => {
  try {
    const res = await api.patch(`${BASE}/${quoteId}/status`, payload)
    return res.data as Quote
  } catch (error) {
    throw toQuoteError(error)
  }
}

/** Invalidación ÚNICA del listado y del detalle de cotizaciones (prefijo). */
async function invalidateQuoteQueries(client: QueryClient): Promise<void> {
  // Una sola invalidación por operación = un solo refetch de la fila
  // (aceptación: «refresca la fila una sola vez, sin duplicar»).
  await client
    .invalidateQueries({ queryKey: ['quotes'], refetchType: 'all' })
    .catch(() => undefined)
}

export interface QuoteItemDiscountInput {
  quoteId: string
  itemId: string
  discountPct: string
}

/**
 * Aplica el descuento y refresca la caché compartida SOLO con 200 (patrón
 * COM-02 `reassignCustomerInCache`): un 403/400/404/409 NO invalida nada —
 * la fila sigue mostrando lo que el servidor autoriza y el error se pinta
 * tal cual (el editor sigue abierto).
 */
export async function updateQuoteItemDiscountInCache(
  client: QueryClient,
  input: QuoteItemDiscountInput
): Promise<Quote> {
  const quote = await updateQuoteItemDiscount(
    input.quoteId,
    input.itemId,
    input.discountPct
  )
  await invalidateQuoteQueries(client)
  return quote
}

export interface QuoteStatusInput {
  quoteId: string
  payload: UpdateQuoteStatusPayload
}

/**
 * Cambia el estado y refresca la caché compartida. Caso 409 (COM-03 §6/F7:
 * transición inválida o doble `ganada`): se refetchea UNA vez para que la
 * interfaz muestre el estado real del servidor (un solo pedido, un solo
 * estado) y DESPUÉS se re-propaga el error con su mensaje — la página lo
 * pinta en su alerta de estado. Otros errores (400/403) no refetchean: nada
 * cambió en el servidor.
 */
export async function updateQuoteStatusInCache(
  client: QueryClient,
  input: QuoteStatusInput
): Promise<Quote> {
  try {
    const quote = await updateQuoteStatus(input.quoteId, input.payload)
    await invalidateQuoteQueries(client)
    return quote
  } catch (error) {
    if (isQuoteConflict(error)) {
      await invalidateQuoteQueries(client)
    }
    throw error
  }
}
