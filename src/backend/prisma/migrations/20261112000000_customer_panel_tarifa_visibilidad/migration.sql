-- Panel de Clientes (feedback /commercial/customers, 2026-11-11):
-- pestañas "Tarifas" y "Visibilidad" por cliente.
--   * defaultPriceListId: tarifa por defecto del cliente (nullable FK a price_lists).
--   * visibleFields: JSON con los campos que el cliente puede ver en su portal.
--     { "catalog": true, "prices": true, "quotes": true, "orders": true }
-- Todo nullable/default: no rompe registros existentes ni la ruta de cotización
-- (Quote.priceListId sigue siendo la fuente de verdad al congelar precios).

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "defaultPriceListId" TEXT;

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "visibleFields" JSONB;

CREATE INDEX IF NOT EXISTS "customers_defaultPriceListId_idx"
  ON "customers" ("defaultPriceListId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_defaultPriceListId_fkey'
  ) THEN
    ALTER TABLE "customers"
      ADD CONSTRAINT "customers_defaultPriceListId_fkey"
      FOREIGN KEY ("defaultPriceListId") REFERENCES "price_lists"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
