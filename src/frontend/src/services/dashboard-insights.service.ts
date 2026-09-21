import api from './api'

export interface CatalogInsights {
  products: number
  published: number
  pendingPublication: number
  categories: number
  updatedToday: number
  missingImages: number
  latest: Array<{
    id: string
    sku: string
    name: string
    category: string
    updatedAt: string
    lifecycleStatus: string
    hasImage: boolean
  }>
}

export interface UsersInsights {
  total: number
  active: number
  byRole: Array<{ role: string; count: number }>
  recent: Array<{
    id: string
    name: string
    email: string
    roles: string[]
    isActive: boolean
  }>
}

export interface TopCustomer {
  id: string
  name: string
  invoiced: string
  currency: string
  orders: number
}

export interface CategorySale {
  category: string
  amount: string
  currency: string
  units: number
}

export const fetchCatalogInsights = async (): Promise<CatalogInsights> => {
  const res = await api.get('/dashboard/insights/catalog')
  return res.data
}

export const fetchUsersInsights = async (): Promise<UsersInsights> => {
  const res = await api.get('/dashboard/insights/users')
  return res.data
}

export const fetchTopCustomers = async (): Promise<TopCustomer[]> => {
  const res = await api.get('/dashboard/insights/top-customers')
  return res.data.topCustomers ?? []
}

export const fetchSalesByCategory = async (): Promise<CategorySale[]> => {
  const res = await api.get('/dashboard/insights/sales-by-category')
  return res.data.categories ?? []
}
