import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../stores/auth.store'
import { useNavigate, NavLink, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { canAdministerAccess, hasAssignedAction, useOwnUserAccess, usePanelAccess } from '../../features/users/access'
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type Notification,
  getNotificationTypeLabel,
  getNotificationColor,
} from '../../services/notifications.service'

export default function Header() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchQuery, setSearchQuery] = useState('')
  const [commercialOpen, setCommercialOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [menuLeft, setMenuLeft] = useState(0)
  const commercialButtonRef = useRef<HTMLDivElement>(null)
  const commercialMenuRef = useRef<HTMLDivElement>(null)
  const userMenuButtonRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationsButtonRef = useRef<HTMLButtonElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const queryClient = useQueryClient()
  const commercial = usePanelAccess('commercial')
  const catalog = usePanelAccess('catalog')
  const { access, status } = useOwnUserAccess()
  const allowed = (action: string) => hasAssignedAction({ roles: user?.roles, grants: access?.grants, status }, [action])
  const isSuperAdmin = canAdministerAccess(user?.roles)

  // Notificaciones: fetch automático + refetch al abrir dropdown
  const { data: notificationsData, refetch: refetchNotifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications({ take: 10 }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 60_000, // poll cada minuto para el badge
  })

  const markAsReadMutation = useMutation({
    mutationFn: markNotificationAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
    },
  })

  const markAllAsReadMutation = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] })
    },
  })

  // Refetch notificaciones al abrir el dropdown
  useEffect(() => {
    if (notificationsOpen) {
      refetchNotifications()
    }
  }, [notificationsOpen, refetchNotifications])

  const isCommercialActive = commercial.tabs.some((tab) => location.pathname.startsWith(tab.to))

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
    if (!commercialOpen && !userMenuOpen && !notificationsOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (commercialOpen) {
        if (
          commercialMenuRef.current &&
          !commercialMenuRef.current.contains(e.target as Node) &&
          commercialButtonRef.current &&
          !commercialButtonRef.current.contains(e.target as Node)
        ) {
          setCommercialOpen(false)
        }
      }
      if (userMenuOpen) {
        if (
          userMenuRef.current &&
          !userMenuRef.current.contains(e.target as Node) &&
          userMenuButtonRef.current &&
          !userMenuButtonRef.current.contains(e.target as Node)
        ) {
          setUserMenuOpen(false)
        }
      }
      if (notificationsOpen) {
        if (
          notificationsRef.current &&
          !notificationsRef.current.contains(e.target as Node) &&
          notificationsButtonRef.current &&
          !notificationsButtonRef.current.contains(e.target as Node)
        ) {
          setNotificationsOpen(false)
        }
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCommercialOpen(false)
        setUserMenuOpen(false)
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('click', onClickOutside)
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onClickOutside)
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [commercialOpen, userMenuOpen, notificationsOpen])

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
          {allowed('products:read') && <form onSubmit={handleSearch} className="order-last sm:order-none w-full sm:w-auto sm:flex-1 max-w-md min-w-0">
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
          </form>}

          {/* Derecha: Notificaciones + User menu */}
          <div className="flex items-center gap-2 pl-1 border-l border-[var(--color-border)]">
            {/* Notificaciones */}
            <div className="relative">
              <button
                ref={notificationsButtonRef}
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                title="Notificaciones"
                aria-haspopup="menu"
                aria-expanded={notificationsOpen}
                aria-controls="notifications-menu"
              >
                <div className="relative">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {(unreadCount ?? 0) > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 min-w-[18px] bg-[var(--color-error)] text-[var(--color-text-inverse)] text-[10px] font-semibold rounded-full flex items-center justify-center">
                      {(unreadCount ?? 0) > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
              </button>

              {notificationsOpen && (
                <div
                  ref={notificationsRef}
                  id="notifications-menu"
                  role="menu"
                  aria-label="Notificaciones"
                  className="absolute right-0 top-full z-[60] mt-1.5 w-[320px] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg shadow-lg"
                >
                  <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Notificaciones</h3>
                    {(unreadCount ?? 0) > 0 && (
                      <button
                        role="menuitem"
                        tabIndex={0}
                        onClick={() => markAllAsReadMutation.mutate()}
                        disabled={markAllAsReadMutation.isPending}
                        className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-50"
                      >
                        Marcar todas como leídas
                      </button>
                    )}
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {notificationsData?.data?.length === 0 ? (
                      <div className="px-3 py-4 text-center text-[var(--color-text-tertiary)] text-sm">
                        No hay notificaciones nuevas
                      </div>
                    ) : (
                      (notificationsData?.data ?? []).map((notification: Notification) => (
                        <button
                          key={notification.id}
                          role="menuitem"
                          tabIndex={0}
                          onClick={() => {
                            if (!notification.readAt) {
                              markAsReadMutation.mutate(notification.id)
                            }
                            // TODO: navegar según notification.data (ej. quoteId, productId, etc.)
                            setNotificationsOpen(false)
                          }}
                          className={`w-full px-3 py-3 text-left hover:bg-[var(--color-bg-primary)] transition-colors border-b border-[var(--color-border)] last:border-0 ${
                            !notification.readAt
                              ? 'bg-[var(--color-primary-bg-subtle)]'
                              : ''
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs ${getNotificationColor(
                                notification.type,
                              )}`}
                            >
                              {getNotificationTypeLabel(notification.type).charAt(0)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${!notification.readAt ? 'font-semibold' : ''} text-[var(--color-text-primary)]`}>
                                {notification.title}
                              </p>
                              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-1">
                                {notification.message}
                              </p>
                              <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
                                {new Date(notification.createdAt).toLocaleString('es-CO', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
</button>
                      )))}
                  </div>
                  <div className="px-3 py-2 border-t border-[var(--color-border)]">
                    <button
                      role="menuitem"
                      tabIndex={0}
                      onClick={() => {
                        setNotificationsOpen(false)
                        navigate('/notifications')
                      }}
                      className="w-full px-3 py-2 text-sm text-center text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)] rounded transition-colors"
                    >
                      Ver todas las notificaciones
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Separador vertical */}
            <div className="h-6 w-px bg-[var(--color-border)]"></div>

            {/* User menu */}
            <div className="flex items-center gap-1.5 text-[var(--color-text-primary)]">
              <div className="relative">
                <div
                  ref={userMenuButtonRef}
                  className="flex items-center gap-1.5 cursor-pointer group"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                >
                  <div className="w-8 h-8 bg-[var(--color-primary-bg-subtle)] rounded-full flex items-center justify-center text-[var(--color-primary)]">
                    <span className="text-xs font-semibold">
                      {user?.name?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div className="hidden sm:block text-right">
                    <p className="text-xs font-medium leading-tight group-hover:text-[var(--color-primary)] transition-colors">{user?.name}</p>
                    <p className="text-[10px] text-[var(--color-text-secondary)] leading-tight">{user?.roles?.[0] || 'Usuario'}</p>
                  </div>
                  <svg
                    className={`w-3.5 h-3.5 text-[var(--color-text-tertiary)] transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {userMenuOpen && (
                  <div
                    ref={userMenuRef}
                    role="menu"
                    aria-label="Menú de usuario"
                    className="absolute right-0 top-full z-[60] mt-1.5 min-w-[200px] py-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg shadow-lg"
                  >
                    <div className="px-3 py-2 border-b border-[var(--color-border)]">
                      <p className="text-xs font-medium text-[var(--color-text-primary)]">{user?.name}</p>
                      <p className="text-[11px] text-[var(--color-text-secondary)]">{user?.email}</p>
                      <p className="text-[11px] text-[var(--color-text-tertiary)] capitalize">{user?.roles?.[0]?.toLowerCase() || 'usuario'}</p>
                    </div>
                    <button
                      role="menuitem"
                      tabIndex={0}
                      onClick={() => {
                        setUserMenuOpen(false)
                        navigate('/profile')
                      }}
                      className="w-full px-3 py-2 text-sm text-left text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)] transition-colors"
                    >
                      Mi perfil
                    </button>
                    <button
                      role="menuitem"
                      tabIndex={0}
                      onClick={() => {
                        setUserMenuOpen(false)
                        navigate('/settings')
                      }}
                      className="w-full px-3 py-2 text-sm text-left text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary-bg-subtle)] transition-colors"
                    >
                      Configuración
                    </button>
                    <hr className="my-1 border-[var(--color-border)]" />
                    <button
                      role="menuitem"
                      tabIndex={0}
                      onClick={async () => {
                        setUserMenuOpen(false)
                        try { await api.post('/auth/logout') } catch {}
                        logout()
                        navigate('/login', { replace: true })
                      }}
                      className="w-full px-3 py-2 text-sm text-left text-[var(--color-error)] hover:bg-[var(--color-error-bg-subtle)] transition-colors"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Nivel 2 - Navegación principal */}
      <nav ref={navRef} className="relative bg-[var(--color-bg-primary)] border-t border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin py-2">
            <div className="flex-shrink-0">
              <NavItem to="/" label="Mi resumen" />
            </div>
            <div className="flex-shrink-0"><NavItem to="/agenda" label="Agenda y tareas" /></div>
            {catalog.tabs[0] && <div className="flex-shrink-0"><NavItem to={catalog.tabs[0]?.to ?? '/commercial/lists'} label="Catálogo y precios" /></div>}
            {commercial.tabs[0] && <div className="relative flex-shrink-0">
              <div ref={commercialButtonRef} className="flex items-center">
                <NavLink
                  to={commercial.tabs[0]?.to ?? '/commercial/customers'}
                  onClick={() => setCommercialOpen(false)}
                  aria-label="Panel Comercial"
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
            </div>}
            {isSuperAdmin && <div className="flex flex-shrink-0 gap-3"><NavItem to="/team-requests" label="Peticiones" /><NavItem to="/customer-accounts" label="Clientes y escalafones" /><NavItem to="/users/access" label="Asignar paneles" /></div>}
            {allowed('users:read') && (
              <div className="flex-shrink-0">
                <NavItem to="/users" label="Usuarios" />
              </div>
            )}
            {allowed('audit:read') && (
              <div className="flex-shrink-0">
                <NavItem to="/audit" label="Auditoría" />
              </div>
            )}
          </div>
        </div>

        {commercialOpen && commercial.hasAnyPanel && (
          <div
            ref={commercialMenuRef}
            id="comercial-menu"
            role="menu"
            aria-label="Subsecciones comerciales"
            style={{ left: menuLeft }}
            className="absolute top-full z-[60] mt-1 min-w-[180px] py-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg shadow-lg"
          >
            {commercial.tabs.map((item) => (
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
