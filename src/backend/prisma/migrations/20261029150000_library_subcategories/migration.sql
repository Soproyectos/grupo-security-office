/*
  Library block 1, step 1 (docs/biblioteca-dominio/estructura-biblioteca.md, 2.1 and 6.3 "M1"):
  subcategories, the optional products."subcategoryId", and a guarded backfill.

  WHAT IT DOES
    1. Aborts, before changing anything, if row-level security would hide rows of
       "products" or "categories" from the running role, or if a category is
       deeper than 2 levels (a subcategory hangs from a ROOT category, so a third
       level has no home).
    2. Creates "subcategories" and the nullable products."subcategoryId"
       (FK ON DELETE RESTRICT, indexed).
    3. Backfills: one subcategory per current child category of a root, with the
       deterministic id 'sub_' || category id, name / slug / sortOrder / isActive
       copied and "legacyCategoryId" = that category id; then sets
       products."subcategoryId" for every product whose "categoryId" is a child
       category and which has no subcategory yet.
    4. Aborts, rolling everything back, if the backfill is not consistent.

  WHAT IT DOES NOT DO
    "categories" and products."categoryId" are untouched, products."updatedAt" is
    not modified and no product_changes row is written, so the backfill is
    invisible to the publication and audit flows. Nothing is deleted.

  ATOMIC: Prisma sends this file as one multi-statement command, so a guard that
  raises leaves the database exactly as it was (the failed run is only recorded
  in _prisma_migrations; mark it rolled back before retrying).

  DRIFT: the deployed app does not know products."subcategoryId". A product
  created, or moved to another child category, after this migration keeps a null
  or old subcategory. Running the two statements between the backfill markers
  again re-syncs it: they are idempotent, create subcategories only for child
  categories that lack one, and fill only products that have no subcategory yet
  (a subcategory already set is never overwritten, because once the library app
  writes it, it is the source). The guards below are for this one-time run.

  PRISMA: the table, indexes and constraints are what `prisma migrate diff` expects
  for the Subcategory model and Product.subcategoryId; the guards and the
  backfill are plain data statements and do not show up in a diff.
*/

-- Guard: the backfill and the checks below must see every row. QA has row-level
-- security enabled (without policies) on "products" and "categories"; a role that
-- is not a superuser, BYPASSRLS or the table owner would see zero rows there and
-- every guard would pass on a no-op.
DO $$
DECLARE
  hidden text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO hidden
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = current_schema()
    AND c.relname IN ('products', 'categories')
    AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls))
    AND (c.relforcerowsecurity OR NOT pg_has_role(current_user, c.relowner, 'USAGE'));

  IF hidden IS NOT NULL THEN
    RAISE EXCEPTION
      'library_subcategories: row-level security hides rows of % from role %. Run it as a superuser or a BYPASSRLS role (or as the owner without FORCE ROW LEVEL SECURITY); nothing was applied.',
      hidden, current_user;
  END IF;
END $$;

-- Guard: refuse to run while a category is deeper than 2 levels (also catches cycles).
DO $$
DECLARE
  deep_categories bigint;
  sample text;
BEGIN
  SELECT count(*), string_agg(slug, ', ' ORDER BY slug) FILTER (WHERE rn <= 5)
    INTO deep_categories, sample
  FROM (
    SELECT c."slug", row_number() OVER (ORDER BY c."slug") AS rn
    FROM "categories" c
    JOIN "categories" p ON p."id" = c."parentId"
    WHERE p."parentId" IS NOT NULL
  ) d;

  IF deep_categories > 0 THEN
    RAISE EXCEPTION
      'library_subcategories: % category(ies) are deeper than 2 levels (e.g. %). Flatten the category tree to root > child first; nothing was applied.',
      deep_categories, sample;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "subcategoryId" TEXT;

-- CreateTable
CREATE TABLE "subcategories" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "searchTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "legacyCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subcategories_legacyCategoryId_key" ON "subcategories"("legacyCategoryId");

-- CreateIndex
CREATE INDEX "subcategories_categoryId_idx" ON "subcategories"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "subcategories_categoryId_slug_key" ON "subcategories"("categoryId", "slug");

-- CreateIndex
CREATE INDEX "products_subcategoryId_idx" ON "products"("subcategoryId");

-- AddForeignKey
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "subcategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- >>> backfill (idempotent, re-runnable; do not edit the marker lines) >>>
INSERT INTO "subcategories" ("id", "categoryId", "name", "slug", "sortOrder", "isActive", "legacyCategoryId", "updatedAt")
SELECT 'sub_' || c."id", c."parentId", c."name", c."slug", c."sortOrder", c."isActive", c."id", CURRENT_TIMESTAMP
FROM "categories" c
JOIN "categories" parent ON parent."id" = c."parentId" AND parent."parentId" IS NULL
ON CONFLICT ("legacyCategoryId") DO NOTHING;

UPDATE "products" p
SET "subcategoryId" = s."id"
FROM "subcategories" s
WHERE s."legacyCategoryId" = p."categoryId"
  AND p."subcategoryId" IS NULL;
-- <<< backfill <<<

-- Guard: every product in a child category must now have a subcategory, and only those.
DO $$
DECLARE
  with_subcategory bigint;
  in_child_category bigint;
BEGIN
  SELECT count(*) INTO with_subcategory FROM "products" WHERE "subcategoryId" IS NOT NULL;
  SELECT count(*) INTO in_child_category
  FROM "products" p
  JOIN "categories" c ON c."id" = p."categoryId"
  WHERE c."parentId" IS NOT NULL;

  IF with_subcategory <> in_child_category THEN
    RAISE EXCEPTION
      'library_subcategories: % product(s) have a subcategory but % sit in a child category (count mismatch); rolled back.',
      with_subcategory, in_child_category;
  END IF;
END $$;

-- Guard: the subcategory of a product must be the copy of the product's own category.
DO $$
DECLARE
  disagreeing bigint;
  sample text;
BEGIN
  SELECT count(*), string_agg(sku, ', ' ORDER BY sku) FILTER (WHERE rn <= 5)
    INTO disagreeing, sample
  FROM (
    SELECT p."sku", row_number() OVER (ORDER BY p."sku") AS rn
    FROM "products" p
    JOIN "subcategories" s ON s."id" = p."subcategoryId"
    WHERE s."legacyCategoryId" IS DISTINCT FROM p."categoryId"
  ) d;

  IF disagreeing > 0 THEN
    RAISE EXCEPTION
      'library_subcategories: % product(s) have a subcategory that disagrees with their category (e.g. %); rolled back.',
      disagreeing, sample;
  END IF;
END $$;
