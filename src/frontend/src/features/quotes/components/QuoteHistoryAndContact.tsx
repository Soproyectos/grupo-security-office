import { Card } from '../../../components/ui'
import { useQuoteHistory } from '../hooks/useQuotes'
import { whatsappUrl } from '../lib/whatsapp'
import { quoteErrorMessage } from '../../../services/quotes.service'
import { QUOTE_STATUS_LABELS, type Quote, type QuoteEffectiveStatus } from '../types/quote.types'

const statusLabel = (status: string | null) =>
  status ? (QUOTE_STATUS_LABELS[status as QuoteEffectiveStatus] ?? status) : 'Creada'

function formatDateTime(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-neutral-800">{value}</dd>
    </div>
  )
}

const LINK = 'inline-flex min-h-11 items-center rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-primary-bg-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]'

/** Quién la envió desde la tienda y cómo contactarlo. */
export function PortalContactCard({ account }: { account: NonNullable<Quote['portalAccount']> }) {
  const wa = whatsappUrl(account.phone)
  return (
    <Card>
      <h2 className="text-base font-semibold text-neutral-800">Enviada desde la tienda</h2>
      <p className="mt-1 text-sm text-neutral-500">El cliente armó esta cotización en la tienda. Valida el stock y contáctalo para cerrarla.</p>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Contacto" value={account.contactName} />
        <Field label="Correo" value={account.email} />
        <Field label="Teléfono" value={account.phone || 'Sin teléfono'} />
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer" className={`${LINK} text-[var(--color-primary)]`}>
            Escribir por WhatsApp<span className="sr-only"> a {account.contactName}</span>
          </a>
        ) : (
          <p className="text-sm text-neutral-500">No hay un teléfono válido para WhatsApp. Usa el correo.</p>
        )}
        <a href={`mailto:${account.email}`} className={`${LINK} text-neutral-700`}>Escribir por correo</a>
      </div>
    </Card>
  )
}

/** Historial de estados: se monta solo para quien tiene `quotes:history`; el servidor lo vuelve a comprobar. */
export function QuoteHistoryCard({ quoteId }: { quoteId: string }) {
  const { events, isLoading, error, refetch } = useQuoteHistory(quoteId, true)
  return (
    <Card>
      <h2 className="text-base font-semibold text-neutral-800">Historial</h2>
      {isLoading ? (
        <div className="mt-3 space-y-2" aria-busy="true" aria-label="Cargando historial">
          {[0, 1].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-100" />)}
        </div>
      ) : error ? (
        <p className="mt-3 text-sm text-[var(--color-error)]" role="alert">
          {quoteErrorMessage(error, 'No se pudo cargar el historial.')}{' '}
          <button type="button" className="min-h-11 font-medium underline" onClick={() => void refetch()}>Reintentar</button>
        </p>
      ) : !events?.length ? (
        <p className="mt-3 text-sm text-neutral-500">Todavía no hay cambios de estado. Aparecerán aquí cuando la cotización se envíe o cambie.</p>
      ) : (
        <ol className="mt-3 divide-y divide-neutral-100">
          {events.map((e) => (
            <li key={e.id} className="py-3 text-sm">
              <p className="font-medium text-neutral-800">{statusLabel(e.fromStatus)} a {statusLabel(e.toStatus)}</p>
              <p className="text-neutral-500">{formatDateTime(e.createdAt)} · {e.actor ?? 'Sistema'}</p>
              {e.note && <p className="mt-1 text-neutral-600">{e.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
