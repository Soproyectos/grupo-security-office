-- Additive: consent, deletion request and SUSPENDED state for portal accounts.
ALTER TYPE "PortalAccountState" ADD VALUE IF NOT EXISTS 'SUSPENDED';

ALTER TABLE "portal_accounts"
  ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "privacyVersion" TEXT,
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
