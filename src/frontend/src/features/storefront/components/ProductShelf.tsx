import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FeaturedHomeShelf, HomeShelf } from '../constants/home-catalog'
import { usePublicProductShelf, type ProductShelfStatus } from '../hooks/usePublicProductShelf'
import type { PublicProductResult } from '../types/publicProduct'
import { categoryHref } from './mega-menu/menu-model'
import { PublicProductGrid, PublicProductGridSkeleton, PublicProductListingError } from './PublicProductGrid'

const SHELF_GRID = 'grid w-max grid-flow-col auto-cols-[9rem] gap-3 sm:auto-cols-[13rem] lg:auto-cols-[14.5rem] [&>li]:snap-start'
const SHELF_TRACK = 'overflow-x-auto px-1 pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
const ARROW = 'absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-surface-200 bg-white text-ink-700 opacity-40 transition-opacity duration-200 enabled:hover:border-security-600 enabled:hover:text-security-600 enabled:hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-security-600 disabled:pointer-events-none disabled:opacity-0 motion-reduce:transition-none'

function ShelfArrow({ direction, controls, disabled, onClick }: {
  direction: 'previous' | 'next'
  controls: string
  disabled: boolean
  onClick: () => void
}) {
  const previous = direction === 'previous'

  return (
    <button
      type="button"
      aria-label={previous ? 'Productos anteriores' : 'Productos siguientes'}
      aria-controls={controls}
      disabled={disabled}
      onClick={onClick}
      className={`${ARROW} ${previous ? 'left-1' : 'right-1'}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d={previous ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

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
  const titleId = `home-shelf-${shelf.slug}`
  const trackId = `${titleId}-products`
  const trackRef = useRef<HTMLDivElement>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const update = () => {
      setCanGoBack(track.scrollLeft > 1)
      setCanGoForward(track.scrollLeft + track.clientWidth < track.scrollWidth - 1)
    }

    update()
    track.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(track)

    return () => {
      track.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [status, items.length])

  if (status === 'ready' && total === 0) return null

  const showArrows = status === 'ready' && (canGoBack || canGoForward)

  function scrollProducts(direction: -1 | 1) {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: direction * track.clientWidth * 0.85 })
  }

  return (
    <section aria-labelledby={titleId} className="mx-auto mt-6 max-w-[72rem] [--product-card-media-ratio:16/9] sm:[--product-card-media-ratio:4/3] lg:[--product-card-media-ratio:5/4]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
        <h2 id={titleId} className="font-condensed text-xl font-bold text-storefront-ink sm:text-2xl">
          {shelf.title}
        </h2>
        <Link
          to={categoryHref(shelf.slug)}
          className="inline-flex min-h-11 items-center text-body-sm font-bold text-security-500 transition hover:text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500"
        >
          Ver todo<span className="sr-only"> en {shelf.title}</span>
        </Link>
      </div>
      <div className="relative mt-1">
        {showArrows && (
          <div role="group" aria-label={`Recorrer productos de ${shelf.title}`}>
            <ShelfArrow direction="previous" controls={trackId} disabled={!canGoBack} onClick={() => scrollProducts(-1)} />
            <ShelfArrow direction="next" controls={trackId} disabled={!canGoForward} onClick={() => scrollProducts(1)} />
          </div>
        )}
        {status === 'loading' && (
          <div className={SHELF_TRACK}>
            <PublicProductGridSkeleton label={`Cargando ${shelf.title}…`} count={5} compact className={SHELF_GRID} />
          </div>
        )}
        {status === 'error' && <PublicProductListingError onRetry={onRetry} subject={`los productos de ${shelf.title}`} />}
        {status === 'ready' && (
          <div id={trackId} ref={trackRef} className={`${SHELF_TRACK} snap-x snap-mandatory scroll-px-1 motion-safe:scroll-smooth`}>
            <PublicProductGrid products={items} compact className={SHELF_GRID} />
          </div>
        )}
      </div>
    </section>
  )
}

export default function ProductShelf({ shelf }: { shelf: FeaturedHomeShelf }) {
  const { status, items, total, retry } = usePublicProductShelf(shelf.slug, shelf.skus)
  return <ProductShelfView shelf={shelf} status={status} items={items} total={total} onRetry={retry} />
}
