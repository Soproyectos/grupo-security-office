import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchSalesOrders,
  updateInvoice,
} from '../../../services/sales-orders.service'
import type {
  SalesOrder,
  UpdateInvoicePayload,
} from '../types/sales-order.types'

/**
 * Resuelve el Pedido de una cotización GANADA.
 *
 * El backend no expone "sales order por quoteId": el listado
 * GET /api/commercial/sales-orders filtra por `customerId` y cada fila
 * trae `quote { id, code, status }`. Aquí se pide el listado del mismo
 * customer y se empareja por `quote.id === quoteId`. Como la relación
 * quote→salesOrder es 1:1, el match es único.
 */
export function useSalesOrderForQuote(
  quoteId: string | undefined,
  customerId: string | undefined,
  enabled: boolean
) {
  const query = useQuery({
    queryKey: ['salesOrders', 'byQuote', quoteId, customerId],
    queryFn: () =>
      fetchSalesOrders({ customerId: customerId as string }, 1, 100),
    enabled: enabled && Boolean(quoteId) && Boolean(customerId),
    select: (res): SalesOrder | undefined =>
      res.data.find((so) => so.quote?.id === quoteId),
  })

  return {
    salesOrder: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}

/** Registro/actualización manual del número/fecha de factura externa (Yéminus). */
export function useUpdateInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: UpdateInvoicePayload
    }) => updateInvoice(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['salesOrders'],
        refetchType: 'all',
      }),
  })
}
