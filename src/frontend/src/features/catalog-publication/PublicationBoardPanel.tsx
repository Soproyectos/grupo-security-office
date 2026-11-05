import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert } from '../../components/ui'
import { getApiErrorMessage } from '../../lib/apiError'
import { fetchBoard } from './publication-api'
import './library-publication.css'
import {
  BOARD_VIEWS,
  describeBoardItem,
  offeredAction,
  viewBadge,
  type BoardItem,
  type BoardView,
} from './publication-model'

/** Estado compacto de la revisión de trabajo (lo que el servidor afirmó). */
function ItemState({ item }: { item: BoardItem }) {
  const { schedule, published, validation } = describeBoardItem(item)
  const badge = viewBadge(item.lifecycleStatus === 'PUBLISHED' ? 'publicados' : validation && validation.includes('bloquean') ? 'problemas' : 'pendientes')
  const isPublished = item.lifecycleStatus === 'PUBLISHED'
  const accion = offeredAction(item.lifecycleStatus)
  const hasErrors = Boolean(item.workingRevision?.errorCount)
  return (
    <div className="library-publication__item-state">
      <p>
        <span className={`library-publication__status ${badge.tone}`} data-testid={`item-badge-${item.id}`}>{badge.label}</span>
        {accion === 'retirar' && <span className="text-xs text-neutral-600"> · Visible en la tienda</span>}
      </p>
      {validation && (!isPublished || hasErrors) && <p className="text-neutral-600">{validation}</p>}
      {published && !isPublished && <p className="text-xs text-emerald-700">{published}</p>}
      {schedule && (
        <p className="text-xs text-amber-700" data-testid="schedule-notice">
          {schedule}
        </p>
      )}
    </div>
  )
}

/** The row action says what the person will actually do on the next screen. */
function reviewLabel(view: BoardView, item: BoardItem): string {
  if (view === 'historial') return 'Ver historial'
  if (item.lifecycleStatus === 'PUBLISHED') return 'Ver publicado'
  if (view === 'problemas') return 'Ver problemas'
  return 'Revisar y publicar'
}

/** Presentacional: la bandeja pinta lo que el servidor calculó; no re-valida nada. */
export function PublicationBoardPanel({
  view,
  items,
  total,
  page,
  busy,
  error,
  search,
  onSearch,
  onView,
  onPage,
  returnTo = '/catalog-management/publication',
}: {
  view: BoardView
  items: BoardItem[]
  total: number
  page: number
  busy: boolean
  error: string | null
  search: string
  onSearch: (v: string) => void
  onView: (v: BoardView) => void
  onPage: (p: number) => void
  returnTo?: string
}) {
  return (
    <div className="library-publication__board-panel" data-testid="publication-board">
      <div className="library-publication__toolbar">
        <div className="library-publication__views" role="group" aria-label="Vistas de publicación">
        {BOARD_VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onView(v.id)}
            aria-pressed={view === v.id}
            className={`library-publication__view${view === v.id ? ' is-active' : ''}`}
          >
            {v.label}
          </button>
        ))}
        </div>
        <label className="library-publication__search">
          <span className="sr-only">Buscar producto</span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="SKU o nombre"
            aria-label="Buscar SKU o nombre"
          />
        </label>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {error ? null : busy ? (
        <p className="library-publication__loading" role="status">Cargando productos…</p>
      ) : items.length === 0 ? (
        <p className="library-publication__empty" data-testid="board-empty">No hay productos en esta vista. Prueba otra búsqueda o cambia el filtro.</p>
      ) : (
        <ul className="library-publication__rows">
          {items.map((item) => (
            <li key={item.id} className="library-publication__row" data-testid={`board-item-${item.id}`}>
              <div className="library-publication__identity">
                <h3>{item.name}</h3>
                <p><span className="library-publication__sku">{item.sku}</span>{item.category ? <span> · {item.category}</span> : null}</p>
              </div>
              <ItemState item={item} />
              <Link
                to={`/catalog-management/publication/products/${item.id}`}
                state={{ from: returnTo }}
                className="library-publication__review-link"
                aria-label={`${reviewLabel(view, item)}: ${item.name}`}
              >
                {reviewLabel(view, item)}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="library-publication__pagination">
        <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>
          Anterior
        </button>
        <span>Página {page + 1} · {total} productos</span>
        <button type="button" disabled={(page + 1) * 50 >= total} onClick={() => onPage(page + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  )
}

/**
 * Dedicated publication view. Its search and pagination survive a visit to a
 * product through the URL; the server remains the authority for readiness.
 */
export function PublicationBoardSection() {
  const [params, setParams] = useSearchParams()
  const view = BOARD_VIEWS.some((item) => item.id === params.get('view')) ? params.get('view') as BoardView : 'pendientes'
  const search = params.get('search') ?? ''
  const requestedPage = Number(params.get('page') ?? 0)
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0
  const update = (key: string, value: string) => setParams((current) => {
    const next = new URLSearchParams(current)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    return next
  }, { replace: true })
  const query = useQuery({
    queryKey: ['publication-board', view, search, page],
    queryFn: () => fetchBoard(view, { search: search || undefined, page }),
    refetchOnWindowFocus: false,
  })

  return (
    <section className="library-publication library-publication--board" aria-label="Bandeja de publicación">
          <PublicationBoardPanel
            view={view}
            items={query.data?.items ?? []}
            total={query.data?.total ?? 0}
            page={page}
            busy={query.isFetching}
            error={query.isError ? getApiErrorMessage(query.error, 'No se pudieron cargar los productos. Intenta de nuevo.') : null}
            search={search}
            onSearch={(value) => update('search', value)}
            onView={(value) => update('view', value)}
            onPage={(value) => update('page', value > 0 ? String(value) : '')}
            returnTo={`/catalog-management/publication${params.size ? `?${params}` : ''}`}
          />
      {query.isError && <button type="button" onClick={() => void query.refetch()} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700">Reintentar</button>}
    </section>
  )
}
