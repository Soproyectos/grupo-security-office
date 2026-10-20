import type { QueryClient } from '@tanstack/react-query'
import api from './api'

/**
 * Cliente de la agenda personal (BASE-03, paso frontend-propias).
 *
 * Cubre los 3 endpoints que usa el panel —listar, crear y completar— y el
 * manejo de errores que el contrato fija en §6/§7:
 *   409 «ya completada» → error tipado con aviso legible (la página avisa y
 *                         recarga; la fila no se duplica en el estado local),
 *   404 / 403           → mensaje claro (el del servidor si lo trae),
 *   dedup por `id`      → la aceptación del paso: «Crear/completar/recargar
 *                         conserva actividades sin entradas duplicadas por
 *                         panel».
 *
 * Incremento frontend-equipo: se añaden `PATCH /assign` (reasignar), el
 * directorio `/sellers` y dos orquestadores que actualizan la caché compartida
 * SOLO cuando la API responde bien — un 403/404/409 no toca el estado
 * («botones y API concuerdan»).
 */

export const AGENDA_ACTIVITY_KIND_LABELS: Record<string, string> = {
  CALL: 'Llamada',
  VISIT: 'Visita a proyecto',
  FOLLOW_UP: 'Seguimiento',
}

export interface AgendaPerson {
  id: string
  name: string
}

export interface AgendaActivityEvent {
  id: string
  activityId: string
  actorId: string
  type: string
  at: string
}

/** Tipos enlazables del backend (`workflow.dto.ts` LINK_TARGETS). */
export const AGENDA_LINK_TARGETS = ['PRODUCT', 'LISTA', 'PRICE_LIST', 'IMPORT_SESSION'] as const
export type AgendaLinkTarget = (typeof AGENDA_LINK_TARGETS)[number]

export const AGENDA_LINK_TARGET_LABELS: Record<AgendaLinkTarget, string> = {
  PRODUCT: 'Producto',
  LISTA: 'Lista',
  PRICE_LIST: 'Lista de tarifas',
  IMPORT_SESSION: 'Importación',
}

/** Detalle vivo del recurso que el servidor MANDA solo con `revealed:true`. */
export interface AgendaLinkTargetDetails {
  id: string
  name?: string | null
  sku?: string | null
  code?: string | null
  isActive?: boolean
  currency?: string | null
  publishStatus?: string | null
  listaId?: string | null
  userId?: string
  createdAt?: string
}

/**
 * Vínculo actividad → recurso (BASE-03 backend-vinculos).
 *
 * `revealed:false` ⇒ SOLO `targetType`/`targetId`: el servidor ya ocultó
 * label y `target` porque no hay cobertura vigente (contrato §6.3). El
 * cliente pinta exactamente lo que llega: aquí no se completa nada.
 */
export interface AgendaActivityLink {
  id: string
  targetType: string
  targetId: string
  revealed: boolean
  label?: string | null
  target?: AgendaLinkTargetDetails | null
}

export interface AgendaActivity {
  id: string
  title: string
  kind: string
  startsAt: string
  status: string
  assigneeId: string
  creatorId: string
  createdAt?: string
  updatedAt?: string | null
  completedAt?: string | null
  updatedById?: string | null
  assignee: AgendaPerson
  creator: AgendaPerson
  updatedBy?: AgendaPerson | null
  events?: AgendaActivityEvent[]
  links?: AgendaActivityLink[]
}

export interface CreateAgendaActivityPayload {
  title: string
  kind: string
  assigneeId: string
  startsAt: string
}

export type AgendaErrorCode =
  | 'invalid'
  | 'conflict'
  | 'not-found'
  | 'forbidden'
  | 'unauthorized'
  | 'unknown'

export class AgendaServiceError extends Error {
  readonly code: AgendaErrorCode
  readonly status: number

  constructor(code: AgendaErrorCode, message: string, status: number) {
    super(message)
    this.name = 'AgendaServiceError'
    this.code = code
    this.status = status
  }
}

const DEFAULT_ERROR = 'No se pudo completar la actividad. Actualiza la agenda y vuelve a intentarlo.'

const STATUS_FALLBACK: Record<number, string> = {
  401: 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.',
  403: 'No tienes permiso para esta acción en la agenda.',
  404: 'La actividad ya no existe en tu agenda.',
  409: 'La actividad ya fue completada.',
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' ? status : undefined
}

