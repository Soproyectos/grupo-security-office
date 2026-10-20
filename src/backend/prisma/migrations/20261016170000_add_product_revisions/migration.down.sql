-- CAT-02 recuperación ESTRUCTURAL completa (inverse exacto de migration.sql).
-- Nota: el rollback de SOLO el backfill (conservando la estructura) es
-- recoverProductRevisionBackfill() en modules/products/product-revisions.backfill.ts.

-- Backfill inverse (data)
UPDATE "products" SET "publicRevisionId" = NULL;
DELETE FROM "product_revisions";

-- DropForeignKey / DropColumn / DropIndex / DropTable / DropType
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_publicRevisionId_fkey";
DROP INDEX IF EXISTS "products_publicRevisionId_idx";
ALTER TABLE "products" DROP COLUMN IF EXISTS "publicRevisionId";
ALTER TABLE "product_revisions" DROP CONSTRAINT IF EXISTS "product_revisions_createdById_fkey";
ALTER TABLE "product_revisions" DROP CONSTRAINT IF EXISTS "product_revisions_productId_fkey";
DROP INDEX IF EXISTS "product_revisions_productId_status_idx";
DROP INDEX IF EXISTS "product_revisions_productId_version_key";
DROP TABLE IF EXISTS "product_revisions";
DROP TYPE IF EXISTS "RevisionStatus";
