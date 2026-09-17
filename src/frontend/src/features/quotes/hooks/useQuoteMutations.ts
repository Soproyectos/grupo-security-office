import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addQuoteItem,
  createQuote,
  removeQuoteItem,
  updateQuoteItem,
  updateQuoteStatus,
} from '../../../services/quotes.service'
import type {
  AddQuoteItemPayload,
  CreateQuotePayload,
  UpdateQuoteItemPayload,
  UpdateQuoteStatusPayload,
} from '../types/quote.types'

/**
 * Extrae el mensaje de error del backend (axios) para mostrarlo tal cual.
 * El backend devuelve `{ message: string | string[] }` en errores (p. ej. el
 * 409 "no hay precio vigente" al agregar un ítem); NUNCA se reemplaza por un
 * mensaje genérico si existe uno del servidor.
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
      payload: AddQuoteItemPayload
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
      payload: UpdateQuoteItemPayload
    }) => updateQuoteItem(quoteId, itemId, payload),
    onSuccess: (_quote, vars) => invalidateQuote(vars.quoteId),
  })

  const removeItem = useMutation({
    mutationFn: ({ quoteId, itemId }: { quoteId: string; itemId: string }) =>
      removeQuoteItem(quoteId, itemId),
    onSuccess: (_quote, vars) => invalidateQuote(vars.quoteId),
  })

  const updateStatus = useMutation({
    mutationFn: ({
      quoteId,
      payload,
    }: {
      quoteId: string
      payload: UpdateQuoteStatusPayload
    }) => updateQuoteStatus(quoteId, payload),
    onSuccess: (_quote, vars) => invalidateQuote(vars.quoteId),
  })

  return { create, addItem, updateItem, removeItem, updateStatus }
}
