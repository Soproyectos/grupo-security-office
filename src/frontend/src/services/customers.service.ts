import type { QueryClient } from '@tanstack/react-query'
import api from './api'
import type {
  Customer,
  CustomerFilters,
  CustomerListResponse,
  CustomerPayload,
} from '../features/customers/types/customer.types'

const BASE = '/commercial/customers'

/**
 * Campos editables en la edición GENERAL (COM-02 §3): `status`, `ownerId` e
 * `isActive` quedan FUERA del contrato de edición — el servidor responde 400
 * (`owner-not-allowed-in-general-edit`, etc.) desde este incremento.
 *
 * La reasignación vive en `PATCH /:id/reassign` (`reassignCustomer`), el
 * estado en `PATCH /:id/convert` o `DELETE` (soft delete). El `Omit` de la
 * firma hace que TypeScript rechace el payload prohibido ANTES de la red.
 */
export type CustomerEditPayload = Omit<CustomerPayload, 'status' | 'ownerId' | 'isActive'>

/** Body del endpoint dedicado de cartera (COM-02 §3): `ownerId` obligatorio. */
export interface ReassignCustomerPayload {
  ownerId: string
  motivo?: string
}

/**
 * Estado del cliente que el navegador cree vigente. Opcional: si se pasa, el
 * servicio comprueba ANTES de escribir que el servidor sigue en ese estado y
 * devuelve `conflict` sin tocar la fila (guarda cliente anti-carrera; el
 * servidor no tiene OCC — E6 pendiente).
 */
export interface ReassignExpectation {
  ownerId?: string | null
}

export type CustomerErrorCode =
  | 'invalid'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'unknown'

/** Error tipado de la superficie de clientes (patrón agenda/users.service). */
export class CustomerServiceError extends Error {
  readonly code: CustomerErrorCode
  readonly status: number

  constructor(code: CustomerErrorCode, message: string, status: number) {
    super(message)
    this.name = 'CustomerServiceError'
    this.code = code
    this.status = status
  }
}

const DEFAULT_ERROR = 'No se pudo guardar el cambio. Vuelve a intentarlo.'

/**
 * Reservas cuando el servidor no manda texto. El 403 de TRANSICIÓN es el caso
 * esperado hasta D5/concesiones: usuarios sin grants reciben 403 en edición y
 * reasignación salvo Super Admin — la UI debe decirlo con claridad, no romperse.
 */
const STATUS_FALLBACK: Record<number, string> = {
  400: 'El servidor rechazó la petición: revisa los campos enviados.',
  401: 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.',
  403: 'No tienes permiso para esta acción (aún sin concesiones asignadas). Contacta al administrador.',
  404: 'El cliente ya no existe o está fuera de tu alcance.',
  409: 'El registro cambió en el servidor (o el documento ya existe); recarga y vuelve a intentarlo.',
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' ? status : undefined
}

/** El servidor manda `message` como string (exceptions) o array (class-validator). */
function serverMessageOf(error: unknown): string | undefined {
  const message = (error as { response?: { data?: { message?: unknown } } } | null)?.response?.data
    ?.message
  if (typeof message === 'string' && message.trim()) return message
  if (Array.isArray(message)) {
    const joined = message
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .join(' ')
    if (joined) return joined
  }
  return undefined
}

function codeFor(status: number): CustomerErrorCode {
  if (status === 400) return 'invalid'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  return 'unknown'
}

/** Envuelve los errores HTTP; la red (sin `response`) se propaga tal cual. */
function toCustomerError(error: unknown): unknown {
  if (error instanceof CustomerServiceError) return error
  const status = statusOf(error)
  if (status === undefined) return error
  return new CustomerServiceError(
    codeFor(status),
    serverMessageOf(error) ?? STATUS_FALLBACK[status] ?? DEFAULT_ERROR,
    status,
  )
}

/** Mensaje para la UI: el del servidor si existe, si no uno claro por estado. */
export function customerErrorMessage(error: unknown, fallback = DEFAULT_ERROR): string {
  if (error instanceof CustomerServiceError) return error.message
  const status = statusOf(error)
  if (status !== undefined) return serverMessageOf(error) ?? STATUS_FALLBACK[status] ?? fallback
  return fallback
}

