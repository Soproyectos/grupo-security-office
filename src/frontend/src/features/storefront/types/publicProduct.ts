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

/** One page of the public listing plus the total the backend reports. */
export interface PublicProductListing {
  items: PublicProductResult[]
  total: number
  offset: number
  limit: number
}

export interface PublicProductFilters {
  q?: string
  category?: string
}
