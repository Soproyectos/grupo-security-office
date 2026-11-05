/**
 * Pure rules of the «Marketing y mercadeo → Banners» panel: image measures,
 * browser-side validation (the server stays the authority), status labels and
 * the framing used by the previews. No React, no network.
 */
import type { StorefrontCampaigns } from '../storefront/utils/campaigns'

export type CampaignKind = 'HERO' | 'POPUP'
export type CampaignSlot = 'desktop' | 'mobile' | 'image'
export type CampaignFit = 'cover' | 'contain'

export interface ImageRule {
  readonly title: string
  /** Name used inside error messages (same wording as the server). */
  readonly label: string
  readonly minWidth: number
  readonly minRatio: number
  readonly maxRatio: number
  readonly recommended: { readonly width: number; readonly height: number }
}

/**
 * Mirror of `CAMPAIGN_IMAGE_RULES` in
 * `src/backend/src/modules/marketing-campaigns/marketing-campaigns.rules.ts`
 * (desktop 1200 x 520, mobile 900 x 675, pop-up 900 x 900). If the backend
 * values change, change them here too: the server rejects what does not fit.
 */
export const CAMPAIGN_IMAGE_RULES: Readonly<Record<CampaignSlot, ImageRule>> = Object.freeze({
  desktop: { title: 'Escritorio', label: 'el banner de escritorio', minWidth: 1000, minRatio: 2.0, maxRatio: 2.6, recommended: { width: 1200, height: 520 } },
  mobile: { title: 'Móvil', label: 'el banner de móvil', minWidth: 600, minRatio: 1.2, maxRatio: 1.5, recommended: { width: 900, height: 675 } },
  image: { title: 'Pop-up', label: 'la ventana emergente', minWidth: 600, minRatio: 0.6, maxRatio: 1.8, recommended: { width: 900, height: 900 } },
})

/** Same origin: `MAX_IMAGE_BYTES`, `MAX_IMAGE_SIDE_PX`, `MAX_PUBLISHED`, field limits. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024
export const MAX_IMAGE_SIDE_PX = 6000
export const MAX_PUBLISHED: Readonly<Record<CampaignKind, number>> = Object.freeze({ HERO: 6, POPUP: 1 })
export const MAX_NAME_LENGTH = 120
export const MAX_ALT_LENGTH = 200
export const MAX_LINK_LENGTH = 500

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const ACCEPTED_IMAGE_ATTR = ACCEPTED_IMAGE_TYPES.join(',')
export const ACCEPTED_FORMATS_LABEL = 'PNG, JPEG o WebP'

export const CONFLICT_NOTICE = 'Otra persona cambió esto; recarga para ver la versión nueva'

const ratioLabel = (value: number) => value.toFixed(1)

/** One line with every measure of a slot, shown above each upload field. */
export function measureGuideText(slot: CampaignSlot): string {
  const rule = CAMPAIGN_IMAGE_RULES[slot]
  return `${rule.recommended.width} × ${rule.recommended.height} px recomendado · ancho mínimo ${rule.minWidth} px · proporción entre ${ratioLabel(rule.minRatio)} y ${ratioLabel(rule.maxRatio)} · máximo 3 MB · ${ACCEPTED_FORMATS_LABEL}`
}

export const SLOTS_BY_KIND: Readonly<Record<CampaignKind, readonly CampaignSlot[]>> = Object.freeze({
  HERO: ['desktop', 'mobile'],
  POPUP: ['image'],
})

// --------------------------------------------------------- image validation

/** Type and weight, checked before reading the pixels. Null when fine. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `El archivo debe ser una imagen ${ACCEPTED_FORMATS_LABEL}.`
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1).replace('.', ',')
    return `La imagen pesa ${mb} MB; el máximo es 3 MB.`
  }
  return null
}

/** Size of the pixels for a slot; the message states what was found and what is expected. */
export function validateImageDimensions(size: { width: number; height: number }, slot: CampaignSlot): string | null {
  const rule = CAMPAIGN_IMAGE_RULES[slot]
  const { width, height } = size
  const suggestion = `para ${rule.label} sube una de ${rule.recommended.width} × ${rule.recommended.height} px aproximadamente`
  const measure = `La imagen mide ${width} × ${height} px`
  if (!(width > 0) || !(height > 0)) return 'No se pudo leer el tamaño de la imagen.'
  if (width > MAX_IMAGE_SIDE_PX || height > MAX_IMAGE_SIDE_PX) {
    return `${measure}; el lado máximo es ${MAX_IMAGE_SIDE_PX} px, ${suggestion}.`
  }
  if (width < rule.minWidth) return `${measure}; el ancho mínimo es ${rule.minWidth} px, ${suggestion}.`
  const ratio = width / height
  if (ratio < rule.minRatio || ratio > rule.maxRatio) {
    return `${measure} (proporción ${ratio.toFixed(2)}:1); ${suggestion} (proporción entre ${ratioLabel(rule.minRatio)} y ${ratioLabel(rule.maxRatio)}).`
  }
  return null
}

/** Reads the pixel size of a browser image file (not pure: needs the DOM). */
export function readImageSize(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen. Revisa que no esté dañada.'))
    }
    img.src = url
  })
}

/** Full browser-side check of a chosen file; resolves to the error message or null. */
export async function checkImageSelection(file: File, slot: CampaignSlot): Promise<string | null> {
  const fileError = validateImageFile(file)
  if (fileError) return fileError
  try {
    return validateImageDimensions(await readImageSize(file), slot)
  } catch (error) {
    return error instanceof Error ? error.message : 'No se pudo leer la imagen.'
  }
}

