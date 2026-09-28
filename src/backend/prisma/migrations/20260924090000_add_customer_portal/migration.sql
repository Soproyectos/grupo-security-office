-- Isolated customer portal identity and type-based price-list access.
CREATE TYPE "PortalAccountType" AS ENUM ('FINAL_CUSTOMER', 'INSTALLER');
CREATE TYPE "PortalAccountState" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

CREATE TABLE "portal_accounts" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "documentId" TEXT,
  "phone" TEXT,
  "type" "PortalAccountType" NOT NULL,
  "state" "PortalAccountState" NOT NULL DEFAULT 'PENDING',
  "customerId" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedById" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "portal_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "portal_price_list_mappings" (
  "id" TEXT NOT NULL,
  "type" "PortalAccountType" NOT NULL,
  "priceListId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "portal_price_list_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "portal_sessions" (
  "id" TEXT NOT NULL,
  "jti" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "portal_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_accounts_email_key" ON "portal_accounts"("email");
CREATE INDEX "portal_accounts_state_createdAt_idx" ON "portal_accounts"("state", "createdAt");
CREATE INDEX "portal_accounts_customerId_idx" ON "portal_accounts"("customerId");
CREATE INDEX "portal_accounts_documentId_idx" ON "portal_accounts"("documentId");
CREATE UNIQUE INDEX "portal_price_list_mappings_type_key" ON "portal_price_list_mappings"("type");
CREATE INDEX "portal_price_list_mappings_priceListId_idx" ON "portal_price_list_mappings"("priceListId");
CREATE UNIQUE INDEX "portal_sessions_jti_key" ON "portal_sessions"("jti");
CREATE INDEX "portal_sessions_accountId_revokedAt_idx" ON "portal_sessions"("accountId", "revokedAt");
CREATE INDEX "portal_sessions_expiresAt_idx" ON "portal_sessions"("expiresAt");

ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "portal_price_list_mappings" ADD CONSTRAINT "portal_price_list_mappings_priceListId_fkey"
  FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
