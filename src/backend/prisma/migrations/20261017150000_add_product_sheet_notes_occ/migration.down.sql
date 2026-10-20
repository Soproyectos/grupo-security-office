-- CAT-03 backend (esquema): recuperación estructural. Revierte por completo la
-- migración add_product_sheet_notes_occ (0 datos comerciales; las notas internas
-- y los identificadores de fabricante se pierden con las columnas, como es
-- esperable al revertir el esquema que las introdujo).

ALTER TABLE "products" DROP COLUMN IF EXISTS "sheetVersion";
ALTER TABLE "products" DROP COLUMN IF EXISTS "catalogManufacturerRefs";
ALTER TABLE "products" DROP COLUMN IF EXISTS "catalogInternalNotes";
