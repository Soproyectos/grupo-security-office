import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert } from '../../components/ui'
import { getApiErrorMessage } from '../../lib/apiError'
import { fetchBoard } from './publication-api'
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
  const accion = offeredAction(item.lifecycleStatus)
  return (
    <div className="space-y-1 text-sm">
      <p>
        <span className={`font-medium ${badge.tone}`} data-testid={`item-badge-${item.id}`}>{badge.label}</span>
        {accion && <span className="text-xs text-neutral-500"> · la acción disponible la confirma el servidor (publicar/retirar por sus endpoints)</span>}
      </p>
      {validation && <p className="text-neutral-600">{validation}</p>}
      {published && <p className="text-xs text-emerald-700">{published}</p>}
      {schedule && (
        <p className="text-xs text-amber-700" data-testid="schedule-notice">
          {schedule}
        </p>
      )}
    </div>
  )
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
}) {
  return (
    <div className="space-y-3" data-testid="publication-board">
      <div className="flex flex-wrap items-center gap-2">
        {BOARD_VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onView(v.id)}
            className={`px-3 py-1.5 text-sm rounded-lg border ${view === v.id ? 'bg-security-700 text-white border-security-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
          >
            {v.label}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar SKU o nombre…"
          aria-label="Buscar en la bandeja"
          className="ml-auto px-3 py-1.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-focus-ring)]"
        />
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {busy ? (
        <p className="text-sm text-neutral-400">Cargando bandeja…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-400" data-testid="board-empty">Nada en esta vista para tu alcance.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="border border-neutral-200 rounded-lg p-3" data-testid={`board-item-${item.id}`}>
              <p className="text-sm font-medium text-neutral-800">
                {item.name} <span className="text-xs text-neutral-500">({item.sku})</span>
                {item.category ? <span className="text-xs text-neutral-400"> · {item.category}</span> : null}
              </p>
              {view === 'historial' ? (
                <p className="text-xs text-neutral-500">Ver el detalle del producto para su historia completa.</p>
              ) : (
                <ItemState item={item} />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3 text-xs text-neutral-500">
        <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} className="px-2 py-1 rounded border border-neutral-200 disabled:opacity-40">
          Anterior
        </button>
        <span>Página {page + 1} · {total} en total</span>
        <button type="button" disabled={(page + 1) * 50 >= total} onClick={() => onPage(page + 1)} className="px-2 py-1 rounded border border-neutral-200 disabled:opacity-40">
          Siguiente
        </button>
      </div>
    </div>
  )
}

/**
 * Contenedor conectado (CAT-06 `frontend`): la bandeja vive en ProductsPage como
 * sección plegable; las acciones (publicar/retirar/programar) siguen por los
 * endpoints existentes de la ficha/Lista — el servidor decide y re-valida.
 */
export function PublicationBoardSection() {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<BoardView>('pendientes')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const query = useQuery({
    queryKey: ['publication-board', view, search, page],
    queryFn: () => fetchBoard(view, { search: search || undefined, page }),
    enabled: open,
    refetchOnWindowFocus: false,
  })

  return (
    <section className="border border-neutral-200 rounded-xl" aria-label="Bandeja de publicación">
      <button type="button" className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-neutral-700" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Bandeja de publicación
        <span className="text-neutral-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {query.isError && (
            <Alert variant="error">
              {getApiErrorMessage(query.error, 'No se pudo cargar la bandeja (¿tienes acceso a alguna Lista?).')}
            </Alert>
          )}
          <PublicationBoardPanel
            view={view}
            items={query.data?.items ?? []}
            total={query.data?.total ?? 0}
            page={page}
            busy={query.isFetching}
            error={null}
            search={search}
            onSearch={(v) => {
              setSearch(v)
              setPage(0)
            }}
            onView={(v) => {
              setView(v)
              setPage(0)
            }}
            onPage={setPage}
          />
        </div>
      )}
    </section>
  )
}
