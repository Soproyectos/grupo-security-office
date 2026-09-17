import { useEffect, useState } from 'react'
import { Card, Input, Button } from '../../../components/ui'
import { hasRole } from '../../../lib/rbac'
import { ROLES } from '../../../lib/roles'
import { formatMoney } from '../lib/money'
import { extractBackendMessage } from '../hooks/useQuoteMutations'
import {
  useSalesOrderForQuote,
  useUpdateInvoice,
} from '../hooks/useSalesOrder'

const INVOICE_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN_COMERCIAL, ROLES.SUPERVISOR]

function canRegisterInvoice(): boolean {
  return INVOICE_ROLES.some((role) => hasRole(role))
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('es-CO')
}

/** ISO 8601 → 'YYYY-MM-DD' para el input type="date" (solo presentación). */
function toInputDate(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

interface SalesOrderSectionProps {
  quoteId: string
  customerId: string | undefined
  quoteStatus: string
}

/**
 * Sección "Pedido" del detalle de cotización. Solo aplica a cotizaciones
 * GANADAS (el backend crea el SalesOrder en la transición a ganada).
 * El registro de factura externa es SOLO registro manual (Yéminus):
 * la plataforma no emite facturas.
 */
export default function SalesOrderSection({
  quoteId,
  customerId,
  quoteStatus,
}: SalesOrderSectionProps) {
  const isGanada = quoteStatus === 'ganada'
  const { salesOrder, isLoading, error } = useSalesOrderForQuote(
    quoteId,
    customerId,
    isGanada
  )
  const updateInvoice = useUpdateInvoice()
  const editable = canRegisterInvoice()

  const [editing, setEditing] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Sincroniza el formulario cuando llega (o se actualiza) el pedido.
  useEffect(() => {
    setInvoiceNumber(salesOrder?.externalInvoiceNumber ?? '')
    setInvoiceDate(toInputDate(salesOrder?.externalInvoiceDate ?? null))
  }, [salesOrder])

  if (!isGanada) return null

  const hasData = Boolean(salesOrder?.externalInvoiceNumber) ||
    Boolean(salesOrder?.externalInvoiceDate)

  const startEditing = () => {
    setFormError(null)
    setEditing(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!salesOrder) return
    setFormError(null)
    try {
      await updateInvoice.mutateAsync({
        id: salesOrder.id,
        payload: {
          externalInvoiceNumber: invoiceNumber.trim(),
          externalInvoiceDate: invoiceDate || null,
        },
      })
      setEditing(false)
    } catch (err) {
      setFormError(extractBackendMessage(err))
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Pedido
      </h2>

      {isLoading && (
        <div
          className="h-16 animate-pulse rounded-lg bg-neutral-100"
          aria-busy="true"
          aria-label="Cargando pedido"
        />
      )}

      {!isLoading && error && (
        <p className="text-sm text-[var(--color-error)]" role="alert">
          No se pudo cargar el pedido de esta cotización. Intenta de nuevo.
        </p>
      )}

      {!isLoading && !error && !salesOrder && (
        <p className="text-sm text-neutral-500">
          No se encontró un pedido asociado a esta cotización.
        </p>
      )}

      {salesOrder && (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Código
              </dt>
              <dd className="mt-0.5 font-mono text-sm text-neutral-800">
                {salesOrder.code}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Total
              </dt>
              {/* total/currency llegan como string del backend; solo presentación. */}
              <dd className="mt-0.5 text-sm text-neutral-800">
                {formatMoney(salesOrder.total, salesOrder.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Sistema externo
              </dt>
              <dd className="mt-0.5 text-sm text-neutral-800">
                {salesOrder.externalSystem}
              </dd>
            </div>
          </dl>

          {!editing && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                    Factura externa (N°)
                  </dt>
                  <dd className="mt-0.5 text-sm text-neutral-800">
                    {salesOrder.externalInvoiceNumber ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                    Fecha de factura
                  </dt>
                  <dd className="mt-0.5 text-sm text-neutral-800">
                    {formatDate(salesOrder.externalInvoiceDate)}
                  </dd>
                </div>
              </dl>
              {editable && (
                <Button
                  type="button"
                  variant={hasData ? 'secondary' : 'primary'}
                  onClick={startEditing}
                >
                  {hasData
                    ? 'Editar factura externa'
                    : 'Registrar factura externa'}
                </Button>
              )}
            </div>
          )}

          {editing && editable && (
            <form
              onSubmit={handleSubmit}
              className="space-y-3"
              aria-label="Registro de factura externa"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Número de factura externa"
                  name="external-invoice-number"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Ej. YM-10458"
                />
                <Input
                  label="Fecha de la factura"
                  name="external-invoice-date"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              {formError && (
                <p className="text-sm text-[var(--color-error)]" role="alert">
                  {formError}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={updateInvoice.isPending}
                >
                  Guardar factura
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditing(false)
                    setFormError(null)
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}
