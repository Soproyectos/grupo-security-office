import { Outlet } from 'react-router-dom'
import Header from './Header'
import BackgroundImportWidget from '../../features/products/import/components/BackgroundImportWidget'

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
      {/* Visible en cualquier pantalla, no solo mientras el wizard de
          importación está abierto — ver SEC-IMPORT-003. */}
      <BackgroundImportWidget />
    </div>
  )
}
