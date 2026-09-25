import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { categoryHref } from './menu-model'
import type { MenuCategory } from '../../types/categoryMenu'

export interface FeaturedCategoryRowProps {
  nodes: MenuCategory[]
  onNavigate: () => void
}

function ChevronRight() {
  return (
    <svg
      width="18"
      height="18"
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

/**
 * Row of circular covers of the featured subcategories. The row is a plain
 * scroll container with scroll snapping (no carousel library), and the arrow
 * button scrolls it with the native `scrollBy`.
 *
 * `hidden lg:flex`: the circles are a desktop affordance, the mobile drawer
 * lists the same categories as a drill-down instead.
 */
export default function FeaturedCategoryRow({ nodes, onNavigate }: FeaturedCategoryRowProps) {
  const trackRef = useRef<HTMLUListElement>(null)

  if (nodes.length === 0) return null

  const scroll = (direction: 1 | -1) => {
    const track = trackRef.current
    if (!track || typeof track.scrollBy !== 'function') return
    track.scrollBy({ left: direction * Math.max(240, track.clientWidth * 0.8), behavior: 'smooth' })
  }

  return (
    <div className="hidden items-center gap-3 lg:flex">
      <ul
        ref={trackRef}
        role="list"
        aria-label="Categorías destacadas"
        className="flex flex-1 snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-1"
      >
        {nodes.map((node) => (
          <li key={node.id} className="w-24 shrink-0 snap-start">
            <Link
              to={categoryHref(node.slug)}
              onClick={onNavigate}
              className="group flex flex-col items-center gap-2 text-center"
            >
              <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-security-500 bg-white transition group-hover:border-security-600 group-hover:shadow-lg">
                {node.imageUrl ? (
                  <img
                    src={node.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="h-full w-full bg-surface-100" />
                )}
              </span>
              <span className="line-clamp-2 text-micro font-medium leading-tight text-ink-600 transition group-hover:text-security-500">
                {node.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label="Ver más categorías destacadas"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-surface-200 bg-white text-ink-500 transition hover:border-security-500 hover:text-security-500"
      >
        <ChevronRight />
      </button>
    </div>
  )
}
