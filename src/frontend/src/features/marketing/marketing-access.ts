import { useMemo } from 'react'
import { useAuthStore } from '../../stores/auth.store'
import { canAdministerAccess, hasAssignedAction, useOwnUserAccess } from '../users/access'
import type { AccessGrant } from '../../services/users.service'

/** Panel «Marketing y mercadeo»: Banners, Promociones internas and Gestionar avisos. «Campañas» is a future page and is NOT listed. */
export const MARKETING_PANEL_LABEL = 'Marketing y mercadeo'
export const MARKETING_PATH = '/marketing'
export const MARKETING_BANNERS_PATH = '/marketing/banners'
/** Internal promotions that sellers consult (was `/sales/promotions`, in Comercial). */
export const MARKETING_PROMOTIONS_PATH = '/marketing/promotions'
/** Notices that are created, published and withdrawn (was `/promotions`, in Comercial). */
export const MARKETING_NOTICES_PATH = '/marketing/notices'
/** Former addresses; both redirect to the new ones so saved links keep working. */
export const LEGACY_PROMOTIONS_PATH = '/sales/promotions'
export const LEGACY_NOTICES_PATH = '/promotions'

export interface MarketingPage {
  readonly to: string
  readonly label: string
  /** One-line help shown on the right of the tab bar while this tab is active. */
  readonly hint: string
  /** SVG path data (24x24 viewBox) for the tab icon. */
  readonly icon: string
  /** Action that shows the tab. Only assigned actions decide, never a role or a group of accesses. */
  readonly actionId: string
}

/** Same actions each page asked for before the move: hiding a tab is not authorization, the server checks every call. */
export const MARKETING_PAGES: readonly MarketingPage[] = Object.freeze([
  { to: MARKETING_BANNERS_PATH, label: 'Banners', hint: 'Imágenes de la portada de la tienda y ventana emergente.', icon: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M9 9.5h.01', actionId: 'marketing:read' },
  { to: MARKETING_PROMOTIONS_PATH, label: 'Promociones internas', hint: 'Avisos vigentes para consultar antes de cotizar.', icon: 'M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01', actionId: 'commercialPromotions:read' },
  { to: MARKETING_NOTICES_PATH, label: 'Gestionar avisos', hint: 'Crea, publica y retira avisos para el equipo.', icon: 'M4 5h16v11H8l-4 4V5z', actionId: 'commercialPromotions:create' },
])

export type MarketingAction = 'read' | 'create' | 'edit' | 'publish' | 'delete'

export interface MarketingAccessInput {
  readonly roles?: readonly string[] | null
  readonly grants?: readonly Pick<AccessGrant, 'actionId' | 'scope'>[] | null
  readonly status: 'loading' | 'ready' | 'unavailable'
}

/**
 * `marketing:*` only count when the action is assigned with global scope (the
 * server checks the same). Super Admin is explicit. Loading or failing never
 * recovers permissions.
 */
export function hasMarketingAction(input: MarketingAccessInput, action: MarketingAction): boolean {
  if (canAdministerAccess(input.roles)) return true
  if (input.status !== 'ready') return false
  return (input.grants ?? []).some((grant) => grant.actionId === `marketing:${action}` && grant.scope === 'global')
}

/**
 * Tabs of the panel the person can open. Banners needs the assigned
 * `marketing:read` action; the two notice pages ask for their own
 * `commercialPromotions:*` action, exactly as they did in Comercial.
 */
export function visibleMarketingPages(input: MarketingAccessInput): readonly MarketingPage[] {
  return MARKETING_PAGES.filter((page) => (page.actionId.startsWith('marketing:')
    ? hasMarketingAction(input, 'read')
    : hasAssignedAction(input, [page.actionId])))
}

export interface MarketingPermissions {
  readonly read: boolean
  readonly create: boolean
  readonly edit: boolean
  readonly publish: boolean
  readonly delete: boolean
  /** Upload or remove an image: the server accepts `create` OR `edit`. */
  readonly images: boolean
}

export function marketingPermissions(input: MarketingAccessInput): MarketingPermissions {
  const can = (action: MarketingAction) => hasMarketingAction(input, action)
  return {
    read: can('read'),
    create: can('create'),
    edit: can('edit'),
    publish: can('publish'),
    delete: can('delete'),
    images: can('create') || can('edit'),
  }
}

export function useMarketingPages(): { pages: readonly MarketingPage[]; status: MarketingAccessInput['status']; refetch: () => Promise<unknown> } {
  const roles = useAuthStore((state) => state.user?.roles)
  const { access, status, refetch } = useOwnUserAccess()
  const pages = useMemo(
    () => visibleMarketingPages({ roles, grants: access?.grants ?? null, status }),
    [roles, access, status],
  )
  return { pages, status, refetch }
}

export function useMarketingPermissions(): { permissions: MarketingPermissions; status: MarketingAccessInput['status'] } {
  const roles = useAuthStore((state) => state.user?.roles)
  const { access, status } = useOwnUserAccess()
  const permissions = useMemo(
    () => marketingPermissions({ roles, grants: access?.grants ?? null, status }),
    [roles, access, status],
  )
  return { permissions, status }
}
