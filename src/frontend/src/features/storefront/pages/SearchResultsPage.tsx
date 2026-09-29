import { Link, useSearchParams } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import {
  PublicProductGrid,
  PublicProductGridSkeleton,
  PublicProductListingError,
  PublicProductPager,
} from '../components/PublicProductGrid'
import { usePublicProductListing } from '../hooks/usePublicProductListing'

/**
 * Shown when the search returned no products. The query is quoted so the
 * visitor sees exactly what was searched.
 */
function NoResults({ query }: { query: string }) {
  return (
    <div role="status" className="rounded-card border border-dashed border-surface-300 bg-white p-8 text-center">
      <p className="text-body-sm text-ink-500">
        No encontramos resultados para <span className="font-semibold text-ink-700">«{query}»</span>.
      </p>
      <Link
        to="/tienda"
        className="mt-6 inline-flex rounded-control bg-security-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-security-600"
      >
        Explorar categorías
      </Link>
    </div>
  )
}

/** Shown when the header was submitted without a query. */
function EmptyQuery() {
  return (
    <div role="status" className="rounded-card border border-dashed border-surface-300 bg-white p-8 text-center">
      <p className="text-body-sm text-ink-500">
        Escribe lo que estás buscando en el buscador de arriba.
      </p>
      <Link
        to="/tienda"
        className="mt-6 inline-flex rounded-control bg-security-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-security-600"
      >
        Volver al inicio
      </Link>
    </div>
  )
}

/**
 * Landing page of the storefront search (`/catalogo/buscar`), the destination
 * of the header form. The query comes from the URL, so a result set is
 * shareable and the browser back button keeps it.
 */
export default function SearchResultsPage() {
  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') ?? '').trim()
  const { status, items, total, hasMore, loadingMore, loadMoreError, loadMore, retry } =
    usePublicProductListing({ q: query })

  return (
    <StorefrontChrome>
      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-12">
        <h1 className="text-page-title font-bold text-ink-900">Resultados de búsqueda</h1>
        {query !== '' && (
          <p className="mt-2 text-body-sm text-ink-500">
            Buscando <span className="font-semibold text-ink-700">«{query}»</span>
            {status === 'ready' && total > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-ink-700">
                  {total} {total === 1 ? 'resultado' : 'resultados'}
                </span>
              </>
            )}
          </p>
        )}
        <div className="mt-8">
          {status === 'idle' && query === '' && <EmptyQuery />}
          {status === 'loading' && <PublicProductGridSkeleton label="Cargando resultados…" />}
          {status === 'error' && <PublicProductListingError onRetry={retry} subject="los resultados" />}
          {status === 'ready' && items.length > 0 && (
            <>
              <PublicProductGrid products={items} />
              <PublicProductPager
                shown={items.length}
                total={total}
                hasMore={hasMore}
                loadingMore={loadingMore}
                loadMoreError={loadMoreError}
                onLoadMore={loadMore}
              />
            </>
          )}
          {status === 'ready' && items.length === 0 && query !== '' && <NoResults query={query} />}
        </div>
      </main>
    </StorefrontChrome>
  )
}
