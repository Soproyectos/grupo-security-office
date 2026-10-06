import api from './api'

/**
 * Contacto del storefront: los siete campos que muestran la barra superior, el
 * pie de página y los canales de venta. Es un registro único (singleton).
 */
export interface StorefrontContact {
  nationalPhone: string
  whatsappPhone: string | null
  salesPhone: string | null
  email: string
  businessHoursShort: string
  businessHoursFull: string
  sellWithUsMessage: string
}

/**
 * Cuerpo del `PUT`: los teléfonos opcionales se pueden mandar vacíos porque el
 * backend deriva el WhatsApp de la línea nacional y guarda `null` en `salesPhone`.
 */
export interface StorefrontContactPayload {
  nationalPhone: string
  whatsappPhone?: string
  salesPhone?: string
  email: string
  businessHoursShort: string
  businessHoursFull: string
  sellWithUsMessage: string
}

export const fetchStorefrontContact = async (): Promise<StorefrontContact> => {
  const res = await api.get('/storefront/contact')
  return res.data as StorefrontContact
}

export const updateStorefrontContact = async (
  payload: StorefrontContactPayload,
): Promise<StorefrontContact> => {
  const res = await api.put('/storefront/contact', payload)
  return res.data as StorefrontContact
}

// Los mensajes están copiados del DTO del backend a propósito: si divergen, el
// usuario corrige un campo dos veces —una en el panel y otra tras el 400— con
// dos redacciones distintas del mismo problema.
export const PHONE_ERROR = 'El teléfono debe estar en E.164 sin + ni espacios (7 a 15 dígitos)'
export const EMAIL_ERROR = 'El correo no tiene un formato válido'

const E164_PATTERN = /^\d{7,15}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ContactFormErrors = Partial<Record<keyof StorefrontContactPayload, string>>

/**
 * Espejo de las reglas del `UpdateStorefrontContactDto`: E.164 sin `+` ni
 * espacios y correo con formato. El backend sigue siendo la autoridad —esto
 * sólo evita un viaje de ida y vuelta por cada campo mal escrito—.
 */
export function validateStorefrontContact(
  form: StorefrontContactPayload,
): ContactFormErrors {
  const errors: ContactFormErrors = {}

  const phones: { field: keyof StorefrontContactPayload; value: string; required: boolean }[] = [
    { field: 'nationalPhone', value: form.nationalPhone, required: true },
    { field: 'whatsappPhone', value: form.whatsappPhone ?? '', required: false },
    { field: 'salesPhone', value: form.salesPhone ?? '', required: false },
  ]
  for (const { field, value, required } of phones) {
    const digits = value.trim()
    if (!digits) {
      if (required) errors[field] = PHONE_ERROR
      continue
    }
    if (!E164_PATTERN.test(digits)) errors[field] = PHONE_ERROR
  }

  if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = EMAIL_ERROR

  return errors
}