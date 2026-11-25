/** Public price (`CLIENTE_FINAL_IVA`, IVA included) of a product. */
export interface PublicPrice {
  value: number
  currency: string
}

/**
 * Item of the public listing (`GET /api/public/products`), used by search and
 * category pages. `price` is `null` when the product has no valid public price:
 * the storefront then offers a quote instead.
 */
export interface PublicProductResult {
  id: string
  sku: string
  name: string
  imageUrl: string | null
  categoryName: string
  categorySlug: string
  brandName: string | null
  /** Official library record still awaiting commercial publication. */
  isInformational: boolean
  price: PublicPrice | null
}

/** Summary of a public brand with visible products. */
export interface PublicBrandSummary {
  name: string
  slug: string
  productCount: number
}

/** One page of the public listing plus the total the backend reports. */
export interface PublicProductListing {
  items: PublicProductResult[]
  total: number
  offset: number
  limit: number
}

export interface PublicProductFilters {
  q?: string
  sku?: readonly string[]
  category?: string
  /** Persisted subcategory slug, scoped to category when provided. */
  subcategory?: string
  brand?: string
  keySpec?: string[]
  requirement?: string[]
  /** `recent`: newest published first (the server ignores it when `q` is set). */
  sort?: 'recent'
}
