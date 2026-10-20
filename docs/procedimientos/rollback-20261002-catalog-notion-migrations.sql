-- Rollback for migrations applied to Supabase on 2026-10-02:
--   20260930183000_add_notion_token
--   20261002151311_add_product_catalog_detail
-- Both migrations are additive; this removes exactly what they created.
-- WARNING: deletes any Notion tokens and enriched catalog data stored since then.
BEGIN;

DROP TABLE IF EXISTS "product_catalog_spec_items";
DROP TABLE IF EXISTS "product_catalog_spec_groups";
DROP TABLE IF EXISTS "product_catalog_resources";
DROP TABLE IF EXISTS "notion_tokens";

ALTER TABLE "products"
  DROP COLUMN IF EXISTS "catalogAvailableModels",
  DROP COLUMN IF EXISTS "catalogBadges",
  DROP COLUMN IF EXISTS "catalogBrand",
  DROP COLUMN IF EXISTS "catalogBreadcrumb",
  DROP COLUMN IF EXISTS "catalogFeatures",
  DROP COLUMN IF EXISTS "catalogFirmwareNote",
  DROP COLUMN IF EXISTS "catalogHighlights",
  DROP COLUMN IF EXISTS "catalogImageAlt",
  DROP COLUMN IF EXISTS "catalogImageUrl",
  DROP COLUMN IF EXISTS "catalogModel",
  DROP COLUMN IF EXISTS "catalogName",
  DROP COLUMN IF EXISTS "catalogPublished",
  DROP COLUMN IF EXISTS "catalogSlug",
  DROP COLUMN IF EXISTS "catalogSpecsDisclaimer",
  DROP COLUMN IF EXISTS "catalogStatus";

DROP TYPE IF EXISTS "ProductCatalogStatus";
DROP TYPE IF EXISTS "ProductResourceKind";

DELETE FROM "_prisma_migrations"
WHERE migration_name IN ('20260930183000_add_notion_token', '20261002151311_add_product_catalog_detail');

COMMIT;
