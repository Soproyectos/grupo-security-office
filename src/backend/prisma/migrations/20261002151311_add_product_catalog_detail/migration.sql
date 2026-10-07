-- CreateEnum
CREATE TYPE "ProductCatalogStatus" AS ENUM ('ACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "ProductResourceKind" AS ENUM ('DATASHEET', 'MANUAL', 'QUICK_GUIDE', 'CERTIFICATE', 'OTHER_DOCUMENT', 'FIRMWARE', 'RELEASE_NOTES');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "catalogAvailableModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "catalogBadges" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "catalogBrand" TEXT,
ADD COLUMN     "catalogBreadcrumb" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "catalogFeatures" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "catalogFirmwareNote" TEXT,
ADD COLUMN     "catalogHighlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "catalogImageAlt" TEXT,
ADD COLUMN     "catalogImageUrl" TEXT,
ADD COLUMN     "catalogModel" TEXT,
ADD COLUMN     "catalogName" TEXT,
ADD COLUMN     "catalogPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "catalogSlug" TEXT,
ADD COLUMN     "catalogSpecsDisclaimer" TEXT,
ADD COLUMN     "catalogStatus" "ProductCatalogStatus" DEFAULT 'ACTIVE';

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

-- CreateIndex
CREATE INDEX "product_catalog_spec_groups_productId_position_idx" ON "product_catalog_spec_groups"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "product_catalog_spec_groups_productId_key_key" ON "product_catalog_spec_groups"("productId", "key");

-- CreateIndex
CREATE INDEX "product_catalog_spec_items_groupId_position_idx" ON "product_catalog_spec_items"("groupId", "position");

-- CreateIndex
CREATE INDEX "product_catalog_resources_productId_kind_idx" ON "product_catalog_resources"("productId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "products_catalogSlug_key" ON "products"("catalogSlug");

-- CreateIndex
CREATE INDEX "products_catalogPublished_catalogBrand_idx" ON "products"("catalogPublished", "catalogBrand");

-- AddForeignKey
ALTER TABLE "product_catalog_spec_groups" ADD CONSTRAINT "product_catalog_spec_groups_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_catalog_spec_items" ADD CONSTRAINT "product_catalog_spec_items_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "product_catalog_spec_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_catalog_resources" ADD CONSTRAINT "product_catalog_resources_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

