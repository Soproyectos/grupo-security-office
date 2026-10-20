-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
    'LEAD_ASSIGNED',
    'QUOTE_STATUS_CHANGED',
    'ORDER_INVOICED',
    'CUSTOMER_CONVERTED',
    'TARGET_ALERT',
    'TARGET_REACHED',
    'PRODUCT_PENDING_PUBLICATION',
    'PRODUCT_PUBLISHED',
    'PRODUCT_UNPUBLISHED',
    'PRICE_CHANGED',
    'STOCK_ALERT',
    'SUBORDINATE_QUOTE_WON',
    'SUBORDINATE_QUOTE_LOST',
    'SUBORDINATE_TARGET_ALERT',
    'NEW_TEAM_MEMBER',
    'IMPORT_COMPLETED',
    'IMPORT_FAILED',
    'ERP_SYNC_STATUS',
    'ACCOUNT_CHANGED',
    'SECURITY_ALERT',
    'ASSIGNMENT_GRANTED',
    'PERMISSION_CHANGED'
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;