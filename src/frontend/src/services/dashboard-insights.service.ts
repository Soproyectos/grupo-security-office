import type { QueryClient } from '@tanstack/react-query'
import api from './api'

export interface CatalogInsights {
  products: number
  published: number
  pendingPublication: number
  categories: number
  updatedToday: number
  missingImages: number
  latest: Array<{
    id: string
    sku: string
    name: string
    category: string
    updatedAt: string
    lifecycleStatus: string
    hasImage: boolean
  }>
}

export interface UsersInsights {
  total: number
  active: number
  byRole: Array<{ role: string; count: number }>
  recent: Array<{
    id: string
    name: string
    email: string
    roles: string[]
    isActive: boolean
  }>
}

export interface TopCustomer {
  id: string
  name: string
  invoiced: string
  currency: string
  orders: number
}

export interface CategorySale {
  category: string
  amount: string
  currency: string
  units: number
}

export const fetchCatalogInsights = async (): Promise<CatalogInsights> => {
  const res = await api.get('/dashboard/insights/catalog')
  return res.data
}

export const fetchUsersInsights = async (): Promise<UsersInsights> => {
  const res = await api.get('/dashboard/insights/users')
  return res.data
}

export const fetchTopCustomers = async (): Promise<TopCustomer[]> => {
  const res = await api.get('/dashboard/insights/top-customers')
  return res.data.topCustomers ?? []
}

export const fetchSalesByCategory = async (): Promise<CategorySale[]> => {
  const res = await api.get('/dashboard/insights/sales-by-category')
  return res.data.categories ?? []
}

// ---------------------------------------------------------------------------
// COM-04 frontend — metas por integrante/periodo (superficie sales-targets).
// Se amplía ESTE servicio (writePath de la ficha; también lo comparten
// COM-05/07) en vez de crear `sales-targets.service.ts`: el módulo encaja en
// el bloque de datos del panel comercial y la ficha designa este archivo.
// ---------------------------------------------------------------------------

export interface SalesTargetUserRef {
  id: string
  name: string | null
  email: string | null
}

export interface SalesTargetSetByRef {
  id: string
  name: string | null
}

/** Fila de `GET /api/commercial/sales-targets` (include user/setBy del backend). */
export interface SalesTargetRow {
  id: string
  userId: string
  /** DATE día 1 serializado ISO (`2026-10-01T00:00:00.000Z`) o etiqueta corta. */
  period: string
  /** Decimal serializado como string por Prisma (`'250000000'`). */
  amount: string
  currency: string
  notes: string | null
  setById: string | null
  createdAt: string
  updatedAt: string
  user: SalesTargetUserRef | null
  setBy: SalesTargetSetByRef | null
}

/** Catálogo del backend (`sales-targets.service.ts` ALLOWED_CURRENCIES). */
export const SALES_TARGET_CURRENCIES = ['COP', 'USD', 'EUR'] as const
export type SalesTargetCurrency = (typeof SALES_TARGET_CURRENCIES)[number]

/**
 * Body del `POST /api/commercial/sales-targets` (upsert por (userId, period)).
 * `currency` es OBLIGATORIA en el contrato (COM-04 regla 3 / G3): el tipo la
 * exige como literal COP/USD/EUR — sin default sorpresivo en el navegador.
 */
export interface SalesTargetUpsertPayload {
  userId: string
  /** Periodo etiquetado `YYYY-MM` (Bogotá); el servidor lo persiste como día 1. */
  period: string
  amount: string
  currency: SalesTargetCurrency
  notes?: string
}

export interface SalesTargetQueryParams {
  userId?: string
  from?: string
  to?: string
}

export type SalesTargetErrorCode = 'invalid' | 'unauthorized' | 'forbidden' | 'unknown'

/** Error tipado de la superficie de metas (patrón customers/agenda.service). */
export class SalesTargetServiceError extends Error {
  readonly code: SalesTargetErrorCode
  readonly status: number

  constructor(code: SalesTargetErrorCode, message: string, status: number) {
    super(message)
    this.name = 'SalesTargetServiceError'
    this.code = code
    this.status = status
  }
}

const TARGETS_DEFAULT_ERROR = 'No se pudo guardar la meta. Vuelve a intentarlo.'

/**
 * Reservas cuando el servidor no manda texto. El 403 de TRANSICIÓN es el caso
 * esperado: sin concesión `targets:edit` (o fuera de alcance) el POST responde
 * 403 — la UI debe decirlo con claridad, no romperse (aceptación 1).
 */
