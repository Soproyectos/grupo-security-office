import { useState } from 'react'
import { Button, Table } from '../../../components/ui'
import { formatMoney } from '../lib/money'
import { useQuoteMutations } from '../hooks/useQuoteMutations'
import { quoteErrorMessage } from '../../../services/quotes.service'
import type { Quote, QuoteItem } from '../types/quote.types'

export const PRICE_PENDING_LABEL = 'Por confirmar'

/** Control para completar un «precio por confirmar»: el servidor valida el valor y decide si se puede. */
function SetPriceControl({ item, quoteId }: { item: QuoteItem; quoteId: string }) {
  const { setItemPrice } = useQuoteMutations()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const amount = Number(value.replace(',', '.'))
  const valid = value.trim() !== '' && Number.isFinite(amount) && amount > 0

  const save = async () => {
    if (!valid) return
    setError(null)
    try {
      await setItemPrice.mutateAsync({ quoteId, itemId: item.id, unitPrice: amount })
      setOpen(false)
      setValue('')
    } catch (err) {
      setError(quoteErrorMessage(err))
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" className="min-h-11 px-3 py-1 text-xs" onClick={() => setOpen(true)}>
        Poner precio<span className="sr-only"> a {item.name}</span>
      </Button>
    )
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => { e.preventDefault(); void save() }}
    >
      <label className="sr-only" htmlFor={`price-${item.id}`}>Precio unitario de {item.name}</label>
      <input
        id={`price-${item.id}`}
        type="number"
        inputMode="decimal"
        min="0.01"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={setItemPrice.isPending}
        placeholder="Precio unitario"
        className="min-h-11 w-32 rounded-lg border border-neutral-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] disabled:opacity-60"
      />
      <Button type="submit" className="min-h-11 px-3 py-1 text-xs" loading={setItemPrice.isPending} disabled={!valid}>Guardar precio</Button>
      <Button type="button" variant="ghost" className="min-h-11 px-3 py-1 text-xs" disabled={setItemPrice.isPending} onClick={() => { setOpen(false); setValue(''); setError(null) }}>Cancelar</Button>
      {error && <p className="basis-full text-xs text-[var(--color-error)]" role="alert">{error}</p>}
    </form>
  )
}

interface QuoteItemsTableProps {
  quote: Quote
  /** true solo si el estado permite mutar ítems (borrador/enviada/negociacion). */
  editable: boolean
  /**
   * Criterio client-side (UX) para ofrecer el editor de descuento
   * (`features/quotes/access.ts`); el servidor sigue siendo la autoridad de
   * `quotes:discount` y pinta su 403 con su mensaje.
   */
  canEditDiscount?: boolean
}

/**
 * Tabla de ítems de la cotización. TODOS los montos (unitPrice, discountPct,
 * lineTotal) se muestran tal como llegan del backend (strings); NUNCA se
 * recalcula nada en el cliente — cantidad/descuento editados se envían al
 * backend y la tabla se refresca con los totales recalculados del servidor.
 *
 * COM-03 §3: la cantidad viaja por la vía GENERAL (`PATCH .../items/:itemId`,
 * solo `{ quantity }` — nunca `discountPct`) y el descuento por la operación
 * DEDICADA (`PATCH .../items/:itemId/discount`). Editar cantidad no cambia
 * descuentos desde esta tabla.
 */
export default function QuoteItemsTable({
  quote,
  editable,
  canEditDiscount = false,
}: QuoteItemsTableProps) {
  const { updateItem, updateItemDiscount, removeItem } = useQuoteMutations()
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
      setRowError(quoteErrorMessage(err))
    }
  }

  const commitDiscount = async (item: QuoteItem, raw: string) => {
    if (raw === item.discountPct) return
    setRowError(null)
    try {
      await updateItemDiscount.mutateAsync({
        quoteId: quote.id,
        itemId: item.id,
        discountPct: raw || '0',
      })
    } catch (err) {
      // 403 sin quotes:discount → mensaje del servidor (o la reserva clara de
      // F1); el editor sigue en pantalla y la fila conserva el último valor
      // autorizado por el servidor (no hubo refetch en el error).
      setRowError(quoteErrorMessage(err))
    }
  }

  const handleRemove = async (item: QuoteItem) => {
    if (!window.confirm(`¿Quitar "${item.name}" de la cotización?`)) return
    setRowError(null)
    try {
      await removeItem.mutateAsync({ quoteId: quote.id, itemId: item.id })
    } catch (err) {
      setRowError(quoteErrorMessage(err))
    }
  }

  const busy = updateItem.isPending || updateItemDiscount.isPending || removeItem.isPending
  const discountEditable = editable && canEditDiscount

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
            render: (item: QuoteItem) =>
              item.unitPrice === null ? (
                <div className="space-y-1">
                  <span className="inline-block rounded-full bg-[var(--color-warning-bg-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--color-warning-hover)]">
                    {PRICE_PENDING_LABEL}
                  </span>
                  {editable && <SetPriceControl item={item} quoteId={quote.id} />}
                </div>
              ) : (
                formatMoney(item.unitPrice, currency)
              ),
          },
          {
            key: 'discountPct',
            header: 'Dto. %',
            render: (item: QuoteItem) =>
              discountEditable ? (
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
                {item.unitPrice === null ? '—' : formatMoney(item.lineTotal, currency)}
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
