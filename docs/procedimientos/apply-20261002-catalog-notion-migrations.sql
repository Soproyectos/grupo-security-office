-- Apply to Supabase (project "Web Grupo Security") on 2026-10-02:
--   20260930183000_add_notion_token
--   20261002151311_add_product_catalog_detail
-- Run once in the Supabase SQL Editor. Atomic: any error rolls everything back.
-- Pre-check done: Supabase schema matched local exactly before these migrations
-- (fingerprint 3f85e7228386f0c46a2530a8e8c1d5f3, 426 objects).
-- Rollback: rollback-20261002-catalog-notion-migrations.sql
BEGIN;

-- 20260930183000_add_notion_token
CREATE TABLE "notion_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceName" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notion_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notion_tokens_userId_key" ON "notion_tokens"("userId");
CREATE INDEX "notion_tokens_userId_idx" ON "notion_tokens"("userId");
ALTER TABLE "notion_tokens" ADD CONSTRAINT "notion_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 20261002151311_add_product_catalog_detail
CREATE TYPE "ProductCatalogStatus" AS ENUM ('ACTIVE', 'DISCONTINUED');
CREATE TYPE "ProductResourceKind" AS ENUM ('DATASHEET', 'MANUAL', 'QUICK_GUIDE', 'CERTIFICATE', 'OTHER_DOCUMENT', 'FIRMWARE', 'RELEASE_NOTES');

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

CREATE TABLE "product_catalog_spec_groups" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "product_catalog_spec_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_catalog_spec_items" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "product_catalog_spec_items_pkey" PRIMARY KEY ("id")
);

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

CREATE INDEX "product_catalog_spec_groups_productId_position_idx" ON "product_catalog_spec_groups"("productId", "position");
CREATE UNIQUE INDEX "product_catalog_spec_groups_productId_key_key" ON "product_catalog_spec_groups"("productId", "key");
CREATE INDEX "product_catalog_spec_items_groupId_position_idx" ON "product_catalog_spec_items"("groupId", "position");
CREATE INDEX "product_catalog_resources_productId_kind_idx" ON "product_catalog_resources"("productId", "kind");
CREATE UNIQUE INDEX "products_catalogSlug_key" ON "products"("catalogSlug");
CREATE INDEX "products_catalogPublished_catalogBrand_idx" ON "products"("catalogPublished", "catalogBrand");

ALTER TABLE "product_catalog_spec_groups" ADD CONSTRAINT "product_catalog_spec_groups_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_catalog_spec_items" ADD CONSTRAINT "product_catalog_spec_items_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "product_catalog_spec_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_catalog_resources" ADD CONSTRAINT "product_catalog_resources_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Register in Prisma's migration table (checksum = sha256 of each migration.sql file)
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES
  (gen_random_uuid()::text, '3c6a337931139d1cfe0a5463ba9098b23d778f013f7c1a4cd254c893bbf4c5dc', now(), '20260930183000_add_notion_token', NULL, NULL, now(), 1),
  (gen_random_uuid()::text, '74a37d1b464d4ee9646ff1e2bf624e89a0f6af25567bf32907042b69813e54fd', now(), '20261002151311_add_product_catalog_detail', NULL, NULL, now(), 1);

COMMIT;
