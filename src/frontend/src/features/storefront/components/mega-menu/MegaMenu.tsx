import { Link } from 'react-router-dom'
import CategorySidebar from './CategorySidebar'
import CategoryDetailPanel from './CategoryDetailPanel'
import MobileCategoryDrawer from './MobileCategoryDrawer'
import type { MegaMenuView } from './menu-controller'
import type { CategoryMenuStatus, MenuCategory } from '../../types/categoryMenu'

export interface MegaMenuProps {
  status: CategoryMenuStatus
  roots: MenuCategory[]
  selectedRoot: MenuCategory | null
  selectedId: string | null
  view: MegaMenuView
  onSelect: (rootId: string) => void
  onHover: (rootId: string) => void
  onLeave: () => void
  onKeyDown: (key: string) => void
  onOpenDetail: (rootId: string) => void
  onBack: () => void
  onClose: () => void
  onRetry: () => void
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Cerrar menú de categorías"
      className="rounded-control p-1.5 text-ink-400 transition hover:bg-surface-100 hover:text-security-500"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </button>
  )
}

function LoadingBlock() {
  return (
    <div className="flex min-h-0 flex-1">
      <ul
        aria-hidden="true"
        className="hidden w-64 shrink-0 space-y-1 border-r border-surface-200 bg-surface-50 p-3 lg:block"
      >
        {[0, 1, 2, 3, 4, 5, 6].map((row) => (
          <li key={row} className="flex items-center gap-3 px-2 py-1.5">
            <span className="h-8 w-8 shrink-0 animate-pulse rounded-control bg-surface-200" />
            <span className="h-3 flex-1 animate-pulse rounded bg-surface-200" />
          </li>
        ))}
      </ul>
      <div role="status" className="min-w-0 flex-1 space-y-5 overflow-y-auto p-6">
        <span className="sr-only">Cargando categorías…</span>
        <span aria-hidden="true" className="block h-5 w-56 animate-pulse rounded bg-surface-200" />
        <div className="flex items-start gap-6" aria-hidden="true">
          <div className="flex flex-1 flex-wrap gap-2">
            {[0, 1, 2].map((pill) => (
              <span key={pill} className="h-9 w-36 animate-pulse rounded-control bg-surface-100" />
            ))}
          </div>
          <span className="hidden h-[210px] w-[280px] shrink-0 animate-pulse rounded-card bg-surface-200 lg:block" />
        </div>
      </div>
    </div>
  )
}

function ErrorBlock({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 p-6">
      <p className="text-sm font-semibold text-ink-700">No pudimos cargar las categorías</p>
      <p className="text-sm text-ink-500">Revisa tu conexión e inténtalo de nuevo.</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-control bg-security-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-security-600"
      >
        Reintentar
      </button>
    </div>
  )
}

/**
 * Shell of the loading and error states. It is rendered once (not once per
 * responsive variant) so the live region of the state is announced a single
 * time, and it adapts to the panel on desktop and to the drawer on mobile.
 */
function StatusShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white lg:mx-auto lg:h-auto lg:max-w-6xl lg:max-h-[70vh] lg:overflow-hidden lg:rounded-panel lg:border lg:border-surface-200 lg:shadow-2xl">
      <div className="flex items-center justify-end border-b border-surface-200 px-3 py-2">
        <CloseButton onClose={onClose} />
      </div>
      {children}
    </div>
  )
}

function EmptyBlock({ onClose }: { onClose: () => void }) {
  return (
    <p className="text-sm text-ink-500">
      Todavía no hay categorías para mostrar.{' '}
      <Link to="/catalogo" onClick={onClose} className="font-bold text-security-500 hover:text-security-600">
        Ver todo el catálogo
      </Link>
    </p>
  )
}

/**
 * Presentational mega menu: a desktop panel (sidebar of roots with photos + title,
 * "Ver todo", subcategory pills and one large photo) and the mobile drawer. Both variants are
 * always rendered and only one is displayed, through the `lg` breakpoint, so
 * the layout is pure CSS with no viewport state in JavaScript.
 */
export default function MegaMenu({
  status,
  roots,
  selectedRoot,
  selectedId,
  view,
  onSelect,
  onHover,
  onLeave,
  onKeyDown,
  onOpenDetail,
  onBack,
  onClose,
  onRetry,
}: MegaMenuProps) {
  if (status !== 'ready') {
    return (
      <StatusShell onClose={onClose}>
        {status === 'loading' ? <LoadingBlock /> : <ErrorBlock onRetry={onRetry} />}
      </StatusShell>
    )
  }

  return (
    <>
      <div className="hidden lg:mx-auto lg:flex lg:max-h-[70vh] lg:w-full lg:max-w-6xl lg:flex-col lg:overflow-hidden lg:rounded-panel lg:border lg:border-surface-200 lg:bg-white lg:shadow-2xl">
        <div className="flex min-h-0 flex-1">
          <CategorySidebar
            roots={roots}
            selectedId={selectedId}
            onSelect={onSelect}
            onHover={onHover}
            onLeave={onLeave}
            onKeyDown={onKeyDown}
            onNavigate={onClose}
          />
          {selectedRoot === null ? (
            <div className="min-w-0 flex-1 space-y-4 overflow-y-auto p-6">
              <div className="flex justify-end">
                <CloseButton onClose={onClose} />
              </div>
              <EmptyBlock onClose={onClose} />
            </div>
          ) : (
            <CategoryDetailPanel
              root={selectedRoot}
              onNavigate={onClose}
              closeButton={<CloseButton onClose={onClose} />}
            />
          )}
        </div>
      </div>
      <MobileCategoryDrawer
        roots={roots}
        selectedRoot={selectedRoot}
        view={view}
        onOpenDetail={onOpenDetail}
        onBack={onBack}
        onClose={onClose}
        onNavigate={onClose}
      />
    </>
  )
}
