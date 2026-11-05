import { useState, type FormEvent } from 'react'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Modal } from '../../../components/ui'
import { getApiErrorMessage } from '../../../lib/apiError'
import { formatCurrency, formatDate } from '../../../lib/format'
import { useHasPermission } from '../../../lib/rbac'
import { validationKeys } from '../../catalog-validation/validation-api'
import { sheetKeys } from '../sheet/sheet.service'
import {
  createPrice,
  deletePrice,
  fetchPriceLists,
  fetchPricesByProduct,
  updatePrice,
  type Price,
} from '../../../services/prices.service'
import {
  buildCreatePricePayload,
  buildUpdatePricePayload,
  priceDateToInput,
  validatePriceForm,
  type PriceFormValues,
} from './price-form'
import type { Product } from '../types/product.types'

const inputClass = 'w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)] focus:border-[var(--color-primary)] text-sm'

function validityLabel(price: Price): string {
  if (price.validFrom && price.validUntil) return `${formatDate(price.validFrom)} – ${formatDate(price.validUntil)}`
  if (price.validFrom) return `Desde ${formatDate(price.validFrom)}`
  if (price.validUntil) return `Hasta ${formatDate(price.validUntil)}`
  return 'Sin vigencia'
}

export function ProductPriceForm({
  mode,
  product,
  price,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  product: Product
  price?: Price
  onClose: () => void
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(price ? String(price.value) : '')
  const [currency, setCurrency] = useState(price?.currency ?? '')
  const [priceListId, setPriceListId] = useState(price?.priceListId ?? '')
  const [validFrom, setValidFrom] = useState(priceDateToInput(price?.validFrom ?? null))
  const [validUntil, setValidUntil] = useState(priceDateToInput(price?.validUntil ?? null))
  const [formError, setFormError] = useState('')
  const { data: priceLists = [], isLoading: listsLoading, error: listsError } = useQuery({
    queryKey: ['priceLists'],
    queryFn: fetchPriceLists,
  })

  const values: PriceFormValues = { value, currency, priceListId, validFrom, validUntil }
  const mutation = useMutation({
    mutationKey: ['product-prices-write', product.id],
    mutationFn: () => {
      if (queryClient.isMutating({ mutationKey: ['product-publication-write', product.id] })) throw new Error('Espera a que termine la publicación antes de cambiar precios.')
      return mode === 'edit' && price
        ? updatePrice(price.id, buildUpdatePricePayload(price, values))
        : createPrice(buildCreatePricePayload(product.id, values))
    },
    onSuccess: async () => {
      await onSaved()
      onClose()
    },
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const problem = validatePriceForm(values, mode)
    if (problem) {
      setFormError(problem)
      return
    }
    setFormError('')
    mutation.mutate()
  }

  return (
    <Modal
      open
      onClose={() => { if (!mutation.isPending) onClose() }}
      title={mode === 'edit' ? 'Editar precio' : 'Nuevo precio'}
      footer={(
        <>
          <Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="product-price-form" loading={mutation.isPending}>
            {mode === 'edit' ? 'Guardar cambios' : 'Crear precio'}
          </Button>
        </>
      )}
    >
      <form id="product-price-form" onSubmit={handleSubmit} className="space-y-4">
        {(formError || mutation.isError) && (
          <Alert variant="error">{formError || getApiErrorMessage(mutation.error, 'No se pudo guardar el precio.')}</Alert>
        )}
        {listsError && <Alert variant="error">{getApiErrorMessage(listsError, 'No se pudieron cargar las tarifas.')}</Alert>}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-800" htmlFor="price-product">Producto</label>
          <input id="price-product" value={`${product.name} (${product.sku})`} disabled className={`${inputClass} bg-neutral-50 text-neutral-500`} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-neutral-800" htmlFor="price-list">Tarifa *</label>
          {mode === 'edit' && price ? (
            <input id="price-list" value={price.priceList?.name ?? price.priceListId} disabled className={`${inputClass} bg-neutral-50 text-neutral-500`} />
          ) : (
            <select
              id="price-list"
              required
              value={priceListId}
              disabled={listsLoading || Boolean(listsError)}
              onChange={(event) => {
                const selectedList = priceLists.find((list) => list.id === event.target.value)
                setPriceListId(event.target.value)
                setCurrency(selectedList?.currency ?? '')
              }}
              className={inputClass}
            >
              <option value="">{listsLoading ? 'Cargando tarifas...' : 'Seleccionar tarifa...'}</option>
              {priceLists.map((list) => <option key={list.id} value={list.id}>{list.name} ({list.code})</option>)}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-800" htmlFor="price-value">Valor *</label>
            <input id="price-value" type="number" step="0.01" min="0.01" required value={value} onChange={(event) => setValue(event.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-800" htmlFor="price-currency">Moneda *</label>
            <input id="price-currency" value={currency} readOnly={mode === 'create'} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className={`${inputClass} ${mode === 'create' ? 'bg-neutral-50 text-neutral-500' : ''}`} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-800" htmlFor="price-valid-from">Vigente desde</label>
            <input id="price-valid-from" type="datetime-local" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-800" htmlFor="price-valid-until">Vigente hasta</label>
            <input id="price-valid-until" type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className={inputClass} />
          </div>
        </div>
      </form>
    </Modal>
  )
}

export function ProductPricesSection({ product, mode }: { product: Product; mode: 'readOnly' | 'editable' }) {
  const queryClient = useQueryClient()
  const publicationPending = useIsMutating({ mutationKey: ['product-publication-write', product.id] }) > 0
  const canRead = useHasPermission('prices:read')
  const canWriteProduct = useHasPermission('products:write')
  const canApply = useHasPermission('prices:apply')
  const canManage = mode === 'editable' && canRead && canWriteProduct && canApply
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; price: Price } | null>(null)
  const { data: prices = [], isLoading, error } = useQuery({
    queryKey: ['product-prices', product.id],
    queryFn: () => fetchPricesByProduct(product.id),
    enabled: canRead,
  })
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['product-prices', product.id] }),
      queryClient.invalidateQueries({ queryKey: ['product', product.id] }),
      queryClient.invalidateQueries({ queryKey: ['products'], refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: ['product-audit', product.id] }),
      queryClient.invalidateQueries({ queryKey: validationKeys.report(product.id) }),
      queryClient.invalidateQueries({ queryKey: sheetKeys.revisions(product.id) }),
    ])
  }
  const remove = useMutation({ mutationKey: ['product-prices-write', product.id], mutationFn: (id: string) => {
    if (queryClient.isMutating({ mutationKey: ['product-publication-write', product.id] })) throw new Error('Espera a que termine la publicación antes de cambiar precios.')
    return deletePrice(id)
  }, onSuccess: refresh })

  if (!canRead) {
    return <p className="text-sm text-neutral-500">No tienes permiso para consultar los precios de este producto.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Precios del producto ({prices.length})</p>
        {canManage && <Button variant="secondary" disabled={publicationPending} onClick={() => setModal({ mode: 'create' })}>Nuevo precio</Button>}
      </div>
      {canManage && publicationPending && <p role="status" className="text-sm text-neutral-600">Espera a que termine la publicación antes de cambiar precios.</p>}
      {remove.isError && <Alert variant="error">{getApiErrorMessage(remove.error, 'No se pudo eliminar el precio.')}</Alert>}
      {isLoading ? <p className="py-6 text-center text-sm text-neutral-400">Cargando precios...</p>
        : error ? <Alert variant="error">{getApiErrorMessage(error, 'No se pudieron cargar los precios.')}</Alert>
          : prices.length === 0 ? <p className="py-6 text-sm text-neutral-400">Este producto aún no tiene precios asignados.</p>
            : (
              <div className="product-prices__scroll overflow-x-auto rounded-lg border border-neutral-200" role="region" aria-label="Precios del producto" tabIndex={0}>
                <table className="min-w-full divide-y divide-neutral-200 text-sm">
                  <thead className="bg-neutral-50"><tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-neutral-600">Tarifa</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-neutral-600">Precio</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase text-neutral-600">Vigencia</th>
                    {canManage && <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase text-neutral-600">Acciones</th>}
                  </tr></thead>
                  <tbody className="divide-y divide-neutral-100">
                    {prices.map((price) => (
                      <tr key={price.id}>
                        <td className="px-4 py-3"><span className="font-medium text-neutral-800">{price.priceList?.name ?? price.priceListId}</span>{price.priceList?.code && <span className="block font-mono text-xs text-neutral-400">{price.priceList.code}</span>}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-neutral-800">{formatCurrency(Number(price.value), price.currency)}</td>
                        <td className="px-4 py-3 text-xs text-neutral-500">{validityLabel(price)}</td>
                        {canManage && <td className="px-4 py-3"><div className="flex items-center justify-end gap-2">
                          <button type="button" disabled={publicationPending} onClick={() => setModal({ mode: 'edit', price })} className="text-xs font-medium text-neutral-500 hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50">Editar</button>
                          <button type="button" disabled={remove.isPending || publicationPending} onClick={() => { if (window.confirm('¿Eliminar este precio?')) remove.mutate(price.id) }} className="text-xs font-medium text-neutral-400 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50">Eliminar</button>
                        </div></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      {prices.length > 0 && <p className="product-prices__scroll-hint hidden text-xs text-neutral-600">Desliza la tabla para ver todas las columnas y sus acciones.</p>}
      {mode === 'editable' && !canManage && <p className="text-xs text-neutral-500">Para editar precios aquí necesitas tener asignadas las pestañas Fichas y Precios.</p>}
      {canManage && modal && <ProductPriceForm mode={modal.mode} price={modal.mode === 'edit' ? modal.price : undefined} product={product} onClose={() => setModal(null)} onSaved={refresh} />}
    </div>
  )
}
