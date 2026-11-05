-- Reverts 20261029150000_library_subcategories. Run it AFTER the later library
-- block 1 downs (spec dictionary needs "subcategories"). The subcategory
-- assignment of products is derived data: the up migration rebuilds it from
-- "categoryId". Subcategories created by hand after the up are lost.
-- "categories" and products."categoryId" were never modified, so they need nothing.

ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_subcategoryId_fkey";
DROP INDEX IF EXISTS "products_subcategoryId_idx";
ALTER TABLE "products" DROP COLUMN IF EXISTS "subcategoryId";

DROP TABLE IF EXISTS "subcategories";
