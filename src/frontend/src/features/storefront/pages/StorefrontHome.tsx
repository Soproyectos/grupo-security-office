import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import StorefrontChrome from '../components/StorefrontChrome'
import StorefrontSalesChannels from '../components/StorefrontSalesChannels'
import FeaturedSolutionsSection from '../components/FeaturedSolutionsSection'
import { featuredTiles, navigableRoots } from '../components/mega-menu/menu-model'
import { useCategoryMenu } from '../hooks/useCategoryMenu'
import { HOME_SECTIONS, type HomeSection } from '../fixtures/home-sections'
import { FEATURED_SOLUTIONS } from '../fixtures/featured-solutions'
import { CategoryTile } from './CategoryPage'
import type { MenuCategory } from '../types/categoryMenu'

/**
 * Cap of the tiles row: the menu payload carries a featured tile per family
 * branch, so without a cap the home would list the whole tree. Twelve tiles
 * keep the row on a single 6-column grid, the same layout of the category page.
 */
const MAX_HOME_TILES = 12

/**
 * Featured tiles across every family, in the order the backend sends them.
 * Featured nodes are the only ones that carry a photo (`imageUrl`), which is
 * exactly what the tiles of the home need.
 */
function featuredAcrossRoots(categories: MenuCategory[]): MenuCategory[] {
  return navigableRoots(categories)
    .flatMap((root) => featuredTiles(root))
    .slice(0, MAX_HOME_TILES)
}

const PROMOTION_BANNERS = [
  {
    src: '/images/home/banner-hikvision-distribuidor.png',
    alt: 'Distribuidor autorizado de Hikvision y HiLook',
  },
  {
    src: '/images/home/banner-ezviz-nuevas.png',
    alt: 'Nuevas cámaras EZVIZ H8X 2K+, H80x Dual y H90x Dual',
  },
]

const PROMOTION_SLIDE_INTERVAL_MS = 5000

function Hero() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = PROMOTION_BANNERS.length

  useEffect(() => {
    if (paused) return

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count)
    }, PROMOTION_SLIDE_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [count, paused])

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promociones destacadas"
      className="relative w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
        {PROMOTION_BANNERS.map((banner, slideIndex) => (
          <Link key={banner.src} to="/catalogo" className="w-full shrink-0">
            <img
              src={banner.src}
              alt={slideIndex === index ? banner.alt : ''}
              className="h-64 w-full object-cover sm:h-80 lg:h-[420px]"
              loading={slideIndex === 0 ? 'eager' : 'lazy'}
            />
          </Link>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-start justify-center gap-4 bg-gradient-to-r from-black/75 via-black/45 to-transparent px-6 sm:px-12 lg:px-20">
        <h1
          id="home-hero-title"
          className="max-w-xl text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl"
        >
          Todo para tu seguridad, en un solo lugar
        </h1>
        <p className="max-w-lg text-body-sm text-white/90 sm:text-base">
          Cámaras, control de acceso, alarmas y energía: distribución autorizada de marcas líderes.
        </p>
        <Link
          to="/catalogo"
          className="pointer-events-auto rounded-control bg-security-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-security-600"
        >
          Ver catálogo
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setIndex((current) => (current - 1 + count) % count)}
        aria-label="Promoción anterior"
        className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setIndex((current) => (current + 1) % count)}
        aria-label="Promoción siguiente"
        className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
        {PROMOTION_BANNERS.map((banner, slideIndex) => (
          <button
            key={banner.src}
            type="button"
            onClick={() => setIndex(slideIndex)}
            aria-label={`Ir a la promoción ${slideIndex + 1}`}
            aria-current={slideIndex === index}
            className={`h-2.5 w-2.5 rounded-full transition ${slideIndex === index ? 'scale-110 bg-white' : 'bg-white/60 hover:bg-white'}`}
          />
        ))}
      </div>
    </section>
  )
}

function CategoriesSkeleton() {
  return (
    <div role="status" aria-hidden="false" className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
      <span className="sr-only">Cargando categorías…</span>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((tile) => (
        <div key={tile} className="flex flex-col items-center gap-3">
          <span className="h-24 w-24 animate-pulse rounded-full bg-surface-200" />
          <span className="h-3 w-20 animate-pulse rounded bg-surface-100" />
        </div>
      ))}
    </div>
  )
}

/**
 * Shown when the menu could not be loaded. The retry of the hook re-runs the
 * request; no other control is duplicated here.
 */
function CategoriesError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-card border border-surface-200 bg-white p-8 text-center">
      <p className="text-body-sm text-ink-500">
        No pudimos cargar las categorías. Revisa tu conexión e intenta de nuevo.
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

/**
 * One themed section (Marcas destacadas, Ofertas, Novedades). The cards come
 * from the demo fixtures of `home-sections.ts`; each links to the catalog.
 */
function HomeSectionBlock({ section }: { section: HomeSection }) {
  return (
    <section aria-labelledby={`home-${section.id}-title`} className="mt-12">
      <h2 id={`home-${section.id}-title`} className="text-xl font-bold text-ink-900">
        {section.title}
      </h2>
      <ul role="list" className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {section.cards.map((card) => (
          <li key={card.id}>
            <Link
              to={card.href}
              className="group flex h-full flex-col overflow-hidden rounded-card border border-surface-200 bg-white transition hover:border-security-500 hover:shadow-lg"
            >
              {card.imageUrl !== null && (
                <img src={card.imageUrl} alt="" loading="lazy" className="h-40 w-full object-cover" />
              )}
              <span className="flex flex-1 flex-col gap-1.5 p-5">
                <span className="font-semibold text-ink-900 transition group-hover:text-security-500">
                  {card.title}
                </span>
                <span className="text-body-sm text-ink-500">{card.description}</span>
                {card.priceLabel !== null && (
                  <span className="mt-auto pt-2 text-body-sm font-bold text-security-500">
                    {card.priceLabel}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Home of the storefront (`/tienda`), the destination of the logo of the
 * chrome. It reads the same session menu as the header, so arriving here never
 * costs a second request.
 */
export default function StorefrontHome() {
  const { status, categories, retry } = useCategoryMenu()
  const tiles = status === 'ready' ? featuredAcrossRoots(categories) : []

  return (
    <StorefrontChrome>
      <Hero />
      <main className="mx-auto max-w-7xl px-5 py-8 lg:px-12">
        <section aria-labelledby="home-categorias-title" className="mt-12">
          <h2 id="home-categorias-title" className="text-xl font-bold text-ink-900">
            Categorías destacadas
          </h2>
          {status === 'loading' && (
            <div className="mt-5">
              <CategoriesSkeleton />
            </div>
          )}
          {status === 'error' && (
            <div className="mt-5">
              <CategoriesError onRetry={retry} />
            </div>
          )}
          {status === 'ready' && tiles.length > 0 && (
            <ul role="list" className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {tiles.map((node) => (
                <CategoryTile key={node.id} node={node} />
              ))}
            </ul>
          )}
          {status === 'ready' && tiles.length === 0 && (
            <p className="mt-4 text-body-sm text-ink-500">
              Aún no hay categorías destacadas para mostrar.
            </p>
          )}
        </section>
        <FeaturedSolutionsSection solutions={FEATURED_SOLUTIONS} />
        {HOME_SECTIONS.map((section) => (
          <HomeSectionBlock key={section.id} section={section} />
        ))}
        <StorefrontSalesChannels />
      </main>
    </StorefrontChrome>
  )
}
