import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addQuoteItem,
  createQuote,
  removeQuoteItem,
  updateQuoteItem,
  updateQuoteItemDiscountInCache,
  updateQuoteStatusInCache,
} from '../../../services/quotes.service'
import type {
  QuoteItemAddPayload,
  QuoteItemEditPayload,
} from '../../../services/quotes.service'
import type {
  CreateQuotePayload,
  UpdateQuoteStatusPayload,
} from '../types/quote.types'

/**
 * Extrae el mensaje de error del backend (axios) para mostrarlo tal cual.
 * El backend devuelve `{ message: string | string[] }` en errores (p. ej. el
 * 409 "no hay precio vigente" al agregar un ítem); NUNCA se reemplaza por un
 * mensaje genérico si existe uno del servidor.
 *
 * Para las mutaciones cuyo servicio devuelve `QuoteServiceError` (tipado,
 * sin `response`) la UI usa `quoteErrorMessage` de `services/quotes.service`
 * — este helper queda para las superficies que aún envuelven axios crudo
 * (alta de cotización, factura externa).
 */
export function extractBackendMessage(err: unknown): string {
  const data = (err as { response?: { data?: { message?: unknown } } })
    ?.response?.data
  const msg = data?.message
  if (Array.isArray(msg)) return msg.join('. ')
  if (typeof msg === 'string' && msg.trim()) return msg
  return 'Ocurrió un error inesperado. Intenta de nuevo.'
}

export function useQuoteMutations() {
  const queryClient = useQueryClient()

  const invalidateAll = () =>
    queryClient.invalidateQueries({ queryKey: ['quotes'], refetchType: 'all' })

  /** Invalida el listado y el detalle de la cotización afectada. */
  const invalidateQuote = (quoteId: string) => {
    invalidateAll()
    queryClient.invalidateQueries({
      queryKey: ['quotes', 'detail', quoteId],
      refetchType: 'all',
    })
  }

  const create = useMutation({
    mutationFn: (payload: CreateQuotePayload) => createQuote(payload),
    onSuccess: invalidateAll,
  })

  const addItem = useMutation({
    mutationFn: ({
      quoteId,
      payload,
    }: {
      quoteId: string
      payload: QuoteItemAddPayload
    }) => addQuoteItem(quoteId, payload),
    onSuccess: (_quote, vars) => invalidateQuote(vars.quoteId),
  })

  const updateItem = useMutation({
    mutationFn: ({
      quoteId,
      itemId,
      payload,
    }: {
      quoteId: string
      itemId: string
      payload: QuoteItemEditPayload
    }) => updateQuoteItem(quoteId, itemId, payload),
    onSuccess: (_quote, vars) => invalidateQuote(vars.quoteId),
  })

  /**
   * Descuento por línea — operación DEDICADA (COM-03 §3). El refetch vive
   * dentro de `updateQuoteItemDiscountInCache` (solo con 200): sin
   * `onSuccess` no hay doble invalidación, y en 403 la fila no se toca —
   * el error se pinta en la tabla y el editor sigue abierto.
   */
  const updateItemDiscount = useMutation({
    mutationFn: (input: { quoteId: string; itemId: string; discountPct: string }) =>
      updateQuoteItemDiscountInCache(queryClient, input),
  })

  const removeItem = useMutation({
    mutationFn: ({ quoteId, itemId }: { quoteId: string; itemId: string }) =>
      removeQuoteItem(quoteId, itemId),
    onSuccess: (_quote, vars) => invalidateQuote(vars.quoteId),
  })

  /**
   * Transición de estado. El refetch vive dentro de
   * `updateQuoteStatusInCache`: con 200 refetchea una vez, y con 409
   * (transición inválida / doble ganada) también — para que la página
   * muestre el estado y el pedido REALES del servidor — re-propagando el
   * error con el mensaje del servidor para pintarlo en su alerta.
   */
  const updateStatus = useMutation({
    mutationFn: ({
      quoteId,
      payload,
    }: {
      quoteId: string
      payload: UpdateQuoteStatusPayload
    }) => updateQuoteStatusInCache(queryClient, { quoteId, payload }),
  })

  return { create, addItem, updateItem, updateItemDiscount, removeItem, updateStatus }
}
