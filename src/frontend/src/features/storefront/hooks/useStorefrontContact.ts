import { useEffect, useSyncExternalStore } from 'react'
import { fetchPublicStorefrontContact } from '../../../services/public-storefront-contact.service'
import type { StorefrontContact } from '../../../services/storefront-contact.service'
import {
  BUSINESS_HOURS,
  BUSINESS_HOURS_SHORT,
  CUSTOMER_SERVICE_EMAIL,
  SALES_LINE_DISPLAY,
  SALES_LINE_HREF,
  SALES_PHONE_DISPLAY,
  SALES_PHONE_HREF,
  SALES_WHATSAPP_NUMBER,
  WHATSAPP_MESSAGES,
} from '../constants/contact'

export type StorefrontContactStatus = 'loading' | 'ready' | 'error'

/**
 * Contacto ya hidratado para pintar: siempre completo, nunca un hueco. Los
 * `href` de teléfono y WhatsApp se derivan de los números E.164 en el momento
 * del render (nunca a nivel de módulo), porque el dato ahora es asíncrono.
 */
export interface StorefrontContactView {
  /** Presentación legible de la línea nacional, p. ej. "(601) 123 4567". */
  nationalPhoneDisplay: string
  nationalPhoneHref: string
  /** `null` cuando no hay línea de ventas guardada: el consumidor no pinta la fila. */
  salesLineDisplay: string | null
  salesLineHref: string | null
  email: string
  businessHours: string
  businessHoursShort: string
  /**
   * Mensaje prellenado del enlace "Vende con nosotros" del pie. Es el único
   * mensaje editable: el backend sólo guarda `sellWithUsMessage`. El mensaje
   * de la píldora "Contáctenos" de la barra superior no es editable porque no
   * está en el modelo —el consumidor usa la constante `WHATSAPP_MESSAGES.contact`—
   * igual que `projects` y `wholesale`, que siguen siendo constantes para no
   * perder su contenido.
   */
  sellWithUsMessage: string
  /** Enlace de WhatsApp, con mensaje prellenado cuando se le pasa uno. */
  whatsappUrl: (message?: string) => string
}

export interface StorefrontContactState {
  status: StorefrontContactStatus
  contact: StorefrontContactView
  retry: () => void
}

interface StorefrontContactSnapshot {
  status: StorefrontContactStatus
  data: StorefrontContact | null
}

/**
 * Caché a nivel de módulo: la barra superior, el pie, los canales de venta y
 * la ficha de producto comparten una sola petición por sesión. Sólo se cachea
 * el éxito; un error queda publicado para que `retry()` pueda volver a
 * intentarlo. Mientras no haya datos —o si el API falla— los consumidores
 * reciben las constantes de `constants/contact.ts`: la tienda nunca queda en
 * blanco.
 */
let snapshot: StorefrontContactSnapshot = { status: 'loading', data: null }
let pending: Promise<void> | null = null
let requestId = 0
const listeners = new Set<() => void>()

function publish(next: StorefrontContactSnapshot): void {
  snapshot = next
  for (const listener of [...listeners]) listener()
}

export function getStorefrontContactSnapshot(): StorefrontContactSnapshot {
  return snapshot
}

export function subscribeStorefrontContact(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Arranca un intento sin deduplicarlo. `requestId` mantiene a una respuesta
 * obsoleta (p. ej. un `retry()` en vuelo) de pisar el intento vigente.
 */
function startLoad(): Promise<void> {
  const id = ++requestId
  publish({ status: 'loading', data: null })

  const request: Promise<void> = fetchPublicStorefrontContact()
    .then((data) => {
      if (id === requestId) publish({ status: 'ready', data })
    })
    .catch(() => {
      if (id === requestId) publish({ status: 'error', data: null })
    })
    .then(() => {
      if (id === requestId) pending = null
    })

  pending = request
  return request
}

/** Carga el contacto una vez por sesión; si ya está listo no vuelve a pedir. */
export function loadStorefrontContact(): Promise<void> {
  if (snapshot.status === 'ready') return Promise.resolve()
  if (pending) return pending
  return startLoad()
}

/** Descarta lo cacheado (incluido el error) y vuelve a pedir. */
export function retryStorefrontContact(): void {
  void startLoad()
}

/** Enlace de WhatsApp con mensaje prellenado; espejo de `whatsappUrl()` de las constantes. */
function waUrl(e164: string, message?: string): string {
  const base = `https://wa.me/${e164}`
  return message === undefined ? base : `${base}?text=${encodeURIComponent(message)}`
}

/**
 * Presentación de un número en E.164 colombiano sin `+`: quita el 57 de país y
 * agrupa como siempre se mostró —"(601) 123 4567" con 10 dígitos y
 * "(6) 123 4567" con 8—, para que el copy de la barra no cambie cuando el dato
 * viene del API. Si el número no encaja en esos casos se muestra tal cual.
 */
function formatE164(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  const withoutCountry = digits.startsWith('57') ? digits.slice(2) : digits
  const national =
    withoutCountry.length === 8 || withoutCountry.length === 10 ? withoutCountry : digits

  if (national.length === 10) return `(${national.slice(0, 3)}) ${national.slice(3, 6)} ${national.slice(6)}`
  if (national.length === 8) return `(${national.slice(0, 1)}) ${national.slice(1, 4)} ${national.slice(4)}`
  return e164
}

function hydrate(data: StorefrontContact | null): StorefrontContactView {
  if (data === null) {
    // Carga en curso o API caído: los valores de siempre, que ya están probados.
    return {
      nationalPhoneDisplay: SALES_PHONE_DISPLAY,
      nationalPhoneHref: SALES_PHONE_HREF,
      salesLineDisplay: SALES_LINE_DISPLAY,
      salesLineHref: SALES_LINE_HREF,
      email: CUSTOMER_SERVICE_EMAIL,
      businessHours: BUSINESS_HOURS,
      businessHoursShort: BUSINESS_HOURS_SHORT,
      sellWithUsMessage: WHATSAPP_MESSAGES.sellWithUs,
      whatsappUrl: (message?: string) => waUrl(SALES_WHATSAPP_NUMBER, message),
    }
  }

  return {
    nationalPhoneDisplay: formatE164(data.nationalPhone),
    nationalPhoneHref: `tel:+${data.nationalPhone}`,
    salesLineDisplay: data.salesPhone === null ? null : formatE164(data.salesPhone),
    salesLineHref: data.salesPhone === null ? null : `tel:+${data.salesPhone}`,
    email: data.email,
    businessHours: data.businessHoursFull,
    businessHoursShort: data.businessHoursShort,
    sellWithUsMessage: data.sellWithUsMessage,
    whatsappUrl: (message?: string) => waUrl(data.whatsappPhone ?? data.nationalPhone, message),
  }
}

export function useStorefrontContact(): StorefrontContactState {
  const current = useSyncExternalStore(
    subscribeStorefrontContact,
    getStorefrontContactSnapshot,
    getStorefrontContactSnapshot,
  )

  useEffect(() => {
    void loadStorefrontContact()
  }, [])

  return {
    status: current.status,
    contact: hydrate(current.data),
    retry: retryStorefrontContact,
  }
}
