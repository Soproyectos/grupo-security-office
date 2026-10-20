-- EMERGENCY RESTORE (only if STEP 2 must be undone). Restores the touched tables from
-- schema backup_20261002 created in STEP 1. Drops the normalized-SKU index first.
BEGIN;
DROP INDEX IF EXISTS public.products_sku_normalized_key;
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261002200000_products_sku_normalized_unique';
TRUNCATE public.product_catalog_spec_items, public.product_catalog_spec_groups, public.product_catalog_resources,
         public.prices, public.product_images, public.stocks, public.quote_items, public.audit_logs, public.products CASCADE;
INSERT INTO public.products                    SELECT * FROM backup_20261002.products;
INSERT INTO public.prices                      SELECT * FROM backup_20261002.prices;
INSERT INTO public.product_images              SELECT * FROM backup_20261002.product_images;
INSERT INTO public.stocks                      SELECT * FROM backup_20261002.stocks;
INSERT INTO public.quote_items                 SELECT * FROM backup_20261002.quote_items;
INSERT INTO public.audit_logs                  SELECT * FROM backup_20261002.audit_logs;
INSERT INTO public.product_catalog_spec_groups SELECT * FROM backup_20261002.product_catalog_spec_groups;
INSERT INTO public.product_catalog_spec_items  SELECT * FROM backup_20261002.product_catalog_spec_items;
INSERT INTO public.product_catalog_resources   SELECT * FROM backup_20261002.product_catalog_resources;
COMMIT;
