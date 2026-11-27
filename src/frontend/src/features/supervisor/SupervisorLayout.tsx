import { Link, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth.store'
import WorkspaceTabs, { type WorkspaceRouteTab } from '../../components/layout/WorkspaceTabs'

const TABS: readonly WorkspaceRouteTab[] = [
  { id: 'team', to: '/supervisor', end: true, label: 'Mi equipo', icon: 'M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 20v-2a4 4 0 0 0-3-3.9', hint: 'Resumen y avance de tu equipo.' },
  { id: 'agenda', to: '/supervisor/agenda', label: 'Agenda', icon: 'M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', hint: 'Actividades del equipo por fecha.' },
  { id: 'requests', to: '/supervisor/requests', label: 'Solicitudes', icon: 'M4 5h16v11H8l-4 4V5z', hint: 'Peticiones de los supervisores.' },
]

export default function SupervisorLayout() {
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()
  return <div className="min-h-screen bg-neutral-50 text-neutral-900">
    <header className="border-b border-neutral-200 bg-white shadow-sm"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4"><Link to="/supervisor" className="flex items-center gap-3 font-semibold"><img src="/isotipo-grupo-security.png" alt="" className="h-8 w-8 object-contain" />Grupo Security SAS</Link><div className="flex items-center gap-4 text-sm"><span>{user?.name}<span className="block text-xs text-neutral-500">Supervisor</span></span><button type="button" onClick={() => {queryClient.clear();logout()}}>Cerrar sesión</button></div></div><div className="mx-auto max-w-7xl border-t border-neutral-200"><WorkspaceTabs mode="route" variant="header" navLabel="Espacio del Supervisor" tabs={TABS} /></div></header>
    <main className="mx-auto max-w-7xl px-4 py-6"><Outlet /></main>
  </div>
}
