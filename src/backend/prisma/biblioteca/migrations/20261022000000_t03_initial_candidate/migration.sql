-- CANDIDATO T03 SIN APLICAR. Generado con Prisma 6.19.3 desde vacío.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PriceImportRevisionStatus" AS ENUM ('GUARDADA', 'APLICADA', 'DESCARTADA');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('SIN_REVISAR', 'CON_PROBLEMAS', 'LISTA_PARA_PUBLICAR', 'REVISION_PENDIENTE', 'PUBLICADA');

-- CreateEnum
CREATE TYPE "ProductCatalogStatus" AS ENUM ('ACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "ProductResourceKind" AS ENUM ('DATASHEET', 'MANUAL', 'QUICK_GUIDE', 'CERTIFICATE', 'OTHER_DOCUMENT', 'FIRMWARE', 'RELEASE_NOTES');

-- CreateEnum
CREATE TYPE "ProductImageType" AS ENUM ('PORTADA', 'LOGO', 'PRINCIPAL', 'COMPLEMENTARIA', 'EXTRA');

-- CreateTable
CREATE TABLE "listas" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "defaultVisibility" BOOLEAN NOT NULL DEFAULT false,
    "responsibleId" TEXT,
    "type" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "codigo" TEXT,
    "deletionStatus" TEXT,
    "deletionRequestedAt" TIMESTAMP(3),
    "deletionPurgeAt" TIMESTAMP(3),
    "deletionReason" TEXT,
    "deletionRequestedById" TEXT,

    CONSTRAINT "listas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "technicalSpecs" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "extraAttributes" JSONB,
    "listaId" TEXT,
    "publishAt" TIMESTAMP(3),
    "publishStatus" TEXT NOT NULL DEFAULT 'borrador',
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "unpublishAt" TIMESTAMP(3),
    "unpublishReason" TEXT,
    "documents" JSONB,
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "nameSource" TEXT NOT NULL DEFAULT 'sistema',
    "nameLockedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "catalogAvailableModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "catalogBadges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "catalogBrand" TEXT,
    "catalogBreadcrumb" JSONB NOT NULL DEFAULT '[]',
    "catalogFeatures" JSONB NOT NULL DEFAULT '[]',
    "catalogFirmwareNote" TEXT,
    "catalogHighlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "catalogImageAlt" TEXT,
    "catalogImageUrl" TEXT,
    "catalogModel" TEXT,
    "catalogName" TEXT,
    "catalogPublished" BOOLEAN NOT NULL DEFAULT false,
    "catalogSlug" TEXT,
    "catalogSpecsDisclaimer" TEXT,
    "catalogInternalNotes" TEXT,
    "catalogManufacturerRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sheetVersion" INTEGER NOT NULL DEFAULT 0,
    "catalogStatus" "ProductCatalogStatus" DEFAULT 'ACTIVE',
    "publicRevisionId" TEXT,
    "scheduledRevisionId" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_catalog_spec_groups" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "product_catalog_spec_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_catalog_spec_items" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "product_catalog_spec_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_catalog_resources" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "ProductResourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'es',
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "version" TEXT,
    "region" TEXT,
    "requiresLicense" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_catalog_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "iconUrl" VARCHAR(500),
    "imageUrl" VARCHAR(500),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "description" TEXT,
    "website" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

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
    "validatedAt" TIMESTAMP(3),
    "rulesVersion" TEXT,
    "issues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_events" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "revisionId" TEXT,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "actorId" TEXT,
    "issues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_jobs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "progressDone" INTEGER NOT NULL DEFAULT 0,
    "progressTotal" INTEGER NOT NULL DEFAULT 0,
    "checkpoint" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "leaseUntil" TIMESTAMP(3),
    "retryKey" TEXT,
    "resultSummary" JSONB,
    "error" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "catalog_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_bundles" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "bundleBytes" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "manifestJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "export_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_job_units" (
    "jobId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_job_units_pkey" PRIMARY KEY ("jobId","unitId")
);

