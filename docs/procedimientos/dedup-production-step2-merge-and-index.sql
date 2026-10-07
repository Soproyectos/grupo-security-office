-- STEP 2 of 2 (production, Supabase SQL Editor) — 2026-10-02
-- Run ONLY after STEP 1 succeeded. Merges the 181 duplicate product pairs, then adds the
-- normalized-SKU unique index and registers that Prisma migration. Re-running is a no-op.

-- =============================================================================
-- dedup-products-by-sku.sql
--
-- Merge duplicated products that share the same NORMALIZED SKU
-- (upper-case, all whitespace removed):  "iDS-E04HQHI-D"  ==  "IDS-E04HQHI-D".
--
-- Feature: product-identity-dedup (D01).  Run order:
--   1. dedup-products-by-sku-report.sql   (read-only dry run, review it)
--   2. THIS FILE                           (single transaction, idempotent)
--   3. Prisma migration 20261002200000_products_sku_normalized_unique
--      (unique index on the normalized SKU; it FAILS while duplicates exist)
--
-- ROLLBACK: the only rollback is restoring the pg_dump taken BEFORE running
-- this script (take it first, always). The script itself is atomic: any error
-- aborts the whole transaction and nothing is changed.
--   Local:      docker exec gs-db pg_restore -U postgres -d grupo_security \
--                 --clean --if-exists /tmp/pre-dedup.dump
--   Production: Supabase dashboard -> Database -> Backups (or a pg_dump you
--               took beforehand) -- restore BEFORE any new data is written.
--
-- COMPATIBILITY: plain SQL + one DO block; Postgres 16 and 17 (Supabase).
-- Safe to re-run: after a successful run no pair matches, every statement
-- touches 0 rows and the final summary reports zeros.
--
-- -----------------------------------------------------------------------------
-- WHAT IS A PAIR
--   Products sharing a normalized SKU. Survivor = the product with "listaId"
--   NOT NULL (it lives in a Lista, so it is editable in the admin). Loser = the
--   one with "listaId" NULL (biblioteca copy). A group that is NOT exactly
--   {1 with Lista + 1 without} (e.g. 3 rows, 2 with Lista, 2 without) is SKIPPED,
--   never guessed; the report lists them. The merge reports how many groups
--   were skipped in the summary.
--
-- WHAT THE SURVIVOR RECEIVES FROM THE LOSER
--   * Curated identity: when the loser is curated (nameSource='curado' or
--     nameLockedAt set) and the survivor is NOT curated, the survivor gets the
--     loser's name, categoryId and brandId (see carry_category_brand below),
--     nameSource='curado' and nameLockedAt=now(). That lock is what stops list
--     imports from overwriting the name: BatchExecutorService checks
--     nameLockedAt (ADR-002) and, when set, only refreshes prices/lastSeenAt.
--     If the survivor is already curated its own identity is kept.
--   * isVisible / isActive: TRUE if either was TRUE.
--   * Lifecycle/publish (lifecycleStatus, publishStatus, publishedAt,
--     publishedById, publishAt, unpublishAt, unpublishReason): taken as a block
--     from the loser only when the loser is published (lifecycleStatus
--     'PUBLISHED' or publishStatus 'publicado') and the survivor is not.
--   * catalog* columns (13 data columns + catalogPublished/catalogStatus),
--     product_catalog_spec_groups (+ items) and product_catalog_resources: each
--     moved from the loser only when the survivor has NONE of that kind.
--     Otherwise the loser's copy is discarded with it (counted in the summary).
--   * description / technicalSpecs / documents: survivor's value kept when it
--     is non-empty (JSON null counts as empty), otherwise the loser's.
--     extraAttributes: object merge, survivor's keys win.
--
-- REFERENCES (every FK to products.id, enumerated from pg_constraint AND
-- prisma/schema.prisma; a DO block aborts if the database has any other):
--   prices.productId               UNIQUE(productId, priceListId)
--       Conflict (survivor already has a price in that price list): KEEP the
--       survivor's row (fresher: list imports are newer than the biblioteca
--       copy), DELETE the loser's. Non-conflicting loser prices are repointed.
--       quote_items.priceId that pointed to a deleted loser price is repointed
--       to the survivor's price of the same price list (history preserved;
--       quote_items keep their own price snapshot anyway).
--   quote_items.productId          repointed (no unique constraint).
--   product_images.productId       repointed (no unique). If the survivor
--       already has a primary image, moved images lose isPrimary; moved images
--       are ordered after the survivor's (sortOrder offset).
--   stocks.productId               UNIQUE(productId): keep the survivor's row
--       and delete the loser's when both exist; otherwise repoint.
--   audit_logs.productId           repointed (history preserved).
--   product_catalog_spec_groups    moved only if survivor has none
--       (UNIQUE(productId, key) therefore cannot collide); otherwise discarded.
--   product_catalog_resources      moved only if survivor has none; otherwise
--       discarded.
-- Then the loser rows are deleted. Prices that disappear by design: only the
-- conflicting ones (same product+price list), counted in the summary.
--
-- NOT TOUCHED: products without a Lista and without a twin (biblioteca-only).
-- =============================================================================

