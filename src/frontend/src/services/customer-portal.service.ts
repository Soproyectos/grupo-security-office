import axios from 'axios'
import api from './api'
import type { AdminAdvisor, AdminPortalAccount, AdminPriceList, AdminPriceMapping, AdminTier, TariffOption, PortalProfileInput, PendingPortalAccount, PortalAccount } from '../features/customer-portal/types/customer-portal.types'

export const portalApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

function unwrap<T>(value: unknown): T {
  if (value && typeof value === 'object' && 'data' in value) return (value as { data: T }).data
  return value as T
}

/** Precios de la tarifa del cliente para hasta 50 referencias; el servidor calcula todo y omite las que no tienen precio. */
export async function fetchAssignedCatalogPrices(ids: readonly string[], signal?: AbortSignal): Promise<Array<{ productId: string; value: string; currency: string }>> {
  const response = await portalApi.get('/customer-portal/customer/catalog/prices', { params: { ids: ids.join(',') }, signal })
  const inner = unwrap<{ prices?: unknown }>(response.data)
  return Array.isArray(inner?.prices) ? (inner.prices as Array<{ productId: string; value: string; currency: string }>) : []
}

export async function loginPortal(email: string, password: string): Promise<PortalAccount> {
  const response = await portalApi.post('/customer-portal/auth/login', { email, password })
  return unwrap<{ account: PortalAccount }>(response.data).account
}

export async function getPortalSession(): Promise<PortalAccount> {
  const response = await portalApi.get('/customer-portal/auth/me')
  return unwrap<{ account: PortalAccount }>(response.data).account
}

export async function updatePortalProfile(input: PortalProfileInput): Promise<PortalAccount> {
  const response = await portalApi.patch('/customer-portal/auth/me/profile', input)
  return unwrap<{ account: PortalAccount }>(response.data).account
}

/** Sets the first password of an account that entered with Google. */
export async function createPortalPassword(input: { newPassword: string }): Promise<{ hasPassword: boolean }> {
  const response = await portalApi.post('/customer-portal/auth/me/password', input)
  return unwrap<{ hasPassword: boolean }>(response.data)
}

export interface DeletePortalAccountInput {
  password?: string
  confirmEmail?: string
}

export async function deletePortalAccount(input: DeletePortalAccountInput): Promise<{ deleted: boolean }> {
  const response = await portalApi.post('/customer-portal/auth/me/delete', input)
  return unwrap<{ deleted: boolean }>(response.data)
}

/** Internal panel actions: they use the staff session client, not the customer one. */
export async function suspendPortalAccount(id: string, reason: string) {
  const response = await api.post(`/customer-portal/admin/accounts/${id}/suspend`, { reason })
  return response.data
}

export async function reactivatePortalAccount(id: string) {
  const response = await api.post(`/customer-portal/admin/accounts/${id}/reactivate`)
  return response.data
}

function asList<T>(value: unknown): T[] {
  const inner = unwrap<unknown>(value)
  return Array.isArray(inner) ? (inner as T[]) : []
}

/** Panel: todas las lecturas pasan por asList porque algunos endpoints responden `{ data: [...] }` y otros una lista directa. */
export async function fetchAdminAccounts() { return asList<AdminPortalAccount>((await api.get('/customer-portal/admin/accounts')).data) }
export async function fetchAdminTiers() { return asList<AdminTier>((await api.get('/customer-portal/admin/tiers')).data) }
export async function fetchAdminPriceLists() { return asList<AdminPriceList>((await api.get('/prices/lists')).data) }
export async function fetchAdminPriceMappings() { return asList<AdminPriceMapping>((await api.get('/customer-portal/admin/price-list-mappings')).data) }
export async function saveAdminPriceMapping(priceListId: string) { return (await api.post('/customer-portal/admin/price-list-mappings', { type: 'FINAL_CUSTOMER', priceListId })).data }
export async function fetchAdminAdvisors() { return asList<AdminAdvisor>((await api.get('/customer-portal/admin/advisors')).data) }
export async function assignAccountAdvisor(id: string, advisorId: string) { return (await api.patch(`/customer-portal/admin/accounts/${id}/advisor`, { advisorId })).data }
/** Tarifas activas para elegir en una cuenta; solo id, nombre, código y moneda (nunca precios). */
export async function fetchTariffOptions() { return asList<TariffOption>((await api.get('/customer-portal/admin/tariff-options')).data) }
/**
 * Pone la tarifa de una cuenta. Con el id de una tarifa (lista de precios) el servidor busca o crea el nivel que la sostiene;
 * con null la cuenta vuelve a la tarifa general (se envía `tierId: null`; nunca se envían los dos campos).
 */
export async function assignAccountTier(id: string, priceListId: string | null) {
  const body = priceListId ? { priceListId } : { tierId: null }
  return (await api.patch(`/customer-portal/admin/accounts/${id}/tier`, body)).data
}
export async function linkAccountCustomer(id: string, customerId: string | null) { return (await api.patch(`/customer-portal/admin/accounts/${id}/customer`, { customerId })).data }
export async function approveAdminAccount(id: string, customerId?: string) { return (await api.post(`/customer-portal/admin/accounts/${id}/approve`, customerId ? { customerId } : {})).data }
export async function rejectAdminAccount(id: string, reason: string) { return (await api.post(`/customer-portal/admin/accounts/${id}/reject`, { reason })).data }

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
