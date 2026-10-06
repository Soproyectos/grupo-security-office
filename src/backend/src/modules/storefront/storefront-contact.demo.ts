/**
 * Datos de contacto demo del storefront. Viven en el backend porque dos
 * consumidores los necesitan y deben coincidir: el seed (fila inicial de
 * `storefront_contacts`) y el fallback del endpoint público cuando la tabla
 * todavía no tiene fila — una tienda nunca puede quedar en blanco por un dato
 * de contacto ausente.
 *
 * Son los mismos valores que las constantes del storefront
 * (`src/frontend/src/features/storefront/constants/contact.ts`) y son DEMO:
 * el coordinador los cambia desde el panel antes de producción.
 */
export const DEMO_STOREFRONT_CONTACT = {
  nationalPhone: '576011234567',
  whatsappPhone: '576011234567',
  salesPhone: '5761234567',
  email: 'serviciocliente@gruposecurity.example',
  businessHoursShort: 'lun a sáb 7:00 a. m. a 7:00 p. m.',
  businessHoursFull:
    'lunes a sábado de 7:00 a.m. a 7:00 p.m. · domingos y festivos de 8:00 a.m. a 2:00 p.m.',
  sellWithUsMessage: 'Hola, quiero información para vender mis productos con Grupo Security.',
} as const;