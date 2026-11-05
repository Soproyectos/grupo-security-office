import api from '../../services/api'
import type { CampaignFit, CampaignKind, CampaignSlot } from './marketing-rules'

/** Shapes of `src/backend/src/modules/marketing-campaigns` (the `{ data }` envelope is removed by the api client). */
export interface CampaignSummary {
  id: string
  revision: number
  kind: CampaignKind
  name: string
  alt: string
  linkUrl: string | null
  position: number
  startsAt: string | null
  endsAt: string | null
  fit: CampaignFit
  focusX: number
  focusY: number
  /** Mobile framing as the server resolves it: falls back to the desktop values when never set. */
  fitMobile?: CampaignFit
  focusMobileX?: number
  focusMobileY?: number
  hasImageDesktop: boolean
  hasImageMobile: boolean
  hasImage: boolean
  status: 'DRAFT' | 'PUBLISHED'
  hasPublished: boolean
  hasUnpublishedChanges: boolean
  validity: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | null
  isLive: boolean
  createdAt: string
  updatedAt: string
}

/** Draft content; images are base64 data URLs usable directly in `<img src>`. */
export interface CampaignDraft {
  kind: CampaignKind
  name: string
  alt: string
  linkUrl: string | null
  position: number
  startsAt: string | null
  endsAt: string | null
  fit: CampaignFit
  focusX: number
  focusY: number
  /** Absent in campaigns saved before the mobile framing existed (they use the desktop values). */
  fitMobile?: CampaignFit
  focusMobileX?: number
  focusMobileY?: number
  imageDesktop: string | null
  imageMobile: string | null
  image: string | null
}

export interface CampaignDetail extends CampaignSummary {
  draft: CampaignDraft
}

export interface CampaignFields {
  name?: string
  alt?: string
  linkUrl?: string | null
  position?: number
  startsAt?: string | null
  endsAt?: string | null
  fit?: CampaignFit
  focusX?: number
  focusY?: number
  fitMobile?: CampaignFit
  focusMobileX?: number
  focusMobileY?: number
}

const BASE = '/marketing/campaigns'

export const campaignsKey = ['marketing', 'campaigns'] as const
export const campaignKey = (id: string) => ['marketing', 'campaign', id] as const

export async function fetchCampaigns(): Promise<CampaignSummary[]> {
  return (await api.get(BASE)).data as CampaignSummary[]
}

export async function fetchCampaign(id: string): Promise<CampaignDetail> {
  return (await api.get(`${BASE}/${id}`)).data as CampaignDetail
}

export async function createCampaign(input: CampaignFields & { kind: CampaignKind; name: string }): Promise<CampaignDetail> {
  return (await api.post(BASE, input)).data as CampaignDetail
}

export async function updateCampaign(id: string, input: CampaignFields & { revision: number }): Promise<CampaignDetail> {
  return (await api.patch(`${BASE}/${id}`, input)).data as CampaignDetail
}

export async function uploadCampaignImage(id: string, slot: CampaignSlot, file: File): Promise<CampaignDetail> {
  const form = new FormData()
  form.append('file', file)
  return (await api.put(`${BASE}/${id}/image/${slot}`, form)).data as CampaignDetail
}

export async function removeCampaignImage(id: string, slot: CampaignSlot): Promise<CampaignDetail> {
  return (await api.delete(`${BASE}/${id}/image/${slot}`)).data as CampaignDetail
}

export async function publishCampaign(id: string, revision: number): Promise<CampaignDetail> {
  return (await api.post(`${BASE}/${id}/publish`, { revision })).data as CampaignDetail
}

export async function unpublishCampaign(id: string): Promise<CampaignDetail> {
  return (await api.post(`${BASE}/${id}/unpublish`)).data as CampaignDetail
}

export async function deleteCampaign(id: string): Promise<void> {
  await api.delete(`${BASE}/${id}`)
}
