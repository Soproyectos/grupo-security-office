import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import { useOwnUserAccess } from '../../features/users/access'

export default function AdminLayout() {
  const pathname = useLocation().pathname.replace(/\/$/, '')
  const accessWorkspace = ['/users/access', '/agenda', '/sales/agenda', '/supervisor/agenda'].includes(pathname)
  // COM-01 §4: el shell monta el acceso real de la identidad UNA vez con la
  // MISMA queryKey que CommercialLayout y el panel de concesiones
  // (`features/users/access.ts`). Así el menú y la fuente de datos comparten
  // caché: el refetch tras aplicar/retirar un paquete actualiza la
  // navegación en la misma sesión, sin cerrarla.
  useOwnUserAccess()

  return (
    <div className={accessWorkspace ? 'flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--color-bg-primary)]' : 'min-h-screen bg-[var(--color-bg-primary)]'}>
      {accessWorkspace ? <div className="shrink-0"><Header /></div> : <Header />}
      {/* Wider canvas for the whole internal app (was max-w-7xl); keep in sync with the two containers in Header.tsx. */}
      <main className={accessWorkspace ? 'mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden px-2 py-2 md:px-3' : 'max-w-[1600px] mx-auto px-5 py-6'}>
        <Outlet />
      </main>
    </div>
  )
}
