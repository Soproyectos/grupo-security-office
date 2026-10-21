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
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
