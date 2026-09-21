import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header'
import BackgroundImportWidget from '../../features/products/import/components/BackgroundImportWidget'
import ImportWizard from '../../features/products/import/components/ImportWizard'
import { useImportModalStore } from '../../features/products/import/store/importModal.store'
import { hasPersistedImportState } from '../../features/products/import/store/import.store'

export default function AdminLayout() {
  const isImportOpen = useImportModalStore((s) => s.isOpen)
  const importListaId = useImportModalStore((s) => s.listaId)
  const openImport = useImportModalStore((s) => s.open)
  const closeImport = useImportModalStore((s) => s.close)

  // El wizard ya no vive por página, así que la reapertura automática de una
  // sesión a medias (el usuario refrescó mientras mapeaba columnas, por
  // ejemplo) se decide una sola vez aquí, no en cada página que antes lo
  // montaba por su cuenta.
  useEffect(() => {
    if (hasPersistedImportState()) openImport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
      {/* Montados una sola vez, no por página: el wizard se abre desde
          cualquier pantalla (botón de la página, o la tarjeta flotante) vía
          `useImportModalStore` — ver SEC-IMPORT-003/004. */}
      <BackgroundImportWidget />
      {isImportOpen && <ImportWizard listaId={importListaId} onClose={closeImport} />}
    </div>
  )
}
