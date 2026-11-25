import type { MenuCategory } from '../../types/categoryMenu'

const photo = (slug: string): string => `/images/menu/${slug}.jpg`

/** Photos shipped with the storefront (public/images/menu), keyed by category slug. */
export const MENU_IMAGES: Readonly<Record<string, string>> = {
  camaras: photo('camaras'),
  alarmas: photo('alarmas'),
  'control-de-acceso': photo('control-de-acceso'),
  cableado: photo('cableado'),
  'redes-y-wi-fi': photo('redes-y-wi-fi'),
  parqueaderos: photo('parqueaderos'),
  'audio-y-perifoneo': photo('audio-y-perifoneo'),
  'energia-y-electricidad': photo('energia-y-electricidad'),
  'monitores-y-pantallas': photo('monitores-y-pantallas'),
}

/**
 * Photo of a category: the one the backend sends, else the bundled photo for
 * its slug, else `null` (the caller paints a plain neutral frame).
 */
export function categoryImage(node: Pick<MenuCategory, 'slug' | 'imageUrl'>): string | null {
  if (node.imageUrl) return node.imageUrl
  return Object.prototype.hasOwnProperty.call(MENU_IMAGES, node.slug) ? (MENU_IMAGES[node.slug] ?? null) : null
}
