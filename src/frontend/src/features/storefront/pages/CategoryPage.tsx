import { Fragment, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import { CategoryIcon } from '../components/mega-menu/CategorySidebar'
import { categoryHref } from '../components/mega-menu/menu-model'
import {
  PublicProductGrid,
  PublicProductGridSkeleton,
  PublicProductListingError,
  PublicProductPager,
} from '../components/PublicProductGrid'
import { useCategoryMenu } from '../hooks/useCategoryMenu'
import { usePublicProductListing } from '../hooks/usePublicProductListing'
import type { MenuCategory } from '../types/categoryMenu'

/**
 * Depth the public menu guarantees: `GET /api/public/categories/menu` caps the
 * tree at 3 levels. The lookup stops there, so it cannot walk forever on a
 * malformed payload and the breadcrumb is never deeper than the mega menu.
 */
const MAX_TREE_DEPTH = 3

const NO_CHILDREN: MenuCategory[] = []

interface CategoryTrail {
  category: MenuCategory
  ancestors: MenuCategory[]
}

/**
 * Finds a category by slug anywhere in the tree and returns the chain of
 * ancestors the breadcrumb needs.
 *
 * The search is recursive on purpose, not roots-only: every link of the mega
 * menu points at a category page (level-2 headers, level-3 leaves and the
 * families themselves), so a roots-only lookup would answer "no encontrada" for
 * most of the menu and the user would land on a dead page.
 */
function findCategoryTrail(roots: MenuCategory[], slug: string): CategoryTrail | null {
  const visit = (nodes: MenuCategory[], ancestors: MenuCategory[]): CategoryTrail | null => {
    for (const node of nodes) {
      if (node.slug === slug) return { category: node, ancestors }
      // `ancestors` holds the chain above, so a node is at level
      // `ancestors.length + 1`: the last level is matched but not descended.
      if (ancestors.length + 1 < MAX_TREE_DEPTH) {
        const found = visit(node.children, [...ancestors, node])
        if (found) return found
      }
    }
    return null
  }

  return visit(roots, [])
}

/** Children by `sortOrder`. Ties keep the order the backend sent (stable sort). */
function childrenBySortOrder(category: MenuCategory): MenuCategory[] {
  return [...category.children].sort((a, b) => a.sortOrder - b.sortOrder)
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
 * Trail of the page: Inicio / Catálogo / ancestors… / current. The ancestors are
 * links to their own page, so the user can walk up the tree.
 */
function Breadcrumb({ trail }: { trail: CategoryTrail }) {
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
          <Link to="/catalogo" className="transition hover:text-security-500">
            Catálogo
          </Link>
        </BreadcrumbItem>
        {trail.ancestors.map((ancestor) => (
          <Fragment key={ancestor.id}>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Link to={categoryHref(ancestor.slug)} className="transition hover:text-security-500">
                {ancestor.name}
              </Link>
            </BreadcrumbItem>
          </Fragment>
        ))}
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <span aria-current="page" className="font-semibold text-ink-900">
            {trail.category.name}
          </span>
        </BreadcrumbItem>
      </ol>
    </nav>
  )
}

/**
 * One child category as a circle, the same affordance as the featured row of the
 * mega menu. The cover is a plain `<img>`; the stroke icon is painted through
 * the `CategoryIcon` mask because `currentColor` does not cross the `<img>`
 * boundary.
 */
export function CategoryTile({ node }: { node: MenuCategory }) {
  return (
    <li className="flex flex-col items-center gap-3 text-center">
      <Link to={categoryHref(node.slug)} className="group flex flex-col items-center gap-3 text-center">
        <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-security-500 bg-white transition group-hover:border-security-600 group-hover:shadow-lg">
          {node.imageUrl ? (
            <img src={node.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : node.iconUrl ? (
            <span className="flex h-full w-full items-center justify-center text-security-500">
              <CategoryIcon src={node.iconUrl} className="h-8 w-8" />
            </span>
          ) : (
            <span className="h-full w-full bg-surface-100" />
          )}
        </span>
        <span className="line-clamp-2 text-body-sm font-medium leading-tight text-ink-600 transition group-hover:text-security-500">
          {node.name}
        </span>
      </Link>
    </li>
  )
}

/** Shown when the category (and its descendants) hold no published product. */
function EmptyProducts() {
  return (
    <div role="status" className="rounded-card border border-dashed border-surface-300 bg-white p-8 text-center">
      <h3 className="text-lg font-bold text-ink-900">Aún no hay productos en esta categoría</h3>
      <p className="mx-auto mt-2 max-w-md text-body-sm text-ink-500">
        Explora otras categorías o escríbenos y te ayudamos a encontrar lo que necesitas.
      </p>
      <Link
        to="/catalogo"
        className="mt-6 inline-flex rounded-control bg-security-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-security-600"
      >
        Volver al catálogo
      </Link>
    </div>
  )
}

/**
 * Product grid of a category. The endpoint already includes the products of
 * every descendant category, so a family page lists its whole subtree.
 */
function CategoryProducts({ slug }: { slug: string }) {
  const { status, items, total, hasMore, loadingMore, loadMoreError, loadMore, retry } =
    usePublicProductListing({ category: slug })

  return (
    <section aria-labelledby="categoria-productos" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="categoria-productos" className="text-eyebrow uppercase text-ink-500">
          Productos
        </h2>
        {status === 'ready' && total > 0 && (
          <p className="text-body-sm text-ink-500">
            <span className="font-semibold text-ink-700">{total}</span>{' '}
            {total === 1 ? 'producto' : 'productos'}
          </p>
        )}
      </div>
      <div className="mt-5">
        {status === 'loading' && <PublicProductGridSkeleton />}
        {status === 'error' && <PublicProductListingError onRetry={retry} />}
        {status === 'ready' && items.length === 0 && total === 0 && <EmptyProducts />}
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
      </div>
    </section>
  )
}

function CategorySkeleton() {
  return (
    <div role="status" className="space-y-8">
      <span className="sr-only">Cargando categoría…</span>
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
 * Shown when the slug does not exist in the tree and when the tree could not be
 * loaded: from this page both mean the same thing to the visitor, the category
 * cannot be shown. The header of the storefront keeps the retry of the menu
 * available, so no extra control is duplicated here.
 */
function CategoryNotFound({ slug }: { slug: string }) {
  return (
    <section role="alert" className="rounded-card border border-surface-200 bg-white p-8 text-center">
      <h1 className="text-2xl font-bold text-ink-900">Categoría no encontrada</h1>
      <p className="mt-2 text-body-sm text-ink-500">
        La categoría <span className="font-semibold text-ink-700">{slug}</span> no existe o ya no
        está disponible.
      </p>
      <Link
        to="/catalogo"
        className="mt-6 inline-flex rounded-control bg-security-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-security-600"
      >
        Volver al catálogo
      </Link>
    </section>
  )
}

/**
 * Landing page of a category (`/catalogo/categoria/:slug`), the destination of
 * every link of the mega menu. It reads the same session tree as the header, so
 * arriving here never costs a second request.
 */
export default function CategoryPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { status, categories } = useCategoryMenu()

  const trail = useMemo(
    () => (status === 'ready' ? findCategoryTrail(categories, slug) : null),
    [categories, slug, status],
  )
  const children = trail === null ? NO_CHILDREN : childrenBySortOrder(trail.category)
  const showNotFound = status === 'error' || (status === 'ready' && trail === null)

  return (
    <StorefrontChrome>
      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-12">
        {status === 'loading' && <CategorySkeleton />}
        {showNotFound && <CategoryNotFound slug={slug} />}
        {status === 'ready' && trail !== null && (
          <>
            <Breadcrumb trail={trail} />
            <h1 className="mt-4 text-page-title font-bold text-ink-900">{trail.category.name}</h1>
            {children.length > 0 ? (
              <section aria-labelledby="categoria-subcategorias" className="mt-8">
                <h2
                  id="categoria-subcategorias"
                  className="text-eyebrow uppercase text-ink-500"
                >
                  Subcategorías
                </h2>
                <ul
                  role="list"
                  className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6"
                >
                  {children.map((child) => (
                    <CategoryTile key={child.id} node={child} />
                  ))}
                </ul>
              </section>
            ) : (
              <p className="mt-4 text-body-sm text-ink-500">
                Esta categoría todavía no tiene subcategorías.
              </p>
            )}
            <CategoryProducts slug={slug} />
          </>
        )}
      </main>
    </StorefrontChrome>
  )
}
