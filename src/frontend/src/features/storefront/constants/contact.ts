/**
 * Sales contact of the storefront. DEMO data, the same number the footer and
 * the sales-channels section show: replace it in one place when the real line
 * is available.
 */
export const SALES_WHATSAPP_NUMBER = '576011234567'
export const SALES_PHONE_HREF = 'tel:+576011234567'

/** WhatsApp link with a prefilled message. */
export function whatsappUrl(message: string): string {
  return `https://wa.me/${SALES_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}
