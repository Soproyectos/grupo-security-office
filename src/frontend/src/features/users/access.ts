import { useMemo } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import {
  applyUserPackage,
  fetchUserAccess,
  removeUserPackage,
  userAccessErrorMessage,
  UserAccessServiceError,
  type AccessGrant,
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
  { to: '/commercial/lists', label: 'Listas', end: false, actionId: 'listas:read' },
  { to: '/commercial/products', label: 'Biblioteca de productos', end: false, actionId: 'products:read' },
  { to: '/catalog-management/publication', label: 'Publicación del catálogo', end: false, actionId: 'products:publish' },
])

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
  'listas:read': 'Consultar listas',
  'commercialSettings:read': 'Consultar parámetros comerciales',
  'commercialSettings:edit': 'Editar parámetros comerciales',
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
  readonly status: 'loading' | 'ready' | 'unavailable'
}

export function hasAssignedAction(input: CommercialAccessInput, actions: readonly string[]): boolean {
  if (canAdministerAccess(input.roles)) return true
  if (input.status !== 'ready') return false
  const granted = new Set((input.grants ?? []).map((grant) => grant.actionId))
  return actions.some((action) => granted.has(action))
}

/** Cargar o fallar nunca recupera permisos por rol. Super Admin es explícito. */
export function panelAccess(input: CommercialAccessInput, panel: 'commercial' | 'catalog'): CommercialAccess {
  const candidates = panel === 'commercial' ? COMMERCIAL_TABS : CATALOG_TABS
  const tabs = candidates.filter((tab) => hasAssignedAction(input, [tab.actionId]))
  return { tabs, hasAnyPanel: tabs.length > 0, gated: true }
}

export const commercialAccess = (input: CommercialAccessInput): CommercialAccess => panelAccess(input, 'commercial')

export function isCatalogPath(pathname: string): boolean {
  return pathname.startsWith('/commercial/products') || pathname.startsWith('/commercial/lists') || pathname.startsWith('/catalog-management')
}

/** Clave de la caché compartida: el panel de asignación y el menú leen la
 *  MISMA entrada, de modo que el refetch tras revocar actualiza la navegación. */
export const userAccessKey = (userId: string | undefined) => ['user-access', userId] as const

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
  const enabled = Boolean(userId)

  const query = useQuery({
    queryKey: userAccessKey(userId),
    queryFn: () => fetchUserAccess(userId as string),
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

/** Criterio de visibilidad de Comercial para la identidad actual. */
export function useCommercialAccess(): CommercialAccess {
  return usePanelAccess('commercial')
}

export function usePanelAccess(panel: 'commercial' | 'catalog'): CommercialAccess {
  const roles = useAuthStore((state) => state.user?.roles)
  const { access, status } = useOwnUserAccess()
  return useMemo(
    () => panelAccess({ roles, grants: access?.grants ?? null, status }, panel),
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
    const { data } = await api.get('/auth/profile')
    if (data && typeof data.id === 'string' && Array.isArray(data.roles)) {
      useAuthStore.getState().login(data)
    }
  } catch {
    // Identidad no refrescable: no se cierra sesión; el acceso ya se refetcheó.
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
