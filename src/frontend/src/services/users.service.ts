import api from './api'

export interface UserListItem {
  id: string
  email: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  supervisorId?: string | null
  roles: { id: string; name: string }[]
}

interface UserListResponse {
  data: UserListItem[]
  meta?: { total: number; skip: number; take: number }
}

export const fetchUsers = async (search = '', take = 200): Promise<UserListItem[]> => {
  const params = new URLSearchParams()
  params.set('take', String(take))
  if (search.trim()) params.set('search', search.trim())
  const res = await api.get(`/users?${params}`)
  const body = res.data as UserListResponse
  return body.data ?? []
}

export const updateUserSupervisor = async (userId: string, supervisorId: string | null) => {
  const res = await api.patch(`/users/${userId}/supervisor`, { supervisorId })
  return res.data
}

// ---------------------------------------------------------------------------
// COM-01 frontend — concesiones por acción+alcance (paquetes de trabajo).
// Superficie del backend `users.controller.ts` (COM-01 backend, E1):
//   GET    /users/:id/access                  → estado, procedencia y paquetes
//   PUT    /users/:id/access                  → modo paquete o modo grants (OCC)
//   DELETE /users/:id/access/packages/:id     → retira SOLO esa fuente template
// El navegador nunca inventa reglas: sólo ecoa la versión OCC y la del
// catálogo que el servidor ya sirvió (409/400 si se desactualizan).
// ---------------------------------------------------------------------------

/** Versión del catálogo con la que el servidor sirve hoy el paquete. */
export const ACCESS_CATALOG_VERSION = 'panels-20261019-3'

export type AccessScope = 'own' | 'team' | 'list' | 'product' | 'global'

/** Selección concreta de un paquete: acción del catálogo + alcance (§3.1). */
export interface AccessSelection {
  actionId: string
  scope: AccessScope
  resourceId?: string
}

/** Concesión vigente con su procedencia (`sourceId` = fila de AccessSource). */
export interface AccessGrant {
  sourceId: string
  actionId: string
  scope: AccessScope
  resourceId?: string
}

export interface AccessSource {
  id: string
  kind: string
  templateId: string | null
  catalogVersion: string
  grantedById: string
  reason: string | null
}

export interface AccessPackage {
  id: string
  name: string
  selections: AccessSelection[]
  applied: boolean
  sourceId: string | null
}

export interface UserAccessState {
  catalogVersion: string
  accessVersion: number
  grants: AccessGrant[]
  sources: AccessSource[]
  packages: AccessPackage[]
  /** Solo Super Admin recibe el catálogo completo para repartir trabajo. */
  actions?: AccessActionDefinition[]
}

export interface AccessActionDefinition {
  id: string
  label: string
  purpose: string
  allowedScopes: AccessScope[]
  dependencies: string[]
  enabled: boolean
}

export interface AssignmentReceipt {
  userId: string
  sourceId: string
  accessVersion: number
  changed: boolean
  replayed?: boolean
  grants: AccessGrant[]
}

export type UserAccessErrorCode =
  | 'invalid'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'unknown'

/**
 * Error tipado de la superficie de concesiones. `serverCode` conserva el
 * código libre del servidor cuando lo trae (p. ej. `access-version-conflict`).
 */
export class UserAccessServiceError extends Error {
  readonly code: UserAccessErrorCode
  readonly status: number
  readonly serverCode?: string

  constructor(code: UserAccessErrorCode, message: string, status: number, serverCode?: string) {
    super(message)
    this.name = 'UserAccessServiceError'
    this.code = code
    this.status = status
    this.serverCode = serverCode
  }
}

const ACCESS_STATUS_FALLBACK: Record<number, string> = {
  400: 'El servidor rechazó la asignación: revisa la acción, el alcance o la versión.',
  401: 'Tu sesión expiró. Vuelve a iniciar sesión para administrar concesiones.',
  403: 'Sólo Super Admin puede administrar concesiones por acción.',
  404: 'El usuario o el paquete ya no existe.',
  409: 'Las concesiones cambiaron mientras se editaban; se recarga el estado actual.',
}

const ACCESS_DEFAULT_ERROR =
  'No se pudo guardar el acceso. Vuelve a intentarlo tras revisar el estado del usuario.'

function statusOf(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' ? status : undefined
}

