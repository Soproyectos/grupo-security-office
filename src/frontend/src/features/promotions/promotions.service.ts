import api from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import { ROLES } from '../../lib/roles'

export interface Promotion {
  flyer?: string | null
  id: string
  title: string
  message: string
  startsAt: string
  endsAt: string
}
export interface ManagedPromotion extends Promotion {
  isActive: boolean
  audience: 'GLOBAL' | 'TEAM'
  /** COM-08: null = borrador (preparado, NO publicado); ausente = dato legacy tratado como publicado. */
  publishedAt?: string | null
}
export async function fetchCurrentPromotions(): Promise<Promotion[]> {
  return (await api.get('/promotions/current')).data as Promotion[]
}
/**
 * Cookies are shared between tabs. Never trust a persisted profile to choose
 * the publisher of an announcement after another tab signs into another account.
 */
export async function verifyPromotionPublisher(): Promise<void> {
  const previous = useAuthStore.getState().user
  const { data: current } = await api.get('/auth/profile')
  if (!current?.id || !Array.isArray(current.roles)) {
    throw new Error('No se pudo comprobar la sesión. Vuelve a iniciar sesión.')
  }
  useAuthStore.getState().login(current)
  if (!previous || previous.id !== current.id) {
    throw new Error('La cuenta de la sesión cambió en otra pestaña. Revisa el perfil actual antes de continuar.')
  }
}
export async function fetchManagedPromotions(): Promise<ManagedPromotion[]> {
  await verifyPromotionPublisher()
  return (await api.get('/promotions/manage')).data as ManagedPromotion[]
}
export async function publishPromotion(payload: Omit<Promotion, 'id'>): Promise<ManagedPromotion> {
  await verifyPromotionPublisher()
  return (await api.post('/promotions', payload)).data as ManagedPromotion
}
export async function withdrawPromotion(id: string): Promise<void> {
  await verifyPromotionPublisher()
  await api.patch(`/promotions/${id}/withdraw`)
}
/**
 * COM-08: publicación EXPLÍCITA de un borrador (acción `commercialPromotions:publish`
 * en servidor; 409 si ya estaba publicado, 400 si la vigencia venció, 403 sin permiso).
 */
export async function publishDraftPromotion(id: string): Promise<ManagedPromotion> {
  await verifyPromotionPublisher()
  return (await api.patch(`/promotions/${id}/publish`)).data as ManagedPromotion
}
export function promotionDate(value: string): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value))
}

export function promotionStatus(promotion: ManagedPromotion, now = Date.now()): string {
  // COM-08: preparar NO publica — un borrador nunca se presenta como vigente.
  if (promotion.publishedAt === null) return 'Borrador'
  if (!promotion.isActive) return 'Retirada'
  if (new Date(promotion.endsAt).getTime() <= now) return 'Vencida'
  return new Date(promotion.startsAt).getTime() > now ? 'Programada' : 'Vigente'
}

/** Form inputs are Colombia local time; never rely on browser/server timezone. */
export function promotionLocalTimeToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    throw new Error('Indica una fecha y hora válidas para la promoción')
  }
  const date = new Date(`${value}${value.length === 16 ? ':00' : ''}-05:00`)
  if (!Number.isFinite(date.getTime())) throw new Error('La fecha de la promoción no es válida')
  return date.toISOString()
}

export async function editPromotion(id: string, payload: Omit<Promotion, 'id' | 'flyer'>): Promise<ManagedPromotion> {
  await verifyPromotionPublisher()
  return (await api.patch(`/promotions/${id}`, payload)).data as ManagedPromotion
}
export async function uploadPromotionFlyer(id: string, file: File): Promise<void> {
  await verifyPromotionPublisher()
  const form = new FormData()
  form.append('file', file)
  await api.post(`/promotions/${id}/flyer`, form)
}
export async function removePromotionFlyer(id: string): Promise<void> {
  await verifyPromotionPublisher()
  await api.delete(`/promotions/${id}/flyer`)
}
export function promotionInputTime(value: string): string {
  return new Date(new Date(value).getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 16)
}
