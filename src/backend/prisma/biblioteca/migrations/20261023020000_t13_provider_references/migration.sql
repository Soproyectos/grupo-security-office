-- T13b · Proveedores y referencias (modelo-de-datos.md §3.4). Aditiva: columnas con valor por defecto o rellenadas antes de exigirlas.
-- No cambia precios ni costos. Una referencia de proveedor apunta a un solo producto; un producto puede tener varias.

-- Proveedor activo/inactivo (no se crea una tabla de proveedores paralela).
ALTER TABLE "provider_profiles" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Referencia de proveedor o equivalente de un producto.
ALTER TABLE "provider_equivalences"
  ADD COLUMN "normalized_ref" TEXT,
  ADD COLUMN "ref_kind" TEXT NOT NULL DEFAULT 'PROVEEDOR',
  ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- Misma normalización que el SKU (sin espacios, mayúsculas) para filas ya existentes.
UPDATE "provider_equivalences" SET "normalized_ref" = upper(regexp_replace("externalRef", '\s', '', 'g')) WHERE "normalized_ref" IS NULL;
ALTER TABLE "provider_equivalences" ALTER COLUMN "normalized_ref" SET NOT NULL;

ALTER TABLE "provider_equivalences" ADD CONSTRAINT "provider_equivalences_ref_kind_check" CHECK ("ref_kind" IN ('PROVEEDOR', 'EQUIVALENTE'));
ALTER TABLE "provider_equivalences" ADD CONSTRAINT "provider_equivalences_normalized_ref_not_blank" CHECK (length(btrim("normalized_ref")) > 0);

-- Una referencia normalizada por proveedor.
CREATE UNIQUE INDEX "provider_equivalences_profile_normalized_ref_key" ON "provider_equivalences"("providerProfileId", "normalized_ref");
-- A lo sumo una referencia principal por producto y proveedor.
CREATE UNIQUE INDEX "provider_equivalences_one_primary_key" ON "provider_equivalences"("productId", "providerProfileId") WHERE "is_primary";

-- La referencia ya no puede apuntar a un producto inexistente, y un producto con referencias no se borra en silencio.
ALTER TABLE "provider_equivalences" ADD CONSTRAINT "provider_equivalences_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
