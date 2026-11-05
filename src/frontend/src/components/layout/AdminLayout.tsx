import { Outlet } from 'react-router-dom'
import Header from './Header'
import { useOwnUserAccess } from '../../features/users/access'

export default function AdminLayout() {
  // COM-01 §4: el shell monta el acceso real de la identidad UNA vez con la
  // MISMA queryKey que CommercialLayout y el panel de concesiones
  // (`features/users/access.ts`). Así el menú y la fuente de datos comparten
  // caché: el refetch tras aplicar/retirar un paquete actualiza la
  // navegación en la misma sesión, sin cerrarla.
  useOwnUserAccess()

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Header />
      {/* Wider canvas for the whole internal app (was max-w-7xl); keep in sync with the two containers in Header.tsx. */}
      <main className="max-w-[1600px] mx-auto px-5 py-6">
        <Outlet />
      </main>
    </div>
  )
}