const TARGETS_STATUS_FALLBACK: Record<number, string> = {
  400: 'El servidor rechazó la meta: revisa monto, moneda (COP/USD/EUR) y periodo (YYYY-MM).',
  401: 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.',
  403: 'No tienes permiso para fijar metas sobre este integrante. Contacta al administrador.',
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

function codeFor(status: number): SalesTargetErrorCode {
  if (status === 400) return 'invalid'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  return 'unknown'
}

/** Envuelve los errores HTTP; la red (sin `response`) se propaga tal cual. */
function toSalesTargetError(error: unknown): unknown {
  if (error instanceof SalesTargetServiceError) return error
  const status = statusOf(error)
  if (status === undefined) return error
  return new SalesTargetServiceError(
    codeFor(status),
    serverMessageOf(error) ?? TARGETS_STATUS_FALLBACK[status] ?? TARGETS_DEFAULT_ERROR,
    status,
  )
}

/** Mensaje para la UI: el del servidor si existe, si no uno claro por estado. */
export function salesTargetErrorMessage(
  error: unknown,
  fallback = TARGETS_DEFAULT_ERROR,
): string {
  if (error instanceof SalesTargetServiceError) return error.message
  const status = statusOf(error)
  if (status !== undefined) {
    return serverMessageOf(error) ?? TARGETS_STATUS_FALLBACK[status] ?? fallback
  }
  return fallback
}

/** Clave PARCIAL de la lista: cualquier filtro de la página comparte prefijo. */
export const SALES_TARGETS_QUERY_KEY = ['sales-targets'] as const

/**
 * `GET /api/commercial/sales-targets` — el servidor decide el alcance (propias
 * siempre; ajenas solo con jerarquía/concesión; 403 pintado con su mensaje).
 */
export const fetchSalesTargets = async (
  params: SalesTargetQueryParams = {},
): Promise<SalesTargetRow[]> => {
  const qs = new URLSearchParams()
  if (params.userId) qs.set('userId', params.userId)
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  const query = qs.toString()
  const res = await api.get(`/commercial/sales-targets${query ? `?${query}` : ''}`)
  return Array.isArray(res.data) ? (res.data as SalesTargetRow[]) : []
}

/**
 * Periodo etiquetado `YYYY-MM` desde la fila (el backend persiste DATE día 1
 * serializado ISO; la etiqueta es lo que se muestra y compara).
 */
export function targetPeriodLabel(period: string): string {
  return /^\d{4}-\d{2}/.test(period) ? period.slice(0, 7) : period
}

/**
 * Dedup defensivo por `(userId, period)`: el servidor ya garantiza 1 fila por
 * clave (`@@unique`), pero una caché con reintentos no debe pintar duplicados.
 * Conserva la ÚLTIMA fila recibida.
 */
export function dedupeTargets(rows: readonly SalesTargetRow[]): SalesTargetRow[] {
  const byKey = new Map<string, SalesTargetRow>()
  for (const row of rows) {
    byKey.set(`${row.userId}|${targetPeriodLabel(row.period)}`, row)
  }
  return [...byKey.values()]
}

/**
 * `POST /api/commercial/sales-targets` (upsert idéntico por (userId, period):
 * N reintentos = 1 fila en servidor). Errores 400/401/403 salen tipados con el
 * mensaje del servidor tal cual.
 */
export const upsertSalesTarget = async (
  payload: SalesTargetUpsertPayload,
): Promise<SalesTargetRow> => {
  try {
    const res = await api.post('/commercial/sales-targets', payload)
    return res.data as SalesTargetRow
  } catch (error) {
    throw toSalesTargetError(error)
  }
}

/**
 * Upsert + refetch ÚNICO de la caché compartida de metas (patrón
 * `reassignCustomerInCache`): la fila vive en el servidor; el navegador NUNCA
 * la appendea en local, de modo que N reintentos idénticos dejan 1 fila tras
 * el refetch (aceptación 2). Un 400/403 no invalida nada: la tabla sigue
 * mostrando lo que el servidor autoriza.
 */
export async function upsertSalesTargetInCache(
  client: QueryClient,
  payload: SalesTargetUpsertPayload,
): Promise<SalesTargetRow> {
  const row = await upsertSalesTarget(payload)
  await client.invalidateQueries({ queryKey: SALES_TARGETS_QUERY_KEY, refetchType: 'all' })
  return row
}

/**
 * Avance facturado SEPARADO de la meta (COM-04 regla 3): fuente real
 * `/dashboard/team/:userId` (mes en curso, `SalesOrder` con referencia externa).
 * Devuelve SOLO `invoiced` — el `target` de esta respuesta NUNCA se usa en la
 * pantalla de metas: la meta vive en `SalesTarget` (sales-targets).
 */
export interface MemberInvoiced {
  amount: string
  currency: string
  mixedCurrency: boolean
}

export const fetchMemberInvoiced = async (userId: string): Promise<MemberInvoiced> => {
  const res = await api.get(`/dashboard/team/${userId}`)
  return res.data.invoiced as MemberInvoiced
}

// ─── COM-05 frontend — resumen asignado con fuente visible ───
/**
 * Facturado con procedencia (contrato COM-05 §3): la fuente actual es la
 * REFERENCIA MANUAL de factura; `sourceStatus` permite distinguir un cero
 * medido de una fuente ERP no conectada. La etiqueta jamás promete
 * sincronización Yéminus (regla 1 de la ficha).
 */
export interface InvoicedAmount {
  amount: string
  currency: string
  mixedCurrency: boolean
  source: string
  sourceStatus: string
}

export interface MoneyRef {
  amount: string
  currency: string
}

export interface PersonalSalesGoal {
  period: string
  target: MoneyRef | null
  invoiced: InvoicedAmount
  remaining: MoneyRef | null
  progressPercent: number | null
}

export interface MyQuotesCount {
  borrador: number
  enviada: number
  negociacion: number
  ganada: number
  perdida: number
}

export interface CommercialBlock {
  target: MoneyRef | null
  invoiced: InvoicedAmount
  remaining: MoneyRef | null
  pipeline: { amount: string; count: number }
  myCustomers: { total: number; leads: number; clientes: number }
  myQuotes: MyQuotesCount
}

export interface TeamMemberSummary {
  userId: string
  name: string
  target: MoneyRef | null
  invoiced: InvoicedAmount
  remaining: MoneyRef | null
  pipeline: { amount: string; count: number }
  customers: { total: number; leads: number; clientes: number }
  quotesByStatus: Record<string, number>
}

export interface MyTeamBlock {
  members: TeamMemberSummary[]
  totals: {
    target: MoneyRef & { mixedCurrency: boolean }
    invoiced: InvoicedAmount
  }
}

export interface MyWorkspace {
  scope: 'GLOBAL' | 'ASSIGNED'
  kpis: { listas: number; products: number; pendingPublication: number; recentActivity: number }
  listas: unknown[]
  recentActivity: unknown[]
  commercial?: CommercialBlock
  /** Presente SOLO si el servidor concedió ver equipo (teamInsights:read o
   * capa legada): la UI no inventa el bloque cuando no llega. */
  team?: MyTeamBlock
}

export const DASHBOARD_RESUME_QUERY_KEY = ['dashboard-resume'] as const
export const DASHBOARD_GOAL_QUERY_KEY = ['dashboard-goal'] as const

export const fetchPersonalSalesGoal = async (): Promise<PersonalSalesGoal> => {
  const res = await api.get('/dashboard/sales-goal')
  return res.data as PersonalSalesGoal
}

export const fetchMyWorkspace = async (): Promise<MyWorkspace> => {
  const res = await api.get('/dashboard/me')
  return res.data as MyWorkspace
}

/**
 * Etiqueta honesta de la fuente (COM-05 §3): «referencia manual» siempre;
 * añade «ERP sin conectar» cuando `sourceStatus` lo indica. Nunca «sincronizado».
 */
export function invoiceSourceLabel(invoiced: InvoicedAmount): string {
  const base = 'Referencia manual de factura'
  return invoiced.sourceStatus === 'erp-not-connected' ? `${base} · ERP sin conectar` : base
}

/**
 * Criterio UX de edición de metas (COM-04, punto de extensión D5/E6/F3):
 * vive en el service para que la página solo exporte componentes (react-refresh).
 * Cuando el navegador reciba concesiones, decidirá por `targets:edit`.
 */
export function targetsCanEdit(user?: { roles?: readonly string[] | null } | null): boolean {
  const roles = user?.roles ?? []
  return roles.includes('Super Admin') || roles.includes('Supervisor')
}