// ------------------------------------------------------------------ status

export interface StatusInput {
  status: 'DRAFT' | 'PUBLISHED'
  validity: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | null
  hasUnpublishedChanges: boolean
}

export interface StatusLabel {
  label: string
  tone: 'success' | 'warning' | 'error' | 'info' | 'neutral'
  /** Extra note when the published copy and the draft differ and the main label does not already say it. */
  extra: string | null
}

export function campaignStatus(campaign: StatusInput): StatusLabel {
  if (campaign.status === 'DRAFT') return { label: 'Borrador', tone: 'neutral', extra: null }
  const pending = campaign.hasUnpublishedChanges
  if (campaign.validity === 'SCHEDULED') return { label: 'Programado', tone: 'info', extra: pending ? 'Con cambios sin publicar' : null }
  if (campaign.validity === 'EXPIRED') return { label: 'Vencido', tone: 'error', extra: pending ? 'Con cambios sin publicar' : null }
  return pending
    ? { label: 'Publicado con cambios sin publicar', tone: 'warning', extra: null }
    : { label: 'Publicado', tone: 'success', extra: null }
}

// ------------------------------------------------------------------ preview

/** Frame ratio used by the previews (the desktop and mobile recommended sizes). */
export function frameAspectRatio(slot: CampaignSlot): string {
  const { width, height } = CAMPAIGN_IMAGE_RULES[slot].recommended
  return `${width} / ${height}`
}

/** Device frame of the banner preview. */
export type PreviewDevice = 'desktop' | 'mobile'

/** Width of the page canvas in the preview: a laptop screen, or a phone. */
export const PREVIEW_CANVAS_WIDTH: Readonly<Record<PreviewDevice, number>> = Object.freeze({ desktop: 1280, mobile: 390 })

/** Scale that makes a canvas fit the available width; never enlarges it. */
export function previewScale(available: number, canvas: number): number {
  if (!Number.isFinite(available) || available <= 0 || canvas <= 0) return 1
  return Math.min(1, available / canvas)
}

/** Text shown above the page while the draft has no image yet; null when there is one. */
export function emptyPreviewText(kind: CampaignKind, hasImage: boolean): string | null {
  if (hasImage) return null
  const slot: CampaignSlot = kind === 'POPUP' ? 'image' : 'desktop'
  const { width, height } = CAMPAIGN_IMAGE_RULES[slot].recommended
  return `Sube una imagen para ver cómo se verá. Medidas recomendadas: ${width} × ${height} px.`
}

interface DraftPieces {
  kind: CampaignKind
  alt: string
  fit: CampaignFit
  focusX: number
  focusY: number
  /** Mobile framing; when absent the desktop values apply. */
  fitMobile?: CampaignFit
  focusMobileX?: number
  focusMobileY?: number
  imageDesktop: string | null
  imageMobile: string | null
  image: string | null
}

/** The draft in the shape of the public campaigns the store reads, to show it in the real page. */
export function draftToCampaigns(draft: DraftPieces): StorefrontCampaigns {
  if (draft.kind === 'POPUP') {
    return { hero: [], popup: draft.image ? { id: 'preview', revision: 0, alt: draft.alt, linkUrl: null, imageUrl: draft.image } : null }
  }
  return {
    hero: draft.imageDesktop
      ? [{ id: 'preview', revision: 0, alt: draft.alt, linkUrl: null, fit: draft.fit, focusX: draft.focusX, focusY: draft.focusY, fitMobile: draft.fitMobile ?? draft.fit, focusMobileX: draft.focusMobileX ?? draft.focusX, focusMobileY: draft.focusMobileY ?? draft.focusY, imageDesktopUrl: draft.imageDesktop, imageMobileUrl: draft.imageMobile }]
      : [],
    popup: null,
  }
}

export function previewImageStyle(fit: CampaignFit, focusX: number, focusY: number): { objectFit: CampaignFit; objectPosition: string } {
  const clamp = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 50))
  return { objectFit: fit, objectPosition: `${clamp(focusX)}% ${clamp(focusY)}%` }
}

// ------------------------------------------------------------------- dates

/** Form dates are Colombia local time (UTC-5, no daylight saving), like the internal promotions. */
export function localInputToIso(value: string): string | null {
  const text = value.trim()
  if (!text) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text)) throw new Error('Indica una fecha y hora válidas')
  const date = new Date(`${text}${text.length === 16 ? ':00' : ''}-05:00`)
  if (!Number.isFinite(date.getTime())) throw new Error('Indica una fecha y hora válidas')
  return date.toISOString()
}

export function isoToLocalInput(value: string | null | undefined): string {
  if (!value) return ''
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''
  return new Date(time - 5 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

export function formatCampaignDate(value: string | null): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value))
}

export function validityText(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return 'Sin fechas: se muestra mientras esté publicado'
  if (startsAt && endsAt) return `${formatCampaignDate(startsAt)} — ${formatCampaignDate(endsAt)}`
  return startsAt ? `Desde ${formatCampaignDate(startsAt)}` : `Hasta ${formatCampaignDate(endsAt)}`
}

// ------------------------------------------------------------------ errors

export function isRevisionConflict(error: unknown, operation: 'edit' | 'other'): boolean {
  const response = (error as { response?: { status?: number; data?: { message?: unknown } } })?.response
  if (response?.status !== 409) return false
  // PATCH only answers 409 for an outdated revision; other operations also use 409 for business rules.
  if (operation === 'edit') return true
  const message = response.data?.message
  return typeof message === 'string' && message.includes('cambió mientras la editabas')
}
