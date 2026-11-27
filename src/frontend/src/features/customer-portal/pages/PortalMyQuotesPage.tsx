import { Link, useOutletContext, useParams, useLocation } from 'react-router-dom'
import { formatCop } from '../../storefront/utils/formatCop'
import AccountStateNotice from '../components/AccountStateNotice'
import { quoteAccess } from '../utils/quote-access'
import { useMyQuote, useMyQuotes } from '../hooks/usePortalQuotes'
import { formatQuoteDate, quoteStatusLabel } from '../utils/quote-labels'
import type { PortalAccount } from '../types/customer-portal.types'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
export const PRICE_PENDING_NOTE = 'Tiene precios por confirmar'
const LINK_BUTTON = `inline-flex min-h-11 items-center rounded-control bg-security-600 px-5 text-sm font-bold !text-white hover:bg-security-500 ${FOCUS}`
const TEXT_LINK = `inline-flex min-h-11 items-center text-sm font-semibold !text-security-600 hover:underline ${FOCUS}`

function StatusChip({ status }: { status: string }) {
  return <span className="inline-flex rounded-full bg-surface-100 px-3 py-1 text-sm font-semibold text-ink-900">{quoteStatusLabel(status)}</span>
}

function ListSkeleton() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Cargando tus cotizaciones…</span>
      {[0, 1, 2].map((row) => <div key={row} aria-hidden="true" className="h-20 animate-pulse rounded-card bg-surface-200" />)}
    </div>
  )
}

function LoadError({ onRetry, subject }: { onRetry: () => void; subject: string }) {
  return (
    <div role="alert" className="rounded-card border border-surface-200 bg-white p-6">
      <p className="text-sm text-ink-900">No pudimos cargar {subject}. Revisa tu conexión e inténtalo de nuevo.</p>
      <button type="button" onClick={onRetry} className={`mt-3 min-h-11 rounded-control border border-security-600 px-4 text-sm font-semibold !text-security-600 hover:bg-security-50 ${FOCUS}`}>Intentar de nuevo</button>
    </div>
  )
}

