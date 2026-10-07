CREATE TABLE "portal_tiers" (
 "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT,
 "priceListId" TEXT REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "portal_tiers_name_key" ON "portal_tiers"("name");
CREATE INDEX "portal_tiers_priceListId_idx" ON "portal_tiers"("priceListId");
ALTER TABLE "portal_accounts" ADD COLUMN "tierId" TEXT REFERENCES "portal_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
