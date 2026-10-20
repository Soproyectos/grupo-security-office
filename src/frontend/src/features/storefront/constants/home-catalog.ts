/**
 * Catalog picks of the storefront home, in one place so a change of stock only
 * touches this file. Slugs must be categories that hold published products:
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
  { slug: 'camaras-turbo', title: 'Videovigilancia' },
  { slug: 'motores-para-puertas-levadizas', title: 'Automatización de puertas' },
  { slug: 'ups-on-line', title: 'Energía y respaldo' },
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
