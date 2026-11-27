/** Enlace de WhatsApp (wa.me) con solo dígitos; un celular de 10 dígitos lleva el prefijo de Colombia (57). */
export function whatsappUrl(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const full = digits.length === 10 ? `57${digits}` : digits
  return `https://wa.me/${full}`
}
