import { useEffect, useState, type CSSProperties } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import {
  HERO_INTERVAL_MS,
  nextIndex,
  resolveCampaignImageUrl,
  type HeroCampaign,
} from '../utils/campaigns'
import CampaignLink from './CampaignLink'

// The section is the image frame; on desktop it stretches to the height of the text column.
// Below 768 px the frame follows the mobile piece (4:3, as approved) when every slide has one;
// otherwise it keeps the wide 2.37 frame the desktop images were made for. The cap keeps a 4:3
// frame from pushing the page down on large phones.
const PANEL = 'relative overflow-hidden bg-security-600 md:aspect-auto md:self-stretch'
const FRAME_MOBILE_PIECE = 'aspect-[4/3] max-h-[22rem] md:max-h-none'
const FRAME_WIDE_PIECE = 'aspect-[2.37]'
const IMAGE_FRAMING = 'h-full w-full [object-fit:var(--fit-m)] [object-position:var(--pos-m)] md:[object-fit:var(--fit-d)] md:[object-position:var(--pos-d)]'
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
// Side arrows: just a chevron, centred vertically, so they stay clear of the floating WhatsApp button
// (bottom-right). The button is the invisible 44 px touch target; the chevron is faint on desktop
// until the banner is hovered or focused, and 70 % on touch screens. The focus ring shows on keyboard use.
const ARROW = 'group/arrow absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center text-white opacity-70 focus:outline-none focus-visible:opacity-100 md:opacity-60 md:group-hover:opacity-100'
const ARROW_FOCUS = 'grid h-8 w-8 place-items-center rounded-md group-focus-visible/arrow:ring-2 group-focus-visible/arrow:ring-white group-focus-visible/arrow:ring-offset-2 group-focus-visible/arrow:ring-offset-black/60'
const ARROW_ICON = 'h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]'

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <span aria-hidden="true" className={ARROW_FOCUS}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={ARROW_ICON}>
        <path d={direction === 'left' ? 'M12.5 4 6.5 10l6 6' : 'M7.5 4l6 6-6 6'} />
      </svg>
    </span>
  )
}

/** Current camera photo: what the panel shows when there are no published banners. */
function FallbackArt() {
  return (
    <div
      aria-hidden="true"
      className="aspect-[2.37] self-center bg-no-repeat md:aspect-auto md:self-stretch"
      style={{
        backgroundImage: 'url(/images/home/storefront-art.png)',
        backgroundSize: '188% 251%',
        backgroundPosition: '100% 16.6%',
      }}
    />
  )
}

function Slide({ campaign, index, count, active }: { campaign: HeroCampaign; index: number; count: number; active: boolean }) {
  const desktop = resolveCampaignImageUrl(campaign.imageDesktopUrl)
  const mobile = campaign.imageMobileUrl ? resolveCampaignImageUrl(campaign.imageMobileUrl) : null
  // React 18 does not know `fetchPriority`; the lowercase attribute reaches the DOM.
  // Below 768 px the mobile image is shown, so its own framing applies; without one the phone shows
  // the desktop image and therefore the desktop framing. Variables + utility classes switch at `md`.
  const mobileFit = mobile ? campaign.fitMobile ?? campaign.fit : campaign.fit
  const mobilePosition = mobile ? `${campaign.focusMobileX ?? campaign.focusX}% ${campaign.focusMobileY ?? campaign.focusY}%` : `${campaign.focusX}% ${campaign.focusY}%`
  const framing = {
    '--fit-d': campaign.fit,
    '--pos-d': `${campaign.focusX}% ${campaign.focusY}%`,
    '--fit-m': mobileFit,
    '--pos-m': mobilePosition,
  } as CSSProperties
  const priority = index === 0 ? { fetchpriority: 'high' } : { loading: 'lazy' as const }

  return (
    <div
      role="group"
      aria-roledescription="diapositiva"
      aria-label={`${index + 1} de ${count}`}
      aria-hidden={active ? undefined : true}
      className={`absolute inset-0 transition-[opacity,visibility] duration-500 motion-reduce:transition-none ${active ? 'visible opacity-100' : 'invisible opacity-0'}`}
    >
      <CampaignLink url={campaign.linkUrl} className={`block h-full w-full ${FOCUS}`}>
        <picture>
          {mobile && <source media="(max-width: 767px)" srcSet={mobile} />}
          <img
            src={desktop}
            alt={campaign.alt}
            decoding="async"
            className={IMAGE_FRAMING}
            style={framing}
            {...priority}
          />
        </picture>
      </CampaignLink>
    </div>
  )
}

function useTabHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden')
  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return hidden
}

interface HeroBannerProps {
  campaigns: HeroCampaign[]
}

/**
 * Sliding banner of the home hero. With no campaigns it renders exactly the
 * camera photo the panel always had, so the hero is never empty.
 */
export default function HeroBanner({ campaigns }: HeroBannerProps) {
  const count = campaigns.length
  const reducedMotion = usePrefersReducedMotion()
  const tabHidden = useTabHidden()
  const [index, setIndex] = useState(0)
  const [interacting, setInteracting] = useState(false)

  const mobileFrame = count > 0 && campaigns.every((campaign) => !!campaign.imageMobileUrl)
  const current = count > 0 ? Math.min(index, count - 1) : 0
  const running = count > 1 && !reducedMotion && !interacting && !tabHidden

  useEffect(() => {
    if (!running) return undefined
    const timer = window.setTimeout(() => setIndex(nextIndex(current, 1, count)), HERO_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [running, current, count])

  if (count === 0) return <FallbackArt />

  const go = (delta: number) => setIndex(nextIndex(current, delta, count))

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Promociones"
      className={`group ${PANEL} ${mobileFrame ? FRAME_MOBILE_PIECE : FRAME_WIDE_PIECE}`}
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInteracting(false)
      }}
    >
      <div aria-live={running ? 'off' : 'polite'} className="absolute inset-0">
        {campaigns.map((campaign, i) => (
          <Slide key={campaign.id} campaign={campaign} index={i} count={count} active={i === current} />
        ))}
      </div>

      {count > 1 && (
        <>
          <button type="button" aria-label="Banner anterior" className={`${ARROW} left-0 md:left-1`} onClick={() => go(-1)}>
            <Chevron direction="left" />
          </button>
          <button type="button" aria-label="Banner siguiente" className={`${ARROW} right-0 md:right-1`} onClick={() => go(1)}>
            <Chevron direction="right" />
          </button>
        </>
      )}
    </section>
  )
}
