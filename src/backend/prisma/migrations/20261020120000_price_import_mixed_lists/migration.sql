-- Price import rules (2026-10-20): mixed listas per revision, unknown-SKU
-- resolution, large-change flag and per-product history. Additive only.

-- A revision may span several listas: listaId becomes nullable and the FK no
-- longer deletes history when a lista is deleted.
ALTER TABLE "price_import_revisions" DROP CONSTRAINT "price_import_revisions_listaId_fkey";
ALTER TABLE "price_import_revisions" ALTER COLUMN "listaId" DROP NOT NULL;
ALTER TABLE "price_import_revisions" ADD CONSTRAINT "price_import_revisions_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row snapshots and unknown-SKU resolution (plain columns, no FKs).
ALTER TABLE "price_import_revision_rows" ADD COLUMN "productId" TEXT,
ADD COLUMN "listaId" TEXT,
ADD COLUMN "resolution" TEXT,
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "resolvedById" TEXT;
CREATE INDEX "price_import_revision_rows_listaId_idx" ON "price_import_revision_rows"("listaId");
CREATE INDEX "price_import_revision_rows_productId_idx" ON "price_import_revision_rows"("productId");

-- Per-price product link and large-change flag.
ALTER TABLE "price_import_revision_prices" ADD COLUMN "productId" TEXT,
ADD COLUMN "changePercent" DECIMAL(9,2),
ADD COLUMN "largeChange" BOOLEAN NOT NULL DEFAULT false;

-- Per-product change history.
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
CREATE INDEX "product_changes_productId_createdAt_idx" ON "product_changes"("productId", "createdAt" DESC);
CREATE INDEX "product_changes_sourceRef_idx" ON "product_changes"("sourceRef");
