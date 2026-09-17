import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Modal } from '../../../components/ui'
import { extractBackendMessage, useQuoteMutations } from '../hooks/useQuoteMutations'
import { useQuoteBuilderStore } from '../store/quote-builder.store'
import { fetchCustomers } from '../../../services/customers.service'
import { fetchListas } from '../../../services/listas.service'

function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

/**
 * Wizard de creación de cotización (3 pasos: cliente → lista → revisar).
 * Solo recolecta SELECCIONES (ids, fecha, notas); todos los montos los
 * calcula el backend al crear la cotización y al agregar ítems después.
 */
export default function QuoteBuilderModal() {
  const navigate = useNavigate()
  const store = useQuoteBuilderStore()
  const { create } = useQuoteMutations()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const debouncedSearch = useDebounced(customerSearch)

  const customersQuery = useQuery({
    queryKey: ['customers', 'picker', debouncedSearch],
    queryFn: () =>
      fetchCustomers({ search: debouncedSearch || undefined }, 1, 10),
    enabled: store.isOpen && store.step === 'customer',
  })

  const listasQuery = useQuery({
    queryKey: ['listas', 'all'],
    queryFn: fetchListas,
    enabled: store.isOpen && store.step === 'lista',
  })
  const selectableListas = (listasQuery.data ?? []).filter(
    (l) => l.isActive && !l.archivedAt
  )

  if (!store.isOpen) return null

  const handleClose = () => {
    setSubmitError(null)
    store.close()
  }

  const handleConfirm = async () => {
    if (!store.customer || !store.lista) return
    setSubmitError(null)
    try {
      const quote = await create.mutateAsync({
        customerId: store.customer.id,
        listaId: store.lista.id,
        validUntil: store.validUntil || undefined,
        taxRate: store.taxRate || undefined,
        notes: store.notes || undefined,
      })
      store.reset()
      navigate(`/commercial/quotes/${quote.id}`)
    } catch (err) {
      setSubmitError(extractBackendMessage(err))
    }
  }

  const titles: Record<typeof store.step, string> = {
    customer: 'Nueva cotización — Cliente',
    lista: 'Nueva cotización — Lista de precios',
    review: 'Nueva cotización — Revisar y confirmar',
  }

  return (
    <Modal
      open={store.isOpen}
      onClose={handleClose}
      title={titles[store.step]}
      size="lg"
      footer={
        <>
          {store.step !== 'customer' && (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                store.setStep(store.step === 'review' ? 'lista' : 'customer')
              }
            >
              Atrás
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
          >
            Cancelar
          </Button>
          {store.step === 'customer' && (
            <Button
              type="button"
              disabled={!store.customer}
              onClick={() => store.setStep('lista')}
            >
              Siguiente
            </Button>
          )}
          {store.step === 'lista' && (
            <Button
              type="button"
              disabled={!store.lista}
              onClick={() => store.setStep('review')}
            >
              Siguiente
            </Button>
          )}
          {store.step === 'review' && (
            <Button
              type="button"
              loading={create.isPending}
              disabled={!store.customer || !store.lista}
              onClick={handleConfirm}
            >
              Confirmar y crear
            </Button>
          )}
        </>
      }
    >
      {store.step === 'customer' && (
        <div className="space-y-3">
          <Input
            label="Buscar cliente"
            name="customer-search"
            type="search"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            placeholder="Nombre, código o documento"
          />
          <div
            role="listbox"
            aria-label="Clientes disponibles"
            className="max-h-64 overflow-y-auto divide-y divide-neutral-100 rounded-lg border border-neutral-200"
          >
            {customersQuery.isLoading && (
              <p className="p-4 text-sm text-neutral-400">Cargando...</p>
            )}
            {customersQuery.data?.data.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={store.customer?.id === c.id}
                onClick={() =>
                  store.setCustomer({ id: c.id, label: c.name })
                }
                className={`w-full px-4 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
                  store.customer?.id === c.id
                    ? 'bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]'
                    : 'hover:bg-neutral-50'
                }`}
              >
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 font-mono text-xs text-neutral-400">
                  {c.code}
                </span>
              </button>
            ))}
            {customersQuery.data && customersQuery.data.data.length === 0 && (
              <p className="p-4 text-sm text-neutral-400">
                No hay clientes con ese criterio
              </p>
            )}
          </div>
        </div>
      )}

      {store.step === 'lista' && (
        <div
          role="listbox"
          aria-label="Listas de precios disponibles"
          className="max-h-80 overflow-y-auto divide-y divide-neutral-100 rounded-lg border border-neutral-200"
        >
          {listasQuery.isLoading && (
            <p className="p-4 text-sm text-neutral-400">Cargando...</p>
          )}
          {selectableListas.map((l) => (
            <button
              key={l.id}
              type="button"
              role="option"
              aria-selected={store.lista?.id === l.id}
              onClick={() =>
                store.setLista({ id: l.id, label: `${l.name} (${l.currency})` })
              }
              className={`w-full px-4 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
                store.lista?.id === l.id
                  ? 'bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]'
                  : 'hover:bg-neutral-50'
              }`}
            >
              <span className="font-medium">{l.name}</span>
              <span className="ml-2 text-xs text-neutral-400">
                {l.code} · {l.currency}
              </span>
            </button>
          ))}
          {listasQuery.data && selectableListas.length === 0 && (
            <p className="p-4 text-sm text-neutral-400">
              No hay listas activas disponibles
            </p>
          )}
        </div>
      )}

      {store.step === 'review' && (
        <div className="space-y-4">
          <dl className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-neutral-400">Cliente</dt>
              <dd className="font-medium text-neutral-800">
                {store.customer?.label}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-400">Lista</dt>
              <dd className="font-medium text-neutral-800">
                {store.lista?.label}
              </dd>
            </div>
          </dl>
          <Input
            label="Vigente hasta (opcional)"
            name="valid-until"
            type="date"
            value={store.validUntil}
            onChange={(e) => store.setValidUntil(e.target.value)}
          />
          <Input
            label="Impuesto (%)"
            name="tax-rate"
            type="number"
            min="0"
            step="0.01"
            value={store.taxRate}
            onChange={(e) => store.setTaxRate(e.target.value)}
          />
          <div className="space-y-1.5">
            <label
              htmlFor="quote-notes"
              className="block text-sm font-medium text-neutral-800"
            >
              Notas (opcional)
            </label>
            <textarea
              id="quote-notes"
              value={store.notes}
              onChange={(e) => store.setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
            />
          </div>
          {submitError && (
            <p className="text-sm text-[var(--color-error)]" role="alert">
              {submitError}
            </p>
          )}
          <p className="text-xs text-neutral-400">
            La cotización se crea en estado Borrador. Después podrás agregar
            productos desde el detalle; los precios y totales los calcula el
            sistema.
          </p>
        </div>
      )}
    </Modal>
  )
}
