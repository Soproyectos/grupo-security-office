import { useState } from 'react'
import { Button, Table } from '../../../components/ui'
import { formatMoney } from '../lib/money'
import { extractBackendMessage, useQuoteMutations } from '../hooks/useQuoteMutations'
import type { Quote, QuoteItem } from '../types/quote.types'

interface QuoteItemsTableProps {
  quote: Quote
  /** true solo si el estado permite mutar ítems (borrador/enviada/negociacion). */
  editable: boolean
}

/**
 * Tabla de ítems de la cotización. TODOS los montos (unitPrice, discountPct,
 * lineTotal) se muestran tal como llegan del backend (strings); NUNCA se
 * recalcula nada en el cliente — cantidad/descuento editados se envían al
 * backend y la tabla se refresca con los totales recalculados del servidor.
 */
export default function QuoteItemsTable({ quote, editable }: QuoteItemsTableProps) {
  const { updateItem, removeItem } = useQuoteMutations()
  const [rowError, setRowError] = useState<string | null>(null)

  const items = quote.items ?? []
  const currency = quote.currency

  const commitQuantity = async (item: QuoteItem, raw: string) => {
    const quantity = Number(raw)
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity === item.quantity)
      return
    setRowError(null)
    try {
      await updateItem.mutateAsync({
        quoteId: quote.id,
        itemId: item.id,
        payload: { quantity },
      })
    } catch (err) {
      setRowError(extractBackendMessage(err))
    }
  }

  const commitDiscount = async (item: QuoteItem, raw: string) => {
    if (raw === item.discountPct) return
    setRowError(null)
    try {
      await updateItem.mutateAsync({
        quoteId: quote.id,
        itemId: item.id,
        payload: { discountPct: raw || '0' },
      })
    } catch (err) {
      setRowError(extractBackendMessage(err))
    }
  }

  const handleRemove = async (item: QuoteItem) => {
    if (!window.confirm(`¿Quitar "${item.name}" de la cotización?`)) return
    setRowError(null)
    try {
      await removeItem.mutateAsync({ quoteId: quote.id, itemId: item.id })
    } catch (err) {
      setRowError(extractBackendMessage(err))
    }
  }

  const busy = updateItem.isPending || removeItem.isPending

  return (
    <div className="space-y-2">
      {rowError && (
        <p className="text-sm text-[var(--color-error)]" role="alert">
          {rowError}
        </p>
      )}
      <Table
        columns={[
          {
            key: 'sku',
            header: 'SKU',
            render: (item: QuoteItem) => (
              <span className="font-mono text-xs text-neutral-500">
                {item.sku}
              </span>
            ),
          },
          {
            key: 'name',
            header: 'Producto',
            render: (item: QuoteItem) => (
              <span className="font-medium text-neutral-800">{item.name}</span>
            ),
          },
          {
            key: 'quantity',
            header: 'Cant.',
            render: (item: QuoteItem) =>
              editable ? (
                <input
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={item.quantity}
                  disabled={busy}
                  aria-label={`Cantidad de ${item.name}`}
                  onBlur={(e) => commitQuantity(item, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-20 rounded-lg border border-neutral-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                />
              ) : (
                item.quantity
              ),
          },
          {
            key: 'unitPrice',
            header: 'Precio unitario',
            render: (item: QuoteItem) => formatMoney(item.unitPrice, currency),
          },
          {
            key: 'discountPct',
            header: 'Dto. %',
            render: (item: QuoteItem) =>
              editable ? (
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  defaultValue={item.discountPct}
                  disabled={busy}
                  aria-label={`Descuento de ${item.name}`}
                  onBlur={(e) => commitDiscount(item, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-20 rounded-lg border border-neutral-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
                />
              ) : (
                `${item.discountPct}%`
              ),
          },
          {
            key: 'lineTotal',
            header: 'Total línea',
            render: (item: QuoteItem) => (
              <span className="font-medium">
                {formatMoney(item.lineTotal, currency)}
              </span>
            ),
          },
          ...(editable
            ? [
                {
                  key: 'actions',
                  header: '',
                  render: (item: QuoteItem) => (
                    <Button
                      type="button"
                      variant="ghost"
                      className="px-2 py-1 text-xs text-[var(--color-error)]"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemove(item)
                      }}
                    >
                      Quitar
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
        data={items}
        emptyMessage="La cotización no tiene ítems todavía"
        keyExtractor={(item: QuoteItem) => item.id}
      />
    </div>
  )
}
