import { useMemo } from 'react'
import StorefrontChrome from '../components/StorefrontChrome'
import StorefrontSalesChannels from '../components/StorefrontSalesChannels'
import FeaturedSolutionsSection from '../components/FeaturedSolutionsSection'
import BrandsStrip from '../components/BrandsStrip'
import HomeHero from '../components/HomeHero'
import ProductShelf from '../components/ProductShelf'
import { CategoryShopTiles, CategoryShopTilesSkeleton } from '../components/CategoryShopTiles'
import { HOME_CATEGORY_TILE_LIMIT, HOME_SHELVES } from '../constants/home-catalog'
import { useCategoryMenu } from '../hooks/useCategoryMenu'
import { useCategoryProductCounts } from '../hooks/useCategoryProductCounts'
import { FEATURED_SOLUTIONS } from '../fixtures/featured-solutions'

/**
 * "Compra por categoría": the top-level categories of the menu that really
 * hold products, each with its live count. Nothing is shown for a category
 * without products, so the home never leads to an empty page.
 */
function ShopByCategory() {
  const { status: menuStatus, categories, retry: retryMenu } = useCategoryMenu()
  const candidates = useMemo(() => (menuStatus === 'ready' ? categories : []), [menuStatus, categories])
  const { status: countsStatus, entries, retry: retryCounts } = useCategoryProductCounts(
    candidates,
    HOME_CATEGORY_TILE_LIMIT,
  )

  const loading = menuStatus === 'loading' || (menuStatus === 'ready' && countsStatus === 'loading')
  const failed = menuStatus === 'error' || (menuStatus === 'ready' && countsStatus === 'error')

  return (
    <section aria-labelledby="home-categorias-title" className="mt-12">
      <h2 id="home-categorias-title" className="font-condensed text-2xl font-bold text-storefront-ink">
        Compra por categoría
      </h2>
      <div className="mt-4">
        {loading && <CategoryShopTilesSkeleton />}
        {failed && (
          <div role="alert" className="rounded-card border border-surface-200 bg-white p-8 text-center">
            <p className="text-body-sm text-ink-500">
              No pudimos cargar las categorías. Revisa tu conexión e inténtalo de nuevo.
            </p>
            <button
              type="button"
              onClick={menuStatus === 'error' ? retryMenu : retryCounts}
              className="mt-6 min-h-11 rounded-control bg-security-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500"
            >
              Intentar de nuevo
            </button>
          </div>
        )}
        {!loading && !failed && entries.length > 0 && <CategoryShopTiles entries={entries} />}
        {!loading && !failed && entries.length === 0 && (
          <p className="text-body-sm text-ink-500">Aún no hay categorías con productos para mostrar.</p>
        )}
      </div>
    </section>
  )
}

/**
 * Home of the storefront (`/tienda`): banner slider, categories with stock,
 * product shelves with real prices, brands, solutions and sales channels. The
 * category tree is the same session menu the header reads.
 */
export default function StorefrontHome() {
  return (
    <StorefrontChrome>
      <HomeHero />
      <main className="mx-auto max-w-7xl px-5 pb-12 pt-2 lg:px-12">
        <ShopByCategory />
        {HOME_SHELVES.map((shelf) => (
          <ProductShelf key={shelf.slug} shelf={shelf} />
        ))}
        <BrandsStrip />
        <FeaturedSolutionsSection solutions={FEATURED_SOLUTIONS} />
        <StorefrontSalesChannels />
      </main>
    </StorefrontChrome>
  )
}
