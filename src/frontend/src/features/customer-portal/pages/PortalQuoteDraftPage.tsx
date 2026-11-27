import { useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { resolveAssetUrl } from '../../../services/api'
import ProductImageStage, { PRODUCT_STAGE_BORDER } from '../../storefront/components/ProductImageStage'
import QuantityStepper from '../../storefront/components/QuantityStepper'
import { productHref } from '../../storefront/components/mega-menu/menu-model'
import { useAssignedProductPrices } from '../../storefront/hooks/useAssignedProductPrices'
import { formatCop } from '../../storefront/utils/formatCop'
import { usePortalQuoteList, type QuoteListItem } from '../../../stores/portal-quote-list.store'
import AccountStateNotice from '../components/AccountStateNotice'
import { quoteAccess } from '../utils/quote-access'
import { useSendPortalQuote } from '../hooks/usePortalQuotes'
import { quoteServerMessage } from '../utils/quote-labels'
import type { PortalAccount } from '../types/customer-portal.types'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
export const NOTES_MAX = 1000
export const ESTIMATE_CAPTION = 'Valor estimado con tu tarifa; tu asesor confirma stock y envío'
export const PRICE_PENDING = 'Precio por confirmar'

function Thumb({ item }: { item: QuoteListItem }) {
  const src = item.imageUrl ? resolveAssetUrl(item.imageUrl) : null
  return <ProductImageStage src={src} sizeClass="h-16 w-16" padding="p-1" className={`rounded-control border ${PRODUCT_STAGE_BORDER}`} />
}

/** "Mi cotización": the list the client built in the store, reviewed before sending it to the advisor. */
export default function PortalQuoteDraftPage() {
  const account = useOutletContext<PortalAccount>()
  const navigate = useNavigate()
  const list = usePortalQuoteList(account.id)
  const prices = useAssignedProductPrices(list.items.map((item) => item.productId))
  const send = useSendPortalQuote()
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const access = quoteAccess(account)

  if (access !== 'ready') {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-4">
        <h1 className="font-condensed text-3xl font-semibold">Mi cotización</h1>
        <AccountStateNotice account={account} />
        <Link to="/catalogo" className={`inline-flex min-h-11 items-center text-sm font-semibold !text-security-600 hover:underline ${FOCUS}`}>Ver el catálogo</Link>
      </div>
    )
  }

  if (list.items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-4">
        <h1 className="font-condensed text-3xl font-semibold">Mi cotización</h1>
        <section className="rounded-card border border-surface-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Tu cotización está vacía</h2>
          <p className="mt-1 max-w-prose text-sm text-ink-600">Agrega productos desde el catálogo con «Agregar a mi cotización». Aquí revisas las cantidades antes de enviarla a tu asesor.</p>
          <div className="mt-4 flex flex-wrap gap-x-4">
            <Link to="/catalogo" className={`inline-flex min-h-11 items-center rounded-control bg-security-600 px-5 text-sm font-bold !text-white hover:bg-security-500 ${FOCUS}`}>Ir al catálogo</Link>
            <Link to="/clientes/cotizaciones" className={`inline-flex min-h-11 items-center text-sm font-semibold !text-security-600 hover:underline ${FOCUS}`}>Ver mis cotizaciones</Link>
          </div>
        </section>
      </div>
    )
  }

  const lines = list.items.map((item) => ({ item, unit: prices.prices.get(item.productId)?.value ?? null }))
  const pricedTotal = lines.reduce((sum, { item, unit }) => (unit === null ? sum : sum + unit * item.quantity), 0)
  const pendingCount = lines.filter(({ unit }) => unit === null).length
  const busy = send.isPending

  function submit() {
    if (busy) return
    setError('')
    send.mutate(
      { items: list.items.map(({ productId, quantity }) => ({ productId, quantity })), ...(notes.trim() ? { notes: notes.trim() } : {}) },
      {
        onSuccess: (created) => {
          list.clear(account.id)
          navigate(`/clientes/cotizaciones/${created.id}`, { replace: true, state: { sent: true } })
        },
        onError: (cause) => setError(quoteServerMessage(cause)),
      },
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <header>
        <h1 className="font-condensed text-3xl font-semibold">Mi cotización</h1>
        <p className="mt-1 text-sm text-ink-600">Revisa las cantidades y envíala a tu asesor. Los precios salen de tu tarifa.</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <ul aria-label="Productos de tu cotización" className="divide-y divide-surface-200 rounded-card border border-surface-200 bg-white">
          {lines.map(({ item, unit }) => (
            <li key={item.productId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Thumb item={item} />
                <div className="min-w-0">
                  <Link to={productHref(item.productId)} className={`line-clamp-2 font-semibold !text-storefront-ink hover:underline ${FOCUS}`}>{item.name}</Link>
                  <p className="break-words font-mono text-xs text-ink-500">{item.sku}</p>
                  <p className="mt-1 text-sm text-ink-600">
                    {prices.loading ? 'Buscando tu precio…' : unit === null ? PRICE_PENDING : `${formatCop(unit)} c/u`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                <QuantityStepper value={item.quantity} label={item.name} onChange={(quantity) => list.setQuantity(account.id, item.productId, quantity)} />
                <p className="min-w-24 text-right font-condensed text-lg font-bold tabular-nums">{unit === null ? '' : formatCop(unit * item.quantity)}</p>
                <button type="button" onClick={() => list.remove(account.id, item.productId)} className={`inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold !text-security-600 hover:bg-security-50 ${FOCUS}`}>
                  Quitar<span className="sr-only"> {item.name}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>

        <section aria-label="Resumen de tu cotización" className="space-y-3 rounded-card border border-surface-200 bg-white p-4">
          <div>
            <p className="text-sm font-medium text-ink-600">Valor estimado</p>
            <p className="font-condensed text-3xl font-bold tabular-nums">{formatCop(pricedTotal)}</p>
            <p className="mt-1 text-sm text-ink-600">{ESTIMATE_CAPTION}</p>
            {pendingCount > 0 && !prices.loading && (
              <p className="mt-2 text-sm font-semibold text-ink-900">{pendingCount === 1 ? '1 producto tiene precio por confirmar y no suma al valor.' : `${pendingCount} productos tienen precio por confirmar y no suman al valor.`}</p>
            )}
            {prices.error && <p role="alert" className="mt-2 text-sm text-security-600">No pudimos cargar todos tus precios. Tu asesor los confirmará.</p>}
          </div>
          <label className="block text-sm font-medium">
            Notas para tu asesor (opcional)
            <textarea
              name="notes"
              rows={3}
              maxLength={NOTES_MAX}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`mt-1 w-full rounded-control border border-surface-300 bg-white p-3 text-sm font-normal ${FOCUS}`}
            />
            <span className="text-xs font-normal text-ink-500">{notes.length} de {NOTES_MAX}</span>
          </label>
          {error && <p role="alert" className="rounded-control bg-security-50 p-3 text-sm text-security-600">{error}</p>}
          <button type="button" onClick={submit} disabled={busy} className={`min-h-12 w-full rounded-control bg-security-600 px-4 font-semibold text-white hover:bg-security-500 disabled:opacity-60 ${FOCUS}`}>
            {busy ? 'Enviando…' : 'Enviar a mi asesor'}
          </button>
          <Link to="/catalogo" className={`inline-flex min-h-11 items-center text-sm font-semibold !text-security-600 hover:underline ${FOCUS}`}>Seguir agregando productos</Link>
        </section>
      </div>
    </div>
  )
}
