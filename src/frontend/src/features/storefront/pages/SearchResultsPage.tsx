import { Link, useSearchParams } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import {
  PublicProductGrid,
  PublicProductGridSkeleton,
  PublicProductListingError,
  PublicProductPager,
} from '../components/PublicProductGrid'
import { CAMERA_SUBCATEGORY_SLUGS } from '../constants/home-catalog'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { usePublicProductListing } from '../hooks/usePublicProductListing'
import { pageTitle } from '../utils/documentTitle'

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
  const brand = (searchParams.get('brand') ?? '').trim()
  const category = searchParams.get('category') === 'camaras' ? 'camaras' : ''
  const categoryParams = new URLSearchParams(searchParams)
  if (category) categoryParams.delete('category')
  else categoryParams.set('category', 'camaras')
  const searchLabel = [query, brand].filter(Boolean).join(' · ')
  useDocumentTitle(pageTitle(searchLabel ? `Resultados para ${searchLabel}` : 'Buscar productos'))
  const { status, items, total, hasMore, loadingMore, loadMoreError, loadMore, retry } =
    usePublicProductListing({
      q: query,
      brand,
      category,
      ...(category === 'camaras' ? { subcategory: CAMERA_SUBCATEGORY_SLUGS } : {}),
    })

  return (
    <StorefrontChrome>
      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-12">
        <h1 className="text-page-title font-bold text-ink-900">Resultados de búsqueda</h1>
        {searchLabel !== '' && (
          <p className="mt-2 text-body-sm text-ink-500">
            Buscando <span className="font-semibold text-ink-700">«{searchLabel}»</span>
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
        {brand && (
          <Link
            to={`?${categoryParams.toString()}`}
            className="mt-4 inline-flex min-h-11 items-center rounded-control px-3 font-semibold text-security-600 underline focus-visible:outline focus-visible:outline-security-600"
          >
            {category ? 'Ver todas las categorías de la marca' : 'Ver cámaras de la marca'}
          </Link>
        )}
        <div className="mt-8">
          {status === 'idle' && searchLabel === '' && <EmptyQuery />}
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
          {status === 'ready' && items.length === 0 && searchLabel !== '' && <NoResults query={searchLabel} />}
        </div>
      </main>
    </StorefrontChrome>
  )
}
