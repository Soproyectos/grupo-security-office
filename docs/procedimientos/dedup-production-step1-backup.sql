-- STEP 1 of 2 (production, Supabase SQL Editor) — 2026-10-02
-- In-database backup of every table the product dedup touches, BEFORE the merge.
-- Copies go to schema "backup_20261002", which the Supabase public API does not expose.
-- Restore (only if needed): see dedup-production-RESTORE.sql.
BEGIN;
CREATE SCHEMA IF NOT EXISTS backup_20261002;
REVOKE ALL ON SCHEMA backup_20261002 FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA backup_20261002 FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA backup_20261002 FROM authenticated';
  END IF;
END $$;
CREATE TABLE backup_20261002.products                    AS TABLE public.products;
CREATE TABLE backup_20261002.prices                      AS TABLE public.prices;
CREATE TABLE backup_20261002.product_images              AS TABLE public.product_images;
CREATE TABLE backup_20261002.stocks                      AS TABLE public.stocks;
CREATE TABLE backup_20261002.quote_items                 AS TABLE public.quote_items;
CREATE TABLE backup_20261002.audit_logs                  AS TABLE public.audit_logs;
CREATE TABLE backup_20261002.product_catalog_spec_groups AS TABLE public.product_catalog_spec_groups;
CREATE TABLE backup_20261002.product_catalog_spec_items  AS TABLE public.product_catalog_spec_items;
CREATE TABLE backup_20261002.product_catalog_resources   AS TABLE public.product_catalog_resources;
COMMIT;

SELECT 'products' AS t, count(*) FROM backup_20261002.products
UNION ALL SELECT 'prices', count(*) FROM backup_20261002.prices
UNION ALL SELECT 'product_images', count(*) FROM backup_20261002.product_images;
