import { portalApi } from './customer-portal.service'
import type { PortalMunicipality } from '../features/customer-portal/types/customer-portal.types'
import type { PortalQuoteCreated, PortalQuoteDetail, PortalQuoteListItem, SendPortalQuoteInput } from '../features/customer-portal/types/portal-quotes.types'

function unwrap<T>(value: unknown): T {
  if (value && typeof value === 'object' && 'data' in value) return (value as { data: T }).data
  return value as T
}

/** The person sends the quote list they built in the store; prices come from the company tariff on the server. */
export async function sendPortalQuote(input: SendPortalQuoteInput): Promise<PortalQuoteCreated> {
  const response = await portalApi.post('/customer-portal/customer/quotes', input)
  return unwrap<PortalQuoteCreated>(response.data)
}

export async function fetchMyQuotes(): Promise<PortalQuoteListItem[]> {
  const response = await portalApi.get('/customer-portal/customer/quotes')
  const list = unwrap<unknown>(response.data)
  return Array.isArray(list) ? (list as PortalQuoteListItem[]) : []
}

export async function fetchMyQuote(id: string): Promise<PortalQuoteDetail> {
  const response = await portalApi.get(`/customer-portal/customer/quotes/${encodeURIComponent(id)}`)
  return unwrap<PortalQuoteDetail>(response.data)
}

/** Fixed list of municipalities (DIVIPOLA) for the city selector; public and static. */
export async function fetchMunicipalities(): Promise<PortalMunicipality[]> {
  const response = await portalApi.get('/public/municipalities')
  const list = unwrap<unknown>(response.data)
  return Array.isArray(list) ? (list as PortalMunicipality[]) : []
}
