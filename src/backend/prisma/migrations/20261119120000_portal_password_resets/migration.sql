CREATE TABLE "portal_password_resets" (
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_password_resets_pkey" PRIMARY KEY ("accountId")
);

CREATE UNIQUE INDEX "portal_password_resets_tokenHash_key" ON "portal_password_resets"("tokenHash");

ALTER TABLE "portal_password_resets" ADD CONSTRAINT "portal_password_resets_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "portal_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
