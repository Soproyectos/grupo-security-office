-- Additive development contracts, complementary to Prisma's schema.
-- These checks do not evaluate publication or select an official product field/tariff.
ALTER TABLE "product_gaps"
  ADD CONSTRAINT "product_gaps_status_check" CHECK (status IN ('NO_ENCONTRADO','NO_PUBLICADO','NO_APLICA','PENDIENTE')),
  ADD CONSTRAINT "product_gaps_severity_check" CHECK (severity IN ('BLOQUEA','AVISO')),
  ADD CONSTRAINT "product_gaps_reason_check" CHECK (status <> 'NO_APLICA' OR NULLIF(btrim(reason),'') IS NOT NULL),
  ADD CONSTRAINT "product_gaps_documents_notice_check" CHECK (gap_key NOT IN ('datasheet','manual','firmware') OR severity='AVISO');
CREATE UNIQUE INDEX "product_gaps_open_key" ON "product_gaps" (product_id,gap_key) WHERE resolved_at IS NULL;

ALTER TABLE "field_evidence"
  ADD CONSTRAINT "field_evidence_level_check" CHECK (level IN ('VERIFICADO','DECLARADO','INFERIDO','CONTRADICTORIO')),
  ADD CONSTRAINT "field_evidence_source_check" CHECK (source_kind IN ('FABRICANTE','LISTA_PROVEEDOR','MANUAL','SCRIPT')),
  ADD CONSTRAINT "field_evidence_url_check" CHECK (level <> 'VERIFICADO' OR source_kind <> 'FABRICANTE' OR NULLIF(btrim(source_url),'') IS NOT NULL),
  ADD CONSTRAINT "field_evidence_reason_check" CHECK (level <> 'INFERIDO' OR NULLIF(btrim(reason),'') IS NOT NULL);

ALTER TABLE "supplier_costs"
  ADD CONSTRAINT "supplier_costs_positive_check" CHECK (amount > 0),
  ADD CONSTRAINT "supplier_costs_currency_check" CHECK (char_length(currency)=3),
  ADD CONSTRAINT "supplier_costs_dates_check" CHECK (valid_until IS NULL OR valid_until > valid_from);
