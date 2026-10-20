/**
 * SKU identity: two SKUs are the same product when they are equal after
 * normalization (trim, remove ALL whitespace, upper-case), so
 * "iDS-E04HQHI-D", "IDS-E04HQHI-D" and "IDS-E04HQHI- D" match.
 *
 * The database enforces the same rule with the expression index
 * `products_sku_normalized_key` ON (upper(regexp_replace(sku, '\s', '', 'g')))
 * (migration 20261002200000_products_sku_normalized_unique). The stored `sku`
 * keeps its original casing for display; MATCHING must always go through
 * `normalizeSku` / `findProductsBySkus`, never `where: { sku }`.
 */
import { Prisma } from '@prisma/client';
import { normalizeSku } from '../import/helpers/text-normalizer';

export { normalizeSku };

/** Minimal client surface needed to look products up (PrismaService or a tx). */
export type SkuLookupClient = Pick<Prisma.TransactionClient, '$queryRaw' | 'product'>;

/**
 * Finds the existing products whose normalized SKU equals the normalized form
 * of any of `skus`, keyed by normalized SKU. Empty/blank inputs are ignored.
 *
 * If several products share a normalized SKU (only possible before the unique
 * index exists), the one that belongs to a Lista wins, then the oldest.
 */
export async function findProductsBySkus<S extends Prisma.ProductSelect>(
  client: SkuLookupClient,
  skus: Array<string | null | undefined>,
  select: S,
  where?: Prisma.ProductWhereInput,
): Promise<Map<string, Prisma.ProductGetPayload<{ select: S }> & { id: string }>> {
  const result = new Map<string, Prisma.ProductGetPayload<{ select: S }> & { id: string }>();
  const normalized = [...new Set(skus.map((s) => normalizeSku(s)).filter((s) => s !== ''))];
  if (normalized.length === 0) return result;

  // Must stay identical to the expression of products_sku_normalized_key.
  const matches = await client.$queryRaw<Array<{ id: string; sku: string }>>(Prisma.sql`
    SELECT id, sku
    FROM products
    WHERE upper(regexp_replace(sku, '\\s', '', 'g')) = ANY(${normalized}::text[])
    ORDER BY ("listaId" IS NULL), "createdAt", id
  `);
  if (matches.length === 0) return result;

  const rows = await client.product.findMany({
    where: { ...where, id: { in: matches.map((m) => m.id) } },
    select: { ...select, id: true } as Prisma.ProductSelect,
  });
  const byId = new Map(rows.map((r) => [(r as { id: string }).id, r]));

  for (const match of matches) {
    const row = byId.get(match.id);
    const key = normalizeSku(match.sku);
    if (row && !result.has(key)) {
      result.set(key, row as Prisma.ProductGetPayload<{ select: S }> & { id: string });
    }
  }
  return result;
}

/** Single-SKU convenience wrapper around `findProductsBySkus`. */
export async function findProductBySku<S extends Prisma.ProductSelect>(
  client: SkuLookupClient,
  sku: string | null | undefined,
  select: S,
  where?: Prisma.ProductWhereInput,
): Promise<(Prisma.ProductGetPayload<{ select: S }> & { id: string }) | null> {
  const found = await findProductsBySkus(client, [sku], select, where);
  return found.get(normalizeSku(sku)) ?? null;
}