/** El servidor manda `message` como string (exceptions) o array (class-validator). */
function serverMessageOf(error: unknown): string | undefined {
  const message = (error as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message
  if (typeof message === 'string' && message.trim()) return message
  if (Array.isArray(message)) {
    const joined = message.filter((item): item is string => typeof item === 'string' && item.trim() !== '').join(' ')
    if (joined) return joined
  }
  return undefined
}

function serverCodeOf(error: unknown): string | undefined {
  const code = (error as { response?: { data?: { code?: unknown } } } | null)?.response?.data?.code
  return typeof code === 'string' && code.trim() ? code : undefined
}

function codeFor(status: number): UserAccessErrorCode {
  if (status === 400) return 'invalid'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  return 'unknown'
}

function toAccessError(error: unknown): unknown {
  if (error instanceof UserAccessServiceError) return error
  const status = statusOf(error)
  if (status === undefined) return error
  return new UserAccessServiceError(
    codeFor(status),
    serverMessageOf(error) ?? ACCESS_STATUS_FALLBACK[status] ?? ACCESS_DEFAULT_ERROR,
    status,
    serverCodeOf(error),
  )
}

/** Mensaje para la UI: el del servidor si existe, si no uno claro por estado. */
export function userAccessErrorMessage(error: unknown, fallback = ACCESS_DEFAULT_ERROR): string {
  if (error instanceof UserAccessServiceError) return error.message
  const status = statusOf(error)
  if (status !== undefined) return serverMessageOf(error) ?? ACCESS_STATUS_FALLBACK[status] ?? fallback
  return fallback
}

/** Super Admin lee el catálogo para cualquier usuario; el resto solo su propio estado. */
export async function fetchUserAccess(userId: string): Promise<UserAccessState> {
  try {
    const res = await api.get(`/users/${userId}/access`)
    return res.data as UserAccessState
  } catch (error) {
    throw toAccessError(error)
  }
}

/**
 * Aplica un paquete del catálogo como fuente template (modo paquete del PUT).
 * `grants: []` es obligatorio: el DTO del servidor lo exige y `packageId` y
 * grants no-empty son excluyentes (400 «Envíe packageId o grants, no ambos»).
 */
export async function applyUserPackage(
  userId: string,
  packageId: string,
  expectedVersion: number,
  options: { catalogVersion?: string; reason?: string; idempotencyKey?: string } = {},
): Promise<AssignmentReceipt> {
  try {
    const res = await api.put(`/users/${userId}/access`, {
      packageId,
      grants: [],
      expectedVersion,
      expectedCatalogVersion: options.catalogVersion ?? ACCESS_CATALOG_VERSION,
      ...(options.reason ? { reason: options.reason } : {}),
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    })
    return res.data as AssignmentReceipt
  } catch (error) {
    throw toAccessError(error)
  }
}

/**
 * Retira la fuente template del paquete; las demás fuentes del usuario se
 * conservan (si otra concede la misma acción, el acceso permanece).
 */
export async function removeUserPackage(
  userId: string,
  packageId: string,
  expectedVersion: number,
): Promise<AssignmentReceipt> {
  try {
    const res = await api.delete(`/users/${userId}/access/packages/${packageId}`, {
      params: { expectedVersion },
    })
    return res.data as AssignmentReceipt
  } catch (error) {
    throw toAccessError(error)
  }
}

/** Quita una fuente manual para que el usuario pueda volver a quedar sin acciones. */
export async function removeManualAccessSource(
  userId: string,
  sourceId: string,
  expectedVersion: number,
): Promise<AssignmentReceipt> {
  try {
    const res = await api.delete(`/users/${userId}/access/manual/${sourceId}`, {
      params: { expectedVersion },
    })
    return res.data as AssignmentReceipt
  } catch (error) {
    throw toAccessError(error)
  }
}

/**
 * Modo grants del PUT (fuente manual). COM-01 frontend lo deja declarado para
 * la revisión casilla a casilla: la interfaz de paquetes no lo usa todavía
 * (no existe superficie equivalente previa; ficha regla 1).
 */
export async function setUserAccessGrants(
  userId: string,
  grants: AccessSelection[],
  expectedVersion: number,
  options: { catalogVersion?: string; reason?: string; idempotencyKey?: string } = {},
): Promise<AssignmentReceipt> {
  try {
    const res = await api.put(`/users/${userId}/access`, {
      grants,
      expectedVersion,
      expectedCatalogVersion: options.catalogVersion ?? ACCESS_CATALOG_VERSION,
      ...(options.reason ? { reason: options.reason } : {}),
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    })
    return res.data as AssignmentReceipt
  } catch (error) {
    throw toAccessError(error)
  }
}
