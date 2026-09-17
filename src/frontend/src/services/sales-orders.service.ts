import api from './api'
import type {
  SalesOrder,
  SalesOrderFilters,
  SalesOrderListResponse,
  UpdateInvoicePayload,
} from '../features/quotes/types/sales-order.types'

const BASE = '/commercial/sales-orders'

export const fetchSalesOrders = async (
  filters: SalesOrderFilters = {},
  page = 1,
  pageSize = 20
): Promise<SalesOrderListResponse> => {
  const params = new URLSearchParams()
  params.set('skip', String((page - 1) * pageSize))
  params.set('take', String(pageSize))
  if (filters.search?.trim()) params.set('search', filters.search.trim())
  if (filters.customerId) params.set('customerId', filters.customerId)
  if (filters.ownerId) params.set('ownerId', filters.ownerId)

  const res = await api.get(`${BASE}?${params}`)
  return res.data as SalesOrderListResponse
}

export const fetchSalesOrder = async (id: string): Promise<SalesOrder> => {
  const res = await api.get(`${BASE}/${id}`)
  return res.data as SalesOrder
}

export const updateInvoice = async (
  id: string,
  payload: UpdateInvoicePayload
): Promise<SalesOrder> => {
  const res = await api.patch(`${BASE}/${id}/invoice`, payload)
  return res.data as SalesOrder
}
