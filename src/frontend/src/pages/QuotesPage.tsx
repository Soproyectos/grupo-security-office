import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Table } from '../components/ui'
import { SearchFilterBar } from '../components/filters/SearchFilterBar'
import QuoteStatusBadge from '../features/quotes/components/QuoteStatusBadge'
import QuoteBuilderModal from '../features/quotes/components/QuoteBuilderModal'
import { useQuotes } from '../features/quotes/hooks/useQuotes'
import { useQuoteBuilderStore } from '../features/quotes/store/quote-builder.store'
import { formatMoney } from '../features/quotes/lib/money'
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  type QuoteFilters,
  type QuoteListItem,
  type QuoteStatus,
} from '../features/quotes/types/quote.types'

const PAGE_SIZE = 20

export default function QuotesPage() {
  const navigate = useNavigate()
  const openBuilder = useQuoteBuilderStore((s) => s.open)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | undefined>()
  const [page, setPage] = useState(1)

  const filters: QuoteFilters = useMemo(
    () => ({ search: search || undefined, status: statusFilter }),
    [search, statusFilter]
  )

  const { quotes, total, totalPages, isLoading, error } = useQuotes({
    filters,
    page,
    pageSize: PAGE_SIZE,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-condensed font-semibold text-neutral-800">
            Cotizaciones
          </h1>
          <p className="text-sm text-neutral-500">
            {total} cotizaci{total === 1 ? 'ón' : 'ones'} en tu alcance
          </p>
        </div>
        <Button type="button" onClick={openBuilder}>
          Nueva cotización
        </Button>
      </div>

      <SearchFilterBar
        search={{
          value: search,
          onChange: (v) => {
            setSearch(v)
            setPage(1)
          },
          placeholder: 'Buscar por código o cliente',
          ariaLabel: 'Buscar cotizaciones',
        }}
        activeFilterCount={statusFilter ? 1 : 0}
        activeFilterChips={
          statusFilter
            ? [
                {
                  id: 'status',
                  label: `Estado: ${QUOTE_STATUS_LABELS[statusFilter]}`,
                  onRemove: () => setStatusFilter(undefined),
                },
              ]
            : []
        }
        onClearFilters={() => setStatusFilter(undefined)}
      />

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filtrar por estado"
      >
        <button
          type="button"
          onClick={() => {
            setStatusFilter(undefined)
            setPage(1)
          }}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
            !statusFilter
              ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]'
              : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          Todas
        </button>
        {QUOTE_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => {
              setStatusFilter(status)
              setPage(1)
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
              statusFilter === status
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg-subtle)] text-[var(--color-primary)]'
                : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {QUOTE_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-[var(--color-error)]" role="alert">
          No se pudieron cargar las cotizaciones. Intenta de nuevo.
        </p>
      )}

      <Table
        columns={[
          {
            key: 'code',
            header: 'Código',
            render: (q: QuoteListItem) => (
              <span className="font-mono text-xs text-neutral-500">
                {q.code}
              </span>
            ),
          },
          {
            key: 'customer',
            header: 'Cliente',
            render: (q: QuoteListItem) => (
              <span className="font-medium text-neutral-800">
                {q.customer?.name ?? '—'}
              </span>
            ),
          },
          {
            key: 'items',
            header: 'Ítems',
            render: (q: QuoteListItem) => q._count?.items ?? 0,
          },
          {
            key: 'total',
            header: 'Total',
            render: (q: QuoteListItem) => (
              <span className="font-medium">
                {formatMoney(q.total, q.currency)}
              </span>
            ),
          },
          {
            key: 'validUntil',
            header: 'Vigente hasta',
            render: (q: QuoteListItem) =>
              q.validUntil
                ? new Date(q.validUntil).toLocaleDateString('es-CO')
                : '—',
          },
          {
            key: 'status',
            header: 'Estado',
            render: (q: QuoteListItem) => (
              <QuoteStatusBadge status={q.status} />
            ),
          },
        ]}
        data={quotes}
        isLoading={isLoading}
        emptyMessage="No hay cotizaciones con estos filtros"
        keyExtractor={(q: QuoteListItem) => q.id}
        onRowClick={(q) => navigate(`/commercial/quotes/${q.id}`)}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <QuoteBuilderModal />
    </div>
  )
}
