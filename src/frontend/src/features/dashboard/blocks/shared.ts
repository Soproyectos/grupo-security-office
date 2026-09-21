import { useQuery } from '@tanstack/react-query'
import {
  fetchCatalogInsights,
  fetchUsersInsights,
  fetchTopCustomers,
  fetchSalesByCategory,
} from '../../../services/dashboard-insights.service'
import { fetchMyWorkspace } from '../../../services/dashboard.service'

/**
 * Hooks compartidos por los bloques.
 *
 * Cada agregado se consulta UNA vez por dashboard aunque lo usen varios
 * bloques: react-query deduplica por `queryKey`, de modo que los cuatro KPIs de
 * catálogo y su tabla comparten una sola petición.
 */

const FIVE_MINUTES = 5 * 60 * 1000

export const useWorkspace = () =>
  useQuery({
    queryKey: ['dashboard', 'me'],
    queryFn: () => fetchMyWorkspace(),
    staleTime: FIVE_MINUTES,
  })

export const useCatalogInsights = () =>
  useQuery({
    queryKey: ['dashboard', 'insights', 'catalog'],
    queryFn: fetchCatalogInsights,
    staleTime: FIVE_MINUTES,
  })

export const useUsersInsights = () =>
  useQuery({
    queryKey: ['dashboard', 'insights', 'users'],
    queryFn: fetchUsersInsights,
    staleTime: FIVE_MINUTES,
  })

export const useTopCustomers = () =>
  useQuery({
    queryKey: ['dashboard', 'insights', 'top-customers'],
    queryFn: fetchTopCustomers,
    staleTime: FIVE_MINUTES,
  })

export const useSalesByCategory = () =>
  useQuery({
    queryKey: ['dashboard', 'insights', 'sales-by-category'],
    queryFn: fetchSalesByCategory,
    staleTime: FIVE_MINUTES,
  })

/** Formatea un importe en la moneda indicada, sin decimales (montos grandes). */
export function formatMoney(amount: string | number, currency = 'COP'): string {
  const value = typeof amount === 'string' ? Number(amount) : amount

  if (!Number.isFinite(value)) return '—'

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value)
}

/** "hace 2 h", "hace 4 días". Devuelve '—' si la fecha no es válida. */
export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date

  if (Number.isNaN(d.getTime())) return '—'

  const minutes = Math.round((Date.now() - d.getTime()) / 60000)

  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`

  const days = Math.round(hours / 24)
  return days === 1 ? 'hace 1 día' : `hace ${days} días`
}

/** Porcentaje acotado a [0, 100], para barras de avance. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}
