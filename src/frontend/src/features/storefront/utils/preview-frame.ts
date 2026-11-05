import { normalizeCampaigns, type StorefrontCampaigns } from './campaigns'

/**
 * The admin panel previews a banner or pop-up by loading the real home page in a same-origin
 * iframe (`/tienda?vista-previa-campana=1`) and posting the draft to it. Inside that iframe the
 * page never calls the campaigns API, shows the pop-up at once and does not mark it as seen.
 */
export const PREVIEW_PARAM = 'vista-previa-campana'
export const PREVIEW_PATH = `/tienda?${PREVIEW_PARAM}=1`
export const PREVIEW_READY = 'gs-campaign-preview:ready'
export const PREVIEW_DATA = 'gs-campaign-preview:data'
export const PREVIEW_LAYOUT = 'gs-campaign-preview:layout'

/** `banner`: scroll the iframe so the banner is at the top; `top`: show the page from the top. */
export type PreviewAlign = 'banner' | 'top'

/** Where the banner is inside the iframe page, in the iframe's own CSS pixels. */
export interface PreviewLayout {
  left: number
  width: number
  height: number
  /** Height of the store header above the banner (it stays pinned while the page scrolls). */
  headerHeight: number
}

/** True only inside the admin preview iframe; a normal visit to /tienda is never affected. */
export function isCampaignPreviewFrame(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top && new URLSearchParams(window.location.search).has(PREVIEW_PARAM)
  } catch {
    return false
  }
}

/** The draft sent by the admin window, or null for any other message (or another origin). */
export function readPreviewMessage(event: Pick<MessageEvent, 'data' | 'origin' | 'source'>): { campaigns: StorefrontCampaigns; align: PreviewAlign } | null {
  if (typeof window === 'undefined' || event.origin !== window.location.origin || event.source !== window.parent) return null
  const data: unknown = event.data
  if (typeof data !== 'object' || data === null || (data as { type?: unknown }).type !== PREVIEW_DATA) return null
  const { campaigns, align } = data as { campaigns?: unknown; align?: unknown }
  return { campaigns: normalizeCampaigns(campaigns), align: align === 'banner' ? 'banner' : 'top' }
}

/** The banner position reported by the iframe, or null for any other message (or another window). */
export function readLayoutMessage(event: Pick<MessageEvent, 'data' | 'origin' | 'source'>, frame: unknown): PreviewLayout | null {
  if (typeof window === 'undefined' || event.origin !== window.location.origin || event.source !== frame) return null
  const data = event.data as { type?: unknown; layout?: Partial<PreviewLayout> } | null
  if (!data || data.type !== PREVIEW_LAYOUT || !data.layout) return null
  const { left, width, height } = data.layout
  const headerHeight = typeof data.layout.headerHeight === 'number' && data.layout.headerHeight >= 0 ? data.layout.headerHeight : 0
  if (typeof left !== 'number' || typeof width !== 'number' || typeof height !== 'number') return null
  return [left, width, height].every(Number.isFinite) && width > 0 && height > 0 ? { left, width, height, headerHeight } : null
}
