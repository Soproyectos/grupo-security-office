import SalesWorkspacePreview from './SalesWorkspacePreview'
import SalesGoalCard from './SalesGoalCard'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Card } from '../../components/ui'
import { useAuthStore } from '../../stores/auth.store'
import { fetchCustomers } from '../../services/customers.service'
import { fetchQuotes } from '../../services/quotes.service'
import { formatMoney } from '../quotes/lib/money'
import QuoteStatusBadge from '../quotes/components/QuoteStatusBadge'
import QuoteBuilderModal from '../quotes/components/QuoteBuilderModal'
import { useQuoteBuilderStore } from '../quotes/store/quote-builder.store'

export default function SalesHomePage() {
  const [params] = useSearchParams()
  if (import.meta.env.DEV && params.get('preview') === 'pendientes') return <SalesWorkspacePreview />
  return <SalesHomeContent />
}

function SalesHomeContent() {
  const user = useAuthStore((state) => state.user)
  const openBuilder = useQuoteBuilderStore((state) => state.open)
  const customers = useQuery({
    queryKey: ['sales', 'customers', user?.id],
    queryFn: () => fetchCustomers({ ownerId: user!.id }, 1, 1),
    enabled: !!user?.id,
  })
  const quotes = useQuery({
    queryKey: ['sales', 'quotes', user?.id],
    queryFn: () => fetchQuotes({ ownerId: user!.id }, 1, 5),
    enabled: !!user?.id,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-condensed font-semibold">Mi espacio de ventas</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {user?.name}, aquí están tus clientes y cotizaciones.
          </p>
        </div>
        <Button type="button" onClick={openBuilder}>Nueva cotización</Button>
      </div>
      <SalesGoalCard />
      <section aria-label="Mis indicadores" className="grid gap-4 sm:grid-cols-2">
        {[
          { title: 'Mis clientes', query: customers, to: '/sales/customers' },
          { title: 'Mis cotizaciones', query: quotes, to: '/sales/quotes' },
        ].map(({ title, query, to }) => (
          <Link key={to} to={to}>
            <Card hover padding="md">
              <h2 className="font-medium">{title}</h2>
              <p className="mt-2 text-xl font-semibold">
                {query.isPending ? 'Cargando…' : query.isError ? 'No disponible' : query.data?.meta.total}
              </p>
            </Card>
          </Link>
        ))}
      </section>
      <section aria-labelledby="recent-quotes">
        <h2 id="recent-quotes" className="mb-3 text-lg font-semibold">Mis cotizaciones recientes</h2>
        {quotes.isError ? (
          <p role="alert">No se pudieron cargar tus cotizaciones.
            <button type="button" onClick={() => void quotes.refetch()} className="ml-2 underline">Reintentar</button>
          </p>
        ) : quotes.isPending ? <p aria-busy="true">Cargando tus cotizaciones…</p>
          : !quotes.data?.data.length ? (
            <Card><p>Tu primera cotización empieza con un cliente y una tarifa autorizada.</p>
              <Link to="/sales/customers" className="mt-2 inline-block text-[var(--color-primary)]">Gestionar mis clientes</Link>
            </Card>
          ) : (
            <Card padding="none">
              <ul className="divide-y divide-[var(--color-border)]">
                {quotes.data.data.map(quote => (
                  <li key={quote.id}>
                    <Link to={`/sales/quotes/${quote.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div><p className="font-medium">{quote.customer?.name ?? quote.code}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">{quote.code}</p></div>
                      <div className="flex items-center gap-3">
                        <span>{formatMoney(quote.total, quote.currency)}</span>
                        <QuoteStatusBadge status={quote.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
      </section>
      <QuoteBuilderModal quotesPath="/sales/quotes" ownerId={user?.id} />
    </div>
  )
}
