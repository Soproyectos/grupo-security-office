/*
  Library block 1, step 5: a product can be saved as an incomplete draft
  without a brand and/or a classification (minimum data: SKU + name).

  products."brandId" and products."categoryId" stop being NOT NULL. A product
  without brand or subcategory is "por clasificar": it is never given a
  placeholder brand or category.

  Purely relaxing: every existing row stays valid. The foreign keys
  products_brandId_fkey / products_categoryId_fkey are NOT touched (still
  ON DELETE RESTRICT ON UPDATE CASCADE), so a non-NULL value must still point
  to an existing brand / category. No data is rewritten.

  Publishing stays blocked by the application rules (brand_present and
  category_valid), not by the database.

  NOTE for older builds: they read products.brand / products.category as
  always present. Do not create null-brand drafts while an old build serves
  traffic on the same database.
*/

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "brandId" DROP NOT NULL,
ALTER COLUMN "categoryId" DROP NOT NULL;
