import { Link, useSearchParams } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import { categoryHref } from '../components/mega-menu/menu-model'
import { usePublicProductSearch } from '../hooks/usePublicProductSearch'
import type { PublicProductResult } from '../types/publicProduct'
import { resolveAssetUrl } from '../../../services/api'

/**
 * One product of the results grid. The Product model has no slug of its own
 * and the storefront has no product sheet yet, so the card links to the page
 * of its category, the deepest destination available today. The image is a
 * relative API route (`/api/files/:id`) resolved through `resolveAssetUrl`.
 */
function ProductCard({ product }: { product: PublicProductResult }) {
  return (
    <li>
      <Link
        to={categoryHref(product.categorySlug)}
        className="group flex h-full flex-col overflow-hidden rounded-card border border-surface-200 bg-white transition hover:border-security-500 hover:shadow-lg"
      >
        <span className="flex h-40 w-full items-center justify-center overflow-hidden bg-surface-100">
          {product.imageUrl !== null && (
            <img
              src={resolveAssetUrl(product.imageUrl)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
        </span>
        <span className="flex flex-1 flex-col gap-1.5 p-5">
          <span className="line-clamp-2 font-semibold text-ink-900 transition group-hover:text-security-500">
            {product.name}
          </span>
          <span className="text-body-sm text-ink-500">{product.categoryName}</span>
        </span>
      </Link>
    </li>
  )
}

/** Placeholder of the results grid while the search request is in flight. */
function SearchSkeleton() {
  return (
    <div role="status" aria-hidden="false" className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
      <span className="sr-only">Cargando resultados…</span>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((card) => (
        <div key={card} className="flex flex-col overflow-hidden rounded-card border border-surface-200">
          <span className="h-40 w-full animate-pulse bg-surface-200" />
          <span className="flex flex-col gap-1.5 p-5">
            <span className="h-4 w-3/4 animate-pulse rounded bg-surface-100" />
            <span className="h-3 w-1/2 animate-pulse rounded bg-surface-100" />
          </span>
        </div>
      ))}
    </div>
  )
}

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

/**
 * Shown when the search could not be loaded. The retry re-runs the request;
 * the copy is the same of the error blocks of the storefront.
 */
function SearchError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-card border border-surface-200 bg-white p-8 text-center">
      <p className="text-body-sm text-ink-500">
        No pudimos cargar los resultados. Revisa tu conexión e inténtalo de nuevo.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-control bg-security-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-security-600"
      >
        Intentar de nuevo
      </button>
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
  const { status, results, retry } = usePublicProductSearch(query)

  return (
    <StorefrontChrome>
      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-12">
        <h1 className="text-page-title font-bold text-ink-900">Resultados de búsqueda</h1>
        {query !== '' && (
          <p className="mt-2 text-body-sm text-ink-500">
            Buscando <span className="font-semibold text-ink-700">«{query}»</span>
          </p>
        )}
        <div className="mt-8">
          {status === 'idle' && query === '' && <EmptyQuery />}
          {status === 'loading' && <SearchSkeleton />}
          {status === 'error' && <SearchError onRetry={retry} />}
          {status === 'ready' && results.length > 0 && (
            <ul role="list" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {results.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </ul>
          )}
          {status === 'ready' && results.length === 0 && query !== '' && <NoResults query={query} />}
        </div>
      </main>
    </StorefrontChrome>
  )
}
