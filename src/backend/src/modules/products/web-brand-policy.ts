// Keep these spellings aligned with the enrichment collector's brand policy.
const BLOCKED_BRAND_SPELLINGS = ['dahua', 'da hua', 'da-hua', 'imou', 'i mou', 'i-mou'];
const EXACT_BRAND_ALIASES = ['dh'];

export function isWebBrandExcluded(...brands: (string | null | undefined)[]): boolean {
  return brands.some((brand) => {
    const value = brand?.toLowerCase() ?? '';
    return EXACT_BRAND_ALIASES.includes(value.trim())
      || BLOCKED_BRAND_SPELLINGS.some((spelling) => value.includes(spelling));
  });
}

const blockedBrandNames = [
  ...BLOCKED_BRAND_SPELLINGS.map((contains) => ({ contains, mode: 'insensitive' as const })),
  ...EXACT_BRAND_ALIASES.map((equals) => ({ equals, mode: 'insensitive' as const })),
];
export const BLOCKED_WEB_BRAND_WHERE = { OR: blockedBrandNames.map((name) => ({ name })) };

// Account for the commercial label and the related brand independently.
// Explicit null branches preserve visibility for legacy products with no label.
export function webBrandVisibility(blockedRevisionBrandIds: string[] = []) {
  return {
    AND: [
      {
        OR: [
          { brandId: null },
          { brand: { is: { NOT: BLOCKED_WEB_BRAND_WHERE } } },
        ],
      },
      {
        OR: [
          { catalogBrand: null },
          { NOT: { OR: blockedBrandNames.map((catalogBrand) => ({ catalogBrand })) } },
        ],
      },
      {
        OR: [
          { publicRevisionId: null },
          {
            publicRevision: {
              isNot: {
                status: 'PUBLICADA' as const,
                OR: [
                  ...BLOCKED_BRAND_SPELLINGS.map((string_contains) => ({
                    content: { path: ['catalogBrand'], string_contains, mode: 'insensitive' as const },
                  })),
                  ...['dh', 'DH', 'Dh', 'dH'].map((equals) => ({ content: { path: ['catalogBrand'], equals } })),
                  ...blockedRevisionBrandIds.map((equals) => ({ content: { path: ['brandId'], equals } })),
                ],
              },
            },
          },
        ],
      },
    ],
  };
}

interface BrandReader {
  brand: {
    findMany(args: { where: typeof BLOCKED_WEB_BRAND_WHERE; select: { id: true } }): PromiseLike<{ id: string }[]>;
  };
}

export async function blockedWebBrandIds(db: BrandReader): Promise<string[]> {
  const brands = (await db.brand.findMany({ where: BLOCKED_WEB_BRAND_WHERE, select: { id: true } })) ?? [];
  return brands.map(({ id }) => id);
}