/**
 * Retira los campos prohibidos de la edición general (defensa en capa
 * servicio además del `Omit` de la firma): si llegaran, el 400 del servidor
 * rechazaría la petición ENTERA (COM-02 §5.1, sin cambio parcial).
 */
export function toCustomerEditPayload(
  payload: CustomerPayload | CustomerEditPayload,
): CustomerEditPayload {
  const body: Record<string, unknown> = { ...payload }
  delete body.ownerId
  delete body.status
  delete body.isActive
  return body as CustomerEditPayload
}

export const fetchCustomers = async (
  filters: CustomerFilters = {},
  page = 1,
  pageSize = 20
): Promise<CustomerListResponse> => {
  const params = new URLSearchParams()
  params.set('skip', String((page - 1) * pageSize))
  params.set('take', String(pageSize))
  if (filters.search?.trim()) params.set('search', filters.search.trim())
  if (filters.status) params.set('status', filters.status)
  if (filters.ownerId) params.set('ownerId', filters.ownerId)

  const res = await api.get(`${BASE}?${params}`)
  return res.data as CustomerListResponse
}

export const fetchCustomer = async (id: string): Promise<Customer> => {
  const res = await api.get(`${BASE}/${id}`)
  return res.data as Customer
}

export const createCustomer = async (payload: CustomerPayload): Promise<Customer> => {
  const res = await api.post(BASE, payload)
  return res.data as Customer
}

/**
 * Edición GENERAL de contacto/notas (COM-02 §3): el payload se limpia de
 * `ownerId`/`status`/`isActive` y los errores 400/403/404 salen tipados con el
 * mensaje del servidor tal cual (el 403 de transición incluido).
 */
export const updateCustomer = async (
  id: string,
  payload: CustomerEditPayload
): Promise<Customer> => {
  try {
    const res = await api.patch(`${BASE}/${id}`, toCustomerEditPayload(payload))
    return res.data as Customer
  } catch (error) {
    throw toCustomerError(error)
  }
}

export const convertCustomer = async (id: string): Promise<Customer> => {
  const res = await api.patch(`${BASE}/${id}/convert`)
  return res.data as Customer
}

export const deleteCustomer = async (id: string): Promise<void> => {
  await api.delete(`${BASE}/${id}`)
}

/**
 * Reasignación de cartera — endpoint DEDICADO `PATCH /:id/reassign`
 * (COM-02 §3): 200 con `customers:reassign`, 403 sin la acción, 404 fuera de
 * alcance; la trazabilidad (actor + antes/después + motivo, sin PII) es del
 * backend. El navegador solo envía `{ ownerId, motivo? }` y pinta el error.
 */
export const reassignCustomer = async (
  id: string,
  payload: ReassignCustomerPayload,
  expected?: ReassignExpectation
): Promise<Customer> => {
  if (expected && expected.ownerId !== undefined) {
    const current = await fetchCustomer(id).catch((error: unknown) => {
      throw toCustomerError(error)
    })
    if (current.ownerId !== expected.ownerId) {
      throw new CustomerServiceError(
        'conflict',
        'El responsable del cliente cambió desde que se abrió la ficha; vuelve a cargar la lista.',
        409,
      )
    }
  }

  try {
    const motivo = payload.motivo?.trim()
    const res = await api.patch(
      `${BASE}/${id}/reassign`,
      motivo ? { ownerId: payload.ownerId, motivo } : { ownerId: payload.ownerId }
    )
    return res.data as Customer
  } catch (error) {
    throw toCustomerError(error)
  }
}

export interface ReassignCustomerInput {
  id: string
  payload: ReassignCustomerPayload
  expected?: ReassignExpectation
}

/**
 * Reasigna y refetchea la caché compartida de clientes SOLO si el servidor
 * respondió 200 (patrón `agenda.service.ts`): un 403/404 no invalida nada, de
 * modo que la fila de la tabla sigue mostrando lo que el servidor autoriza.
 * Es el refetch que hace que la columna «Responsable» muestre el nuevo
 * responsable (aceptación 3, lado cliente).
 */
export async function reassignCustomerInCache(
  client: QueryClient,
  input: ReassignCustomerInput
): Promise<Customer> {
  const customer = await reassignCustomer(input.id, input.payload, input.expected)
  await client.invalidateQueries({ queryKey: ['customers'], refetchType: 'all' })
  return customer
}
