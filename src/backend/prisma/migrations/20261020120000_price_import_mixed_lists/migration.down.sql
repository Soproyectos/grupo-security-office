-- Reverts 20261020120000_price_import_mixed_lists. The history table and the
-- new columns are dropped. Revisions without a lista (multi-lista) cannot
-- exist in the previous schema, so they are removed (rows and prices cascade).

DROP TABLE IF EXISTS "product_changes";

ALTER TABLE "price_import_revision_prices" DROP COLUMN IF EXISTS "largeChange";
ALTER TABLE "price_import_revision_prices" DROP COLUMN IF EXISTS "changePercent";
ALTER TABLE "price_import_revision_prices" DROP COLUMN IF EXISTS "productId";

DROP INDEX IF EXISTS "price_import_revision_rows_productId_idx";
DROP INDEX IF EXISTS "price_import_revision_rows_listaId_idx";
ALTER TABLE "price_import_revision_rows" DROP COLUMN IF EXISTS "resolvedById";
ALTER TABLE "price_import_revision_rows" DROP COLUMN IF EXISTS "resolvedAt";
ALTER TABLE "price_import_revision_rows" DROP COLUMN IF EXISTS "resolution";
ALTER TABLE "price_import_revision_rows" DROP COLUMN IF EXISTS "listaId";
ALTER TABLE "price_import_revision_rows" DROP COLUMN IF EXISTS "productId";

DELETE FROM "price_import_revisions" WHERE "listaId" IS NULL;
ALTER TABLE "price_import_revisions" DROP CONSTRAINT "price_import_revisions_listaId_fkey";
ALTER TABLE "price_import_revisions" ALTER COLUMN "listaId" SET NOT NULL;
ALTER TABLE "price_import_revisions" ADD CONSTRAINT "price_import_revisions_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