-- Summary survives COMMIT (session-scoped) so it can be selected at the end.
DROP TABLE IF EXISTS pg_temp._dedup_summary;
CREATE TEMP TABLE _dedup_summary (metric text, n bigint);

BEGIN;

-- Block concurrent writers (imports) while merging; reads keep working.
LOCK TABLE products, prices, product_images, stocks, quote_items, audit_logs,
  product_catalog_spec_groups, product_catalog_resources
  IN SHARE ROW EXCLUSIVE MODE;

-- Guard: abort if some table references products.id and this script does not
-- know about it (a new FK would otherwise be silently nulled/cascaded).
DO $$
DECLARE
  unexpected text;
BEGIN
  SELECT string_agg(DISTINCT c.conrelid::regclass::text, ', ')
    INTO unexpected
  FROM pg_constraint c
  WHERE c.confrelid = 'public.products'::regclass
    AND c.contype = 'f'
    AND c.conrelid::regclass::text NOT IN (
      'prices', 'quote_items', 'product_images', 'stocks', 'audit_logs',
      'product_catalog_spec_groups', 'product_catalog_resources'
    );
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'dedup aborted: unhandled foreign key(s) to products: %', unexpected;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Configuration
--   carry_category_brand: when the loser identity wins, ALSO carry its
--   categoryId/brandId (the identity lock protects name/description/category/
--   brand together; biblioteca categories are the curated ones used by the
--   store menu, list imports infer "Cámaras IP" / "Sin categoría").
--   Set to false to keep the survivor's category/brand.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _dedup_cfg ON COMMIT DROP AS
SELECT true AS carry_category_brand;

-- -----------------------------------------------------------------------------
-- 1. Pairs: normalized SKU shared by exactly one product with Lista + one without
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _dedup_pairs ON COMMIT DROP AS
WITH norm AS (
  SELECT id,
         upper(regexp_replace(sku, '\s', '', 'g')) AS k,
         ("listaId" IS NOT NULL) AS has_lista
  FROM products
), grp AS (
  SELECT k, count(*) AS c, count(*) FILTER (WHERE has_lista) AS with_lista
  FROM norm
  GROUP BY k
  HAVING count(*) > 1
)
SELECT g.k, s.id AS survivor_id, l.id AS loser_id
FROM grp g
JOIN norm s ON s.k = g.k AND s.has_lista
JOIN norm l ON l.k = g.k AND NOT l.has_lista
WHERE g.c = 2 AND g.with_lista = 1;

INSERT INTO _dedup_summary
SELECT 'groups_skipped_unexpected_shape', count(*)
FROM (
  SELECT upper(regexp_replace(sku, '\s', '', 'g')) AS k
  FROM products
  GROUP BY 1
  HAVING count(*) > 1
     AND NOT (count(*) = 2 AND count(*) FILTER (WHERE "listaId" IS NOT NULL) = 1)
) x;

INSERT INTO _dedup_summary SELECT 'pairs_to_merge', count(*) FROM _dedup_pairs;