function serverMessageOf(error: unknown): string | undefined {
  const message = (error as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message
  return typeof message === 'string' && message.trim() ? message : undefined
}

function codeFor(status: number): AgendaErrorCode {
  if (status === 400) return 'invalid'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  return 'unknown'
}

/** Mensaje para la UI: el del servidor si existe, si no uno claro por estado. */
export function agendaErrorMessage(error: unknown, fallback = DEFAULT_ERROR): string {
  if (error instanceof AgendaServiceError) return error.message
  const status = statusOf(error)
  if (status !== undefined) return serverMessageOf(error) ?? STATUS_FALLBACK[status] ?? fallback
  return fallback
}

/** El 409 es el único estado que exige un aviso específico («ya completada»). */
export function isAgendaConflict(error: unknown): boolean {
  return error instanceof AgendaServiceError && error.code === 'conflict'
}

/**
 * Envuelve los errores HTTP en `AgendaServiceError`; la red se propaga tal cual.
 *
 * `statusFallback`/`fallback` son los mensajes propios de cada familia de
 * endpoints: los de enlaces no reutilizan los de actividad (un 409 aquí es
 * «ya está enlazado», no «ya fue completada»).
 */
function toAgendaError(
  error: unknown,
  statusFallback: Record<number, string> = STATUS_FALLBACK,
  fallback = DEFAULT_ERROR,
): unknown {
  if (error instanceof AgendaServiceError) return error
  const status = statusOf(error)
  if (status === undefined) return error
  return new AgendaServiceError(codeFor(status), serverMessageOf(error) ?? statusFallback[status] ?? fallback, status)
}

/** Avisos propios de los vínculos (400/403/404/409 de `/links`). */
const LINK_DEFAULT_ERROR = 'No se pudo guardar el enlace de la actividad. Vuelve a intentarlo.'
const LINK_STATUS_FALLBACK: Record<number, string> = {
  400: 'El identificador del recurso no es un UUID válido.',
  401: 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.',
  403: 'No tienes permiso para gestionar los enlaces de esta actividad.',
  404: 'La actividad o el enlace ya no está disponible.',
  409: 'Ese recurso ya está enlazado a esta actividad.',
}

/** Validación cliente espejo de `@IsUUID()` (workflow.dto LinkDto). */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

/** Clave de la caché compartida por las vistas del panel (una sola por usuario). */
export const agendaActivitiesKey = (userId?: string) => ['team-workflow', 'activities', userId] as const

/**
 * La API devuelve envuelta en `{ data: … }` (y el interceptor de `api` ya peló
 * una capa); aquí se pelan todas las que queden para tolerar ambos casos.
 */
function unwrapBody(payload: unknown): unknown {
  let data = payload
  while (
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'data' in data &&
    !('id' in data)
  ) {
    data = (data as { data: unknown }).data
  }
  return data
}

/** Una fila por `id`, en el orden en que llega: así no se duplican paneles. */
export function dedupeAgendaActivities(rows: readonly AgendaActivity[] | null | undefined): AgendaActivity[] {
  if (!Array.isArray(rows)) return []
  const seen = new Set<string>()
  const unique: AgendaActivity[] = []
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || seen.has(row.id)) continue
    seen.add(row.id)
    unique.push(row)
  }
  return unique
}

/**
 * Estado local tras una recarga: manda lo que trajo el servidor, se queda con
 * lo que solo existía localmente y nunca deja dos filas para el mismo `id`.
 */
export function mergeAgendaActivities(
  current: readonly AgendaActivity[] | undefined | null,
  incoming: readonly AgendaActivity[] | undefined | null,
): AgendaActivity[] {
  const refreshed = dedupeAgendaActivities(incoming)
  const refreshedIds = new Set(refreshed.map(row => row.id))
  const localOnly = dedupeAgendaActivities(current).filter(row => !refreshedIds.has(row.id))
  return [...refreshed, ...localOnly]
}

export async function fetchAgendaActivities(): Promise<AgendaActivity[]> {
  try {
    const response = await api.get('/team-workflow/activities')
    const rows = unwrapBody(response.data)
    return dedupeAgendaActivities(Array.isArray(rows) ? rows : [])
  } catch (error) {
    throw toAgendaError(error)
  }
}

/** Directorio de vendedores: solo lo pide la query del equipo (`enabled`). */
export async function fetchAgendaSellers(): Promise<AgendaPerson[]> {
  try {
    const response = await api.get('/team-workflow/sellers')
    const rows = unwrapBody(response.data)
    return Array.isArray(rows) ? (rows as AgendaPerson[]) : []
  } catch (error) {
    throw toAgendaError(error)
  }
}

export async function createAgendaActivity(payload: CreateAgendaActivityPayload): Promise<AgendaActivity> {
  try {
    const response = await api.post('/team-workflow/activities', payload)
    return unwrapBody(response.data) as AgendaActivity
  } catch (error) {
    throw toAgendaError(error)
  }
}

export async function completeAgendaActivity(id: string): Promise<void> {
  try {
    await api.patch(`/team-workflow/activities/${id}/complete`)
  } catch (error) {
    throw toAgendaError(error)
  }
}

/** Reasignar (`PATCH /activities/:id/assign`). 403 = destino fuera de tu
 *  conjunto; 404 = actividad ajena o inexistente (la API no revela cuál). */
export async function assignAgendaActivity(id: string, assigneeId: string): Promise<void> {
  try {
    await api.patch(`/team-workflow/activities/${id}/assign`, { assigneeId })
  } catch (error) {
    throw toAgendaError(error)
  }
}

