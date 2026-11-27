-- DropForeignKey
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_listaId_fkey";

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "portalTierId" TEXT;

-- AlterTable
ALTER TABLE "portal_accounts" ADD COLUMN     "advisorId" TEXT,
ADD COLUMN     "city" TEXT;

-- AlterTable
ALTER TABLE "quote_items" ALTER COLUMN "unitPrice" DROP NOT NULL;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "portalAccountId" TEXT,
ALTER COLUMN "listaId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "zoneId" TEXT;

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_cities" (
    "zoneId" TEXT NOT NULL,
    "cityCode" TEXT NOT NULL,

    CONSTRAINT "zone_cities_pkey" PRIMARY KEY ("zoneId","cityCode")
);

-- CreateTable
CREATE TABLE "quote_status_events" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "portalAccountId" TEXT,
    "note" TEXT,

    CONSTRAINT "quote_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zones_name_key" ON "zones"("name");

-- CreateIndex
CREATE INDEX "zone_cities_cityCode_idx" ON "zone_cities"("cityCode");

-- CreateIndex
CREATE INDEX "quote_status_events_quoteId_createdAt_idx" ON "quote_status_events"("quoteId", "createdAt");

-- CreateIndex
CREATE INDEX "customers_portalTierId_idx" ON "customers"("portalTierId");

-- CreateIndex
CREATE INDEX "portal_accounts_advisorId_idx" ON "portal_accounts"("advisorId");

-- CreateIndex
CREATE INDEX "quotes_portalAccountId_idx" ON "quotes"("portalAccountId");

-- CreateIndex
CREATE INDEX "users_zoneId_idx" ON "users"("zoneId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_portalTierId_fkey" FOREIGN KEY ("portalTierId") REFERENCES "portal_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_portalAccountId_fkey" FOREIGN KEY ("portalAccountId") REFERENCES "portal_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_cities" ADD CONSTRAINT "zone_cities_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_status_events" ADD CONSTRAINT "quote_status_events_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: the tariff tier moves from each portal account to its company.
UPDATE "customers"
SET "portalTierId" = pa."tierId"
FROM "portal_accounts" pa
WHERE pa."customerId" = "customers"."id"
  AND pa."tierId" IS NOT NULL
  AND "customers"."portalTierId" IS NULL;
