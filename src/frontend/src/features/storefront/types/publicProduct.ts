/**
 * Result of the public product search (`GET /api/public/products?q=&limit=`).
 * The Product model has no slug of its own, so the landing page links each
 * result to the page of its category (`/catalogo/categoria/:categorySlug`).
 */
export interface PublicProductResult {
  id: string
  name: string
  imageUrl: string | null
  categoryName: string
  categorySlug: string
}
