import { Prisma } from '@prisma/client';

/**
 * A product is public when it passed the commercial publication workflow or
 * when the official library import marked it as an informational record.
 *
 * The second branch deliberately does not mutate lifecycleStatus: incomplete
 * library records remain DRAFT and therefore cannot be mistaken for products
 * that passed the price/image/stock publication gate.
 */
/** Keep one predicate while accepting each generated client's nominal JsonNull type. */
export function publicCatalogVisibility<TJsonNull>(jsonNull: TJsonNull) {
  return {
    OR: [
      { lifecycleStatus: 'PUBLISHED' as const },
      {
        extraAttributes: {
          path: ['biblioteca'],
          not: jsonNull,
        },
      },
    ],
  };
}

export const PUBLIC_CATALOG_VISIBILITY: Prisma.ProductWhereInput = publicCatalogVisibility(Prisma.JsonNull);
