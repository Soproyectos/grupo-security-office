import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import {
  applyUserPackage,
  fetchUserAccess,
  removeUserPackage,
  setUserLibrarySelection,
  userAccessErrorMessage,
  UserAccessServiceError,
  type AccessPackage,
  type AccessGrant,
  type AccessSource,
  type UserAccessState,
} from '../../services/users.service'

/**
 * Gating de la navegación Comercial por concesiones individuales (COM-01 §4).
 *
 * MISMO patrón que `features/agenda/agenda-access.ts` (BASE-03): una función
 * pura decide la navegación a partir de identidad + concesiones. Aquí el
 * criterio deja de ser el rol y pasa a ser la ACCIÓN concedida (ficha regla 1:
 * «paquete no equivale a rol»); el servidor sigue siendo la autoridad del
 * alcance y de los datos por petición (`data-scope.ts`).
 */

export const NO_PANELS_MESSAGE = 'Sin paneles asignados'

export interface CommercialTab {
  readonly to: string
  readonly label: string
  readonly end: boolean
  /** Acción del catálogo cuya concesión habilita la pestaña (§3.1/§4). */
  readonly actionId: string
}

/** Los dos paneles usan las rutas existentes sin mezclar sus herramientas. */
export const COMMERCIAL_TABS: readonly CommercialTab[] = Object.freeze([
  { to: '/commercial/customers', label: 'Clientes', end: false, actionId: 'customers:read' },
  { to: '/commercial/quotes', label: 'Cotizaciones', end: false, actionId: 'quotes:read' },
  { to: '/targets', label: 'Metas', end: false, actionId: 'targets:read' },
  { to: '/reports', label: 'Resumen del equipo', end: false, actionId: 'teamInsights:read' },
  { to: '/sales/promotions', label: 'Promociones internas', end: false, actionId: 'commercialPromotions:read' },
  { to: '/promotions', label: 'Gestionar avisos', end: false, actionId: 'commercialPromotions:create' },
])

export const CATALOG_TABS: readonly CommercialTab[] = Object.freeze([
  { to: '/commercial/products', label: 'Productos', end: false, actionId: 'products:read' },
  { to: '/commercial/library/update/products', label: 'Fichas', end: false, actionId: 'products:write' },
  { to: '/commercial/library/update', label: 'Precios', end: true, actionId: 'prices:preview' },
  { to: '/commercial/library/update/import', label: 'Importaciones', end: false, actionId: 'imports:read' },
  { to: '/commercial/library/masters', label: 'Catálogos maestros', end: false, actionId: 'masters:read' },
])

/** Rutas de las pestañas de Biblioteca (Productos, Fichas, Precios, Importaciones, Catálogos maestros). */
export const LIBRARY_PRODUCTS_PATH = '/commercial/products'
export const LIBRARY_SHEETS_PATH = '/commercial/library/update/products'
export const LIBRARY_PRICES_PATH = '/commercial/library/update'
export const LIBRARY_IMPORTS_PATH = '/commercial/library/update/import'
export const LIBRARY_MASTERS_PATH = '/commercial/library/masters'

/**
 * Pestañas independientes, cada una con su paquete y su acción:
 * Productos = products:read, Fichas = products:write, Precios = prices:preview,
 * Importaciones = imports:read, Catálogos maestros = masters:read.
 * `biblioteca-publicacion` es un complemento de Fichas y no abre pestaña propia.
 * Pertenecer a Biblioteca no concede ninguna: cada una exige su propia concesión.
 */
export type LibraryPanelId =
  | 'biblioteca-consulta'
  | 'biblioteca-fichas'
  | 'biblioteca-precios'
  | 'biblioteca-publicacion'
  | 'biblioteca-importaciones'
  | 'biblioteca-maestros'

const LIBRARY_PANEL_ACTIONS: Readonly<Record<LibraryPanelId, string>> = Object.freeze({
  'biblioteca-consulta': 'products:read',
  'biblioteca-fichas': 'products:write',
  'biblioteca-precios': 'prices:preview',
  'biblioteca-publicacion': 'products:publish',
  'biblioteca-importaciones': 'imports:read',
  'biblioteca-maestros': 'masters:read',
})

