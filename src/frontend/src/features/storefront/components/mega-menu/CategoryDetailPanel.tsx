import { Link } from 'react-router-dom'
import FeaturedCategoryRow from './FeaturedCategoryRow'
import { categoryImage } from './menu-images'
import { categoryHref, categoryNodeHref, featuredTiles, productCountLabel } from './menu-model'
import type { MenuCategory } from '../../types/categoryMenu'

export interface CategoryDetailPanelProps {
  root: MenuCategory
  onNavigate: () => void
  closeButton: React.ReactNode
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
const CHIP = `group inline-flex min-h-11 max-w-full items-center gap-2 rounded-control border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-ink-900 motion-safe:transition-colors hover:border-security-500 hover:bg-white active:bg-surface-100 ${FOCUS}`
const OPTION = `group flex h-full min-h-12 flex-col justify-center rounded-control border border-surface-200 bg-surface-50 px-3 py-2 motion-safe:transition-colors hover:border-security-500 hover:bg-white active:bg-surface-100 ${FOCUS}`

export default function CategoryDetailPanel({ root, onNavigate, closeButton }: CategoryDetailPanelProps) {
  const image = categoryImage(root)
  const hasChildren = root.children.length > 0
  const rootHref = categoryHref(root.slug)

  return (
    <div className="min-w-0 flex-1 space-y-4 overflow-y-auto p-4 xl:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-bold text-ink-900">{root.name}</h2>
          {hasChildren && (
            <Link
              to={rootHref}
              onClick={onNavigate}
              className={`inline-flex min-h-11 items-center rounded-control text-sm font-semibold !text-security-600 hover:underline ${FOCUS}`}
            >
              Ver todo ({productCountLabel(root.productCount)})
            </Link>
          )}
        </div>
        {closeButton}
      </div>

      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          {hasChildren ? (
            <>
              <h3 className="mb-2 text-base font-semibold text-ink-900">Subcategorías</h3>
              <ul role="list" aria-label={`Subcategorías de ${root.name}`} className="flex flex-wrap gap-2">
                {root.children.map((child) => (
                  <li key={child.id} className="min-w-0 max-w-full">
                    <Link to={categoryNodeHref(child, root.slug)} onClick={onNavigate} className={CHIP}>
                      <span className="break-words font-semibold group-hover:text-security-600">{child.name}</span>
                      {child.productCount > 0 && (
                        <span className="shrink-0 tabular-nums text-ink-600">
                          {child.productCount}
                          <span className="sr-only"> {child.productCount === 1 ? 'producto' : 'productos'}</span>
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Link to={rootHref} onClick={onNavigate} className={`${OPTION} max-w-sm`}>
              <span className="text-sm font-semibold text-ink-900 group-hover:text-security-600">
                Ver todos los productos
              </span>
              <span className="text-sm text-ink-600">{productCountLabel(root.productCount)}</span>
            </Link>
          )}
        </div>
        {!hasChildren && image !== null && (
          <img
            src={image}
            alt=""
            loading="lazy"
            className="hidden aspect-[4/3] w-56 shrink-0 rounded-card object-cover xl:block"
          />
        )}
      </div>

      <FeaturedCategoryRow nodes={featuredTiles(root)} parentSlug={root.slug} onNavigate={onNavigate} />
    </div>
  )
}
