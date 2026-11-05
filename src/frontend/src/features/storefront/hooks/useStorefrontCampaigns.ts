import { useEffect, useState } from 'react'
import { fetchStorefrontCampaigns } from '../../../services/storefront-campaigns.service'
import { EMPTY_CAMPAIGNS, type StorefrontCampaigns } from '../utils/campaigns'
import { PREVIEW_LAYOUT, PREVIEW_READY, isCampaignPreviewFrame, readPreviewMessage, type PreviewAlign, type PreviewLayout } from '../utils/preview-frame'

export type CampaignsStatus = 'loading' | 'ready' | 'error'

type CampaignsState = { status: CampaignsStatus; campaigns: StorefrontCampaigns }

/** Events that would open, send or navigate: swallowed inside the admin preview, which is read-only. */
const BLOCKED_EVENTS = ['click', 'auxclick', 'dblclick', 'submit', 'mousedown', 'contextmenu', 'dragstart', 'keydown'] as const

/**
 * Admin preview: the draft comes from the parent window and nothing is requested. The page can be
 * scrolled but not used: clicks, submits and keys are swallowed. It aligns to the banner only when
 * it loads or the draft changes, never while the person is scrolling, and tells the parent where
 * the banner is.
 */
function startPreviewFrame(setState: (state: CampaignsState) => void): () => void {
  let align: PreviewAlign = 'top'
  let hasBanner = false
  let last = ''
  let frame = 0
  let userScrolled = false
  let lastAuto = 0
  const timers: number[] = []

  const alignNow = () => {
    const banner = hasBanner ? document.querySelector('section[aria-roledescription="carrusel"]') : null
    const header = document.querySelector('header')
    const headerHeight = header ? header.getBoundingClientRect().height : 0
    if (!banner) {
      if (!userScrolled) window.scrollTo(0, 0)
      return
    }
    const rect = banner.getBoundingClientRect()
    const top = rect.top + window.scrollY
    const layout: PreviewLayout = { left: rect.left + window.scrollX, width: rect.width, height: rect.height, headerHeight }
    if (!userScrolled) {
      lastAuto = performance.now()
      window.scrollTo(0, align === 'banner' ? Math.max(0, top - headerHeight) : 0)
    }
    const key = JSON.stringify(layout)
    if (key !== last) {
      last = key
      window.parent.postMessage({ type: PREVIEW_LAYOUT, layout }, window.location.origin)
    }
  }
  const schedule = () => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(alignNow)
  }
  const settle = () => {
    schedule()
    timers.forEach((id) => window.clearTimeout(id))
    timers.length = 0
    timers.push(window.setTimeout(schedule, 300), window.setTimeout(schedule, 1200))
  }
  const onScroll = () => {
    if (performance.now() - lastAuto > 150) userScrolled = true
  }
  const block = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const onMessage = (event: MessageEvent) => {
    const message = readPreviewMessage(event)
    if (!message) return
    align = message.align
    hasBanner = message.campaigns.hero.length > 0
    last = ''
    userScrolled = false
    setState({ status: 'ready', campaigns: message.campaigns })
    settle()
  }
  // The header stays pinned (the banner is shown right under it) and the floating WhatsApp button,
  // fixed to the viewport, would cover the corner of the banner.
  const style = document.createElement('style')
  style.textContent = 'header { position: sticky !important; top: 0; z-index: 40; } a.fixed.bottom-5.right-5 { display: none !important; }'
  document.head.appendChild(style)
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  observer?.observe(document.body)
  BLOCKED_EVENTS.forEach((name) => document.addEventListener(name, block, true))
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('message', onMessage)
  window.addEventListener('load', settle)
  document.addEventListener('load', schedule, true)
  window.parent.postMessage({ type: PREVIEW_READY }, window.location.origin)
  return () => {
    observer?.disconnect()
    style.remove()
    BLOCKED_EVENTS.forEach((name) => document.removeEventListener(name, block, true))
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('message', onMessage)
    window.removeEventListener('load', settle)
    document.removeEventListener('load', schedule, true)
    window.cancelAnimationFrame(frame)
    timers.forEach((id) => window.clearTimeout(id))
  }
}

/**
 * One request for the banner and the pop-up. While it loads, or if it fails,
 * the campaigns are empty, so the page keeps its fallback art and never jumps.
 */
export function useStorefrontCampaigns(): CampaignsState {
  const [state, setState] = useState<CampaignsState>({
    status: 'loading',
    campaigns: EMPTY_CAMPAIGNS,
  })

  useEffect(() => {
    if (isCampaignPreviewFrame()) return startPreviewFrame(setState)
    const controller = new AbortController()
    fetchStorefrontCampaigns(controller.signal)
      .then((campaigns) => {
        if (!controller.signal.aborted) setState({ status: 'ready', campaigns })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error', campaigns: EMPTY_CAMPAIGNS })
      })
    return () => controller.abort()
  }, [])

  return state
}
