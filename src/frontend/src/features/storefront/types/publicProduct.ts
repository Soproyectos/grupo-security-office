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

export interface PublicCategoryRef {
  id: string
  name: string
  slug: string
}

export interface PublicTechnicalSpec {
  key: string
  value: string
  unit: string | null
}

export interface PublicDatasheet {
  name: string
  url: string
}

/** Product sheet (`GET /api/public/products/:id`). The primary image comes first. */
export interface PublicProductDetail {
  id: string
  sku: string
  name: string
  description: string | null
  brand: { name: string; slug: string } | null
  category: PublicCategoryRef | null
  /** Ancestors of the category, root first, without the category itself. */
  breadcrumb: PublicCategoryRef[]
  images: Array<{ url: string; alt: string | null }>
  technicalSpecs: PublicTechnicalSpec[]
  datasheets: PublicDatasheet[]
  price: PublicPrice | null
}