/**
 * Paquetes cuya asignación abre cada pestaña. `biblioteca-actualizacion` es el
 * paquete anterior (fichas + precios juntos): quien aún lo tiene conserva sus
 * pestañas Fichas y Precios hasta que se le retire.
 */
const LIBRARY_PANEL_PACKAGES: Readonly<Record<LibraryPanelId, readonly string[]>> = Object.freeze({
  'biblioteca-consulta': ['biblioteca-consulta'],
  'biblioteca-fichas': ['biblioteca-fichas', 'biblioteca-actualizacion'],
  'biblioteca-precios': ['biblioteca-precios', 'biblioteca-actualizacion'],
  'biblioteca-publicacion': ['biblioteca-publicacion'],
  'biblioteca-importaciones': ['biblioteca-importaciones'],
  'biblioteca-maestros': ['biblioteca-maestros'],
})

const LIBRARY_PANEL_BY_ACTION: Readonly<Record<string, LibraryPanelId>> = Object.freeze({
  'products:read': 'biblioteca-consulta',
  'products:write': 'biblioteca-fichas',
  'prices:preview': 'biblioteca-precios',
  'products:publish': 'biblioteca-publicacion',
  'imports:read': 'biblioteca-importaciones',
  'masters:read': 'biblioteca-maestros',
})

/** Etiquetas del catálogo (espejo de `access-catalog.ts`) para pintar
 *  selecciones concretas; lo que no esté aquí se muestra como actionId. */
export const ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'customers:read': 'Consultar clientes',
  'customers:create': 'Crear cliente',
  'customers:edit': 'Editar cliente',
  'customers:reassign': 'Reasignar cartera',
  'quotes:read': 'Consultar cotizaciones',
  'quotes:create': 'Crear cotización',
  'quotes:edit': 'Editar cotización',
  'quotes:status': 'Cambiar estado',
  'targets:read': 'Consultar metas',
  'targets:edit': 'Editar metas',
  'activities:read': 'Consultar agenda',
  'activities:create': 'Crear actividad',
  'activities:complete': 'Completar actividad',
  'activities:assign': 'Asignar actividades',
  'teamInsights:read': 'Consultar equipo',
  'commercialPromotions:read': 'Consultar avisos internos',
  'commercialPromotions:create': 'Crear aviso',
  'commercialPromotions:edit': 'Editar aviso',
  'commercialPromotions:publish': 'Publicar aviso',
  'commercialPromotions:withdraw': 'Retirar aviso',
  'products:read': 'Consultar productos',
  'products:write': 'Editar fichas',
  'products:delete': 'Eliminar productos',
  'products:validate': 'Validar productos',
  'products:notes': 'Gestionar notas de productos',
  'products:publish': 'Publicar productos',
  'products:approveSpecs': 'Aprobar datos clave',
  'imports:read': 'Consultar importaciones',
  'imports:run': 'Importar datos',
  'masters:read': 'Consultar catálogos maestros',
  'masters:write': 'Editar catálogos maestros',
  'prices:read': 'Consultar precios',
  'prices:preview': 'Revisar archivo de precios',
  'prices:save': 'Guardar revisión de precios',
  'prices:apply': 'Aplicar precios',
  'providers:read': 'Consultar proveedores',
  'providers:write': 'Gestionar proveedores',
  'listas:read': 'Consultar listas',
  'libraryStats:products': 'Estadísticas de Productos',
  'libraryStats:update': 'Estadísticas de Fichas',
  'libraryStats:publication': 'Estadísticas de Publicar en tienda',
  'commercialSettings:read': 'Consultar parámetros comerciales',
  'commercialSettings:edit': 'Editar parámetros comerciales',
  'marketing:read': 'Ver banners y pop-ups',
  'marketing:create': 'Crear',
  'marketing:edit': 'Editar',
  'marketing:publish': 'Publicar y retirar',
  'marketing:delete': 'Eliminar',
})

