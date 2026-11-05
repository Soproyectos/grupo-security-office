/**
 * Sales contact of the storefront: the single place every phone, WhatsApp
 * number and email of the chrome, footer, sales channels and product pages
 * read from.
 */

// The only published contact number: the WhatsApp button of gruposecurity.co
// (wa.me/3160275100, Colombian mobile, country code 57 added). Every contact
// action of the storefront goes through WhatsApp.
export const SALES_WHATSAPP_NUMBER = '573160275100'
export const SALES_PHONE_DISPLAY = '316 027 5100'

/** Prefilled WhatsApp messages of the commercial entry points. */
export const WHATSAPP_MESSAGES = {
  contact: 'Hola, quiero asesoría comercial de Grupo Security.',
  projects: 'Hola, quiero cotizar un proyecto de seguridad electrónica.',
  wholesale: 'Hola, quiero información sobre precios al por mayor para distribuidores e instaladores.',
  sellWithUs: 'Hola, quiero información para vender mis productos con Grupo Security.',
} as const

/** Prefilled message of the "configure equipment" support request; `need` completes "necesito ...". */
export function configureSupportMessage(need: string): string {
  return `Hola, compré una cámara en Grupo Security y necesito ${need}.\nReferencia: [escribe la referencia]\nFactura o pedido: [escribe el número]`
}

/** WhatsApp link, with a prefilled message when one is given. */
export function whatsappUrl(message?: string): string {
  const base = `https://wa.me/${SALES_WHATSAPP_NUMBER}`
  return message === undefined ? base : `${base}?text=${encodeURIComponent(message)}`
}
