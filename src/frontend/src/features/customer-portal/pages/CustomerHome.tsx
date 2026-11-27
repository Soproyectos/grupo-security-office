import { Link } from 'react-router-dom'
import { formatCop } from '../../storefront/utils/formatCop'
import { whatsappUrl } from '../../storefront/constants/contact'
import { usePortalQuoteList } from '../../../stores/portal-quote-list.store'
import AccountStateNotice from '../components/AccountStateNotice'
import CommercialTier from '../components/CommercialTier'
import { useMyQuotes } from '../hooks/usePortalQuotes'
import { quoteAccess } from '../utils/quote-access'
import { formatQuoteDate, quoteStatusLabel } from '../utils/quote-labels'
import type { PortalAccount } from '../types/customer-portal.types'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
const PRIMARY = `inline-flex min-h-11 items-center justify-center rounded-control bg-security-600 px-5 text-sm font-bold !text-white hover:bg-security-500 ${FOCUS}`
const SECONDARY = `inline-flex min-h-11 items-center justify-center rounded-control border border-security-600 px-4 text-sm font-semibold !text-security-600 hover:bg-security-50 ${FOCUS}`
const TEXT_LINK = `inline-flex min-h-11 items-center text-sm font-semibold !text-security-600 hover:underline ${FOCUS}`
const RECENT_QUOTES = 3

function productsText(count: number) {
  return count === 1 ? '1 producto' : `${count} productos`
}

/** Who looks after the company and how to reach them. Only the name is known to the customer. */
function AdvisorPanel({ account }: { account: PortalAccount }) {
  const advisor = account.advisor?.name
  const message = advisor
    ? `Hola, soy ${account.contactName} de ${account.companyName}. Mi asesor es ${advisor}.`
    : `Hola, soy ${account.contactName} de ${account.companyName}. Quisiera hablar con un asesor.`
  return (
    <section className="rounded-card border border-surface-200 bg-white p-4">
      <h2 className="text-lg font-semibold">Tu asesor</h2>
      {advisor ? (
        <>
          <p className="mt-1 break-words text-base font-semibold text-ink-900">{advisor}</p>
          <p className="mt-1 text-sm text-ink-600">Te ayuda con los precios, el stock y el envío de tus cotizaciones.</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-ink-600">Un asesor se hará cargo de tu cuenta pronto. Si tienes prisa, escríbenos.</p>
      )}
      <a href={whatsappUrl(message)} target="_blank" rel="noreferrer noopener" className={`${SECONDARY} mt-3 w-full`}>
        Escribir por WhatsApp
      </a>
      <p className="mt-2 text-sm text-ink-600">Se abre WhatsApp con el equipo de Grupo Security.</p>
    </section>
  )
}

/** Where the person left off: the quote being built, or the next step if it is empty. */
function QuoteDraftSummary({ account }: { account: PortalAccount }) {
  const { count } = usePortalQuoteList(account.id)
  const advisor = account.advisor?.name
  return (
    <section className="rounded-card border border-surface-200 bg-white p-4">
      {count > 0 ? (
        <>
          <h2 className="text-lg font-semibold">Tienes {productsText(count)} en tu cotización</h2>
          <p className="mt-1 max-w-prose text-sm text-ink-600">Revisa las cantidades y envíala{advisor ? ` a ${advisor}` : ' a tu asesor'}.</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4">
            <Link to="/clientes/cotizacion" className={PRIMARY}>Revisar mi cotización</Link>
            <Link to="/catalogo" className={TEXT_LINK}>Seguir viendo el catálogo</Link>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold">Tu cotización está vacía</h2>
          <p className="mt-1 max-w-prose text-sm text-ink-600">Busca productos en el catálogo, agrégalos y envíalos a tu asesor para que confirme stock y envío.</p>
          <div className="mt-3"><Link to="/catalogo" className={PRIMARY}>Ir al catálogo</Link></div>
        </>
      )}
    </section>
  )
}

/** The last quotes sent, with their status; the full list lives in "Mis cotizaciones". */
function RecentQuotes() {
  const quotes = useMyQuotes()
  if (quotes.isPending) {
    return (
      <div role="status" className="space-y-2">
        <span className="sr-only">Cargando tus cotizaciones…</span>
        <div aria-hidden="true" className="h-16 animate-pulse rounded-card bg-surface-200" />
        <div aria-hidden="true" className="h-16 animate-pulse rounded-card bg-surface-200" />
      </div>
    )
  }
  if (quotes.isError) {
    return (
      <section role="alert" className="rounded-card border border-surface-200 bg-white p-4">
        <p className="text-sm text-ink-900">No pudimos cargar tus últimas cotizaciones. Revisa tu conexión e inténtalo de nuevo.</p>
        <button type="button" onClick={() => void quotes.refetch()} className={`${SECONDARY} mt-3`}>Intentar de nuevo</button>
      </section>
    )
  }
  if (quotes.data.length === 0) return null
  return (
    <section aria-label="Últimas cotizaciones" className="rounded-card border border-surface-200 bg-white">
      <h2 className="px-4 pt-4 text-lg font-semibold">Tus últimas cotizaciones</h2>
      <ul className="mt-2 divide-y divide-surface-200">
        {quotes.data.slice(0, RECENT_QUOTES).map((quote) => (
          <li key={quote.id}>
            <Link to={`/clientes/cotizaciones/${quote.id}`} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-100 ${FOCUS}`}>
              <span className="min-w-0">
                <span className="block font-semibold !text-storefront-ink">{quote.code}</span>
                <span className="block text-sm text-ink-600">{formatQuoteDate(quote.issuedAt ?? quote.createdAt)} · {productsText(quote.itemCount)}</span>
              </span>
              <span className="flex flex-col items-start gap-1 sm:items-end">
                <span className="inline-flex rounded-full bg-surface-100 px-3 py-1 text-sm font-semibold text-ink-900">{quoteStatusLabel(quote.status)}</span>
                <span className="font-condensed text-lg font-bold tabular-nums !text-storefront-ink">{formatCop(quote.total)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-surface-200 px-4"><Link to="/clientes/cotizaciones" className={TEXT_LINK}>Ver todas mis cotizaciones</Link></div>
    </section>
  )
}

/** "Inicio" of the portal: account state, the advisor, the quote in progress and the latest quotes. */
export default function CustomerHome({ account }: { account: PortalAccount }) {
  const access = quoteAccess(account)
  const canQuote = access === 'ready' && account.state === 'ACTIVE'
  return (
    <div className="space-y-4 py-2">
      <header>
        <h1 className="font-condensed text-3xl font-semibold">Bienvenido, {account.contactName || 'cliente'}</h1>
        <p className="mt-1 break-words text-ink-600">{account.companyName}</p>
      </header>
      {access !== 'ready' && <AccountStateNotice account={account} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-4">
          {canQuote ? (
            <>
              <QuoteDraftSummary account={account} />
              <RecentQuotes />
            </>
          ) : (
            <section className="rounded-card border border-surface-200 bg-white p-4">
              <h2 className="text-lg font-semibold">Mientras tanto, mira el catálogo</h2>
              <p className="mt-1 max-w-prose text-sm text-ink-600">Encuentra los productos disponibles. Cuando tu cuenta esté lista verás tus precios aquí mismo.</p>
              <div className="mt-3"><Link to="/catalogo" className={PRIMARY}>Ir al catálogo</Link></div>
            </section>
          )}
        </div>
        <div className="space-y-4">
          <AdvisorPanel account={account} />
          {canQuote && <CommercialTier account={account} />}
        </div>
      </div>
    </div>
  )
}
