import axios from 'axios'
import type { CatalogFilters, CatalogProduct, CatalogResponse, PendingPortalAccount, PortalAccount, PortalRegistration } from '../features/customer-portal/types/customer-portal.types'

const portalApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

function unwrap<T>(value: unknown): T {
  if (value && typeof value === 'object' && 'data' in value) return (value as { data: T }).data
  return value as T
}

function catalogParams(filters: CatalogFilters) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.category) params.set('category', filters.category)
  if (filters.brand) params.set('brand', filters.brand)
  params.set('page', String(filters.page ?? 1))
  params.set('pageSize', String(filters.pageSize ?? 24))
  return params
}

export async function fetchPublicCatalog(filters: CatalogFilters): Promise<CatalogResponse> {
  const response = await portalApi.get(`/customer-portal/catalog/products?${catalogParams(filters)}`)
  return unwrap<CatalogResponse>(response.data)
}

export async function fetchCustomerCatalog(filters: CatalogFilters): Promise<CatalogResponse> {
  const response = await portalApi.get(`/customer-portal/customer/catalog/products?${catalogParams(filters)}`)
  return unwrap<CatalogResponse>(response.data)
}

export async function fetchPublicCatalogProduct(id: string): Promise<CatalogProduct> {
  const response = await portalApi.get(`/customer-portal/catalog/products/${id}`)
  return unwrap<CatalogProduct>(response.data)
}

export async function fetchCustomerCatalogProduct(id: string): Promise<CatalogProduct> {
  const response = await portalApi.get(`/customer-portal/customer/catalog/products/${id}`)
  return unwrap<CatalogProduct>(response.data)
}

export async function registerPortalAccount(payload: PortalRegistration) {
  const response = await portalApi.post('/customer-portal/accounts/register', payload)
  return unwrap<{ id: string; state: string; message: string }>(response.data)
}

export async function loginPortal(email: string, password: string): Promise<PortalAccount> {
  const response = await portalApi.post('/customer-portal/auth/login', { email, password })
  return unwrap<{ account: PortalAccount }>(response.data).account
}

export async function getPortalSession(): Promise<PortalAccount> {
  const response = await portalApi.get('/customer-portal/auth/me')
  return unwrap<{ account: PortalAccount }>(response.data).account
}

export async function logoutPortal(): Promise<void> {
  await portalApi.post('/customer-portal/auth/logout')
}

export async function fetchPendingPortalAccounts(): Promise<PendingPortalAccount[]> {
  const response = await portalApi.get('/customer-portal/admin/accounts/pending')
  return unwrap<PendingPortalAccount[]>(response.data)
}

export async function approvePortalAccount(id: string, customerId?: string) {
  const response = await portalApi.post(`/customer-portal/admin/accounts/${id}/approve`, customerId ? { customerId } : {})
  return unwrap<{ id: string; state: string; customerId: string }>(response.data)
}

export async function rejectPortalAccount(id: string, reason: string) {
  const response = await portalApi.post(`/customer-portal/admin/accounts/${id}/reject`, { reason })
  return unwrap<{ id: string; state: string }>(response.data)
}
