import { useRef } from 'react'
import { Link } from 'react-router-dom'
import type { FeaturedSolution } from '../types/featuredSolution'

/**
 * "Soluciones destacadas" of the storefront home (`/tienda`): corporate and
 * commercial security solution concepts (NOT distributor catalog data) fed by
 * the temporary fixture `fixtures/featured-solutions.ts`, which documents that
 * there is no backend contract for solutions.
 *
 * Horizontal card layout with native horizontal scroll plus accessible
 * previous/next buttons; no autoplay. Mobile shows one primary card and
 * scrolls sideways; tablet and desktop show two and three cards. The list
 * itself is focusable so keyboard users can scroll it with the arrow keys,
 * and the buttons move it by one card honoring `prefers-reduced-motion`.
 */

const SCROLL_LIST_ID = 'home-soluciones-lista'

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className="h-5 w-5">
      <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className="h-5 w-5">
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function scrollByOneCard(list: HTMLUListElement | null, direction: 1 | -1) {
  if (list === null) return
  const card = list.querySelector<HTMLElement>(':scope > li')
  const step = card !== null ? card.offsetWidth + 24 : list.clientWidth
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  list.scrollBy({ left: direction * step, behavior: reduceMotion ? 'auto' : 'smooth' })
}

const CONTROL_CLASS =
  'flex h-10 w-10 items-center justify-center rounded-full border border-surface-200 bg-white text-ink-900 transition hover:border-security-500 hover:text-security-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

export default function FeaturedSolutionsSection({ solutions }: { solutions: FeaturedSolution[] }) {
  const listRef = useRef<HTMLUListElement | null>(null)

  return (
    <section aria-labelledby="home-soluciones-title" className="mt-12">
      <div className="flex items-center justify-between gap-4">
        <h2 id="home-soluciones-title" className="text-xl font-bold text-ink-900">
          Soluciones destacadas
        </h2>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            aria-label="Ver soluciones anteriores"
            aria-controls={SCROLL_LIST_ID}
            onClick={() => scrollByOneCard(listRef.current, -1)}
            className={CONTROL_CLASS}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            aria-label="Ver soluciones siguientes"
            aria-controls={SCROLL_LIST_ID}
            onClick={() => scrollByOneCard(listRef.current, 1)}
            className={CONTROL_CLASS}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      <ul
        ref={listRef}
        id={SCROLL_LIST_ID}
        role="list"
        tabIndex={0}
        aria-label="Lista de soluciones destacadas"
        className="mt-5 flex snap-x gap-6 overflow-x-auto pb-1 motion-safe:scroll-smooth"
      >
        {solutions.map((solution) => (
          <li
            key={solution.id}
            className="flex shrink-0 snap-start basis-[85%] sm:basis-[calc(50%-0.75rem)] lg:basis-[calc(33.333%-1rem)]"
          >
            <article className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-card border border-surface-200 bg-white transition hover:border-security-500 hover:shadow-lg">
              {solution.imageUrl !== null && (
                <img
                  src={solution.imageUrl}
                  alt={solution.imageAlt}
                  loading="lazy"
                  className="h-40 w-full shrink-0 object-cover"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-5">
                <p className="text-eyebrow font-semibold uppercase text-security-600">
                  {solution.category}
                </p>
                <h3 className="font-semibold text-ink-900">{solution.title}</h3>
                <p className="text-body-sm text-ink-500">{solution.description}</p>
                <Link
                  to={solution.href}
                  className="mt-auto inline-block break-words pt-3 text-body-sm font-bold text-security-500 transition hover:text-security-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500"
                >
                  {solution.ctaLabel}
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}
