import { Link } from 'react-router-dom'
import type { CountedCategory } from '../utils/pickCountedCategories'
import { productGlyphKind } from '../utils/productGlyphKind'
import { CategoryIcon } from './mega-menu/CategorySidebar'
import { categoryHref } from './mega-menu/menu-model'
import { ProductGlyph } from './ProductMedia'

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

function TileMedia({ entry }: { entry: CountedCategory }) {
  const { category } = entry

  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-100 text-ink-600"
    >
      {category.imageUrl ? (
        <img src={category.imageUrl} alt="" loading="lazy" width={48} height={48} className="h-full w-full object-cover" />
      ) : category.iconUrl ? (
        <CategoryIcon src={category.iconUrl} className="h-6 w-6" />
      ) : (
        <ProductGlyph kind={productGlyphKind(category.slug)} className="h-6 w-6" />
      )}
    </span>
  )
}

/** One category with its live product count; the whole tile is the link. */
function CategoryShopTile({ entry }: { entry: CountedCategory }) {
  return (
    <li>
      <Link
        to={categoryHref(entry.category.slug)}
        className={`flex min-h-[4.5rem] items-center gap-3 rounded-card border border-surface-200 bg-white p-3 transition-colors duration-150 hover:border-storefront-ink ${FOCUS_RING}`}
      >
        <TileMedia entry={entry} />
        <span className="flex min-w-0 flex-col">
          <span className="line-clamp-2 font-condensed text-base font-bold leading-5 text-storefront-ink">
            {entry.category.name}
          </span>
          <span className="text-body-sm tabular-nums text-ink-500">
            {entry.count} {entry.count === 1 ? 'producto' : 'productos'}
          </span>
        </span>
      </Link>
    </li>
  )
}

const GRID_CLASS = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'

export function CategoryShopTiles({ entries }: { entries: CountedCategory[] }) {
  return (
    <ul role="list" className={GRID_CLASS}>
      {entries.map((entry) => (
        <CategoryShopTile key={entry.category.id} entry={entry} />
      ))}
    </ul>
  )
}

/** Keeps the shape of the tiles while the counts are in flight. */
export function CategoryShopTilesSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" className={GRID_CLASS}>
      <span className="sr-only">Cargando categorías…</span>
      {Array.from({ length: count }, (_, tile) => (
        <div
          key={tile}
          aria-hidden="true"
          className="flex min-h-[4.5rem] items-center gap-3 rounded-card border border-surface-200 bg-white p-3"
        >
          <span className="h-12 w-12 shrink-0 animate-pulse rounded-control bg-surface-200" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3 w-3/4 animate-pulse rounded bg-surface-200" />
            <span className="h-2.5 w-1/3 animate-pulse rounded bg-surface-100" />
          </span>
        </div>
      ))}
    </div>
  )
}
