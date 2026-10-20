-- CAT-02 backend-esquema: revisión de producto (snapshot público con versión)
-- + referencia pública activa. Solo estructura + backfill de lo YA publicado.
-- K1: en producción real el backfill se ensaya primero en BD desechable (TANDA-COMPLETA).

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('SIN_REVISAR', 'CON_PROBLEMAS', 'LISTA_PARA_PUBLICAR', 'REVISION_PENDIENTE', 'PUBLICADA');

-- CreateTable
CREATE TABLE "product_revisions" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdById" TEXT,
    "status" "RevisionStatus" NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_revisions_productId_version_key" ON "product_revisions"("productId", "version");
CREATE INDEX "product_revisions_productId_status_idx" ON "product_revisions"("productId", "status");

-- AddForeignKey
ALTER TABLE "product_revisions" ADD CONSTRAINT "product_revisions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_revisions" ADD CONSTRAINT "product_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddColumn
ALTER TABLE "products" ADD COLUMN "publicRevisionId" TEXT;
CREATE INDEX "products_publicRevisionId_idx" ON "products"("publicRevisionId");
ALTER TABLE "products" ADD CONSTRAINT "products_publicRevisionId_fkey" FOREIGN KEY ("publicRevisionId") REFERENCES "product_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BACKFILL: una revisión PUBLICADA (v1) por cada producto del catálogo actual.
-- Preserva IDs/datos/medios: NO escribe en products salvo publicRevisionId;
-- el snapshot referencia los MISMOS ids/urls de imágenes. Campos EXPLÍCITOS
-- (no to_jsonb): el snapshot no cambia si el schema evoluciona.
WITH ins AS (
  INSERT INTO "product_revisions" ("id", "productId", "createdById", "status", "version", "content", "publishedAt", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text,
         p."id",
         p."publishedById",
         'PUBLICADA'::"RevisionStatus",
         1,
         jsonb_build_object(
           'id', p."id", 'sku', p."sku", 'name', p."name", 'description', p."description",
           'categoryId', p."categoryId", 'brandId', p."brandId", 'listaId', p."listaId",
           'technicalSpecs', to_jsonb(p."technicalSpecs"), 'extraAttributes', to_jsonb(p."extraAttributes"),
           'documents', to_jsonb(p."documents"),
           'publishStatus', p."publishStatus", 'publishedAt', to_jsonb(p."publishedAt"),
           'catalogPublished', p."catalogPublished", 'catalogSlug', p."catalogSlug",
           'catalogName', p."catalogName", 'catalogModel', p."catalogModel", 'catalogBrand', p."catalogBrand",
           'catalogImageUrl', p."catalogImageUrl", 'catalogImageAlt', p."catalogImageAlt",
           'catalogHighlights', to_jsonb(p."catalogHighlights"), 'catalogFeatures', to_jsonb(p."catalogFeatures"),
           'catalogBreadcrumb', p."catalogBreadcrumb", 'catalogBadges', to_jsonb(p."catalogBadges"),
           'catalogAvailableModels', to_jsonb(p."catalogAvailableModels"), 'catalogFirmwareNote', p."catalogFirmwareNote",
           'catalogSpecsDisclaimer', p."catalogSpecsDisclaimer", 'catalogStatus', p."catalogStatus"::text,
           'updatedAt', to_jsonb(p."updatedAt"),
           'snapshotAt', to_jsonb(CURRENT_TIMESTAMP),
           'images', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'id', i."id", 'url', i."url", 'alt', i."alt",
               'isPrimary', i."isPrimary", 'sortOrder', i."sortOrder", 'type', i."type"::text
             ) ORDER BY i."sortOrder")
             FROM "product_images" i WHERE i."productId" = p."id"
           ), '[]'::jsonb)
         ),
         COALESCE(p."publishedAt", p."createdAt"),
         CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP
  FROM "products" p
  WHERE p."catalogPublished" = true
    AND p."publicRevisionId" IS NULL
  RETURNING "id", "productId"
)
UPDATE "products" p
SET "publicRevisionId" = ins."id"
FROM ins
WHERE ins."productId" = p."id";
