/**
 * Catalog picks of the storefront home, in one place so a change of stock only
 * touches this file. Slugs are the top-level categories of the public menu (/public/categories/menu):
 * a shelf whose category is empty hides itself, but a wrong slug is a silent
 * gap on the home.
 */

export interface HomeShelf {
  /** Category slug served by `GET /api/public/products?category=`. */
  slug: string
  title: string
}

/** Products per shelf. */
export const HOME_SHELF_LIMIT = 4

export const HOME_SHELVES: HomeShelf[] = [
  { slug: 'camaras', title: 'Cámaras' },
  { slug: 'alarmas', title: 'Alarmas' },
  { slug: 'control-de-acceso', title: 'Control de acceso' },
  { slug: 'casa-inteligente', title: 'Casa inteligente' },
]

/** Support categories shown as a plain mosaic (no products) under the shelves. */
export const HOME_OTHER_CATEGORIES: HomeShelf[] = [
  { slug: 'redes-y-wi-fi', title: 'Redes y Wi-Fi' },
  { slug: 'energia-y-electricidad', title: 'Energía y electricidad' },
  { slug: 'audio-y-perifoneo', title: 'Audio y perifoneo' },
  { slug: 'parqueaderos', title: 'Parqueaderos' },
]

/** Cap of the "Compra por categoría" tiles. */
export const HOME_CATEGORY_TILE_LIMIT = 8

export interface HomeBrand {
  label: string
  /**
   * Text sent to the catalog search. The public search matches product name and
   * SKU, not the brand column, so a few brands need a term that appears in
   * their product names instead of the brand itself.
   */
  query: string
}

export const HOME_BRANDS: HomeBrand[] = [
  { label: 'Hikvision', query: 'Hikvision' },
  { label: 'Accessmatic', query: 'Accessmatic' },
  { label: 'Powest', query: 'Powest' },
  { label: 'Fuli Battery', query: 'Batería' },
  { label: 'Western Digital', query: 'WD' },
  { label: 'Imou', query: 'Imou' },
  { label: 'Kingston', query: 'Kingston' },
]

/** Catalog search of a brand chip. */
export function brandSearchHref(brand: HomeBrand): string {
  return `/catalogo/buscar?q=${encodeURIComponent(brand.query)}`
}
