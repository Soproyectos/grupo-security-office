import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/auth.store'
import { Card, Badge } from '../components/ui'
import { fetchTrendingProducts } from '../services/trending.service'
import {
  fetchLatestProducts,
  fetchPendingPublication,
  fetchActiveUsers,
  fetchAuditEventsTotal,
  fetchMyWorkspace,
} from '../services/dashboard.service'
import CommercialWorkspace, {
  CommercialWorkspaceSkeleton,
} from '../features/dashboard/components/CommercialWorkspace'
import { canViewDashboardSection, DASHBOARD_SECTIONS } from '../lib/roles'
import type { Product } from '../features/products/types/product.types'
import { CAROUSEL_INTERVAL, TRENDING_PRODUCTS_LIMIT } from '../constants'
import { fetchListas } from '../services/listas.service'
import type { Lista } from '../services/listas.service'

interface BannerItem {
  title: string
  subtitle: string
  color: string
  icon: React.ReactNode
}

interface KpiItem {
  title: string
  value: number
  loading: boolean
  error: boolean
  cardVariant: 'primary' | 'success' | 'warning' | 'info'
  badgeVariant: 'info' | 'success' | 'warning' | 'neutral'
  icon: React.ReactNode
}

interface QuickLink {
  to: string
  title: string
  description: string
  icon: React.ReactNode
  iconColor: string
  iconBg: string
  visible: boolean
}