export const SCOPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  own: 'Propio',
  team: 'Equipo',
  list: 'Lista',
  product: 'Producto',
  global: 'Global',
})

export function actionLabel(actionId: string): string {
  return ACTION_LABELS[actionId] ?? actionId
}

export interface AccessActionNotice {
  tone: 'conflict' | 'error'
  message: string
}

/** Aviso para la UI: 409 = versión desactualizada (hay que recargar y reintentar). */
export function accessActionNotice(error: unknown): AccessActionNotice | null {
  if (!error) return null
  if (error instanceof UserAccessServiceError && error.code === 'conflict') {
    return { tone: 'conflict', message: error.message }
  }
  return { tone: 'error', message: userAccessErrorMessage(error) }
}

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope
}

/**
 * Quién puede ADMINISTRAR el acceso de otros hoy: mismo rol que la lectura
 * (`assertWritableIdentity` del servicio y `@Roles('Super Admin')` del
 * controller). Se declara aparte para que el cambio de un lado no arrastre al
 * otro cuando el servidor abra la lectura propia a más roles.
 */
export function canAdministerAccess(roles: readonly string[] | undefined | null): boolean {
  return (roles ?? []).includes('Super Admin')
}

export interface CommercialAccess {
  readonly tabs: readonly CommercialTab[]
  /** Falso ⇒ «Sin paneles asignados» y ningún dato interno montado. */
  readonly hasAnyPanel: boolean
  /** true cuando la decisión salió de concesiones reales (no del fallback). */
  readonly gated: boolean
}

export interface CommercialAccessInput {
  readonly roles?: readonly string[] | null
  readonly grants?: readonly AccessGrant[] | null
  readonly packages?: readonly Pick<AccessPackage, 'id' | 'applied'>[] | null
  /** Fuentes del usuario: permiten reconocer la selección por casillas de Biblioteca. */
  readonly sources?: readonly Pick<AccessSource, 'id' | 'kind' | 'templateId'>[] | null
  readonly status: 'loading' | 'ready' | 'unavailable'
}

/** Acciones de Biblioteca: solo cuentan con alcance global. */
const LIBRARY_ACTION_PATTERN = /^(products|prices|providers|imports|masters):/

export function hasAssignedAction(input: CommercialAccessInput, actions: readonly string[]): boolean {
  if (canAdministerAccess(input.roles)) return true
  if (input.status !== 'ready') return false
  return (input.grants ?? []).some((grant) =>
    actions.includes(grant.actionId) &&
    (!LIBRARY_ACTION_PATTERN.test(grant.actionId) || grant.scope === 'global'),
  )
}

/** Id reservado de la fuente que guarda las casillas de Biblioteca (espejo del servidor). */
export const LIBRARY_SELECTION_TEMPLATE_ID = 'biblioteca-seleccion'

/**
 * Una pestaña de Biblioteca se muestra si la persona tiene su acción global y esa
 * acción viene de un paquete vigente aplicado o de la selección por casillas.
 * Los permisos sueltos o de accesos anteriores no abren pestañas.
 */
export function hasAssignedLibraryPanel(input: CommercialAccessInput, panelId: LibraryPanelId): boolean {
  if (canAdministerAccess(input.roles)) return true
  if (input.status !== 'ready') return false
  const requiredAction = LIBRARY_PANEL_ACTIONS[panelId]
  if (!hasAssignedAction(input, [requiredAction])) return false
  const accepted = LIBRARY_PANEL_PACKAGES[panelId]
  if ((input.packages ?? []).some((pkg) => accepted.includes(pkg.id) && pkg.applied)) return true
  const selectionSourceIds = new Set(
    (input.sources ?? []).filter((source) => source.kind === 'template' && source.templateId === LIBRARY_SELECTION_TEMPLATE_ID).map((source) => source.id),
  )
  return (input.grants ?? []).some((grant) =>
    grant.actionId === requiredAction && grant.scope === 'global' && selectionSourceIds.has(grant.sourceId),
  )
}

