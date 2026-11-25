-- AlterTable
ALTER TABLE "portal_accounts" ADD COLUMN     "authUserId" TEXT;

-- CreateTable
CREATE TABLE "portal_auth_user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "companyName" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'FINAL_CUSTOMER',
    "documentId" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_auth_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_auth_session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "portal_auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_auth_account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_auth_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_auth_verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_auth_verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_auth_user_email_key" ON "portal_auth_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "portal_auth_session_token_key" ON "portal_auth_session"("token");

-- CreateIndex
CREATE INDEX "portal_auth_session_userId_idx" ON "portal_auth_session"("userId");

-- CreateIndex
CREATE INDEX "portal_auth_account_userId_idx" ON "portal_auth_account"("userId");

-- CreateIndex
CREATE INDEX "portal_auth_verification_identifier_idx" ON "portal_auth_verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "portal_accounts_authUserId_key" ON "portal_accounts"("authUserId");

-- AddForeignKey
ALTER TABLE "portal_accounts" ADD CONSTRAINT "portal_accounts_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "portal_auth_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_auth_session" ADD CONSTRAINT "portal_auth_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "portal_auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_auth_account" ADD CONSTRAINT "portal_auth_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "portal_auth_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