-- -----------------------------------------------------------------------------
-- 2. Plan: decisions per pair, computed BEFORE anything is changed
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _dedup_plan ON COMMIT DROP AS
SELECT
  p.k, p.survivor_id, p.loser_id,
  -- loser identity (name/category/brand) wins only if loser curated, survivor not
  ((l."nameLockedAt" IS NOT NULL OR l."nameSource" = 'curado')
    AND NOT (s."nameLockedAt" IS NOT NULL OR s."nameSource" = 'curado')) AS loser_identity_wins,
  -- loser publish block wins only if loser published and survivor not
  ((l."lifecycleStatus" = 'PUBLISHED' OR l."publishStatus" = 'publicado')
    AND NOT (s."lifecycleStatus" = 'PUBLISHED' OR s."publishStatus" = 'publicado')) AS loser_publish_wins,
  -- catalog* columns: loser has data AND survivor has none
  (
    (l."catalogName" IS NOT NULL OR l."catalogSlug" IS NOT NULL OR l."catalogModel" IS NOT NULL
      OR l."catalogBrand" IS NOT NULL OR l."catalogImageUrl" IS NOT NULL OR l."catalogImageAlt" IS NOT NULL
      OR l."catalogFirmwareNote" IS NOT NULL OR l."catalogSpecsDisclaimer" IS NOT NULL
      OR l."catalogPublished"
      OR COALESCE(cardinality(l."catalogHighlights"), 0) > 0
      OR COALESCE(cardinality(l."catalogBadges"), 0) > 0
      OR COALESCE(cardinality(l."catalogAvailableModels"), 0) > 0
      OR l."catalogFeatures" <> '[]'::jsonb OR l."catalogBreadcrumb" <> '[]'::jsonb)
    AND NOT
    (s."catalogName" IS NOT NULL OR s."catalogSlug" IS NOT NULL OR s."catalogModel" IS NOT NULL
      OR s."catalogBrand" IS NOT NULL OR s."catalogImageUrl" IS NOT NULL OR s."catalogImageAlt" IS NOT NULL
      OR s."catalogFirmwareNote" IS NOT NULL OR s."catalogSpecsDisclaimer" IS NOT NULL
      OR s."catalogPublished"
      OR COALESCE(cardinality(s."catalogHighlights"), 0) > 0
      OR COALESCE(cardinality(s."catalogBadges"), 0) > 0
      OR COALESCE(cardinality(s."catalogAvailableModels"), 0) > 0
      OR s."catalogFeatures" <> '[]'::jsonb OR s."catalogBreadcrumb" <> '[]'::jsonb)
  ) AS move_catalog_cols,
  l."catalogSlug" AS loser_slug,
  (EXISTS (SELECT 1 FROM product_catalog_spec_groups g WHERE g."productId" = p.loser_id)
    AND NOT EXISTS (SELECT 1 FROM product_catalog_spec_groups g WHERE g."productId" = p.survivor_id)) AS move_spec_groups,
  (EXISTS (SELECT 1 FROM product_catalog_resources r WHERE r."productId" = p.loser_id)
    AND NOT EXISTS (SELECT 1 FROM product_catalog_resources r WHERE r."productId" = p.survivor_id)) AS move_resources,
  EXISTS (SELECT 1 FROM product_images i WHERE i."productId" = p.survivor_id AND i."isPrimary") AS survivor_has_primary_image,
  (SELECT COALESCE(max(i."sortOrder") + 1, 0) FROM product_images i WHERE i."productId" = p.survivor_id) AS image_offset
FROM _dedup_pairs p
JOIN products s ON s.id = p.survivor_id
JOIN products l ON l.id = p.loser_id;

-- -----------------------------------------------------------------------------
-- 3. Prices (UNIQUE productId + priceListId): keep survivor's on conflict
-- -----------------------------------------------------------------------------
INSERT INTO _dedup_summary
SELECT 'price_conflicts_loser_value_differs', count(*)
FROM _dedup_plan pl
JOIN prices lp ON lp."productId" = pl.loser_id
JOIN prices sp ON sp."productId" = pl.survivor_id AND sp."priceListId" = lp."priceListId"
WHERE lp.value <> sp.value OR lp.currency <> sp.currency;

INSERT INTO _dedup_summary
SELECT 'price_conflicts_loser_newer_than_survivor', count(*)
FROM _dedup_plan pl
JOIN prices lp ON lp."productId" = pl.loser_id
JOIN prices sp ON sp."productId" = pl.survivor_id AND sp."priceListId" = lp."priceListId"
WHERE lp."updatedAt" > sp."updatedAt";

