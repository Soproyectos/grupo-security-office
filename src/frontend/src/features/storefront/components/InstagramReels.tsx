import { useEffect, useRef, useState } from 'react'
import { HOME_REELS, type HomeReel } from '../constants/home-catalog'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600'
const INSTAGRAM_PREFIX = 'https://www.instagram.com/'
const ARROW = 'absolute top-[30%] z-10 flex size-11 items-center justify-center rounded-full border border-surface-200 bg-white text-ink-700 shadow-sm transition-opacity duration-200 enabled:hover:border-security-600 enabled:hover:text-security-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-security-600 disabled:pointer-events-none disabled:opacity-0 motion-reduce:transition-none'

/** Embed URL of a reel, or null when the link is not an Instagram one. */
function embedUrl(url: string): string | null {
  if (!url.startsWith(INSTAGRAM_PREFIX)) return null
  const base = (url.split(/[?#]/)[0] ?? url).replace(/\/+$/, '')
  return `${base}/embed`
}

function ReelArrow({ direction, disabled, onClick }: { direction: 'previous' | 'next'; disabled: boolean; onClick: () => void }) {
  const previous = direction === 'previous'
  return (
    <button
      type="button"
      aria-label={previous ? 'Reels anteriores' : 'Reels siguientes'}
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

/** Silent clip that plays only while the pointer is over the tile (devices with a pointer that can hover). */
function ReelPreview({ reel, playing }: { reel: HomeReel; playing: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (playing) {
      void video.play().catch(() => undefined)
    } else {
      video.pause()
      video.currentTime = 0
    }
  }, [playing])

  return (
    <video
      ref={ref}
      src={reel.preview}
      poster={reel.thumbnail}
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden="true"
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 motion-reduce:transition-none ${playing ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}

export default function InstagramReels({ reels = HOME_REELS }: { reels?: HomeReel[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const trackRef = useRef<HTMLUListElement>(null)
  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches === true
  const valid = reels.flatMap((reel) => {
    const src = embedUrl(reel.url)
    return src ? [{ reel, src }] : []
  })
  const count = valid.length

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
  }, [count, activeId])

  if (count === 0) return null

  function scrollReels(direction: -1 | 1) {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: direction * track.clientWidth * 0.85 })
  }

  return (
    <section aria-labelledby="home-reels-title" className="mx-auto max-w-[80rem] px-5 py-3 sm:px-8 lg:px-10">
      <h2 id="home-reels-title" className="mb-2 text-2xl font-bold">Mantente al día</h2>
      <div className="relative">
        {(canGoBack || canGoForward) && (
          <div role="group" aria-label="Recorrer reels">
            <ReelArrow direction="previous" disabled={!canGoBack} onClick={() => scrollReels(-1)} />
            <ReelArrow direction="next" disabled={!canGoForward} onClick={() => scrollReels(1)} />
          </div>
        )}
        <ul
          ref={trackRef}
          className="flex items-start gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden motion-safe:scroll-smooth"
        >
          {valid.map(({ reel, src }) => (
            <li
              key={reel.id}
              className={activeId === reel.id ? 'w-[min(20rem,85vw)] shrink-0' : 'min-w-[7.5rem] flex-1'}
            >
              {activeId === reel.id ? (
                <iframe
                  title={reel.title}
                  src={src}
                  loading="lazy"
                  allowFullScreen
                  className="block h-[640px] w-full rounded-card border border-surface-200 bg-white"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveId(reel.id)}
                  onMouseEnter={() => setHoverId(reel.id)}
                  onMouseLeave={() => setHoverId(null)}
                  className={`group block w-full text-left ${FOCUS}`}
                >
                  <span className="relative block aspect-[4/5] overflow-hidden rounded-card border border-surface-200 bg-surface-100">
                    <img src={reel.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {canHover && reel.preview && <ReelPreview reel={reel} playing={hoverId === reel.id} />}
                    <span className="absolute right-2 top-2 rounded-control bg-storefront-ink/85 px-2 py-0.5 text-xs font-bold text-white">
                      {reel.duration ?? 'REEL'}
                    </span>
                  </span>
                  <span className="mt-2 block font-bold leading-tight text-storefront-ink group-hover:text-security-600">{reel.title}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
