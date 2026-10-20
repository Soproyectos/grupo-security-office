-- CAT-04 backend-activos (D1): recuperación estructural. Revierte por completo
-- la migración add_uploaded_file_metadata (0 datos comerciales: son metadatos
-- de activos añadidos por esta tanda).

DROP INDEX IF EXISTS "uploaded_files_visibility_idx";
DROP INDEX IF EXISTS "uploaded_files_ownerProductId_idx";

ALTER TABLE "uploaded_files" DROP COLUMN IF EXISTS "ownerProductId";
ALTER TABLE "uploaded_files" DROP COLUMN IF EXISTS "visibility";
ALTER TABLE "uploaded_files" DROP COLUMN IF EXISTS "originalName";
ALTER TABLE "uploaded_files" DROP COLUMN IF EXISTS "detectedKind";
ALTER TABLE "uploaded_files" DROP COLUMN IF EXISTS "sha256";
ALTER TABLE "uploaded_files" DROP COLUMN IF EXISTS "sizeBytes";
