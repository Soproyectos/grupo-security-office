import { Link, NavLink, Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth.store'

export default function SupervisorLayout() {
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()
  return <div className="min-h-screen bg-neutral-50 text-neutral-900">
    <header className="border-b border-neutral-200 bg-white shadow-sm"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4"><Link to="/supervisor" className="flex items-center gap-3 font-semibold"><img src="/isotipo-grupo-security.png" alt="" className="h-8 w-8 object-contain" />Grupo Security SAS</Link><div className="flex items-center gap-4 text-sm"><span>{user?.name}<span className="block text-xs text-neutral-500">Supervisor</span></span><button type="button" onClick={() => {queryClient.clear();logout()}}>Cerrar sesión</button></div></div><nav aria-label="Espacio del Supervisor" className="mx-auto max-w-7xl px-4">{[{to:'/supervisor',label:'Mi equipo',end:true},{to:'/supervisor/agenda',label:'Agenda',end:false},{to:'/supervisor/requests',label:'Solicitudes',end:false}].map(item => <NavLink key={item.to} to={item.to} end={item.end} className={({isActive}) => `inline-block border-b-2 px-3 py-3 font-condensed font-semibold ${isActive ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-neutral-500'}`}>{item.label}</NavLink>)}</nav></header>
    <main className="mx-auto max-w-7xl px-4 py-6"><Outlet /></main>
  </div>
}
