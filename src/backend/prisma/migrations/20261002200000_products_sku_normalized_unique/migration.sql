/*
  Product identity: the SKU is unique after normalization (upper-case, all
  whitespace removed), so "iDS-E04HQHI-D", "IDS-E04HQHI-D" and "IDS-E04HQHI- D"
  are the same product. The plain "products_sku_key" unique index stays (it is
  case-sensitive); this one closes the gap that let case-only duplicates in.

  ORDER (important): this migration MUST run AFTER the data merge
  docs/procedimientos/dedup-products-by-sku.sql. While duplicate normalized
  SKUs exist it aborts with a clear message and creates nothing (it is
  transactional), so `prisma migrate deploy` can never leave a half state.
  The timestamp (20261002200000) is later than every migration that existed
  when the merge was written; do not reorder it before the merge is applied in
  an environment.

  The expression MUST match normalizeSku() in
  src/modules/products/import/helpers/text-normalizer.ts
  (trim + remove ALL whitespace + upper-case):
      upper(regexp_replace(sku, '\s', '', 'g'))
  Lookups in the app use the same expression through findProductsBySkus()
  (src/modules/products/helpers/sku-identity.ts).

  PRISMA CAVEAT: schema.prisma cannot express an expression index. Prisma's
  introspection ignores it, so `prisma migrate diff` / `migrate dev` do NOT try
  to drop it (verified with `migrate diff --from-url <migrated db>
  --to-schema-datamodel` => empty diff). Do not remove it by hand and do not
  declare an equivalent @@unique in schema.prisma.
*/

-- Guard: refuse to run while duplicate normalized SKUs exist.
DO $$
DECLARE
  dup_groups bigint;
  sample text;
BEGIN
  SELECT count(*), string_agg(k, ', ' ORDER BY k) FILTER (WHERE rn <= 5)
    INTO dup_groups, sample
  FROM (
    SELECT k, row_number() OVER (ORDER BY k) AS rn
    FROM (
      SELECT upper(regexp_replace(sku, '\s', '', 'g')) AS k
      FROM "products"
      GROUP BY 1
      HAVING count(*) > 1
    ) d
  ) x;

  IF dup_groups > 0 THEN
    RAISE EXCEPTION
      'products_sku_normalized_key: % duplicate normalized SKU group(s) exist (e.g. %). Run docs/procedimientos/dedup-products-by-sku.sql first.',
      dup_groups, sample;
  END IF;
END $$;

-- CreateIndex (expression index, not representable in schema.prisma)
CREATE UNIQUE INDEX IF NOT EXISTS "products_sku_normalized_key"
  ON "products" (upper(regexp_replace("sku", '\s', '', 'g')));
