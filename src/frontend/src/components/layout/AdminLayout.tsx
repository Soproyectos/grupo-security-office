import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header'
import BackgroundImportWidget from '../../features/products/import/components/BackgroundImportWidget'
import ImportWizard from '../../features/products/import/components/ImportWizard'
import { useImportModalStore } from '../../features/products/import/store/importModal.store'
import { hasPersistedImportState } from '../../features/products/import/store/import.store'
import { hasAssignedAction, useOwnUserAccess } from '../../features/users/access'
import { useAuthStore } from '../../stores/auth.store'

export default function AdminLayout() {
  const isImportOpen = useImportModalStore((s) => s.isOpen)
  const importListaId = useImportModalStore((s) => s.listaId)
  const openImport = useImportModalStore((s) => s.open)
  const closeImport = useImportModalStore((s) => s.close)

  // COM-01 §4: el shell monta el acceso real de la identidad UNA vez con la
  // MISMA queryKey que CommercialLayout y el panel de concesiones
  // (`features/users/access.ts`). Así el menú y la fuente de datos comparten
  // caché: el refetch tras aplicar/retirar un paquete actualiza la
  // navegación en la misma sesión, sin cerrarla. El rol que el servidor no
  // deja leer su propio acceso no emite la petición (`enabled`).
  const roles = useAuthStore((state) => state.user?.roles)
  const { access, status } = useOwnUserAccess()
  const canImport = hasAssignedAction({ roles, grants: access?.grants, status }, ['listas:import'])

  // El wizard ya no vive por página, así que la reapertura automática de una
  // sesión a medias (el usuario refrescó mientras mapeaba columnas, por
  // ejemplo) se decide una sola vez aquí, no en cada página que antes lo
  // montaba por su cuenta.
  useEffect(() => {
    if (canImport && hasPersistedImportState()) openImport()
    if (!canImport) closeImport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canImport])

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
      {/* Montados una sola vez, no por página: el wizard se abre desde
          cualquier pantalla (botón de la página, o la tarjeta flotante) vía
          `useImportModalStore` — ver SEC-IMPORT-003/004. */}
      {canImport && <BackgroundImportWidget />}
      {canImport && isImportOpen && <ImportWizard listaId={importListaId} onClose={closeImport} />}
    </div>
  )
}
