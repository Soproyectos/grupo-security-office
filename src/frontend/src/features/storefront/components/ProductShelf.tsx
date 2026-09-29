import { Link } from 'react-router-dom'
import { HOME_SHELF_LIMIT, type HomeShelf } from '../constants/home-catalog'
import { usePublicProductShelf, type ProductShelfStatus } from '../hooks/usePublicProductShelf'
import type { PublicProductResult } from '../types/publicProduct'
import { categoryHref } from './mega-menu/menu-model'
import { PublicProductGrid, PublicProductGridSkeleton, PublicProductListingError } from './PublicProductGrid'

/**
 * Presentation of one shelf. A shelf whose category has no products renders
 * nothing, so the home never advertises an empty category.
 */
export function ProductShelfView({
  shelf,
  status,
  items,
  total,
  onRetry,
}: {
  shelf: HomeShelf
  status: ProductShelfStatus
  items: PublicProductResult[]
  total: number
  onRetry: () => void
}) {
  if (status === 'ready' && total === 0) return null

  const titleId = `home-shelf-${shelf.slug}`

  return (
    <section aria-labelledby={titleId} className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={titleId} className="font-condensed text-2xl font-bold text-storefront-ink">
          {shelf.title}
        </h2>
        <Link
          to={categoryHref(shelf.slug)}
          className="inline-flex min-h-11 items-center text-body-sm font-bold text-security-500 transition hover:text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500"
        >
          Ver todo<span className="sr-only"> en {shelf.title}</span>
        </Link>
      </div>
      <div className="mt-3">
        {status === 'loading' && <PublicProductGridSkeleton label={`Cargando ${shelf.title}…`} count={HOME_SHELF_LIMIT} />}
        {status === 'error' && <PublicProductListingError onRetry={onRetry} subject={`los productos de ${shelf.title}`} />}
        {status === 'ready' && <PublicProductGrid products={items} />}
      </div>
    </section>
  )
}

export default function ProductShelf({ shelf }: { shelf: HomeShelf }) {
  const { status, items, total, retry } = usePublicProductShelf(shelf.slug, HOME_SHELF_LIMIT)

  return <ProductShelfView shelf={shelf} status={status} items={items} total={total} onRetry={retry} />
}
