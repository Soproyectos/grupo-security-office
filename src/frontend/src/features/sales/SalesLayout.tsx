import SalesPromotionsPanel from '../promotions/SalesPromotionsPanel'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/auth.store'
import { useQuoteBuilderStore } from '../quotes/store/quote-builder.store'

const navigation = [
  { to: '/sales', label: 'Mi espacio', end: true },
  { to: '/sales/agenda', label: 'Mi agenda', end: false },
  { to: '/sales/customers', label: 'Mis clientes', end: false },
  { to: '/sales/promotions', label: 'Promociones', end: false },
  { to: '/sales/quotes', label: 'Mis cotizaciones', end: false },
]

export default function SalesLayout() {
  const location = useLocation()
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
        <nav aria-label="Mi espacio de ventas" className="border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 scrollbar-thin">
          {navigation.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => `shrink-0 whitespace-nowrap rounded border-b-2 px-3 py-1.5 font-condensed text-sm font-semibold tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] ${isActive
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]'}`}>
              {item.label}
            </NavLink>
          ))}
          <Link to="/catalogo" target="_blank" rel="noopener noreferrer"
            className="relative shrink-0 whitespace-nowrap rounded border-b-2 border-transparent px-3 py-1.5 font-condensed text-sm font-semibold tracking-wider text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]">
            Consultar catálogo
            <span className="sr-only"> (abre en otra pestaña)</span>
          </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {location.pathname === '/sales/promotions' && <div className="mb-5">
          <h1 className="text-2xl font-semibold">Mis promociones</h1>
          <p className="mt-1 text-sm">Consulta los avisos de tu equipo y los generales antes de cotizar.</p>
        </div>}
        <SalesPromotionsPanel showPanel={location.pathname === '/sales/promotions'} /><Outlet />
      </main>
    </div>
  )
}