/**
 * Actualización de una fila en la caché compartida: dedup por `id` primero,
 * así una reasignación o una completada nunca añaden filas al panel.
 */
export function applyAgendaAssignee(
  rows: readonly AgendaActivity[] | null | undefined,
  id: string,
  assignee: AgendaPerson,
): AgendaActivity[] {
  return dedupeAgendaActivities(rows).map(row =>
    row.id === id ? { ...row, assigneeId: assignee.id, assignee } : row,
  )
}

export function applyAgendaCompletion(
  rows: readonly AgendaActivity[] | null | undefined,
  id: string,
): AgendaActivity[] {
  return dedupeAgendaActivities(rows).map(row =>
    row.id === id ? { ...row, status: 'COMPLETED' } : row,
  )
}

/**
 * Reasignar contra la caché compartida por las dos vistas. Solo escribe cuando
 * la API responde: un 403/404 se propaga tal cual y el estado local queda
 * intacto (sin cambio optimista) para que la página muestre el aviso.
 */
export async function reassignAgendaActivityInCache(
  client: QueryClient,
  key: readonly unknown[],
  id: string,
  assignee: AgendaPerson,
): Promise<void> {
  await assignAgendaActivity(id, assignee.id)
  client.setQueryData<AgendaActivity[]>(key, rows => applyAgendaAssignee(rows, id, assignee))
  await client.invalidateQueries({ queryKey: key })
}

/** Completar contra la caché compartida: misma regla — si la API no confirma
 *  (409 «ya completada», 404), la caché no cambia y no aparecen filas nuevas. */
export async function completeAgendaActivityInCache(
  client: QueryClient,
  key: readonly unknown[],
  id: string,
): Promise<void> {
  await completeAgendaActivity(id)
  client.setQueryData<AgendaActivity[]>(key, rows => applyAgendaCompletion(rows, id))
  await client.invalidateQueries({ queryKey: key })
}

// ---------------------------------------------------------------------------
// BASE-03 frontend-vinculos: «Un enlace no revela recurso ajeno ni concede
// permisos» (contrato §5/§6.3).
// ---------------------------------------------------------------------------

/**
 * Añade un vínculo actividad → recurso. El cuerpo es SOLO `targetType` y
 * `targetId`: crear un enlace no concede acceso a nada ni el cliente ni el
 * servidor lo intentan (DISENO-CATALOGO:88), de modo que aquí no se envía
 * ningún campo de permiso, concesión o rol.
 */
export async function addAgendaLink(
  activityId: string,
  payload: { targetType: AgendaLinkTarget; targetId: string },
): Promise<AgendaActivityLink> {
  if (!isUuid(payload.targetId)) {
    throw new AgendaServiceError('invalid', LINK_STATUS_FALLBACK[400]!, 400)
  }
  try {
    const response = await api.post(`/team-workflow/activities/${activityId}/links`, payload)
    return unwrapBody(response.data) as AgendaActivityLink
  } catch (error) {
    throw toAgendaError(error, LINK_STATUS_FALLBACK, LINK_DEFAULT_ERROR)
  }
}

/** Quita el vínculo (no la actividad): la trazabilidad de la tarea se queda. */
export async function removeAgendaLink(activityId: string, linkId: string): Promise<void> {
  try {
    await api.delete(`/team-workflow/activities/${activityId}/links/${linkId}`)
  } catch (error) {
    throw toAgendaError(error, LINK_STATUS_FALLBACK, LINK_DEFAULT_ERROR)
  }
}

/**
 * Alta de un vínculo contra la caché compartida por las vistas del panel.
 *
 * MATIZ DE DISEÑO: la respuesta del POST es SIEMPRE conservadora
 * (`revealed:false`, sin `label` ni `target`) porque crear un enlace no
 * revela el recurso — el estado real (`revealed` según la cobertura vigente)
 * sólo lo decide `GET /activities`. Por eso esta función NO pinta la
 * respuesta en la caché: sólo invalida la query para que el refetch traiga
 * el estado real. Un fallo (400/404/409) tampoco toca el estado local.
 */
export async function addAgendaLinkInCache(
  client: QueryClient,
  key: readonly unknown[],
  activityId: string,
  payload: { targetType: AgendaLinkTarget; targetId: string },
): Promise<void> {
  await addAgendaLink(activityId, payload)
  await client.invalidateQueries({ queryKey: key })
}

/**
 * Baja de un vínculo contra la caché compartida: mismo trato — el `DELETE`
 * sólo confirma `{ok:true}`, así que la fila se repinta con el refetch
 * (dedup por `id` en el `select` de la página: una sola fila, un solo
 * pintado) y un 404 deja el estado local intacto.
 */
export async function removeAgendaLinkInCache(
  client: QueryClient,
  key: readonly unknown[],
  activityId: string,
  linkId: string,
): Promise<void> {
  await removeAgendaLink(activityId, linkId)
  await client.invalidateQueries({ queryKey: key })
}