/**
 * Primera pestaña de Biblioteca asignada a la persona (Productos, Fichas o
 * Precios, en ese orden), o `null` si no tiene ninguna. Sirve para redirigir
 * cuando entra a una pestaña que no tiene.
 */
export function firstAssignedLibraryPath(input: CommercialAccessInput): string | null {
  return panelAccess(input, 'catalog').tabs[0]?.to ?? null
}

/** Cargar o fallar nunca recupera permisos por rol. Super Admin es explícito. */
export function panelAccess(input: CommercialAccessInput, panel: 'commercial' | 'catalog'): CommercialAccess {
  const candidates = panel === 'commercial' ? COMMERCIAL_TABS : CATALOG_TABS
  const tabs = candidates.filter((tab) => {
    if (panel === 'catalog') {
      const packageId = LIBRARY_PANEL_BY_ACTION[tab.actionId]
      return packageId ? hasAssignedLibraryPanel(input, packageId) : false
    }
    return hasAssignedAction(input, [tab.actionId])
  })
  return { tabs, hasAnyPanel: tabs.length > 0, gated: true }
}

export const commercialAccess = (input: CommercialAccessInput): CommercialAccess => panelAccess(input, 'commercial')

export function isCatalogPath(pathname: string): boolean {
  return (
    pathname.startsWith('/commercial/products') ||
    pathname.startsWith('/commercial/library') ||
    pathname.startsWith('/commercial/lists') ||
    pathname.startsWith('/catalog-management')
  )
}

/** Clave de la caché compartida: el panel de asignación y el menú leen la
 *  MISMA entrada, de modo que el refetch tras revocar actualiza la navegación. */
export const userAccessKey = (userId: string | undefined) => ['user-access', userId] as const

type AccessEventsSource = Pick<EventSource, 'close' | 'onopen' | 'onmessage' | 'onerror'>
type AccessEventsEntry = {
  source: AccessEventsSource
  references: number
  clients: Map<QueryClient, number>
}

const accessEventsByUser = new Map<string, AccessEventsEntry>()

function createAccessEventsSource(): AccessEventsSource | null {
  if (typeof EventSource === 'undefined') return null
  const apiBase = import.meta.env.VITE_API_URL || '/api'
  return new EventSource(`${apiBase.replace(/\/$/, '')}/users/me/access-events`, { withCredentials: true })
}

function invalidateAccessForSubscribers(entry: AccessEventsEntry, userId: string): void {
  for (const subscriber of entry.clients.keys()) {
    void subscriber.invalidateQueries({ queryKey: userAccessKey(userId) }).catch(() => undefined)
  }
}

/** One EventSource per user in this tab; each hook holds a reference until unmount. */
export function subscribeOwnAccessEvents(
  userId: string,
  client: QueryClient,
  sourceFactory: () => AccessEventsSource | null = createAccessEventsSource,
): () => void {
  let entry = accessEventsByUser.get(userId)
  if (!entry) {
    const source = sourceFactory()
    if (!source) return () => undefined
    entry = { source, references: 0, clients: new Map() }
    accessEventsByUser.set(userId, entry)
    source.onopen = () => invalidateAccessForSubscribers(entry!, userId)
    source.onmessage = (event) => {
      let type: string | undefined
      try {
        type = JSON.parse(event.data).type
      } catch {
        return
      }
      if (type === 'heartbeat') return
      invalidateAccessForSubscribers(entry!, userId)
    }
    // EventSource reconnects itself. Focus refetch and the 30s query interval are fallbacks.
    source.onerror = () => undefined
  }

  entry.references += 1
  entry.clients.set(client, (entry.clients.get(client) ?? 0) + 1)
  return () => {
    const active = accessEventsByUser.get(userId)
    if (!active) return
    active.references -= 1
    const clientReferences = (active.clients.get(client) ?? 1) - 1
    if (clientReferences <= 0) active.clients.delete(client)
    else active.clients.set(client, clientReferences)
    if (active.references === 0) {
      active.source.onmessage = null
      active.source.onopen = null
      active.source.onerror = null
      active.source.close()
      accessEventsByUser.delete(userId)
    }
  }
}

