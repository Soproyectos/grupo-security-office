import api from './api'
import type { Product } from '../features/products/types/product.types'

export interface DashboardListResult {
  data: Product[]
  total: number
}

export interface UserSummary {
  id: string
  name: string
  email: string
  isActive: boolean
  roles: Array<{ id: string; name: string }>
}

interface PaginatedResponse<T> {
  data: T[]
  meta?: { total: number; skip: number; take: number }
}

export const fetchLatestProducts = async (take = 6): Promise<DashboardListResult> => {
  const res = await api.get(`/products?take=${take}`)
  const body = res.data as PaginatedResponse<Product>
  return { data: body.data ?? [], total: body.meta?.total ?? 0 }
}

export const fetchPendingPublication = async (take = 5): Promise<DashboardListResult> => {
  const res = await api.get(`/products?take=${take}&isVisible=false`)
  const body = res.data as PaginatedResponse<Product>
  return { data: body.data ?? [], total: body.meta?.total ?? 0 }
}

export const fetchActiveUsers = async (take = 100): Promise<number> => {
  const res = await api.get(`/users?take=${take}`)
  const body = res.data as PaginatedResponse<UserSummary>
  return (body.data ?? []).filter((user) => user.isActive).length
}

export const fetchAuditEventsTotal = async (): Promise<number> => {
  const res = await api.get('/audit?take=1')
  const body = res.data as PaginatedResponse<unknown>
  return body.meta?.total ?? 0
}

// --- Espacio de trabajo del usuario autenticado (GET /api/dashboard/me) ---
// Una sola llamada agregada: reemplaza el patron de componer N requests desde el
// cliente, que ya provoco 429s en el wizard de importacion.

export type WorkspaceScope = 'GLOBAL' | 'ASSIGNED'

export interface MyListaSummary {
  id: string
  code: string
  name: string
  currency: string
  level: string | null
  isResponsible: boolean
  productCount: number
  updatedAt: string
}

export interface MyActivityEntry {
  id: string
  action: string
  entity: string
  entityId: string
  result: string | null
  createdAt: string
}

export interface MoneyAmount {
  amount: string
  currency: string
}

/** Bloque comercial del propio usuario (metas, facturado y pipeline). */
export interface MyCommercialWorkspace {
  target: MoneyAmount | null
  invoiced: MoneyAmount & { mixedCurrency: boolean }
  remaining: MoneyAmount | null
  pipeline: { amount: string; count: number }
  myCustomers: { total: number; leads: number; clientes: number }
  myQuotes: {
    borrador: number
    enviada: number
    negociacion: number
    ganada: number
    perdida: number
  }
}

export interface TeamMemberSummary {
  userId: string
  name: string
  target: MoneyAmount | null
  invoiced: MoneyAmount & { mixedCurrency: boolean }
  remaining: MoneyAmount | null
  pipeline: { amount: string; count: number }
  customers: { total: number; leads: number; clientes: number }
  quotesByStatus: Record<string, number>
}

export interface MyTeamBlock {
  members: TeamMemberSummary[]
  totals: {
    target: MoneyAmount & { mixedCurrency: boolean }
    invoiced: MoneyAmount & { mixedCurrency: boolean }
  }
}

export interface MyWorkspace {
  scope: WorkspaceScope
  kpis: {
    listas: number
    products: number
    pendingPublication: number
    recentActivity: number
  }
  listas: MyListaSummary[]
  recentActivity: MyActivityEntry[]
  /** Presente solo para usuarios con pipeline comercial propio. */
  commercial?: MyCommercialWorkspace
  /** Presente solo si el usuario tiene subordinados (User.supervisorId). */
  team?: MyTeamBlock
}

export const fetchMyWorkspace = async (take?: number): Promise<MyWorkspace> => {
  const qs = take ? `?take=${take}` : ''
  const res = await api.get(`/dashboard/me${qs}`)
  return res.data as MyWorkspace
}
