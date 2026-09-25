import { Link } from 'react-router-dom'
import { categoryHref } from './menu-model'
import { CategoryIcon } from './CategorySidebar'
import type { MegaMenuView } from './menu-controller'
import type { MenuCategory } from '../../types/categoryMenu'

export interface MobileCategoryDrawerProps {
  roots: MenuCategory[]
  selectedRoot: MenuCategory | null
  view: MegaMenuView
  onOpenDetail: (rootId: string) => void
  onBack: () => void
  onClose: () => void
  onNavigate: () => void
}

function ChevronRight({ className }: { className: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
      className={className}
    >
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
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
  )
}

/**
 * Mobile (< `lg`) variant: a full-screen drawer with a two step drill-down.
 * The roots are listed first and each one opens its columns as a native
 * accordion (`<details>`), so the drill-down needs no extra state machine.
 */
export default function MobileCategoryDrawer({
  roots,
  selectedRoot,
  view,
  onOpenDetail,
  onBack,
  onClose,
  onNavigate,
}: MobileCategoryDrawerProps) {
  if (view === 'detail' && selectedRoot !== null) {
    return (
      <div className="flex h-full flex-col bg-white lg:hidden">
        <div className="flex items-center gap-3 border-b border-surface-200 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 rounded-control px-2 py-1.5 text-sm font-semibold text-security-500"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Volver
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-900">{selectedRoot.name}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar categorías"
            className="rounded-control p-1.5 text-ink-500 transition hover:text-security-500"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <Link
            to={categoryHref(selectedRoot.slug)}
            onClick={onNavigate}
            className="mb-3 block rounded-control bg-security-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-security-600"
          >
            Ver {selectedRoot.name}
          </Link>
          <ul role="list" className="space-y-2">
            {selectedRoot.children.map((child) => (
              <li key={child.id} className="rounded-panel border border-surface-200">
                {child.children.length === 0 ? (
                  <Link
                    to={categoryHref(child.slug)}
                    onClick={onNavigate}
                    className="flex items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-security-500"
                  >
                    <span className="truncate">{child.name}</span>
                    <ChevronRight className="shrink-0" />
                  </Link>
                ) : (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-bold text-security-500 marker:hidden">
                      <Link
                        to={categoryHref(child.slug)}
                        onClick={onNavigate}
                        className="min-w-0 truncate"
                      >
                        {child.name}
                      </Link>
                      <ChevronRight className="shrink-0 transition group-open:rotate-90" />
                    </summary>
                    <ul role="list" className="border-t border-surface-200 px-4 py-2">
                      {child.children.map((leaf) => (
                        <li key={leaf.id}>
                          <Link
                            to={categoryHref(leaf.slug)}
                            onClick={onNavigate}
                            className="block truncate py-2 text-sm text-ink-600"
                          >
                            {leaf.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-white lg:hidden">
      <div className="flex items-center justify-between gap-3 border-b border-surface-200 px-4 py-3">
        <span className="text-sm font-bold text-ink-900">Categorías</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar categorías"
          className="rounded-control p-1.5 text-ink-500 transition hover:text-security-500"
        >
          <CloseIcon />
        </button>
      </div>
      <ul role="list" aria-label="Categorías" className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {roots.map((root) => (
          <li key={root.id} className="border-b border-surface-100 last:border-b-0">
            <button
              type="button"
              onClick={() => onOpenDetail(root.id)}
              className="flex w-full items-center gap-3 py-3 text-left"
            >
              {root.iconUrl ? (
                <CategoryIcon src={root.iconUrl} className="h-6 w-6 shrink-0 text-ink-600" />
              ) : (
                <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full bg-surface-200" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-700">{root.name}</span>
              <ChevronRight className="shrink-0 text-ink-400" />
            </button>
          </li>
        ))}
        <li className="pt-3">
          <Link
            to="/catalogo"
            onClick={onNavigate}
            className="block text-micro font-bold uppercase tracking-wide text-ink-500"
          >
            Ver todo el catálogo
          </Link>
        </li>
      </ul>
    </div>
  )
}
