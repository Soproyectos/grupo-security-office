import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, Modal } from '../../../components/ui'
import { useQuoteMutations } from '../hooks/useQuoteMutations'
import { quoteErrorMessage } from '../../../services/quotes.service'
import api from '../../../services/api'
import type { Quote } from '../types/quote.types'

interface AddQuoteItemModalProps {
  open: boolean
  onClose: () => void
  quote: Quote
}

interface ProductOption {
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
 * Agrega un producto que la persona puede ver en Biblioteca (sin Listas). El backend toma el precio
 * vigente de la tarifa de la empresa (snapshot); sin precio, la línea queda «por confirmar» y calcula los totales — el frontend solo
 * envía productId + quantity (COM-03 §3: el alta NO lleva descuento; la línea
 * nace con 0 y aplicarlo es la operación dedicada `PATCH
 * /:id/items/:itemId/discount`). Si no hay precio vigente el backend responde
 * 409 y su mensaje se muestra tal cual.
 */
export default function AddQuoteItemModal({
  open,
  onClose,
  quote,
}: AddQuoteItemModalProps) {
  const { addItem } = useQuoteMutations()
  const [search, setSearch] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [selected, setSelected] = useState<ProductOption | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debouncedSearch = useDebounced(search)

  const term = debouncedSearch.trim()
  const productsQuery = useQuery({
    queryKey: ['quotes', 'add-item-products', term],
    queryFn: async () => {
      const res = await api.get('/products', { params: { search: term, take: 20, skip: 0 } })
      const body = res.data as unknown
      const list = body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body
      return Array.isArray(list) ? (list as ProductOption[]) : []
    },
    enabled: open && term.length >= 2,
  })
  const options = productsQuery.data ?? []

  const handleClose = () => {
    setSearch('')
    setQuantity('1')
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
        },
      })
      handleClose()
    } catch (err) {
      // Incluye 403/404 de producto/lista ajeno y el 409 "no hay precio
      // vigente": mensaje del servidor tal cual (errores tipados del servicio).
      setError(quoteErrorMessage(err))
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
          label="Buscar producto"
          name="product-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Escribe al menos 2 letras del nombre o el SKU"
        />
        <div
          role="listbox"
          aria-label="Productos encontrados"
          className="max-h-56 overflow-y-auto divide-y divide-neutral-100 rounded-lg border border-neutral-200"
        >
          {productsQuery.isFetching && (
            <p className="p-4 text-sm text-neutral-400">Buscando…</p>
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
          {term.length < 2 && (
            <p className="p-4 text-sm text-neutral-400">
              Busca por nombre o SKU para agregar un producto.
            </p>
          )}
          {productsQuery.data && options.length === 0 && (
            <p className="p-4 text-sm text-neutral-400">
              No hay productos con ese criterio
            </p>
          )}
          {productsQuery.isError && (
            <p className="p-4 text-sm text-[var(--color-error)]" role="alert">
              No se pudo buscar productos. Inténtalo de nuevo.
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
