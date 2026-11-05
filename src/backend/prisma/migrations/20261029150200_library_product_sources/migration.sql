/*
  Library block 1, step 3 (docs/biblioteca-dominio/estructura-biblioteca.md, 6.1 and 6.3 "M4"):
  provenance of a product in the supplier lists. Created EMPTY.

  Each appearance of a product in a list is one row, identified by
  (file, sheet, row, cutoff date); the reference is not part of the identity, so
  the same reference in another file is another source. Provenance is preserved:
  the foreign key is ON DELETE RESTRICT (a product that has sources cannot be
  deleted) and the app has no operation that deletes a source.

  No foreign key to anything but "products", on purpose (see the dictionary
  migration): the table can move to a dedicated library database.

  PRISMA: table, indexes and foreign key are what `prisma migrate diff` expects
  for the ProductSource model; the CHECK is not modelled by Prisma.
*/

-- CreateTable
CREATE TABLE "product_sources" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "cutoffDate" DATE NOT NULL,
    "originalReference" TEXT NOT NULL,
    "originalDescription" TEXT,
    "originalSection" TEXT,
    "originalBrandLabel" TEXT,
    "classificationCriterion" TEXT,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_sources_pkey" PRIMARY KEY ("id"),
    -- Rows of a sheet are numbered from 1.
    CONSTRAINT "product_sources_source_row_check" CHECK ("sourceRow" >= 1)
);

-- CreateIndex
CREATE INDEX "product_sources_productId_idx" ON "product_sources"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_sources_sourceFile_sourceSheet_sourceRow_cutoffDate_key" ON "product_sources"("sourceFile", "sourceSheet", "sourceRow", "cutoffDate");

-- AddForeignKey
ALTER TABLE "product_sources" ADD CONSTRAINT "product_sources_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
