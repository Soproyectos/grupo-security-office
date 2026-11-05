-- Product internal notes as a list (one row per note, with author and dates).
-- Additive and re-runnable: the old single-text column "products"."catalogInternalNotes" is NOT dropped
-- here. It becomes obsolete (the service no longer reads or writes it) and is removed in a later,
-- separately approved migration.
--
-- Author columns are plain values (no FK to "users"): the dedicated library database has no users table.
-- authorId NULL + authorName 'Sistema' marks notes migrated from the old single-text column.

-- CreateTable
CREATE TABLE IF NOT EXISTS "product_internal_notes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_internal_notes_productId_createdAt_idx" ON "product_internal_notes"("productId", "createdAt" DESC);

-- AddForeignKey (guarded so a second run does not fail)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_internal_notes_productId_fkey'
  ) THEN
    ALTER TABLE "product_internal_notes"
      ADD CONSTRAINT "product_internal_notes_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Data migration: one first note per product that has a non-empty old note.
-- Date = the product's last known update (products."updatedAt"); author = 'Sistema' (authorId NULL).
-- The deterministic id 'sistema-<productId>' plus ON CONFLICT DO NOTHING makes this idempotent:
-- running it again never duplicates a note, and never touches notes people wrote afterwards.
INSERT INTO "product_internal_notes" ("id", "productId", "authorId", "authorName", "text", "version", "createdAt", "updatedAt")
SELECT 'sistema-' || p."id", p."id", NULL, 'Sistema', btrim(p."catalogInternalNotes"), 0, p."updatedAt", p."updatedAt"
FROM "products" p
WHERE p."catalogInternalNotes" IS NOT NULL
  AND btrim(p."catalogInternalNotes") <> ''
ON CONFLICT ("id") DO NOTHING;
