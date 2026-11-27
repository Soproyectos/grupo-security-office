import { Outlet } from 'react-router-dom'
import WorkspaceTabs, { type WorkspaceRouteTab } from '../../../components/layout/WorkspaceTabs'
import { useAuthStore } from '../../../stores/auth.store'
import { canAdministerAccess, hasAssignedAction, useOwnUserAccess } from '../access'

/**
 * «Usuarios» panel: one route container for `/users` and `/users/access`, with
 * the shared tab bar (docs/PATRON-PANELES-CON-PESTANAS.md). Each child route keeps
 * its own AccessBoundary in App.tsx; the bar only decides which tabs to show.
 * Hiding a tab is not authorization: the server checks every request.
 */
export const USERS_TABS: readonly WorkspaceRouteTab[] = [
  {
    id: 'users',
    to: '/users',
    end: true,
    label: 'Usuarios',
    icon: 'M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 20v-2a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74',
    hint: 'Crea y edita las cuentas de las personas del equipo.',
  },
  {
    id: 'access',
    to: '/users/access',
    label: 'Asignar paneles',
    icon: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
    hint: 'Da o quita a cada persona el acceso a los paneles.',
  },
]

interface UsersTabsInput {
  roles?: readonly string[] | null
  grants?: Parameters<typeof hasAssignedAction>[0]['grants']
  status: 'loading' | 'ready' | 'unavailable'
}

/** Same criteria as each route guard in App.tsx: `users:read` for Usuarios, Super Admin for Asignar paneles. */
export function visibleUsersTabs(input: UsersTabsInput): readonly WorkspaceRouteTab[] {
  return USERS_TABS.filter((tab) => (tab.id === 'access'
    ? canAdministerAccess(input.roles)
    : hasAssignedAction(input, ['users:read'])))
}

/** Presentational part: the bar (only when there are two or more tabs) and the page below it. */
export function UsersWorkspace({ tabs, children }: { tabs: readonly WorkspaceRouteTab[]; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {tabs.length > 1 && (
        <div className="shrink-0">
          <WorkspaceTabs mode="route" variant="standalone" navLabel="Navegación de Usuarios" tabs={tabs} />
        </div>
      )}
      <div className={`flex min-h-0 flex-1 flex-col ${tabs.length > 1 ? 'pt-3' : ''}`}>{children}</div>
    </div>
  )
}

export default function UsersLayout() {
  const roles = useAuthStore((state) => state.user?.roles)
  const { access, status } = useOwnUserAccess()
  const tabs = visibleUsersTabs({ roles, grants: access?.grants, status })
  return <UsersWorkspace tabs={tabs}><Outlet /></UsersWorkspace>
}
