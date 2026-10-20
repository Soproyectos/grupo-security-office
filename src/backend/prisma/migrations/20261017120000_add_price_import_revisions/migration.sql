-- IMP-04 backend-esquema: revisión comercial de precios guardada (recuperable).
-- Solo estructura, 0 datos comerciales; no modifica Price ni identidad (regla 3).
-- El archivo original se guarda en almacenamiento privado (fuera del estático).

-- CreateEnum
CREATE TYPE "PriceImportRevisionStatus" AS ENUM ('GUARDADA', 'APLICADA', 'DESCARTADA');

-- CreateTable
CREATE TABLE "price_import_revisions" (
    "id" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
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

    CONSTRAINT "price_import_revision_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_import_revisions_idempotencyKey_key" ON "price_import_revisions"("idempotencyKey");
CREATE INDEX "price_import_revisions_listaId_status_idx" ON "price_import_revisions"("listaId", "status");
CREATE INDEX "price_import_revisions_createdById_idx" ON "price_import_revisions"("createdById");
CREATE UNIQUE INDEX "price_import_revision_rows_revisionId_rowNumber_key" ON "price_import_revision_rows"("revisionId", "rowNumber");
CREATE INDEX "price_import_revision_rows_revisionId_status_idx" ON "price_import_revision_rows"("revisionId", "status");
CREATE UNIQUE INDEX "price_import_revision_prices_revisionId_rowNumber_tariffCode_key" ON "price_import_revision_prices"("revisionId", "rowNumber", "tariffCode");
CREATE INDEX "price_import_revision_prices_revisionId_idx" ON "price_import_revision_prices"("revisionId");

-- AddForeignKey
ALTER TABLE "price_import_revisions" ADD CONSTRAINT "price_import_revisions_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_import_revisions" ADD CONSTRAINT "price_import_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "price_import_revision_rows" ADD CONSTRAINT "price_import_revision_rows_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "price_import_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_import_revision_prices" ADD CONSTRAINT "price_import_revision_prices_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "price_import_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
