import { useAuthStore } from '../stores/auth.store'
import { ROLES } from './roles'

export function hasRole(role: string): boolean {
  const user = useAuthStore.getState().user
  return user?.roles?.includes(role) ?? false
}

export function hasPermission(permission: string): boolean {
  const user = useAuthStore.getState().user
  if (/^(products|prices|providers):/.test(permission) && user?.roles?.includes(ROLES.SUPER_ADMIN)) return true
  return user?.permissions?.includes(permission) ?? false
}

/** React views subscribe to permission changes instead of reading a stale render. */
export function useHasPermission(permission: string): boolean {
  return useAuthStore((state) => Boolean(
    (/^(products|prices|providers):/.test(permission) && state.user?.roles?.includes(ROLES.SUPER_ADMIN)) ||
    state.user?.permissions?.includes(permission),
  ))
}

export function hasAnyRole(roles: string[]): boolean {
  const user = useAuthStore.getState().user
  return roles.some(r => user?.roles?.includes(r)) ?? false
}

export function hasAnyPermission(permissions: string[]): boolean {
  return permissions.some((permission) => hasPermission(permission))
}

// --- Listas: visibilidad basada en rol (el nivel granular view/edit/manage
//     por Lista se enerva server-side en AclService; el frontend reacciona a 403/404). ---
export function canCreateLista(): boolean {
  return hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN_COMERCIAL)
}

export function canManageListas(): boolean {
  return hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN_COMERCIAL)
}

export function canViewListas(): boolean {
  return hasAnyRole([
    ROLES.SUPER_ADMIN,
    ROLES.SUPERVISOR,
    ROLES.ADMIN_COMERCIAL,
    ROLES.OPERADOR,
    ROLES.CONSULTA,
  ])
}

export function canDeleteLista(): boolean {
  return hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN_COMERCIAL)
}

export function canDeleteCategories(): boolean {
  return hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN_COMERCIAL)
}

export function canDeleteBrands(): boolean {
  return hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN_COMERCIAL)
}

export function canDeletePrices(): boolean {
  return hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN_COMERCIAL)
}

export function canManageListaAccess(): boolean {
  return hasRole(ROLES.SUPER_ADMIN) || hasRole(ROLES.ADMIN_COMERCIAL)
}

export function canViewUsers(): boolean {
  return (
    hasRole(ROLES.SUPER_ADMIN) ||
    hasRole(ROLES.ADMIN_COMERCIAL) ||
    hasPermission('users:read')
  )
}

export function canViewAudit(): boolean {
  return (
    hasRole(ROLES.SUPER_ADMIN) ||
    hasRole(ROLES.SUPERVISOR) ||
    hasRole(ROLES.ADMIN_COMERCIAL) ||
    hasPermission('audit:read')
  )
}

