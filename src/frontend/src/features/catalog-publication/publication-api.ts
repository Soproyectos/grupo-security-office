import api from '../../services/api'
import type { BoardItem, BoardView, PublicationEventView } from './publication-model'

export interface BoardResponse {
  view: BoardView
  page: number
  pageSize: number
  total: number
  items: BoardItem[]
}

/** GET /catalog/publication-board — la bandeja calculada por el servidor (sin reglas aquí). */
export async function fetchBoard(view: BoardView, opts: { search?: string; page?: number } = {}): Promise<BoardResponse> {
  const res = await api.get('/catalog/publication-board', {
    params: { view, ...(opts.search ? { search: opts.search } : {}), ...(opts.page ? { page: opts.page } : {}) },
  })
  return res.data as BoardResponse
}

/** GET /products/:id/publication-history — eventos (quién/qué revisión/resultado). */
export async function fetchPublicationHistory(productId: string): Promise<PublicationEventView[]> {
  const res = await api.get(`/products/${productId}/publication-history`)
  return (res.data ?? []) as PublicationEventView[]
}
