-- IMP-05: revierte por completo add_price_import_revision_apply. 0 datos comerciales.
ALTER TABLE "price_import_revisions" DROP CONSTRAINT IF EXISTS "price_import_revisions_appliedById_fkey";
DROP INDEX IF EXISTS "price_import_revisions_status_idx";
ALTER TABLE "price_import_revisions" DROP COLUMN IF EXISTS "appliedResult";
ALTER TABLE "price_import_revisions" DROP COLUMN IF EXISTS "appliedById";
ALTER TABLE "price_import_revisions" DROP COLUMN IF EXISTS "appliedAt";