WITH moved AS (
  UPDATE quote_items qi
  SET "priceId" = sp.id
  FROM _dedup_plan pl
  JOIN prices lp ON lp."productId" = pl.loser_id
  JOIN prices sp ON sp."productId" = pl.survivor_id AND sp."priceListId" = lp."priceListId"
  WHERE qi."priceId" = lp.id
  RETURNING 1
)
INSERT INTO _dedup_summary SELECT 'quote_items_price_repointed_to_survivor_price', count(*) FROM moved;

WITH del AS (
  DELETE FROM prices lp
  USING _dedup_plan pl
  WHERE lp."productId" = pl.loser_id
    AND EXISTS (
      SELECT 1 FROM prices sp
      WHERE sp."productId" = pl.survivor_id AND sp."priceListId" = lp."priceListId"
    )
  RETURNING 1
)
INSERT INTO _dedup_summary SELECT 'prices_deleted_conflict_kept_survivor', count(*) FROM del;

WITH moved AS (
  UPDATE prices lp
  SET "productId" = pl.survivor_id
  FROM _dedup_plan pl
  WHERE lp."productId" = pl.loser_id
  RETURNING 1
)
INSERT INTO _dedup_summary SELECT 'prices_moved', count(*) FROM moved;

-- -----------------------------------------------------------------------------
-- 4. Quote items, images, stock, audit logs
-- -----------------------------------------------------------------------------
WITH moved AS (
  UPDATE quote_items qi
  SET "productId" = pl.survivor_id
  FROM _dedup_plan pl
  WHERE qi."productId" = pl.loser_id
  RETURNING 1
)
INSERT INTO _dedup_summary SELECT 'quote_items_moved', count(*) FROM moved;

WITH moved AS (
  UPDATE product_images i
  SET "productId" = pl.survivor_id,
      "isPrimary" = CASE WHEN pl.survivor_has_primary_image THEN false ELSE i."isPrimary" END,
      "sortOrder" = i."sortOrder" + pl.image_offset
  FROM _dedup_plan pl
  WHERE i."productId" = pl.loser_id
  RETURNING 1
)
INSERT INTO _dedup_summary SELECT 'product_images_moved', count(*) FROM moved;

WITH del AS (
  DELETE FROM stocks ls
  USING _dedup_plan pl
  WHERE ls."productId" = pl.loser_id
    AND EXISTS (SELECT 1 FROM stocks ss WHERE ss."productId" = pl.survivor_id)
  RETURNING 1
)
INSERT INTO _dedup_summary SELECT 'stocks_deleted_conflict_kept_survivor', count(*) FROM del;

WITH moved AS (
  UPDATE stocks ls
  SET "productId" = pl.survivor_id
  FROM _dedup_plan pl
  WHERE ls."productId" = pl.loser_id
  RETURNING 1
)
INSERT INTO _dedup_summary SELECT 'stocks_moved', count(*) FROM moved;

WITH moved AS (
  UPDATE audit_logs a
  SET "productId" = pl.survivor_id
  FROM _dedup_plan pl
  WHERE a."productId" = pl.loser_id
  RETURNING 1
)
INSERT INTO _dedup_summary SELECT 'audit_logs_moved', count(*) FROM moved;

-- -----------------------------------------------------------------------------
-- 5. Enriched product sheet (catalog*): spec groups + items, resources
-- -----------------------------------------------------------------------------
WITH moved AS (
  UPDATE product_catalog_spec_groups g
  SET "productId" = pl.survivor_id
  FROM _dedup_plan pl
  WHERE g."productId" = pl.loser_id AND pl.move_spec_groups
  RETURNING 1
)
INSERT INTO _dedup_summary SELECT 'spec_groups_moved', count(*) FROM moved;

WITH moved AS (
  UPDATE product_catalog_resources r
  SET "productId" = pl.survivor_id
  FROM _dedup_plan pl
  WHERE r."productId" = pl.loser_id AND pl.move_resources
  RETURNING 1
)
INSERT INTO _dedup_summary SELECT 'resources_moved', count(*) FROM moved;

-- Anything still attached to a loser is discarded with it (survivor had its own).
INSERT INTO _dedup_summary
SELECT 'spec_groups_discarded_survivor_had_own', count(*)
FROM product_catalog_spec_groups g JOIN _dedup_plan pl ON g."productId" = pl.loser_id;

