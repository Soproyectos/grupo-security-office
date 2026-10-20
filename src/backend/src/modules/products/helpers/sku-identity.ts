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
 * Finds EVERY existing product whose normalized SKU equals the normalized form of
 * any of `skus`, keyed by normalized SKU (candidates in lookup order: with Lista
 * first, then oldest). With the unique normalized index in place each key holds
 * at most one product; callers that must refuse to guess (price import) use this
 * variant to detect an ambiguous match defensively.
 */
export async function findProductMatchesBySkus<S extends Prisma.ProductSelect>(
  client: SkuLookupClient,
  skus: Array<string | null | undefined>,
  select: S,
  where?: Prisma.ProductWhereInput,
): Promise<Map<string, Array<Prisma.ProductGetPayload<{ select: S }> & { id: string }>>> {
  type Row = Prisma.ProductGetPayload<{ select: S }> & { id: string };
  const result = new Map<string, Row[]>();
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
    if (!row) continue;
    const key = normalizeSku(match.sku);
    result.set(key, [...(result.get(key) ?? []), row as Row]);
  }
  return result;
}

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
  const all = await findProductMatchesBySkus(client, skus, select, where);
  const result = new Map<string, Prisma.ProductGetPayload<{ select: S }> & { id: string }>();
  for (const [key, rows] of all) result.set(key, rows[0]);
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
