import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Card, Input, Modal } from '../components/ui'
import QuoteStatusBadge from '../features/quotes/components/QuoteStatusBadge'
import QuoteItemsTable from '../features/quotes/components/QuoteItemsTable'
import AddQuoteItemModal from '../features/quotes/components/AddQuoteItemModal'
import { useQuote } from '../features/quotes/hooks/useQuotes'
import {
  extractBackendMessage,
  useQuoteMutations,
} from '../features/quotes/hooks/useQuoteMutations'
import { formatMoney } from '../features/quotes/lib/money'
import {
  allowedTransitions,
  areItemsEditable,
} from '../features/quotes/lib/quote-status'
import type { QuoteStatus } from '../features/quotes/types/quote.types'

const TRANSITION_LABELS: Record<QuoteStatus, string> = {
  borrador: 'Volver a borrador',
  enviada: 'Marcar como enviada',
  negociacion: 'Pasar a negociación',
  ganada: 'Marcar como ganada',
  perdida: 'Marcar como perdida',
  cancelada: 'Cancelar cotización',
}

const TRANSITION_VARIANT: Record<
  QuoteStatus,
  'primary' | 'secondary' | 'danger'
> = {
  borrador: 'secondary',
  enviada: 'primary',
  negociacion: 'secondary',
  ganada: 'primary',
  perdida: 'danger',
  cancelada: 'secondary',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('es-CO')
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-neutral-800">{value}</dd>
    </div>
  )
}

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { quote, isLoading, error } = useQuote(id)
  const { updateStatus } = useQuoteMutations()

  const [statusError, setStatusError] = useState<string | null>(null)
  const [pendingStatus, setPendingStatus] = useState<QuoteStatus | null>(null)
  const [lostReason, setLostReason] = useState('')
  const [isAddItemOpen, setIsAddItemOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Cargando cotización">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl bg-neutral-100"
          />
        ))}
      </div>
    )
  }

  if (error || !quote) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-error)]" role="alert">
          No se pudo cargar la cotización. Intenta de nuevo.
        </p>
        <Link
          to="/commercial/quotes"
          className="text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
        >
          Volver a cotizaciones
        </Link>
      </div>
    )
  }

  const transitions = allowedTransitions(quote.status)
  const itemsEditable = areItemsEditable(quote.status)
  const currency = quote.currency

  const doTransition = async (status: QuoteStatus, reason?: string) => {
    setStatusError(null)
    try {
      await updateStatus.mutateAsync({
        quoteId: quote.id,
        payload: { status, ...(reason ? { lostReason: reason } : {}) },
      })
      setPendingStatus(null)
      setLostReason('')
    } catch (err) {
      // Mensaje del backend (p. ej. transición inválida) mostrado tal cual.
      setStatusError(extractBackendMessage(err))
    }
  }

  const handleTransition = (status: QuoteStatus) => {
    if (status === 'perdida') {
      setPendingStatus('perdida')
      return
    }
    if (!window.confirm(`¿${TRANSITION_LABELS[status]}?`)) return
    void doTransition(status)
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Ruta de navegación" className="text-sm">
        <Link
          to="/commercial/quotes"
          className="font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
        >
          Cotizaciones
        </Link>
        <span className="mx-2 text-neutral-400" aria-hidden="true">
          /
        </span>
        <span className="font-mono text-xs text-neutral-500">{quote.code}</span>
      </nav>

      {/* Encabezado + acciones de estado */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-condensed font-semibold text-neutral-800">
                Cotización {quote.code}
              </h1>
              <QuoteStatusBadge status={quote.status} />
            </div>
            <p className="text-sm text-neutral-500">
              Cliente:{' '}
              <span className="font-medium text-neutral-700">
                {quote.customer?.name ?? '—'}
              </span>
            </p>
          </div>

          {transitions.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Acciones de estado"
            >
              {transitions.map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant={TRANSITION_VARIANT[status]}
                  loading={updateStatus.isPending}
                  onClick={() => handleTransition(status)}
                >
                  {TRANSITION_LABELS[status]}
                </Button>
              ))}
            </div>
          )}
        </div>
        {statusError && (
          <p
            className="mt-3 text-sm text-[var(--color-error)]"
            role="alert"
          >
            {statusError}
          </p>
        )}
      </Card>

      {/* Datos generales */}
      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Datos de la cotización
        </h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <DetailRow label="Lista" value={quote.lista?.name ?? '—'} />
          <DetailRow
            label="Tarifa"
            value={quote.priceList?.name ?? '—'}
          />
          <DetailRow
            label="Responsable"
            value={quote.owner?.name ?? '—'}
          />
          <DetailRow label="Vigente hasta" value={formatDate(quote.validUntil)} />
          <DetailRow label="Emitida" value={formatDate(quote.issuedAt)} />
          <DetailRow label="Cerrada" value={formatDate(quote.closedAt)} />
          <DetailRow label="Moneda" value={currency} />
          {quote.status === 'perdida' && (
            <DetailRow
              label="Motivo de pérdida"
              value={quote.lostReason ?? '—'}
            />
          )}
        </dl>
        {quote.notes && (
          <p className="mt-4 text-sm text-neutral-600">
            <span className="font-medium text-neutral-700">Notas: </span>
            {quote.notes}
          </p>
        )}
      </Card>

      {/* Ítems */}
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Ítems
          </h2>
          {itemsEditable && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsAddItemOpen(true)}
            >
              Agregar producto
            </Button>
          )}
        </div>
        <QuoteItemsTable quote={quote} editable={itemsEditable} />
      </Card>

      {/* Totales: strings del backend, solo presentación (nunca calculados). */}
      <Card>
        <dl className="space-y-2 sm:ml-auto sm:max-w-xs">
          <div className="flex justify-between text-sm text-neutral-600">
            <dt>Subtotal</dt>
            <dd>{formatMoney(quote.subtotal, currency)}</dd>
          </div>
          <div className="flex justify-between text-sm text-neutral-600">
            <dt>Descuento</dt>
            <dd>{formatMoney(quote.discount, currency)}</dd>
          </div>
          <div className="flex justify-between text-sm text-neutral-600">
            <dt>Impuesto ({quote.taxRate}%)</dt>
            <dd>{formatMoney(quote.taxAmount, currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold text-neutral-800">
            <dt>Total</dt>
            <dd>{formatMoney(quote.total, currency)}</dd>
          </div>
        </dl>
      </Card>

      {/* Modal de motivo de pérdida (transición perdida requiere lostReason). */}
      <Modal
        open={pendingStatus === 'perdida'}
        onClose={() => {
          setPendingStatus(null)
          setLostReason('')
        }}
        title="Marcar como perdida"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPendingStatus(null)
                setLostReason('')
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={updateStatus.isPending}
              disabled={!lostReason.trim()}
              onClick={() => void doTransition('perdida', lostReason.trim())}
            >
              Confirmar pérdida
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Motivo de pérdida"
            name="lost-reason"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="Ej. El cliente eligió a la competencia"
            required
          />
          {statusError && (
            <p className="text-sm text-[var(--color-error)]" role="alert">
              {statusError}
            </p>
          )}
        </div>
      </Modal>

      {itemsEditable && (
        <AddQuoteItemModal
          open={isAddItemOpen}
          onClose={() => setIsAddItemOpen(false)}
          quote={quote}
        />
      )}
    </div>
  )
}