const defaultBanners: BannerItem[] = [
  {
    title: 'Sistema de Videovigilancia',
    subtitle: 'Cámaras IP, CCTV y accesorios',
    color: 'from-[var(--color-primary)] to-[var(--color-primary-hover)]',
    icon: (
      <svg className="w-16 h-16 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: 'Control de Acceso',
    subtitle: 'Biométrico, tarjetas y videoporteros',
    color: 'from-[var(--color-info)] to-[var(--color-info-hover)]',
    icon: (
      <svg className="w-16 h-16 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    title: 'Alarmas y Smart Home',
    subtitle: 'Intrusión, domótica y sensores',
    color: 'from-[var(--color-success)] to-[var(--color-success-hover)]',
    icon: (
      <svg className="w-16 h-16 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
]

const formatNumber = (value: number) => new Intl.NumberFormat('es-CO').format(value)

function KpiCard({ title, value, loading, error, cardVariant, badgeVariant, icon }: KpiItem) {
  return (
    <Card variant={cardVariant} padding="md" className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {title}
          </p>
          <div className="mt-2">
            {loading ? (
              <div className="h-6 w-20 bg-[var(--color-border)] rounded animate-pulse" aria-hidden="true" />
            ) : error ? (
              <p className="text-xs text-[var(--color-error)] font-medium" role="alert">
                No se pudo cargar
              </p>
            ) : (
              <Badge variant={badgeVariant} className="px-3 py-1 text-sm font-bold">
                {formatNumber(value)}
              </Badge>
            )}
          </div>
        </div>
        <div className="w-11 h-11 shrink-0 rounded-xl bg-[var(--color-bg-card)] flex items-center justify-center text-[var(--color-primary)]">
          {icon}
        </div>
      </div>
    </Card>
  )
}

function ProductSkeletonCard() {
  return (
    <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] overflow-hidden animate-pulse">
      <div className="aspect-square bg-[var(--color-border)]"></div>
      <div className="p-3 space-y-2">
        <div className="h-3 bg-[var(--color-border)] rounded w-3/4"></div>
        <div className="h-3 bg-[var(--color-border)] rounded w-full"></div>
        <div className="h-3 bg-[var(--color-border)] rounded w-1/2"></div>
      </div>
    </div>
  )
}

function ProductCard({ product }: { product: Product }) {
  return (
    <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-square bg-gradient-to-br from-[var(--color-bg-surface)] to-[var(--color-border)]/10 flex items-center justify-center p-4">
        <svg className="w-16 h-16 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </div>
      <div className="p-3">
        <p className="text-[10px] font-semibold text-[var(--color-primary)] uppercase">{product.brand.name}</p>
        <p className="text-xs text-[var(--color-text-primary)] mt-1 line-clamp-2 leading-tight">{product.name}</p>
        <p className="text-[10px] text-[var(--color-text-tertiary)] font-mono mt-1">{product.sku}</p>
      </div>
    </div>
  )
}

/** Insignia de vigencia de una Lista, a partir de los campos ya calculados por el backend. */
function listaVigenciaBadge(lista: Lista): { variant: 'success' | 'warning' | 'error' | 'neutral'; label: string } {
  if (lista.archivedAt) return { variant: 'neutral', label: 'Archivada' }
  if (lista.isExpired) return { variant: 'error', label: 'Vencida' }
  if (lista.isExpiringSoon) {
    return {
      variant: 'warning',
      label: typeof lista.daysUntilExpiry === 'number' ? `Vence en ${lista.daysUntilExpiry} días` : 'Por vencer',
    }
  }
  if (!lista.isActive) return { variant: 'neutral', label: 'Inactiva' }
  return { variant: 'success', label: 'Vigente' }
}

/** Prioriza lo que necesita atención primero: vencidas, luego por vencer, luego el resto; archivadas al final. */
function sortListasForGovernance(listas: Lista[]): Lista[] {
  const priority = (lista: Lista) => {
    if (lista.archivedAt) return 3
    if (lista.isExpired) return 0
    if (lista.isExpiringSoon) return 1
    return 2
  }
  return [...listas].sort((a, b) => priority(a) - priority(b))
}

/**
 * Panel global: catalogo completo, usuarios y auditoria. Se renderiza para quien
 * administra todas las Listas (scope GLOBAL resuelto por el backend).
 */
function AdminDashboard() {
  const user = useAuthStore((state) => state.user)
  const [currentBanner, setCurrentBanner] = useState(0)

  const canViewKpis = canViewDashboardSection(DASHBOARD_SECTIONS.KPIS)
  const canViewLatest = canViewDashboardSection(DASHBOARD_SECTIONS.ULTIMOS_PRODUCTOS)
  const canViewPending = canViewDashboardSection(DASHBOARD_SECTIONS.PENDIENTES)
  const canViewUsers = canViewDashboardSection(DASHBOARD_SECTIONS.USUARIOS)
  const canViewAudit = canViewDashboardSection(DASHBOARD_SECTIONS.AUDITORIA)

  const {
    data: trendingData = [],
    isLoading: trendingLoading,
    error: trendingError,
  } = useQuery({
    queryKey: ['trending-products'],
    queryFn: () => fetchTrendingProducts({ take: TRENDING_PRODUCTS_LIMIT }),
  })

  const latestQuery = useQuery({
    queryKey: ['dashboard', 'latest-products'],
    queryFn: () => fetchLatestProducts(6),
    enabled: canViewLatest,
  })

  const pendingQuery = useQuery({
    queryKey: ['dashboard', 'pending-publication'],
    queryFn: () => fetchPendingPublication(5),
    enabled: canViewPending,
  })

  const kpiTotalProductsQuery = useQuery({
    queryKey: ['dashboard', 'kpi', 'total-products'],
    queryFn: () => fetchLatestProducts(1),
    enabled: canViewKpis,
  })

  const kpiActiveUsersQuery = useQuery({
    queryKey: ['dashboard', 'kpi', 'active-users'],
    queryFn: () => fetchActiveUsers(),
    enabled: canViewKpis && canViewUsers,
  })

  const kpiAuditEventsQuery = useQuery({
    queryKey: ['dashboard', 'kpi', 'audit-events'],
    queryFn: () => fetchAuditEventsTotal(),
    enabled: canViewKpis && canViewAudit,
  })

  const listasQuery = useQuery({
    queryKey: ['dashboard', 'listas-governance'],
    queryFn: () => fetchListas(),
  })
  const governanceListas = sortListasForGovernance(listasQuery.data ?? []).slice(0, 6)

  const trendingProducts: Product[] = trendingData
  const banners = defaultBanners

  const latestProducts: Product[] = latestQuery.data?.data ?? []
  const pendingProducts: Product[] = pendingQuery.data?.data ?? []

  const kpiItems: KpiItem[] = [
    {
      title: 'Total de productos',
      value: kpiTotalProductsQuery.data?.total ?? 0,
      loading: kpiTotalProductsQuery.isLoading,
      error: !!kpiTotalProductsQuery.error,
      cardVariant: 'info',
      badgeVariant: 'info',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      title: 'Pendientes de publicación',
      value: pendingQuery.data?.total ?? 0,
      loading: pendingQuery.isLoading,
      error: !!pendingQuery.error,
      cardVariant: 'warning',
      badgeVariant: 'warning',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: 'Usuarios activos',
      value: kpiActiveUsersQuery.data ?? 0,
      loading: kpiActiveUsersQuery.isLoading,
      error: !!kpiActiveUsersQuery.error,
      cardVariant: 'success',
      badgeVariant: 'success',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      title: 'Eventos de auditoría',
      value: kpiAuditEventsQuery.data ?? 0,
      loading: kpiAuditEventsQuery.isLoading,
      error: !!kpiAuditEventsQuery.error,
      cardVariant: 'primary',
      badgeVariant: 'neutral',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
  ]

  const visibleKpiItems = kpiItems.filter((kpi) =>
    kpi.title === 'Usuarios activos'
      ? canViewUsers
      : kpi.title === 'Eventos de auditoría'
        ? canViewAudit
        : true
  )

  const quickLinks: QuickLink[] = [
    {
      to: '/products',
      title: 'Gestionar Productos',
      description: 'Agregar, editar y publicar productos',
      visible: true,
      iconColor: 'text-[var(--color-primary)]',
      iconBg: 'bg-[var(--color-primary-bg-subtle)]',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      to: '/prices',
      title: 'Administrar Precios',
      description: 'Listas de precios y valores',
      visible: true,
      iconColor: 'text-[var(--color-success)]',
      iconBg: 'bg-[var(--color-success-bg-subtle)]',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      to: '/categories',
      title: 'Categorías',
      description: 'Organizar el catálogo por categorías',
      visible: true,
      iconColor: 'text-[var(--color-warning)]',
      iconBg: 'bg-[var(--color-warning-bg-subtle)]',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      ),
    },
    {
      to: '/brands',
      title: 'Marcas',
      description: 'Gestionar marcas del catálogo',
      visible: true,
      iconColor: 'text-[var(--color-info)]',
      iconBg: 'bg-[var(--color-info-bg-subtle)]',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      to: '/users',
      title: 'Usuarios',
      description: 'Administrar usuarios y roles',
      visible: canViewUsers,
      iconColor: 'text-[var(--color-error)]',
      iconBg: 'bg-[var(--color-error-bg-subtle)]',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      to: '/audit',
      title: 'Ver Auditoría',
      description: 'Historial de cambios',
      visible: canViewAudit,
      iconColor: 'text-[var(--color-warning)]',
      iconBg: 'bg-[var(--color-warning-bg-subtle)]',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
    },
  ]

  const visibleQuickLinks = quickLinks.filter((link) => link.visible)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length)
    }, CAROUSEL_INTERVAL)
    return () => clearInterval(interval)
  }, [banners.length])

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] border-t-4 border-t-[var(--color-primary)] rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Bienvenido, {user?.name || 'Usuario'}</h1>
            <p className="text-[var(--color-text-secondary)] mt-1">Panel de administración · Grupo Security</p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[var(--color-text-secondary)] text-sm">
            <div className="w-2 h-2 bg-[var(--color-success)] rounded-full animate-pulse"></div>
            <span>Sistema operativo</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {canViewKpis && (
        <section aria-label="Indicadores del panel">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Indicadores</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {visibleKpiItems.map((kpi) => (
              <KpiCard key={kpi.title} {...kpi} />
            ))}
          </div>
        </section>
      )}

      {/* Gestión de Listas */}
      <section aria-label="Gestión de Listas">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Gestión de Listas</h2>
          <Link to="/commercial/lists" className="text-sm text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium">
            Ver todas →
          </Link>
        </div>
        {listasQuery.error ? (
          <div className="p-4 bg-[var(--color-error-bg-subtle)] text-[var(--color-error)] rounded-xl border border-[var(--color-error)]/20" role="alert">
            <p>Error al cargar las Listas. Intente más tarde.</p>
          </div>
        ) : listasQuery.isLoading ? (
          <Card padding="none">
            <ul className="divide-y divide-[var(--color-border)]">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="flex items-center justify-between gap-4 p-4 animate-pulse">
                  <div className="space-y-2 flex-1">
                    <div className="h-3 bg-[var(--color-border)] rounded w-1/3"></div>
                    <div className="h-3 bg-[var(--color-border)] rounded w-2/3"></div>
                  </div>
                  <div className="h-6 w-24 bg-[var(--color-border)] rounded-full"></div>
                </li>
              ))}
            </ul>
          </Card>
        ) : governanceListas.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-[var(--color-text-secondary)]">No hay Listas registradas todavía.</p>
          </Card>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-[var(--color-border)]">
              {governanceListas.map((lista) => {
                const badge = listaVigenciaBadge(lista)
                return (
                  <li key={lista.id}>
                    <Link
                      to={`/commercial/lists/${lista.id}`}
                      className="flex items-center justify-between gap-4 p-4 hover:bg-[var(--color-bg-surface-hover)] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-mono text-[var(--color-text-tertiary)]">{lista.code}</p>
                        <p className="text-sm text-[var(--color-text-primary)] truncate">{lista.name}</p>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                          {formatNumber(lista.productCount ?? 0)} {lista.productCount === 1 ? 'producto' : 'productos'}
                          {!lista.responsibleId && ' · sin responsable'}
                        </p>
                      </div>
                      <Badge variant={badge.variant} className="shrink-0">
                        {badge.label}
                      </Badge>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </section>

      {/* Carousel */}
      <div
        className="relative rounded-xl overflow-hidden shadow-md"
        style={{ height: '12rem' }}
        role="region"
        aria-label="Carrusel de productos tendencia"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            setCurrentBanner((prev) => (prev - 1 + banners.length) % banners.length)
          }
          if (e.key === 'ArrowRight') {
            setCurrentBanner((prev) => (prev + 1) % banners.length)
          }
        }}
      >
        {banners.map((banner, index) => (
          <div
            key={index}
            className={`absolute inset-0 bg-gradient-to-r ${banner.color} transition-opacity duration-500 ${
              index === currentBanner ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="flex items-center justify-between h-full px-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white">{banner.title}</h2>
                <p className="text-white/80 mt-2">{banner.subtitle}</p>
              </div>
              {banner.icon}
            </div>
          </div>
        ))}
        {/* Carousel indicators */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentBanner(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentBanner ? 'bg-white w-6' : 'bg-white/50'
              }`}
              aria-label={`Ir a banner ${index + 1}`}
              aria-current={index === currentBanner}
            />
          ))}
        </div>
        {/* Carousel arrows */}
        <button
          onClick={() => setCurrentBanner((prev) => (prev - 1 + banners.length) % banners.length)}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/30"
          aria-label="Banner anterior"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => setCurrentBanner((prev) => (prev + 1) % banners.length)}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/30"
          aria-label="Banner siguiente"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Latest products */}
      {canViewLatest && (
        <section aria-label="Últimos productos">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Últimos Productos</h2>
            <Link to="/commercial/products" className="text-sm text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium">
              Ver todos →
            </Link>
          </div>
          {latestQuery.error ? (
            <div className="p-4 bg-[var(--color-error-bg-subtle)] text-[var(--color-error)] rounded-xl border border-[var(--color-error)]/20" role="alert">
              <p>Error al cargar los últimos productos. Intente más tarde.</p>
            </div>
          ) : latestQuery.isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductSkeletonCard key={i} />
              ))}
            </div>
          ) : latestProducts.length === 0 ? (
            <div className="p-4 bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] rounded-xl">
              <p>No hay productos registrados</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {latestProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Pending publication */}
      {canViewPending && (
        <section aria-label="Pendientes de publicación">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Pendientes de Publicación</h2>
            <Link to="/commercial/products" className="text-sm text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium">
              Ver todos →
            </Link>
          </div>
          {pendingQuery.error ? (
            <div className="p-4 bg-[var(--color-error-bg-subtle)] text-[var(--color-error)] rounded-xl border border-[var(--color-error)]/20" role="alert">
              <p>Error al cargar los pendientes de publicación. Intente más tarde.</p>
            </div>
          ) : pendingQuery.isLoading ? (
            <Card padding="none">
              <ul className="divide-y divide-[var(--color-border)]">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="flex items-center justify-between gap-4 p-4 animate-pulse">
                    <div className="space-y-2 flex-1">
                      <div className="h-3 bg-[var(--color-border)] rounded w-1/4"></div>
                      <div className="h-3 bg-[var(--color-border)] rounded w-3/4"></div>
                    </div>
                    <div className="h-6 w-20 bg-[var(--color-border)] rounded-full"></div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : pendingProducts.length === 0 ? (
            <Card padding="md">
              <p className="text-sm text-[var(--color-text-secondary)]">No hay productos pendientes de publicación</p>
            </Card>
          ) : (
            <Card padding="none">
              <ul className="divide-y divide-[var(--color-border)]">
                {pendingProducts.map((product) => (
                  <li key={product.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-[var(--color-primary)] uppercase truncate">{product.brand.name}</p>
                      <p className="text-sm text-[var(--color-text-primary)] truncate">{product.name}</p>
                      <p className="text-[10px] text-[var(--color-text-tertiary)] font-mono mt-0.5">{product.sku}</p>
                    </div>
                    <Badge variant="warning" className="shrink-0">Pendiente</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {/* Trending products */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Tendencia en Productos</h2>
          <Link to="/products" className="text-sm text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium">
            Ver todos →
          </Link>
        </div>
        {trendingError ? (
          <div className="p-4 bg-[var(--color-error-bg-subtle)] text-[var(--color-error)] rounded-xl border border-[var(--color-error)]/20">
            <p>Error al cargar productos tendencia. Intente más tarde.</p>
          </div>
        ) : trendingLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductSkeletonCard key={i} />
            ))}
          </div>
        ) : trendingProducts.length === 0 ? (
          <div className="p-4 bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] rounded-xl">
            <p>No hay productos tendencia</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {trendingProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <section aria-label="Accesos rápidos">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Accesos Rápidos</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {visibleQuickLinks.map((link) => (
            <Link key={link.to} to={link.to}>
              <Card hover className="flex items-center gap-4 !p-5 h-full">
                <div className={`w-12 h-12 ${link.iconBg} rounded-xl flex items-center justify-center ${link.iconColor}`}>
                  {link.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--color-text-primary)]">{link.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)]">{link.description}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * Punto de entrada del dashboard. El scope lo decide el backend
 * (AclService.isListasAdmin) y no una lista de roles duplicada en el cliente,
 * para que ambos lados no puedan divergir.
 */
export default function Dashboard() {
  const user = useAuthStore((state) => state.user)

  const workspaceQuery = useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: () => fetchMyWorkspace(),
  })

  if (workspaceQuery.isLoading) {
    return <CommercialWorkspaceSkeleton />
  }

  // Si el resumen falla no se deja al usuario sin panel: el global degrada por
  // seccion y cada una muestra su propio estado de error.
  if (workspaceQuery.error || !workspaceQuery.data) {
    return <AdminDashboard />
  }

  if (workspaceQuery.data.scope === 'GLOBAL') {
    return <AdminDashboard />
  }

  return (
    <CommercialWorkspace
      workspace={workspaceQuery.data}
      userName={user?.name || 'Usuario'}
    />
  )
}
