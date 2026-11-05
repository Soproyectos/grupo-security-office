import { resolveAssetUrl } from '../../../services/api'

export type CampaignFit = 'cover' | 'contain'

export interface HeroCampaign {
  id: string
  revision: number
  alt: string
  linkUrl: string | null
  fit: CampaignFit
  focusX: number
  focusY: number
  /** Framing of the mobile image (below 768 px); equals the desktop values when the server sends none. */
  fitMobile?: CampaignFit
  focusMobileX?: number
  focusMobileY?: number
  imageDesktopUrl: string
  imageMobileUrl: string | null
}

export interface PopupCampaign {
  id: string
  revision: number
  alt: string
  linkUrl: string | null
  imageUrl: string
}

export interface StorefrontCampaigns {
  hero: HeroCampaign[]
  popup: PopupCampaign | null
}

export const EMPTY_CAMPAIGNS: StorefrontCampaigns = { hero: [], popup: null }

/** The API already caps the hero list; the client enforces it defensively. */
export const MAX_HERO_CAMPAIGNS = 6

export const HERO_INTERVAL_MS = 6000
export const POPUP_DELAY_MS = 3000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asLink(value: unknown): string | null {
  const text = asText(value)
  return text && linkKind(text) ? text : null
}

function asPercent(value: unknown, fallback = 50): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(100, Math.max(0, number))
}

function toHero(raw: unknown): HeroCampaign | null {
  if (!isRecord(raw)) return null
  const id = asText(raw.id)
  const imageDesktopUrl = asText(raw.imageDesktopUrl)
  if (!id || !imageDesktopUrl) return null
  const fit: CampaignFit = raw.fit === 'contain' ? 'contain' : 'cover'
  const focusX = asPercent(raw.focusX)
  const focusY = asPercent(raw.focusY)
  return {
    id,
    revision: typeof raw.revision === 'number' ? raw.revision : 0,
    alt: typeof raw.alt === 'string' ? raw.alt : '',
    linkUrl: asLink(raw.linkUrl),
    fit,
    focusX,
    focusY,
    fitMobile: raw.fitMobile === 'contain' || raw.fitMobile === 'cover' ? raw.fitMobile : fit,
    focusMobileX: asPercent(raw.focusMobileX, focusX),
    focusMobileY: asPercent(raw.focusMobileY, focusY),
    imageDesktopUrl,
    imageMobileUrl: asText(raw.imageMobileUrl),
  }
}

function toPopup(raw: unknown): PopupCampaign | null {
  if (!isRecord(raw)) return null
  const id = asText(raw.id)
  const imageUrl = asText(raw.imageUrl)
  if (!id || !imageUrl) return null
  return {
    id,
    revision: typeof raw.revision === 'number' ? raw.revision : 0,
    alt: typeof raw.alt === 'string' ? raw.alt : '',
    linkUrl: asLink(raw.linkUrl),
    imageUrl,
  }
}

/**
 * Reads the public campaigns payload. The envelope may arrive wrapped one or
 * more times (`{ data: { data: ... } }`) depending on the interceptors, so it
 * unwraps until the `hero` list shows up. Anything unexpected is "no campaigns".
 */
export function normalizeCampaigns(payload: unknown): StorefrontCampaigns {
  let value = payload
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(value)) return EMPTY_CAMPAIGNS
    if ('hero' in value || 'popup' in value) break
    value = value.data
  }
  if (!isRecord(value)) return EMPTY_CAMPAIGNS

  const hero = (Array.isArray(value.hero) ? value.hero : [])
    .map(toHero)
    .filter((item): item is HeroCampaign => item !== null)
    .slice(0, MAX_HERO_CAMPAIGNS)
  return { hero, popup: toPopup(value.popup) }
}

/** Resolves a (relative) image URL from the API against the backend origin. */
export function resolveCampaignImageUrl(url: string): string {
  return resolveAssetUrl(url)
}

/** Internal routes use the router; only http(s) links open as external. */
export function linkKind(url: string | null): 'internal' | 'external' | null {
  if (!url) return null
  if (url.startsWith('/') && !url.startsWith('//')) return 'internal'
  if (/^https?:\/\//i.test(url)) return 'external'
  return null
}

/** Index after moving `delta` slides, wrapping around the `count` slides. */
export function nextIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return 0
  return (((current + delta) % count) + count) % count
}

export function popupSessionKey(popup: Pick<PopupCampaign, 'id' | 'revision'>): string {
  return `storefront:popup:${popup.id}:${popup.revision}`
}

/** Minimal storage surface, so the rule can be tested without a browser. */
export interface SeenStore {
  getItem(key: string): string | null
}

function sessionStore(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

/** Whether this campaign and revision were already shown in this session. */
export function wasPopupSeen(popup: Pick<PopupCampaign, 'id' | 'revision'>, store: SeenStore | null = sessionStore()): boolean {
  if (!store) return false
  try {
    return store.getItem(popupSessionKey(popup)) !== null
  } catch {
    return false
  }
}

export function markPopupSeen(popup: Pick<PopupCampaign, 'id' | 'revision'>): void {
  try {
    sessionStore()?.setItem(popupSessionKey(popup), '1')
  } catch {
    // Storage unavailable: the pop-up simply may show again on the next visit.
  }
}

/** The pop-up is shown only when there is one and it was not seen this session. */
export function shouldShowPopup(popup: PopupCampaign | null, store: SeenStore | null = sessionStore()): boolean {
  return popup !== null && !wasPopupSeen(popup, store)
}
