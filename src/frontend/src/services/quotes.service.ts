import api from './api'
import type {
  AddQuoteItemPayload,
  CreateQuotePayload,
  Quote,
  QuoteFilters,
  QuoteListResponse,
  UpdateQuoteItemPayload,
  UpdateQuoteStatusPayload,
} from '../features/quotes/types/quote.types'

const BASE = '/commercial/quotes'

export const fetchQuotes = async (
  filters: QuoteFilters = {},
  page = 1,
  pageSize = 20
): Promise<QuoteListResponse> => {
  const params = new URLSearchParams()
  params.set('skip', String((page - 1) * pageSize))
  params.set('take', String(pageSize))
  if (filters.search?.trim()) params.set('search', filters.search.trim())
  if (filters.status) params.set('status', filters.status)
  if (filters.customerId) params.set('customerId', filters.customerId)
  if (filters.ownerId) params.set('ownerId', filters.ownerId)

  const res = await api.get(`${BASE}?${params}`)
  return res.data as QuoteListResponse
}

export const fetchQuote = async (id: string): Promise<Quote> => {
  const res = await api.get(`${BASE}/${id}`)
  return res.data as Quote
}

export const createQuote = async (
  payload: CreateQuotePayload
): Promise<Quote> => {
  const res = await api.post(BASE, payload)
  return res.data as Quote
}

export const addQuoteItem = async (
  quoteId: string,
  payload: AddQuoteItemPayload
): Promise<Quote> => {
  const res = await api.post(`${BASE}/${quoteId}/items`, payload)
  return res.data as Quote
}

export const updateQuoteItem = async (
  quoteId: string,
  itemId: string,
  payload: UpdateQuoteItemPayload
): Promise<Quote> => {
  const res = await api.patch(`${BASE}/${quoteId}/items/${itemId}`, payload)
  return res.data as Quote
}

export const removeQuoteItem = async (
  quoteId: string,
  itemId: string
): Promise<Quote> => {
  const res = await api.delete(`${BASE}/${quoteId}/items/${itemId}`)
  return res.data as Quote
}

export const updateQuoteStatus = async (
  quoteId: string,
  payload: UpdateQuoteStatusPayload
): Promise<Quote> => {
  const res = await api.patch(`${BASE}/${quoteId}/status`, payload)
  return res.data as Quote
}
