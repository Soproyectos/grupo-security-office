/**
 * Corporate security solution shown in the "Soluciones destacadas" section of
 * the storefront home (`/tienda`).
 *
 * There is NO backend contract for solutions: no endpoint, no Prisma model and
 * no catalog fields back these cards. They are presentation-only entries fed by
 * the temporary fixture `fixtures/featured-solutions.ts`; do not treat them as
 * product, price, inventory or metric data.
 */
export interface FeaturedSolution {
  id: string
  title: string
  /** Commercial segment the solution belongs to (e.g. "Empresas y edificios"). */
  category: string
  description: string
  /** Cover of the card; a temporary storefront image while there is no media. */
  imageUrl: string | null
  /** Useful alt text for the cover; read by assistive tech, never decorative. */
  imageAlt: string
  /**
   * Destination of the card: a category or search that holds published products
   * today. Do not invent solution routes here.
   */
  href: string
  ctaLabel: string
}
