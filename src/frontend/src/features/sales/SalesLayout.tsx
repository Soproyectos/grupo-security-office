import SalesPromotionsPanel from '../promotions/SalesPromotionsPanel'
import { Outlet, Link } from 'react-router-dom'
import { MARKETING_PROMOTIONS_PATH } from '../marketing/marketing-access'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth.store'
import { useQuoteBuilderStore } from '../quotes/store/quote-builder.store'
import WorkspaceTabs, { WorkspaceTabIcon, type WorkspaceRouteTab } from '../../components/layout/WorkspaceTabs'

const navigation: readonly WorkspaceRouteTab[] = [
  { id: 'home', to: '/sales', end: true, label: 'Mi espacio', icon: 'M3 11l9-8 9 8M5 10v10h14V10', hint: 'Tu resumen de ventas y lo que tienes pendiente.' },
  { id: 'agenda', to: '/sales/agenda', label: 'Mi agenda', icon: 'M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', hint: 'Tus actividades por fecha.' },
  { id: 'customers', to: '/sales/customers', label: 'Mis clientes', icon: 'M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 20v-2a4 4 0 0 0-3-3.9', hint: 'Los clientes que tienes asignados.' },
  { id: 'promotions', to: MARKETING_PROMOTIONS_PATH, label: 'Promociones', icon: 'M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01', hint: 'Avisos vigentes de tu equipo y generales.' },
  { id: 'quotes', to: '/sales/quotes', label: 'Mis cotizaciones', icon: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9 13h6M9 17h6', hint: 'Las cotizaciones que creaste y su estado.' },
]
const CATALOG_ICON = 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'

export default function SalesLayout() {
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()

  const signOut = () => {
    useQuoteBuilderStore.getState().reset()
    queryClient.clear()
    logout()
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-sm transition-all duration-300 ease-out">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-3 py-2 lg:min-h-[56px]">
            <Link to="/sales" className="flex shrink-0 items-center gap-2">
              <img src="/isotipo-grupo-security.png" alt="Grupo Security SAS" className="h-8 w-auto sm:h-9 lg:h-10" />
              <span className="font-condensed text-sm font-semibold text-[var(--color-text-primary)] lg:text-base">Grupo Security SAS</span>
            </Link>
            <form action="/catalogo/buscar" method="get" target="_blank"
              className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1 sm:max-w-md">
              <div className="relative">
                <input type="search" name="q" required placeholder="Buscar productos, categorías, marcas..."
                  aria-label="Buscar en el catálogo"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 pr-10 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] transition-all focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]" />
                <button type="submit" aria-label="Buscar en catálogo (abre en otra pestaña)"
                  className="absolute right-0 top-0 h-full rounded-r-lg bg-[var(--color-primary)] px-3 text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-primary-hover)]">
                  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" />
                  </svg>
                </button>
              </div>
            </form>
            <div className="flex items-center gap-3 text-[var(--color-text-primary)]">
              <div className="flex items-center gap-1.5">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary-bg-subtle)] text-xs font-semibold text-[var(--color-primary)]">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </span>
                <div className="text-right">
                  <p className="text-xs font-medium leading-tight">{user?.name}</p>
                  <p className="text-[10px] leading-tight text-[var(--color-text-secondary)]">Vendedor</p>
                </div>
              </div>
              <div aria-hidden="true" className="h-6 w-px bg-[var(--color-border)]" />
              <button type="button" onClick={signOut}
                className="rounded px-2 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-primary-bg-subtle)] hover:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]">
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--color-border)]"><div className="mx-auto max-w-7xl">
          <WorkspaceTabs mode="route" variant="header" navLabel="Mi espacio de ventas" tabs={navigation} trailing={
            <Link to="/catalogo" target="_blank" rel="noopener noreferrer" className="biblioteca-workspace__destination">
              <WorkspaceTabIcon path={CATALOG_ICON} />
              Consultar catálogo
              <span className="sr-only"> (abre en otra pestaña)</span>
            </Link>
          } />
        </div></div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* The promotions page now lives in the Marketing panel; here only the pop-up with the current flyer stays. */}
        <SalesPromotionsPanel /><Outlet />
      </main>
    </div>
  )
}
