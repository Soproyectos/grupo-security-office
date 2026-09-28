import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import { useCategoryMenu } from '../hooks/useCategoryMenu'
import type { MenuCategory } from '../types/categoryMenu'
import { CategoryTile } from './CategoryPage'

const NO_ROOTS: MenuCategory[] = []

/**
 * Roots by `sortOrder`. Ties keep the order the backend sent (stable sort), the
 * same rule the category page applies to the children of a category.
 */
function rootsBySortOrder(categories: MenuCategory[]): MenuCategory[] {
  return [...categories].sort((a, b) => a.sortOrder - b.sortOrder)
}

function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BreadcrumbItem({ children }: { children: React.ReactNode }) {
  return <li className="flex items-center gap-1.5">{children}</li>
}

function BreadcrumbSeparator() {
  return (
    <BreadcrumbItem>
      <ChevronRight />
    </BreadcrumbItem>
  )
}

/**
 * Trail of the index: Inicio / Catálogo. The index is the root of the tree, so
 * there is nothing above it to walk up to and `Catálogo` is the current page.
 */
function Breadcrumb() {
  return (
    <nav aria-label="Ruta de navegación">
      <ol role="list" className="flex flex-wrap items-center gap-1.5 text-body-sm text-ink-500">
        <BreadcrumbItem>
          <Link to="/tienda" className="transition hover:text-security-500">
            Inicio
          </Link>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <span aria-current="page" className="font-semibold text-ink-900">
            Catálogo
          </span>
        </BreadcrumbItem>
      </ol>
    </nav>
  )
}

/** Placeholder of the grid of roots, with the shape of the tiles below. */
function CatalogSkeleton() {
  return (
    <div role="status" className="space-y-8">
      <span className="sr-only">Cargando catálogo…</span>
      <div aria-hidden="true" className="space-y-3">
        <span className="block h-3 w-56 max-w-full animate-pulse rounded bg-surface-200" />
        <span className="block h-8 w-72 max-w-full animate-pulse rounded bg-surface-200" />
      </div>
      <div
        aria-hidden="true"
        className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6"
      >
        {[0, 1, 2, 3, 4, 5].map((tile) => (
          <div key={tile} className="flex flex-col items-center gap-3">
            <span className="h-24 w-24 animate-pulse rounded-full bg-surface-200" />
            <span className="h-3 w-20 animate-pulse rounded bg-surface-100" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Shown when the tree could not be loaded. `retry` re-runs the session request
 * of the menu, so the control belongs to this block instead of relying on the
 * header alone.
 */
function CatalogError({ onRetry }: { onRetry: () => void }) {
  return (
    <section role="alert" className="rounded-card border border-surface-200 bg-white p-8 text-center">
      <h1 className="text-2xl font-bold text-ink-900">No pudimos cargar el catálogo</h1>
      <p className="mt-2 text-body-sm text-ink-500">
        Revisa tu conexión e inténtalo de nuevo.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-control bg-security-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-security-600"
      >
        Intentar de nuevo
      </button>
    </section>
  )
}

/** Shown when the menu is ready but the library has no categories yet. */
function CatalogEmpty() {
  return (
    <section className="rounded-card border border-dashed border-surface-300 bg-white p-8 text-center">
      <p className="text-body-sm text-ink-500">
        El catálogo todavía no tiene categorías. Vuelve pronto a ver nuestro inventario.
      </p>
    </section>
  )
}

/**
 * Index of the catalog (`/catalogo`), the destination of the "Ver todo el
 * catálogo" link of the mega menu and the "Volver al catálogo" of a category.
 *
 * The mega menu is a sidebar of *families*, so it only shows the roots with
 * children (see `navigableRoots`): the 35 flat roots of the library import are
 * reachable from here, and every root of the tree is listed, flat or not. It
 * reads the same session store as the header, so arriving costs no request.
 */
export default function CatalogIndexPage() {
  const { status, categories, retry } = useCategoryMenu()

  const roots = useMemo(
    () => (status === 'ready' ? rootsBySortOrder(categories) : NO_ROOTS),
    [categories, status],
  )

  return (
    <StorefrontChrome>
      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-12">
        {status === 'loading' && <CatalogSkeleton />}
        {status === 'error' && <CatalogError onRetry={retry} />}
        {status === 'ready' && (
          <>
            <Breadcrumb />
            <h1 className="mt-4 text-page-title font-bold text-ink-900">Catálogo</h1>
            {roots.length > 0 ? (
              <section aria-labelledby="catalogo-todas-categorias" className="mt-8">
                <h2 id="catalogo-todas-categorias" className="text-eyebrow uppercase text-ink-500">
                  Todas las categorías
                </h2>
                <ul
                  role="list"
                  className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6"
                >
                  {roots.map((root) => (
                    <CategoryTile key={root.id} node={root} />
                  ))}
                </ul>
              </section>
            ) : (
              <div className="mt-8">
                <CatalogEmpty />
              </div>
            )}
          </>
        )}
      </main>
    </StorefrontChrome>
  )
}