/** "Mis cotizaciones": only the ones this person sent, with their status. */
export function PortalMyQuotesPage() {
  const account = useOutletContext<PortalAccount>()
  const quotes = useMyQuotes()
  const access = quoteAccess(account)

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-4">
      <h1 className="font-condensed text-3xl font-semibold">Mis cotizaciones</h1>
      {access !== 'ready' && <AccountStateNotice account={account} />}
      {access === 'ready' && quotes.isPending && <ListSkeleton />}
      {access === 'ready' && quotes.isError && <LoadError subject="tus cotizaciones" onRetry={() => void quotes.refetch()} />}
      {access === 'ready' && quotes.isSuccess && quotes.data.length === 0 && (
        <section className="rounded-card border border-surface-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Aún no has enviado cotizaciones</h2>
          <p className="mt-1 max-w-prose text-sm text-ink-600">Elige productos en el catálogo, agrégalos a tu cotización y envíala a tu asesor. Aquí verás cómo avanza.</p>
          <div className="mt-4"><Link to="/catalogo" className={LINK_BUTTON}>Ir al catálogo</Link></div>
        </section>
      )}
      {access === 'ready' && quotes.isSuccess && quotes.data.length > 0 && (
        <ul className="space-y-3">
          {quotes.data.map((quote) => (
            <li key={quote.id}>
              <Link to={`/clientes/cotizaciones/${quote.id}`} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-surface-200 bg-white p-4 hover:border-storefront-ink ${FOCUS}`}>
                <span className="min-w-0">
                  <span className="block font-semibold !text-storefront-ink">{quote.code}</span>
                  <span className="block text-sm text-ink-600">{formatQuoteDate(quote.issuedAt ?? quote.createdAt)} · {quote.itemCount === 1 ? '1 producto' : `${quote.itemCount} productos`}</span>
                  {quote.hasPendingPrices && <span className="block text-sm font-semibold text-ink-900">{PRICE_PENDING_NOTE}</span>}
                </span>
                <span className="flex flex-col items-start gap-1 sm:items-end">
                  <StatusChip status={quote.status} />
                  <span className="font-condensed text-lg font-bold tabular-nums !text-storefront-ink">{formatCop(quote.total)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/clientes/cotizacion" className={TEXT_LINK}>Ir a Mi cotización</Link>
    </div>
  )
}

function historyText(fromStatus: string | null, toStatus: string): string {
  return fromStatus ? `Pasó de «${quoteStatusLabel(fromStatus)}» a «${quoteStatusLabel(toStatus)}»` : quoteStatusLabel(toStatus)
}

/** One quote: lines, totals, advisor and the history of its status. */
export function PortalQuoteDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const location = useLocation()
  const justSent = (location.state as { sent?: boolean } | null)?.sent === true
  const quote = useMyQuote(id)

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-4">
      <Link to="/clientes/cotizaciones" className={TEXT_LINK}>Volver a mis cotizaciones</Link>
      {quote.isPending && <ListSkeleton />}
      {quote.isError && (
        <LoadError subject="esta cotización" onRetry={() => void quote.refetch()} />
      )}
      {quote.isSuccess && (() => {
        const data = quote.data
        return (
          <>
            {justSent && (
              <p role="status" className="rounded-control bg-surface-100 p-3 text-sm font-semibold text-ink-900">
                Enviamos tu cotización {data.code} a tu asesor. Te contactará para confirmar stock y envío.
              </p>
            )}
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-condensed text-3xl font-semibold">Cotización {data.code}</h1>
                <p className="mt-1 text-sm text-ink-600">
                  Enviada el {formatQuoteDate(data.issuedAt ?? data.createdAt)}
                  {data.advisor ? ` · Tu asesor: ${data.advisor.name}` : ''}
                </p>
              </div>
              <StatusChip status={data.status} />
            </header>

            <section aria-label="Productos" className="rounded-card border border-surface-200 bg-white">
              <ul className="divide-y divide-surface-200">
                {data.items.map((line) => (
                  <li key={line.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4">
                    <span className="min-w-0">
                      <span className="block break-words font-semibold">{line.name}</span>
                      <span className="block break-words font-mono text-xs text-ink-500">{line.sku}</span>
                      <span className="block text-sm text-ink-600">
                        {line.quantity} {line.quantity === 1 ? 'unidad' : 'unidades'}
                        {line.unitPrice === null ? '' : ` · ${formatCop(line.unitPrice)} c/u`}
                      </span>
                    </span>
                    <span className="font-condensed text-lg font-bold tabular-nums">{line.unitPrice === null ? 'Precio por confirmar' : formatCop(line.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <dl className="space-y-1 border-t border-surface-200 p-4 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-ink-600">Subtotal</dt><dd className="tabular-nums">{formatCop(data.subtotal)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-600">IVA incluido ({Math.round(data.taxRate)}%)</dt><dd className="tabular-nums">{formatCop(data.taxAmount)}</dd></div>
                <div className="flex justify-between gap-4 text-base font-bold"><dt>Total</dt><dd className="font-condensed text-xl tabular-nums">{formatCop(data.total)}</dd></div>
              </dl>
              {data.hasPendingPrices && (
                <p className="border-t border-surface-200 p-4 text-sm font-semibold text-ink-900">Algunos productos tienen precio por confirmar. Tu asesor los completará y el total cambiará.</p>
              )}
            </section>

            {data.notes && (
              <section className="rounded-card border border-surface-200 bg-white p-4">
                <h2 className="text-lg font-semibold">Tus notas</h2>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-900">{data.notes}</p>
              </section>
            )}

            <section aria-label="Historial" className="rounded-card border border-surface-200 bg-white p-4">
              <h2 className="text-lg font-semibold">Historial</h2>
              {data.history.length === 0 ? (
                <p className="mt-1 text-sm text-ink-600">Aún no hay cambios de estado.</p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {data.history.map((event, index) => (
                    <li key={`${event.createdAt}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm">
                      <span className="font-semibold text-ink-900">{historyText(event.fromStatus, event.toStatus)}</span>
                      <span className="text-ink-600">{formatQuoteDate(event.createdAt)} · {event.actor}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )
      })()}
    </div>
  )
}

export default PortalMyQuotesPage
