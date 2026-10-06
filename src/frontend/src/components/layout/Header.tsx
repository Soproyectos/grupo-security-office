import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../stores/auth.store'
import { useNavigate, NavLink, useLocation } from 'react-router-dom'
import api from '../../services/api'
import { canViewAudit, canViewStorefront, canViewUsers } from '../../lib/rbac'

const COMMERCIAL_ITEMS = [
  { to: '/commercial/products', label: 'Productos' },
  { to: '/commercial/lists', label: 'Listas' },
  { to: '/commercial/settings', label: 'Configuración' },
]

export default function Header() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchQuery, setSearchQuery] = useState('')
  const [commercialOpen, setCommercialOpen] = useState(false)
  const [menuLeft, setMenuLeft] = useState(0)
  const commercialButtonRef = useRef<HTMLDivElement>(null)
  const commercialMenuRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)

  const isCommercialActive =
    location.pathname === '/commercial' || location.pathname.startsWith('/commercial/')

  const openMenu = () => {
    const btn = commercialButtonRef.current
    const nav = navRef.current
    if (btn && nav) {
      setMenuLeft(btn.getBoundingClientRect().left - nav.getBoundingClientRect().left)
    }
    setCommercialOpen(true)
  }

  const toggleMenu = () => {
    if (commercialOpen) setCommercialOpen(false)
    else openMenu()
  }

  useEffect(() => {
    if (!commercialOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (
        commercialMenuRef.current &&
        !commercialMenuRef.current.contains(e.target as Node) &&
        commercialButtonRef.current &&
        !commercialButtonRef.current.contains(e.target as Node)
      ) {
        setCommercialOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCommercialOpen(false)
    }
    document.addEventListener('click', onClickOutside)
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onClickOutside)
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [commercialOpen])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/commercial/products?search=${encodeURIComponent(searchQuery)}`)
    }
  }

  return (
    <header className="bg-[var(--color-bg-card)] shadow-sm sticky top-0 z-50 border-b border-[var(--color-border)] transition-all duration-300 ease-out">
      {/* Nivel 1 - Identidad + búsqueda + acciones */}
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-wrap items-center justify-between min-h-[48px] lg:min-h-[56px] h-auto py-2 gap-3">
          {/* Izquierda: Isotipo + nombre */}
          <div className="flex-shrink-0">
            <button onClick={() => navigate('/')} className="flex items-center justify-center gap-2">
              <img
                src="/isotipo-grupo-security.png"
                alt="Grupo Security SAS"
                className="h-8 sm:h-9 lg:h-10 w-auto"
              />
              <span className="text-sm lg:text-base font-condensed font-semibold text-[var(--color-text-primary)]">
                Grupo Security SAS
              </span>
            </button>
          </div>

          {/* Centro: Buscador global */}
          <form onSubmit={handleSearch} className="order-last sm:order-none w-full sm:w-auto sm:flex-1 max-w-md min-w-0">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar productos, categorías, marcas..."
                aria-label="Buscar productos, categorías, marcas"
                className="w-full px-3 py-2 pr-10 rounded-lg text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] placeholder-[var(--color-text-tertiary)] transition-all"
              />
              <button
                type="submit"
                className="absolute right-0 top-0 h-full px-3 bg-[var(--color-primary)] text-[var(--color-text-inverse)] rounded-r-lg hover:bg-[var(--color-primary-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </form>

          {/* Derecha: Notificaciones + User menu */}
          <div className="flex items-center gap-2 pl-1 border-l border-[var(--color-border)]">
            {/* Notificaciones */}
            <button
              type="button"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
              title="Notificaciones"
            >
              <div className="relative">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-[var(--color-error)] rounded-full"></span>
              </div>
            </button>

            {/* Separador vertical */}
            <div className="h-6 w-px bg-[var(--color-border)]"></div>

            {/* User menu */}
            <div className="flex items-center gap-1.5 text-[var(--color-text-primary)]">
              <div className="flex items-center gap-1.5 cursor-pointer group">
                <div className="w-8 h-8 bg-[var(--color-primary-bg-subtle)] rounded-full flex items-center justify-center text-[var(--color-primary)]">
                  <span className="text-xs font-semibold">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="hidden sm:block text-right">
                  <p className="text-xs font-medium leading-tight group-hover:text-[var(--color-primary)] transition-colors">{user?.name}</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)] leading-tight">{user?.roles?.[0] || 'Usuario'}</p>
                </div>
              </div>
              <button
                onClick={async () => {
                  try { await api.post('/auth/logout') } catch {}
                  logout()
                  navigate('/login', { replace: true })
                }}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                title="Cerrar sesión"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Nivel 2 - Navegación principal */}
      <nav ref={navRef} className="relative bg-[var(--color-bg-primary)] border-t border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin py-2">
            <div className="flex-shrink-0">
              <NavItem to="/" label="Dashboard" />
            </div>
            <div className="relative flex-shrink-0">
              <div ref={commercialButtonRef} className="flex items-center">
                <NavLink
                  to="/commercial/products"
                  onClick={() => setCommercialOpen(false)}
                  aria-label="Comercial: Productos"
                  className={`flex items-center px-3 py-1.5 text-sm font-condensed font-semibold whitespace-nowrap transition-all tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] rounded ${
                    isCommercialActive
                      ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]'
                  }`}
                >
                  Comercial
                </NavLink>
                <button
                  type="button"
                  onClick={toggleMenu}
                  aria-haspopup="menu"
                  aria-expanded={commercialOpen}
                  aria-controls="comercial-menu"
                  aria-label={commercialOpen ? 'Cerrar subsecciones comerciales' : 'Abrir subsecciones comerciales'}
                  className={`flex items-center px-1 py-1.5 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
                    isCommercialActive
                      ? 'text-[var(--color-primary)] hover:text-[var(--color-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]'
                  }`}
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${commercialOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
            {canViewUsers() && (
              <div className="flex-shrink-0">
                <NavItem to="/users" label="Usuarios" />
              </div>
            )}
            {canViewStorefront() && (
              <div className="flex-shrink-0">
                <NavItem to="/storefront" label="Tienda" />
              </div>
            )}
            {canViewAudit() && (
              <div className="flex-shrink-0">
                <NavItem to="/audit" label="Auditoría" />
              </div>
            )}
          </div>
        </div>

        {commercialOpen && (
          <div
            ref={commercialMenuRef}
            id="comercial-menu"
            role="menu"
            aria-label="Subsecciones comerciales"
            style={{ left: menuLeft }}
            className="absolute top-full z-[60] mt-1 min-w-[180px] py-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg shadow-lg"
          >
            {COMMERCIAL_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                role="menuitem"
                tabIndex={0}
                onClick={() => setCommercialOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-2 text-sm font-condensed font-semibold whitespace-nowrap transition-all tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
                    isActive
                      ? 'text-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>
    </header>
  )
}

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1.5 text-sm font-condensed font-semibold whitespace-nowrap transition-all tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] rounded ${
          isActive
            ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]'
        }`
      }
    >
      {label}
    </NavLink>
  )
}
