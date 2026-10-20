import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

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

const ARROW_CLASS =
  'absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

/**
 * Full-width banner slider with no text overlay: the banners carry the
 * message, and an sr-only h1 gives the page its heading. It never rotates by
 * itself for visitors who ask for reduced motion, and it pauses while the
 * pointer is over it or focus is inside it.
 */
export default function HomeHero() {
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const reduceMotion = usePrefersReducedMotion()
  const count = PROMOTION_BANNERS.length
  const rotating = !reduceMotion && !hovered && !focused

  useEffect(() => {
    if (!rotating) return

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count)
    }, PROMOTION_SLIDE_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [count, rotating])

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promociones destacadas"
      className="relative w-full overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
    >
      <h1 className="sr-only">Grupo Security: seguridad electrónica al mejor precio</h1>
      <div
        aria-live={rotating ? 'off' : 'polite'}
        className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {PROMOTION_BANNERS.map((banner, slideIndex) => (
          <Link
            key={banner.src}
            to="/catalogo"
            aria-hidden={slideIndex !== index}
            tabIndex={slideIndex === index ? 0 : -1}
            className="w-full shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
          >
            <img
              src={banner.src}
              alt={slideIndex === index ? banner.alt : ''}
              className="h-64 w-full object-cover sm:h-80 lg:h-[300px]"
              loading={slideIndex === 0 ? 'eager' : 'lazy'}
            />
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setIndex((current) => (current - 1 + count) % count)}
        aria-label="Promoción anterior"
        className={`${ARROW_CLASS} left-3`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setIndex((current) => (current + 1) % count)}
        aria-label="Promoción siguiente"
        className={`${ARROW_CLASS} right-3`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 rounded-full bg-black/50 px-1">
        {PROMOTION_BANNERS.map((banner, slideIndex) => (
          <button
            key={banner.src}
            type="button"
            onClick={() => setIndex(slideIndex)}
            aria-label={`Ir a la promoción ${slideIndex + 1}`}
            aria-current={slideIndex === index}
            className="group flex h-11 w-8 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                slideIndex === index ? 'bg-white' : 'bg-white/60 group-hover:bg-white'
              }`}
            />
          </button>
        ))}
      </div>
    </section>
  )
}