INSERT INTO _dedup_summary
SELECT 'resources_discarded_survivor_had_own', count(*)
FROM product_catalog_resources r JOIN _dedup_plan pl ON r."productId" = pl.loser_id;

-- catalogSlug is UNIQUE: free it on the loser before the survivor takes it.
UPDATE products l
SET "catalogSlug" = NULL
FROM _dedup_plan pl
WHERE l.id = pl.loser_id AND pl.move_catalog_cols AND l."catalogSlug" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 6. Survivor fields
-- -----------------------------------------------------------------------------
WITH upd AS (
  UPDATE products s
  SET
    name          = CASE WHEN pl.loser_identity_wins THEN l.name ELSE s.name END,
    "nameSource"  = CASE WHEN pl.loser_identity_wins THEN 'curado' ELSE s."nameSource" END,
    "nameLockedAt"= CASE WHEN pl.loser_identity_wins THEN now() ELSE s."nameLockedAt" END,
    "categoryId"  = CASE WHEN pl.loser_identity_wins AND cfg.carry_category_brand
                         THEN l."categoryId" ELSE s."categoryId" END,
    "brandId"     = CASE WHEN pl.loser_identity_wins AND cfg.carry_category_brand
                         THEN l."brandId" ELSE s."brandId" END,
    "isVisible"   = s."isVisible" OR l."isVisible",
    "isActive"    = s."isActive" OR l."isActive",
    "lifecycleStatus" = CASE WHEN pl.loser_publish_wins THEN l."lifecycleStatus" ELSE s."lifecycleStatus" END,
    "publishStatus"   = CASE WHEN pl.loser_publish_wins THEN l."publishStatus"   ELSE s."publishStatus" END,
    "publishedAt"     = CASE WHEN pl.loser_publish_wins THEN l."publishedAt"     ELSE s."publishedAt" END,
    "publishedById"   = CASE WHEN pl.loser_publish_wins THEN l."publishedById"   ELSE s."publishedById" END,
    "publishAt"       = CASE WHEN pl.loser_publish_wins THEN l."publishAt"       ELSE s."publishAt" END,
    "unpublishAt"     = CASE WHEN pl.loser_publish_wins THEN l."unpublishAt"     ELSE s."unpublishAt" END,
    "unpublishReason" = CASE WHEN pl.loser_publish_wins THEN l."unpublishReason" ELSE s."unpublishReason" END,
    description   = CASE WHEN nullif(btrim(s.description), '') IS NULL THEN l.description ELSE s.description END,
    "technicalSpecs" = CASE WHEN (s."technicalSpecs" IS NULL OR jsonb_typeof(s."technicalSpecs") = 'null')
                                 AND l."technicalSpecs" IS NOT NULL AND jsonb_typeof(l."technicalSpecs") <> 'null'
                            THEN l."technicalSpecs" ELSE s."technicalSpecs" END,
    documents     = CASE WHEN (s.documents IS NULL OR jsonb_typeof(s.documents) = 'null')
                              AND l.documents IS NOT NULL AND jsonb_typeof(l.documents) <> 'null'
                         THEN l.documents ELSE s.documents END,
    "extraAttributes" = CASE
        WHEN jsonb_typeof(s."extraAttributes") = 'object' AND jsonb_typeof(l."extraAttributes") = 'object'
          THEN l."extraAttributes" || s."extraAttributes"
        WHEN (s."extraAttributes" IS NULL OR jsonb_typeof(s."extraAttributes") = 'null')
             AND l."extraAttributes" IS NOT NULL AND jsonb_typeof(l."extraAttributes") <> 'null'
          THEN l."extraAttributes"
        ELSE s."extraAttributes" END,
    "catalogAvailableModels" = CASE WHEN pl.move_catalog_cols THEN l."catalogAvailableModels" ELSE s."catalogAvailableModels" END,
    "catalogBadges"          = CASE WHEN pl.move_catalog_cols THEN l."catalogBadges" ELSE s."catalogBadges" END,
    "catalogBrand"           = CASE WHEN pl.move_catalog_cols THEN l."catalogBrand" ELSE s."catalogBrand" END,
    "catalogBreadcrumb"      = CASE WHEN pl.move_catalog_cols THEN l."catalogBreadcrumb" ELSE s."catalogBreadcrumb" END,
    "catalogFeatures"        = CASE WHEN pl.move_catalog_cols THEN l."catalogFeatures" ELSE s."catalogFeatures" END,
    "catalogFirmwareNote"    = CASE WHEN pl.move_catalog_cols THEN l."catalogFirmwareNote" ELSE s."catalogFirmwareNote" END,
    "catalogHighlights"      = CASE WHEN pl.move_catalog_cols THEN l."catalogHighlights" ELSE s."catalogHighlights" END,
    "catalogImageAlt"        = CASE WHEN pl.move_catalog_cols THEN l."catalogImageAlt" ELSE s."catalogImageAlt" END,
    "catalogImageUrl"        = CASE WHEN pl.move_catalog_cols THEN l."catalogImageUrl" ELSE s."catalogImageUrl" END,
    "catalogModel"           = CASE WHEN pl.move_catalog_cols THEN l."catalogModel" ELSE s."catalogModel" END,
    "catalogName"            = CASE WHEN pl.move_catalog_cols THEN l."catalogName" ELSE s."catalogName" END,
    "catalogPublished"       = CASE WHEN pl.move_catalog_cols THEN l."catalogPublished" ELSE s."catalogPublished" END,
    "catalogSlug"            = CASE WHEN pl.move_catalog_cols THEN pl.loser_slug ELSE s."catalogSlug" END,
    "catalogSpecsDisclaimer" = CASE WHEN pl.move_catalog_cols THEN l."catalogSpecsDisclaimer" ELSE s."catalogSpecsDisclaimer" END,
    "catalogStatus"          = CASE WHEN pl.move_catalog_cols THEN l."catalogStatus" ELSE s."catalogStatus" END,
    "updatedAt"   = now()
  FROM _dedup_plan pl
  JOIN products l ON l.id = pl.loser_id
  CROSS JOIN _dedup_cfg cfg
  WHERE s.id = pl.survivor_id
  RETURNING 1
)
INSERT INTO _dedup_summary SELECT 'survivors_updated', count(*) FROM upd;

