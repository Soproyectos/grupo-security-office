import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, Modal } from '../../../components/ui'
import { extractBackendMessage, useQuoteMutations } from '../hooks/useQuoteMutations'
import { fetchListaProducts } from '../../../services/listas.service'
import type { Quote } from '../types/quote.types'

interface AddQuoteItemModalProps {
  open: boolean
  onClose: () => void
  quote: Quote
}

interface ListaProductOption {
  id: string
  sku?: string | null
  name?: string | null
}

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

/**
 * Agrega un producto de la Lista de la cotización. El backend toma el precio
 * vigente de la tarifa (snapshot) y calcula los totales — el frontend solo
 * envía productId + quantity + discountPct. Si no hay precio vigente el
 * backend responde 409 y su mensaje se muestra tal cual.
 */
export default function AddQuoteItemModal({
  open,
  onClose,
  quote,
}: AddQuoteItemModalProps) {
  const { addItem } = useQuoteMutations()
  const [search, setSearch] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [discountPct, setDiscountPct] = useState('0')
  const [selected, setSelected] = useState<ListaProductOption | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debouncedSearch = useDebounced(search)

  const productsQuery = useQuery({
    queryKey: ['listas', 'products', quote.listaId],
    queryFn: () => fetchListaProducts(quote.listaId),
    enabled: open,
  })

  const options = useMemo(() => {
    const products = (productsQuery.data ?? []) as ListaProductOption[]
    const term = debouncedSearch.trim().toLowerCase()
    const filtered = term
      ? products.filter(
          (p) =>
            (p.name ?? '').toLowerCase().includes(term) ||
            (p.sku ?? '').toLowerCase().includes(term)
        )
      : products
    return filtered.slice(0, 50)
  }, [productsQuery.data, debouncedSearch])

  const handleClose = () => {
    setSearch('')
    setQuantity('1')
    setDiscountPct('0')
    setSelected(null)
    setError(null)
    onClose()
  }

  const handleSubmit = async () => {
    if (!selected) return
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('La cantidad debe ser un entero mayor que cero.')
      return
    }
    setError(null)
    try {
      await addItem.mutateAsync({
        quoteId: quote.id,
        payload: {
          productId: selected.id,
          quantity: qty,
          discountPct: discountPct || undefined,
        },
      })
      handleClose()
    } catch (err) {
      // Incluye el 409 "no hay precio vigente" del backend, mostrado tal cual.
      setError(extractBackendMessage(err))
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Agregar producto"
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={addItem.isPending}
            disabled={!selected}
            onClick={handleSubmit}
          >
            Agregar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Buscar en la lista"
          name="product-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SKU o nombre"
        />
        <div
          role="listbox"
          aria-label="Productos de la lista"
          className="max-h-56 overflow-y-auto divide-y divide-neutral-100 rounded-lg border border-neutral-200"
        >
          {productsQuery.isLoading && (
            <p className="p-4 text-sm text-neutral-400">Cargando...</p>
          )}
          {options.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={selected?.id === p.id}
              onClick={() => setSelected(p)}
              className={`w-full px-4 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
                selected?.id === p.id
                  ? 'bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]'
                  : 'hover:bg-neutral-50'
              }`}
            >
              <span className="font-medium">{p.name}</span>
              {p.sku && (
                <span className="ml-2 font-mono text-xs text-neutral-400">
                  {p.sku}
                </span>
              )}
            </button>
          ))}
          {productsQuery.data && options.length === 0 && (
            <p className="p-4 text-sm text-neutral-400">
              No hay productos con ese criterio
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Cantidad"
            name="quantity"
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Input
            label="Descuento (%)"
            name="discount-pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={discountPct}
            onChange={(e) => setDiscountPct(e.target.value)}
          />
        </div>
        {error && (
          <p className="text-sm text-[var(--color-error)]" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
