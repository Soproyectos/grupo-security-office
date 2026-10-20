-- CAT-03 backend (esquema): apartados de la ficha que faltaban.
--  - catalogInternalNotes: notas INTERNAS (H1). No se publican ni salen en la
--    exportación ordinaria; su lectura/edición exige la acción `products:notes`.
--  - catalogManufacturerRefs: identificadores del fabricante (H4).
--  - sheetVersion: versión de la ficha para el control de concurrencia (H2, OCC).
-- Solo estructura, 0 datos comerciales; no altera el contenido existente.

-- AlterTable
ALTER TABLE "products" ADD COLUMN "catalogInternalNotes" TEXT;
ALTER TABLE "products" ADD COLUMN "catalogManufacturerRefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "products" ADD COLUMN "sheetVersion" INTEGER NOT NULL DEFAULT 0;
