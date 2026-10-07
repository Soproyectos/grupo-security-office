/**
 * Primary-image selection for admin product lists.
 *
 * A product's card image is the image flagged `isPrimary`; when none is flagged
 * (uploads that were not marked primary, merged duplicates, imports) it falls
 * back to the first image by `sortOrder` so a product that has photos never
 * renders as image-less.
 */
export const PRIMARY_IMAGE_ORDER_BY = [
  { isPrimary: 'desc' as const },
  { sortOrder: 'asc' as const },
];

/** Prisma `include.images` argument that yields at most one image: primary first. */
export const primaryImageInclude = () => ({
  orderBy: PRIMARY_IMAGE_ORDER_BY.map((o) => ({ ...o })),
  take: 1,
});

/**
 * Reduces a flat image list to one image per product (primary first, then lowest
 * `sortOrder`). Used where images are fetched in bulk rather than via `include`.
 */
export function pickPrimaryImageByProduct<
  T extends { productId: string; isPrimary: boolean; sortOrder: number },
>(images: T[]): Map<string, T> {
  const best = new Map<string, T>();
  for (const image of images) {
    const current = best.get(image.productId);
    if (
      !current ||
      (image.isPrimary && !current.isPrimary) ||
      (image.isPrimary === current.isPrimary && image.sortOrder < current.sortOrder)
    ) {
      best.set(image.productId, image);
    }
  }
  return best;
}