-- -----------------------------------------------------------------------------
-- 7. Safety checks, then delete the losers
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  leftover bigint;
BEGIN
  -- Rows that FK actions would silently NULL (SET NULL) must already be repointed.
  SELECT (SELECT count(*) FROM audit_logs a JOIN _dedup_plan pl ON a."productId" = pl.loser_id)
       + (SELECT count(*) FROM quote_items q JOIN _dedup_plan pl ON q."productId" = pl.loser_id)
       + (SELECT count(*) FROM prices x JOIN _dedup_plan pl ON x."productId" = pl.loser_id)
       + (SELECT count(*) FROM product_images x JOIN _dedup_plan pl ON x."productId" = pl.loser_id)
    INTO leftover;
  IF leftover > 0 THEN
    RAISE EXCEPTION 'dedup aborted: % reference(s) still point to loser products', leftover;
  END IF;
END $$;

WITH del AS (
  DELETE FROM products WHERE id IN (SELECT loser_id FROM _dedup_plan) RETURNING 1
)
INSERT INTO _dedup_summary SELECT 'products_deleted', count(*) FROM del;

-- Post-condition: no merge-eligible group may remain.
DO $$
DECLARE
  remaining bigint;
BEGIN
  SELECT count(*) INTO remaining FROM (
    SELECT upper(regexp_replace(sku, '\s', '', 'g')) AS k
    FROM products
    GROUP BY 1
    HAVING count(*) = 2 AND count(*) FILTER (WHERE "listaId" IS NOT NULL) = 1
  ) x;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'dedup aborted: % mergeable group(s) remain', remaining;
  END IF;
END $$;

COMMIT;


-- ===== Prisma migration 20261002200000_products_sku_normalized_unique =====
BEGIN;
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

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, '7818cb54b326f280dac77bb1973564324540a21d6f4940dd3b33629b52e6b4c4', now(), '20261002200000_products_sku_normalized_unique', NULL, NULL, now(), 1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20261002200000_products_sku_normalized_unique');
COMMIT;

-- Result: what the merge changed (a re-run shows all zeros).
SELECT metric, n FROM _dedup_summary ORDER BY metric;