function isOwnAccessQuery(queryKey: readonly unknown[], userId: string): boolean {
  return queryKey.length === 2 && queryKey[0] === 'user-access' && queryKey[1] === userId
}

const LIBRARY_QUERY_ROOTS = [
  'product', 'products', 'product-prices', 'product-stock', 'prices', 'price', 'price-lists', 'priceLists',
  'publication-board', 'publication-history', 'product-audit', 'product-changes', 'library-review',
  'catalog', 'brands', 'categories', 'providers', 'provider-profiles', 'imports', 'masters',
]

function isLibraryQuery(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0]
  return typeof root === 'string' && LIBRARY_QUERY_ROOTS.some((prefix) => root === prefix || root.startsWith(`${prefix}-`))
}

async function clearRevokedLibraryQueries(client: QueryClient, userId: string): Promise<void> {
  const isRevokedLibraryQuery = (query: { queryKey: readonly unknown[] }) =>
    !isOwnAccessQuery(query.queryKey, userId) && isLibraryQuery(query.queryKey)
  await client.cancelQueries({ predicate: isRevokedLibraryQuery })
  client.removeQueries({ predicate: isRevokedLibraryQuery })
}

export interface OwnUserAccess {
  readonly access: UserAccessState | undefined
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly refetch: () => Promise<unknown>
}

/**
 * Acceso real de la identidad actual. `enabled` evita la llamada a quien el
 * servidor va a rechazar (403) y `retry:false` evita reintentos: el estado se
 * refetchea tras cada mutación del panel de concesiones.
 */
export function useOwnUserAccess(): OwnUserAccess {
  const userId = useAuthStore((state) => state.user?.id)
  const client = useQueryClient()
  const enabled = Boolean(userId)

  useEffect(() => {
    if (!userId) return
    return subscribeOwnAccessEvents(userId, client)
  }, [client, userId])

  const query = useQuery({
    queryKey: userAccessKey(userId),
    queryFn: () => fetchOwnAccessWithProfile(userId as string, client),
    enabled,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchInterval: 30_000,
  })

  const status: OwnUserAccess['status'] = !enabled
    ? 'unavailable'
    : query.isError
      ? 'unavailable'
      : query.data
        ? 'ready'
        : 'loading'

  return { access: query.data, status, refetch: query.refetch }
}

/** Lee el acceso propio y sincroniza los permisos del perfil en esta sesión. */
export async function fetchOwnAccessWithProfile(userId: string, client?: QueryClient): Promise<UserAccessState> {
  const before = useAuthStore.getState()
  const previousPermissions = before.isAuthenticated && before.user?.id === userId
    ? before.user.permissions ?? []
    : []
  const previousRoles = before.isAuthenticated && before.user?.id === userId
    ? before.user.roles ?? []
    : []
  let access: UserAccessState
  try {
    access = await fetchUserAccess(userId)
  } catch (error) {
    clearCurrentUserGrants(userId)
    throw error
  }
  await refreshCurrentProfileForUser(userId)
  const current = useAuthStore.getState()
  const lostSuperAdminFallback = previousRoles.includes('Super Admin') && !current.user?.roles?.includes('Super Admin')
  const revokedLibraryPermission = lostSuperAdminFallback || previousPermissions.some((permission) =>
    LIBRARY_ACTION_PATTERN.test(permission) && !current.user?.permissions?.includes(permission),
  )
  if (
    client && revokedLibraryPermission && current.isAuthenticated && current.user?.id === userId
  ) {
    await clearRevokedLibraryQueries(client, userId)
  }
  return access
}

/** true si la identidad actual tiene asignada alguna de las acciones (Super Admin: siempre). */
export function useHasAssignedAction(actions: readonly string[]): boolean {
  const roles = useAuthStore((state) => state.user?.roles)
  const { access, status } = useOwnUserAccess()
  return hasAssignedAction({ roles, grants: access?.grants ?? null, status }, actions)
}

