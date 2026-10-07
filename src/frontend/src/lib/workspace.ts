import { ROLES } from './roles'

export type Workspace = 'admin' | 'sales' | 'supervisor'

/** A combined management role keeps its broader workspace. */
export function workspaceForRoles(roles: readonly string[]): Workspace {
  if (roles.includes(ROLES.SUPERVISOR) && !roles.includes(ROLES.SUPER_ADMIN) && !roles.includes(ROLES.ADMIN_COMERCIAL)) return 'supervisor'
  const manages = [ROLES.SUPER_ADMIN, ROLES.SUPERVISOR, ROLES.ADMIN_COMERCIAL]
    .some(role => roles.includes(role))
  return roles.includes(ROLES.VENDEDOR) && !manages ? 'sales' : 'admin'
}

export function workspaceRedirect(
  roles: readonly string[] | undefined,
  isAuthenticated: boolean,
  workspace: Workspace,
): string | null {
  if (!isAuthenticated || !roles) return '/login'
  const ownWorkspace = workspaceForRoles(roles)
  if (ownWorkspace === workspace) return null
  return ownWorkspace === 'sales' ? '/sales' : ownWorkspace === 'supervisor' ? '/supervisor' : '/'
}
