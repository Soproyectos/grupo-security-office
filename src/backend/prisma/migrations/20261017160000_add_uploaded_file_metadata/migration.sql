-- CAT-04 backend-activos (D1): metadatos de activos en UploadedFile.
-- Columnas aditivas y reversibles; SIN relleno retroactivo: las filas
-- existentes quedan visibility='PUBLIC' con metadata NULL (compatibilidad K4
-- y caché immutable del serve público).

-- AlterTable
ALTER TABLE "uploaded_files" ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE "uploaded_files" ADD COLUMN "sha256" TEXT;
ALTER TABLE "uploaded_files" ADD COLUMN "detectedKind" TEXT;
ALTER TABLE "uploaded_files" ADD COLUMN "originalName" TEXT;
ALTER TABLE "uploaded_files" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "uploaded_files" ADD COLUMN "ownerProductId" TEXT;

-- CreateIndex
CREATE INDEX "uploaded_files_ownerProductId_idx" ON "uploaded_files"("ownerProductId");
CREATE INDEX "uploaded_files_visibility_idx" ON "uploaded_files"("visibility");