/** Criterio de visibilidad de Comercial para la identidad actual. */
export function useCommercialAccess(): CommercialAccess {
  return usePanelAccess('commercial')
}

export function usePanelAccess(panel: 'commercial' | 'catalog'): CommercialAccess {
  const roles = useAuthStore((state) => state.user?.roles)
  const { access, status } = useOwnUserAccess()
  return useMemo(
    () => panelAccess({ roles, grants: access?.grants ?? null, packages: access?.packages ?? null, sources: access?.sources ?? null, status }, panel),
    [roles, access, status, panel],
  )
}

/**
 * Refetch de acceso + identidad DESPUÉS de aplicar o retirar un paquete
 * (aceptación 3, lado cliente): el menú se actualiza en la misma sesión, sin
 * cerrarla ni redirigir a login. La identidad se re-escribe desde
 * `GET /auth/profile` (mismo criterio que `verifyPromotionPublisher`); si ese
 * refetch falla, la sesión sigue viva y el acceso ya quedó refetcheado.
 */
export async function refreshSessionAfterAccessChange(
  client: QueryClient,
  userId: string,
): Promise<void> {
  await client.invalidateQueries({ queryKey: userAccessKey(userId) })
  // `type:'all'` refetchea también la entrada inactiva (sin observadores): el
  // panel y el menú comparten la clave, y el test de aceptación 3 exige que la
  // caché quede actualizada sin recargar la aplicación.
  await client.refetchQueries({ queryKey: userAccessKey(userId), type: 'all' })
  try {
    await refreshCurrentProfileForUser(userId)
  } catch {
    // Identidad no refrescable: no se cierra sesión; el acceso ya se refetcheó.
  }
}

/** No reemplaza una sesión que haya cambiado mientras el perfil estaba en vuelo. */
async function refreshCurrentProfileForUser(userId: string): Promise<void> {
  const before = useAuthStore.getState()
  if (!before.isAuthenticated || before.user?.id !== userId) return

  try {
    const { data } = await api.get('/auth/profile')
    const current = useAuthStore.getState()
    if (!current.isAuthenticated || current.user?.id !== userId) return
    if (
      !data || data.id !== userId || !Array.isArray(data.roles) ||
      !Array.isArray(data.permissions)
    ) {
      throw new Error('El perfil no corresponde a la sesión activa.')
    }
    current.login(data)
  } catch (error) {
    clearCurrentUserGrants(userId)
    throw error
  }
}

function clearCurrentUserGrants(userId: string): void {
  const current = useAuthStore.getState()
  if (current.isAuthenticated && current.user?.id === userId && current.user) {
    // A failed refresh cannot leave stale grants or role-based fallbacks active.
    current.login({ ...current.user, roles: [], permissions: [] })
  }
}

/** Aplica el paquete y refetchea caché compartida + identidad (sin sesión nueva). */
export async function applyPackageInCache(
  client: QueryClient,
  userId: string,
  packageId: string,
  expectedVersion: number,
  catalogVersion?: string,
): Promise<void> {
  await applyUserPackage(userId, packageId, expectedVersion, { catalogVersion })
  await refreshSessionAfterAccessChange(client, userId)
}

/** Retira SOLO la fuente del paquete y refetchea caché + identidad (aceptación 3). */
export async function revokePackageInCache(
  client: QueryClient,
  userId: string,
  packageId: string,
  expectedVersion: number,
): Promise<void> {
  await removeUserPackage(userId, packageId, expectedVersion)
  await refreshSessionAfterAccessChange(client, userId)
}

/** Guarda las casillas de Biblioteca y refetchea caché + identidad (menú al día sin cerrar sesión). */
export async function saveLibrarySelectionInCache(
  client: QueryClient,
  userId: string,
  actionIds: string[],
  expectedVersion: number,
  catalogVersion?: string,
): Promise<void> {
  await setUserLibrarySelection(userId, actionIds, expectedVersion, { catalogVersion })
  await refreshSessionAfterAccessChange(client, userId)
}
