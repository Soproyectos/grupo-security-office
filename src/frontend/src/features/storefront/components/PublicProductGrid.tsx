import type { PublicProductResult } from '../types/publicProduct'
import PublicProductCard from './PublicProductCard'

const GRID_CLASS = 'grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4'

/** Responsive grid of product cards: 2, 3 and 4 columns. */
export function PublicProductGrid({ products }: { products: PublicProductResult[] }) {
  return (
    <ul role="list" className={GRID_CLASS}>
      {products.map((product) => (
        <PublicProductCard key={product.id} product={product} />
      ))}
    </ul>
  )
}

/** Placeholder of the grid while the first page is in flight; keeps its shape. */
export function PublicProductGridSkeleton({
  label = 'Cargando productos…',
  count = 8,
}: {
  label?: string
  count?: number
}) {
  return (
    <div role="status" className={GRID_CLASS}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, card) => (
        <div
          key={card}
          aria-hidden="true"
          data-testid="product-skeleton-card"
          className="flex flex-col overflow-hidden rounded-card border border-surface-200 bg-white"
        >
          <span className="aspect-[4/3] w-full animate-pulse bg-surface-200" />
          <span className="flex flex-col gap-2 p-4">
            <span className="h-2.5 w-1/3 animate-pulse rounded bg-surface-100" />
            <span className="h-4 w-4/5 animate-pulse rounded bg-surface-100" />
            <span className="h-3 w-1/2 animate-pulse rounded bg-surface-100" />
            <span className="mt-2 h-6 w-2/3 animate-pulse rounded bg-surface-200" />
          </span>
        </div>
      ))}
    </div>
  )
}

/** "Showing N of M" plus the load-more control, with its own failure state. */
export function PublicProductPager({
  shown,
  total,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
}: {
  shown: number
  total: number
  hasMore: boolean
  loadingMore: boolean
  loadMoreError: boolean
  onLoadMore: () => void
}) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <p className="text-body-sm text-ink-500">
        Mostrando {shown} de {total} productos
      </p>
      {loadMoreError && (
        <p role="alert" className="text-body-sm text-brand-error">
          No pudimos cargar más productos. Inténtalo de nuevo.
        </p>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="min-h-11 rounded-control border border-security-500 px-6 py-3 text-sm font-bold text-security-500 transition hover:bg-security-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500 disabled:cursor-wait disabled:opacity-60"
        >
          {loadingMore ? 'Cargando…' : 'Cargar más'}
        </button>
      )}
    </div>
  )
}

/** Error block of a listing; the retry re-runs the first request. */
export function PublicProductListingError({
  onRetry,
  subject = 'los productos',
}: {
  onRetry: () => void
  subject?: string
}) {
  return (
    <div role="alert" className="rounded-card border border-surface-200 bg-white p-8 text-center">
      <p className="text-body-sm text-ink-500">
        No pudimos cargar {subject}. Revisa tu conexión e inténtalo de nuevo.
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