-- CreateTable
CREATE TABLE "price_import_revisions" (
    "id" TEXT NOT NULL,
    "listaId" TEXT,
    "createdById" TEXT,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PriceImportRevisionStatus" NOT NULL DEFAULT 'GUARDADA',
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "taxIncluded" BOOLEAN NOT NULL DEFAULT true,
    "rounding" TEXT NOT NULL DEFAULT 'HALF_UP',
    "policyVersion" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "trailerVersion" TEXT,
    "tariffs" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,
    "appliedResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_import_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_import_revision_rows" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "issues" JSONB NOT NULL,
    "productId" TEXT,
    "listaId" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "price_import_revision_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_import_revision_prices" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "tariffCode" TEXT NOT NULL,
    "priceListId" TEXT,
    "receivedValue" TEXT NOT NULL,
    "roundedValue" TEXT NOT NULL,
    "previousValue" TEXT,
    "difference" TEXT,
    "wasRounded" BOOLEAN NOT NULL,
    "change" TEXT NOT NULL,
    "productId" TEXT,
    "changePercent" DECIMAL(9,2),
    "largeChange" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "price_import_revision_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_changes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "actorId" TEXT,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "type" "ProductImageType" NOT NULL DEFAULT 'PRINCIPAL',

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prices" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listaId" TEXT,

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_mappings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mappings" JSONB NOT NULL,
    "userId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "headerRow" INTEGER NOT NULL DEFAULT 1,
    "thousandsSeparator" TEXT NOT NULL DEFAULT '',
    "decimalSeparator" TEXT NOT NULL DEFAULT '.',
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "tariffs" JSONB NOT NULL,
    "expectedColumns" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_equivalences" (
    "id" TEXT NOT NULL,
    "providerProfileId" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_equivalences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listas_code_key" ON "listas"("code");

-- CreateIndex
CREATE UNIQUE INDEX "listas_codigo_key" ON "listas"("codigo");

-- CreateIndex
CREATE INDEX "listas_isActive_idx" ON "listas"("isActive");

-- CreateIndex
CREATE INDEX "listas_archivedAt_idx" ON "listas"("archivedAt");

-- CreateIndex
CREATE INDEX "listas_responsibleId_idx" ON "listas"("responsibleId");

-- CreateIndex
CREATE INDEX "listas_deletionPurgeAt_idx" ON "listas"("deletionPurgeAt");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_catalogSlug_key" ON "products"("catalogSlug");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_brandId_idx" ON "products"("brandId");

-- CreateIndex
CREATE INDEX "products_listaId_idx" ON "products"("listaId");

-- CreateIndex
CREATE INDEX "products_publishStatus_idx" ON "products"("publishStatus");

-- CreateIndex
CREATE INDEX "products_publishAt_idx" ON "products"("publishAt");

-- CreateIndex
CREATE INDEX "products_unpublishAt_idx" ON "products"("unpublishAt");

-- CreateIndex
CREATE INDEX "products_publicRevisionId_idx" ON "products"("publicRevisionId");

-- CreateIndex
CREATE INDEX "products_isActive_isVisible_idx" ON "products"("isActive", "isVisible");

-- CreateIndex
CREATE INDEX "products_lifecycleStatus_idx" ON "products"("lifecycleStatus");

-- CreateIndex
CREATE INDEX "products_catalogPublished_catalogBrand_idx" ON "products"("catalogPublished", "catalogBrand");

-- CreateIndex
CREATE INDEX "product_catalog_spec_groups_productId_position_idx" ON "product_catalog_spec_groups"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "product_catalog_spec_groups_productId_key_key" ON "product_catalog_spec_groups"("productId", "key");

-- CreateIndex
CREATE INDEX "product_catalog_spec_items_groupId_position_idx" ON "product_catalog_spec_items"("groupId", "position");

-- CreateIndex
CREATE INDEX "product_catalog_resources_productId_kind_idx" ON "product_catalog_resources"("productId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE INDEX "product_revisions_productId_status_idx" ON "product_revisions"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_revisions_productId_version_key" ON "product_revisions"("productId", "version");

-- CreateIndex
CREATE INDEX "publication_events_productId_createdAt_idx" ON "publication_events"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "publication_events_action_createdAt_idx" ON "publication_events"("action", "createdAt");

-- CreateIndex
CREATE INDEX "catalog_jobs_state_leaseUntil_idx" ON "catalog_jobs"("state", "leaseUntil");

-- CreateIndex
CREATE INDEX "catalog_jobs_actorId_createdAt_idx" ON "catalog_jobs"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_jobs_kind_actor_retry_key_key" ON "catalog_jobs"("kind", "actorId", "retryKey");

-- CreateIndex
CREATE UNIQUE INDEX "export_bundles_jobId_key" ON "export_bundles"("jobId");

-- CreateIndex
CREATE INDEX "export_bundles_actorId_createdAt_idx" ON "export_bundles"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "export_bundles_expiresAt_idx" ON "export_bundles"("expiresAt");

-- CreateIndex
CREATE INDEX "catalog_job_units_jobId_state_idx" ON "catalog_job_units"("jobId", "state");

-- CreateIndex
CREATE INDEX "price_import_revisions_listaId_status_idx" ON "price_import_revisions"("listaId", "status");

-- CreateIndex
CREATE INDEX "price_import_revisions_createdById_idx" ON "price_import_revisions"("createdById");

-- CreateIndex
CREATE INDEX "price_import_revisions_status_idx" ON "price_import_revisions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "price_import_revisions_idempotencyKey_key" ON "price_import_revisions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "price_import_revision_rows_revisionId_status_idx" ON "price_import_revision_rows"("revisionId", "status");

-- CreateIndex
CREATE INDEX "price_import_revision_rows_listaId_idx" ON "price_import_revision_rows"("listaId");

-- CreateIndex
CREATE INDEX "price_import_revision_rows_productId_idx" ON "price_import_revision_rows"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "price_import_revision_rows_revisionId_rowNumber_key" ON "price_import_revision_rows"("revisionId", "rowNumber");

-- CreateIndex
CREATE INDEX "price_import_revision_prices_revisionId_idx" ON "price_import_revision_prices"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "price_import_revision_prices_revisionId_rowNumber_tariffCode_ke" ON "price_import_revision_prices"("revisionId", "rowNumber", "tariffCode");

-- CreateIndex
CREATE INDEX "product_changes_productId_createdAt_idx" ON "product_changes"("productId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "product_changes_sourceRef_idx" ON "product_changes"("sourceRef");

-- CreateIndex
CREATE INDEX "product_images_productId_idx" ON "product_images"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_code_key" ON "price_lists"("code");

-- CreateIndex
CREATE INDEX "prices_productId_idx" ON "prices"("productId");

-- CreateIndex
CREATE INDEX "prices_priceListId_idx" ON "prices"("priceListId");

-- CreateIndex
CREATE INDEX "prices_listaId_idx" ON "prices"("listaId");

-- CreateIndex
CREATE UNIQUE INDEX "prices_productId_priceListId_key" ON "prices"("productId", "priceListId");

-- CreateIndex
CREATE INDEX "import_mappings_userId_idx" ON "import_mappings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_providerName_key" ON "provider_profiles"("providerName");

-- CreateIndex
CREATE INDEX "provider_equivalences_productId_idx" ON "provider_equivalences"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_equivalences_providerProfileId_externalRef_key" ON "provider_equivalences"("providerProfileId", "externalRef");

-- CreateIndex
CREATE INDEX "import_sessions_userId_idx" ON "import_sessions"("userId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_publicRevisionId_fkey" FOREIGN KEY ("publicRevisionId") REFERENCES "product_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_catalog_spec_groups" ADD CONSTRAINT "product_catalog_spec_groups_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_catalog_spec_items" ADD CONSTRAINT "product_catalog_spec_items_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "product_catalog_spec_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_catalog_resources" ADD CONSTRAINT "product_catalog_resources_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_revisions" ADD CONSTRAINT "product_revisions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_bundles" ADD CONSTRAINT "export_bundles_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "catalog_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_job_units" ADD CONSTRAINT "catalog_job_units_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "catalog_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_import_revisions" ADD CONSTRAINT "price_import_revisions_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_import_revision_rows" ADD CONSTRAINT "price_import_revision_rows_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "price_import_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_import_revision_prices" ADD CONSTRAINT "price_import_revision_prices_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "price_import_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_equivalences" ADD CONSTRAINT "provider_equivalences_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- T03 CANDIDATO: complemento revisado del SQL que Prisma genera desde vacío.
-- No aplicar sin autorización y ensayo separado. No contiene cambios de datos.

-- 20260829154935 y 20260829154937: extensión de búsqueda difusa.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 20261017150000_add_product_sheet_notes_occ: Prisma no expresa NOT NULL de arrays.
-- El DEFAULT ARRAY[]::TEXT[] ya está en CREATE TABLE y se conserva.
ALTER TABLE "products" ALTER COLUMN "catalogManufacturerRefs" SET NOT NULL;

-- 20260820185813_lifecycle_status: conservar los SIETE estados históricos.
ALTER TABLE "products" ADD CONSTRAINT "products_lifecycleStatus_check"
  CHECK ("lifecycleStatus" IN ('DRAFT','READY','SCHEDULED','PUBLISHED','HIDDEN','DISCONTINUED','ARCHIVED'));

-- 20261019170000_add_export_bundles: mismo límite histórico de 50 MiB.
ALTER TABLE "export_bundles" ADD CONSTRAINT "export_bundles_size_check"
  CHECK ("sizeBytes" >= 0 AND "sizeBytes" <= 52428800);

-- 20261002200000_products_sku_normalized_unique: misma expresión y nombre.
-- Desde vacío no procede el bloque que busca duplicados ni la deduplicación.
CREATE UNIQUE INDEX IF NOT EXISTS "products_sku_normalized_key"
  ON "products" (upper(regexp_replace("sku", '\s', '', 'g')));

-- Decisión explícita del usuario, 22/10/2026: excluir los tres GIN retirados en
-- 20260908172738. Evaluarlos solo como optimización futura con consultas/mediciones.

-- Comentario vigente de dominio, 20260814171500_lista_entidad_raiz.
COMMENT ON COLUMN "prices"."listaId" IS 'Invariante: prices.listaId debe igualar products.listaId del producto (Price.listaId == Product.listaId). Validado en PricesService. Trigger CHECK diferido.';
