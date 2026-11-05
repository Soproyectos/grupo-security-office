import { useMemo } from 'react'
import { useAuthStore } from '../../stores/auth.store'
import { canAdministerAccess, useOwnUserAccess } from '../users/access'
import type { AccessGrant, AccessPackage } from '../../services/users.service'

/** Panel «Marketing y mercadeo». Today it has one page; «Campañas» is a future page and is NOT listed. */
export const MARKETING_PANEL_LABEL = 'Marketing y mercadeo'
export const MARKETING_PATH = '/marketing'
export const MARKETING_BANNERS_PATH = '/marketing/banners'

export interface MarketingPage {
  readonly to: string
  readonly label: string
  readonly description: string
  readonly actionId: string
}

export const MARKETING_PAGES: readonly MarketingPage[] = Object.freeze([
  { to: MARKETING_BANNERS_PATH, label: 'Banners', description: 'Imágenes de la portada de la tienda y ventana emergente', actionId: 'marketing:read' },
])

export type MarketingAction = 'read' | 'create' | 'edit' | 'publish' | 'delete'

/** Packages that assign the panel (mirror of `PACKAGE_TEMPLATES` in the backend catalog). */
export const MARKETING_PACKAGE_IDS: readonly string[] = Object.freeze([
  'marketing-consulta',
  'marketing-edicion',
  'marketing-publicacion',
])

export interface MarketingAccessInput {
  readonly roles?: readonly string[] | null
  readonly grants?: readonly Pick<AccessGrant, 'actionId' | 'scope'>[] | null
  readonly packages?: readonly Pick<AccessPackage, 'id' | 'applied'>[] | null
  readonly status: 'loading' | 'ready' | 'unavailable'
}

/** The panel counts as assigned only through an applied `marketing-*` package (same rule as Biblioteca tabs). */
export function hasAssignedMarketingPanel(input: MarketingAccessInput): boolean {
  if (canAdministerAccess(input.roles)) return true
  if (input.status !== 'ready') return false
  return (input.packages ?? []).some((pkg) => MARKETING_PACKAGE_IDS.includes(pkg.id) && pkg.applied)
}

/**
 * `marketing:*` only count with global scope (the server checks the same) and
 * only when the panel is assigned: a loose grant is not enough. Super Admin is
 * explicit. Loading or failing never recovers permissions.
 */
export function hasMarketingAction(input: MarketingAccessInput, action: MarketingAction): boolean {
  if (canAdministerAccess(input.roles)) return true
  if (!hasAssignedMarketingPanel(input)) return false
  return (input.grants ?? []).some((grant) => grant.actionId === `marketing:${action}` && grant.scope === 'global')
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

export function useMarketingPermissions(): { permissions: MarketingPermissions; status: MarketingAccessInput['status'] } {
  const roles = useAuthStore((state) => state.user?.roles)
  const { access, status } = useOwnUserAccess()
  const permissions = useMemo(
    () => marketingPermissions({ roles, grants: access?.grants ?? null, packages: access?.packages ?? null, status }),
    [roles, access, status],
  )
  return { permissions, status }
}
