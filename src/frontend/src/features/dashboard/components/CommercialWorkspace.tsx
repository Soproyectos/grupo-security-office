import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, Badge } from '../../../components/ui'
import { useAuthStore } from '../../../stores/auth.store'
import { fetchQuotes } from '../../../services/quotes.service'
import { QUOTE_STATUS_LABELS } from '../../../features/quotes/types/quote.types'
import type {
  QuoteStatus,
  QuoteEffectiveStatus,
  QuoteListItem,
} from '../../../features/quotes/types/quote.types'
import type {
  MyWorkspace,
  MyListaSummary,
  MyActivityEntry,
} from '../../../services/dashboard.service'

const numberFormatter = new Intl.NumberFormat('es-CO')
const formatNumber = (value: number) => numberFormatter.format(value)

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Bogota',
})
const formatDate = (iso: string) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date)
}

/**
 * Etiquetas de los niveles de acceso por Lista. Espejo de LEVEL_RANK en
 * backend/src/common/acl/acl.service.ts. El alias legacy 'edit' se normaliza
 * server-side a 'edit_products', pero se contempla por defensa.
 */
const LEVEL_LABEL: Record<string, string> = {
  view: 'Solo lectura',
  view_prices: 'Ve precios',
  edit_prices: 'Edita precios',
  edit_products: 'Edita productos',
  edit: 'Edita productos',
  manage: 'Administra',
  manage_access: 'Administra accesos',
}

const LEVEL_VARIANT: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = {
  view: 'neutral',
  view_prices: 'neutral',
  edit_prices: 'info',
  edit_products: 'info',
  edit: 'info',
  manage: 'success',
  manage_access: 'warning',
}

const ACTION_LABEL: Record<string, string> = {
  CREATE: 'Creó',
  UPDATE: 'Actualizó',
  DELETE: 'Eliminó',
  PUBLISH: 'Publicó',
  UNPUBLISH: 'Despublicó',
  IMPORT: 'Importó',
  ARCHIVE: 'Archivó',
  RESTORE: 'Restauró',
}

const ENTITY_LABEL: Record<string, string> = {
  Product: 'producto',
  Lista: 'Lista',
  Price: 'precio',
  Assignment: 'acceso',
  User: 'usuario',
  Brand: 'marca',
  Category: 'categoría',
}

/**
 * Etapas del embudo de cotizaciones propio (borrador → enviada → negociación),
 * en el orden real del ciclo de vida definido en quote.types.ts. 'ganada',
 * 'perdida' y 'cancelada' son estados de cierre y se muestran aparte.
 * 'vencida' es un estado calculado por el backend al leer y no es filtrable
 * por status en GET /commercial/quotes, así que no entra en este conteo.
 */
const FUNNEL_STATUSES: QuoteStatus[] = ['borrador', 'enviada', 'negociacion']
const CLOSED_STATUSES: QuoteStatus[] = ['ganada', 'perdida', 'cancelada']
const ALL_COUNTED_STATUSES: QuoteStatus[] = [...FUNNEL_STATUSES, ...CLOSED_STATUSES]

/** Rampa ordinal de una sola familia de color (la del brand), no de estado. */
const FUNNEL_STAGE_COLOR: Record<string, string> = {
  borrador: 'bg-security-300',
  enviada: 'bg-security-400',
  negociacion: 'bg-security-500',
}

const QUOTE_STATUS_VARIANT: Record<QuoteEffectiveStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  borrador: 'neutral',
  enviada: 'info',
  negociacion: 'warning',
  ganada: 'success',
  perdida: 'error',
  cancelada: 'neutral',
  vencida: 'error',
}

const moneyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})
/** El monto llega como string (Decimal serializado); nunca se hace aritmética con él, solo formato. */
function formatMoney(value: string, currency = 'COP'): string {
  const amount = Number(value)
  if (Number.isNaN(amount)) return '—'
  if (currency === 'COP') return moneyFormatter.format(amount)
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${numberFormatter.format(Math.round(amount))} ${currency}`
  }
}

function KpiTile({
  label,
  value,
  variant,
  hint,
}: {
  label: string
  value: number
  variant: 'primary' | 'info' | 'success' | 'warning'
  hint?: string
}) {
  return (
    <Card variant={variant} padding="md" className="h-full">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">
        {formatNumber(value)}
      </p>
      {hint && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{hint}</p>}
    </Card>
  )
}

function ListaTile({ lista }: { lista: MyListaSummary }) {
  const level = lista.level ?? 'view'
  return (
    <Link to={`/commercial/lists/${lista.id}`} className="block h-full">
      <Card hover padding="md" className="h-full flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
              {lista.code}
            </p>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
              {lista.name}
            </h3>
          </div>
          {lista.isResponsible && (
            <Badge variant="success" className="shrink-0">
              Responsable
            </Badge>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="text-xs text-[var(--color-text-secondary)]">
            {formatNumber(lista.productCount)}{' '}
            {lista.productCount === 1 ? 'producto' : 'productos'}
          </span>
          <Badge variant={LEVEL_VARIANT[level] ?? 'neutral'}>
            {LEVEL_LABEL[level] ?? level}
          </Badge>
        </div>
      </Card>
    </Link>
  )
}

function ActivityRow({ entry }: { entry: MyActivityEntry }) {
  const action = ACTION_LABEL[entry.action] ?? entry.action
  const entity = ENTITY_LABEL[entry.entity] ?? entry.entity
  const failed = entry.result === 'ERROR'
  return (
    <li className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-sm text-[var(--color-text-primary)] truncate">
          {action} {entity}
        </p>
        <p className="text-[10px] font-mono text-[var(--color-text-tertiary)] mt-0.5 truncate">
          {entry.entityId}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {failed && <Badge variant="error">Error</Badge>}
        <span className="text-xs text-[var(--color-text-secondary)]">
          {formatDate(entry.createdAt)}
        </span>
      </div>
    </li>
  )
}

export function CommercialWorkspaceSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] animate-pulse"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] animate-pulse"
          />
        ))}
      </div>
    </div>
  )
}

export default function CommercialWorkspace({
  workspace,
  userName,
}: {
  workspace: MyWorkspace
  userName: string
}) {
  const { kpis, listas, recentActivity } = workspace
  const hasListas = listas.length > 0
  const user = useAuthStore((state) => state.user)

  const quoteCountsQuery = useQuery({
    queryKey: ['dashboard', 'quotes-counts', user?.id],
    queryFn: async () => {
      const entries = await Promise.all(
        ALL_COUNTED_STATUSES.map(async (status) => {
          const res = await fetchQuotes({ ownerId: user!.id, status }, 1, 1)
          return [status, res.meta.total] as const
        })
      )
      const counts = {} as Record<QuoteStatus, number>
      entries.forEach(([status, total]) => {
        counts[status] = total
      })
      return counts
    },
    enabled: !!user?.id,
  })

  const recentQuotesQuery = useQuery({
    queryKey: ['dashboard', 'quotes-recent', user?.id],
    queryFn: () => fetchQuotes({ ownerId: user!.id }, 1, 5),
    enabled: !!user?.id,
  })

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] border-t-4 border-t-[var(--color-primary)] rounded-xl p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          Mi espacio de trabajo
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          {userName} · Listas y productos bajo tu responsabilidad
        </p>
      </div>

      <section aria-label="Mis indicadores">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">
          Mis indicadores
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiTile label="Mis Listas" value={kpis.listas} variant="info" />
          <KpiTile label="Mis productos" value={kpis.products} variant="primary" />
          <KpiTile
            label="Sin publicar"
            value={kpis.pendingPublication}
            variant="warning"
          />
          <KpiTile
            label="Mi actividad"
            value={kpis.recentActivity}
            variant="success"
            hint="Últimos 30 días"
          />
        </div>
      </section>

      <section aria-label="Mis Listas">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            Mis Listas
          </h2>
          <Link
            to="/commercial/lists"
            className="text-sm text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium"
          >
            Ver todas →
          </Link>
        </div>
        {!hasListas ? (
          <Card padding="lg">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Todavía no tienes Listas asignadas. Un Administrador Comercial debe
              asignarte acceso para que aparezcan aquí.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listas.map((lista) => (
              <ListaTile key={lista.id} lista={lista} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Mis cotizaciones por estado">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            Mis cotizaciones por estado
          </h2>
          <Link
            to="/commercial/quotes"
            className="text-sm text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium"
          >
            Ver todas →
          </Link>
        </div>
        {quoteCountsQuery.error ? (
          <div className="p-4 bg-[var(--color-error-bg-subtle)] text-[var(--color-error)] rounded-xl border border-[var(--color-error)]/20" role="alert">
            <p>Error al cargar tus cotizaciones. Intente más tarde.</p>
          </div>
        ) : (
          <Card padding="md">
            <div className="grid grid-cols-3 gap-3">
              {FUNNEL_STATUSES.map((status) => (
                <div key={status} className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${FUNNEL_STAGE_COLOR[status]}`}
                    aria-hidden="true"
                  ></span>
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--color-text-secondary)] truncate">
                      {QUOTE_STATUS_LABELS[status]}
                    </p>
                    <p className="text-lg font-bold font-condensed text-[var(--color-text-primary)]">
                      {quoteCountsQuery.isLoading ? '—' : formatNumber(quoteCountsQuery.data?.[status] ?? 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex flex-wrap items-center gap-2">
              {CLOSED_STATUSES.map((status) => (
                <Badge key={status} variant={QUOTE_STATUS_VARIANT[status]}>
                  {QUOTE_STATUS_LABELS[status]}: {quoteCountsQuery.isLoading ? '—' : formatNumber(quoteCountsQuery.data?.[status] ?? 0)}
                </Badge>
              ))}
            </div>
          </Card>
        )}
      </section>

      <section aria-label="Mis cotizaciones recientes">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            Mis cotizaciones recientes
          </h2>
          <Link
            to="/commercial/quotes"
            className="text-sm text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium"
          >
            Ver todas →
          </Link>
        </div>
        {recentQuotesQuery.error ? (
          <div className="p-4 bg-[var(--color-error-bg-subtle)] text-[var(--color-error)] rounded-xl border border-[var(--color-error)]/20" role="alert">
            <p>Error al cargar tus cotizaciones recientes. Intente más tarde.</p>
          </div>
        ) : recentQuotesQuery.isLoading ? (
          <Card padding="none">
            <ul className="divide-y divide-[var(--color-border)]">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="flex items-center justify-between gap-4 p-4 animate-pulse">
                  <div className="space-y-2 flex-1">
                    <div className="h-3 bg-[var(--color-border)] rounded w-1/3"></div>
                    <div className="h-3 bg-[var(--color-border)] rounded w-2/3"></div>
                  </div>
                  <div className="h-6 w-20 bg-[var(--color-border)] rounded-full"></div>
                </li>
              ))}
            </ul>
          </Card>
        ) : !recentQuotesQuery.data || recentQuotesQuery.data.data.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Todavía no tienes cotizaciones. Créala desde el catálogo o desde una Lista.
            </p>
          </Card>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-[var(--color-border)]">
              {recentQuotesQuery.data.data.map((quote: QuoteListItem) => (
                <li key={quote.id}>
                  <Link
                    to={`/commercial/quotes/${quote.id}`}
                    className="flex items-center justify-between gap-4 p-4 hover:bg-[var(--color-bg-surface-hover)] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono text-[var(--color-text-tertiary)]">{quote.code}</p>
                      <p className="text-sm text-[var(--color-text-primary)] truncate">
                        {quote.customer?.name ?? 'Cliente sin nombre'}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                        {formatMoney(quote.total, quote.currency)}
                      </p>
                    </div>
                    <Badge variant={QUOTE_STATUS_VARIANT[quote.status]} className="shrink-0">
                      {QUOTE_STATUS_LABELS[quote.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-label="Mi actividad reciente">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">
          Mi actividad reciente
        </h2>
        {recentActivity.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Sin actividad registrada todavía.
            </p>
          </Card>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-[var(--color-border)]">
              {recentActivity.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}
