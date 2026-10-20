/**
 * Sales contact of the storefront: the single place every phone, WhatsApp
 * number and email of the chrome, footer, sales channels and product pages
 * read from.
 */

// TODO: replace demo contact data before production
export const SALES_WHATSAPP_NUMBER = '576011234567'
export const SALES_PHONE_HREF = 'tel:+576011234567'
export const SALES_PHONE_DISPLAY = '(601) 123 4567'
export const SALES_LINE_HREF = 'tel:+5761234567'
export const SALES_LINE_DISPLAY = '(6) 123 4567'
export const CUSTOMER_SERVICE_EMAIL = 'serviciocliente@gruposecurity.example'
export const BUSINESS_HOURS_SHORT = 'lun a sáb 7:00 a. m. a 7:00 p. m.'
export const BUSINESS_HOURS = 'lunes a sábado de 7:00 a.m. a 7:00 p.m. · domingos y festivos de 8:00 a.m. a 2:00 p.m.'

/** Prefilled WhatsApp messages of the commercial entry points. */
export const WHATSAPP_MESSAGES = {
  contact: 'Hola, quiero asesoría comercial de Grupo Security.',
  projects: 'Hola, quiero cotizar un proyecto de seguridad electrónica.',
  wholesale: 'Hola, quiero información sobre precios al por mayor para distribuidores e instaladores.',
  sellWithUs: 'Hola, quiero información para vender mis productos con Grupo Security.',
} as const

/** WhatsApp link, with a prefilled message when one is given. */
export function whatsappUrl(message?: string): string {
  const base = `https://wa.me/${SALES_WHATSAPP_NUMBER}`
  return message === undefined ? base : `${base}?text=${encodeURIComponent(message)}`
}
