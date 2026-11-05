-- CreateTable
CREATE TABLE "product_gaps" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "gap_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "reason" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "set_by_actor_id" TEXT,
    "set_by_actor_name" TEXT,

    CONSTRAINT "product_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_evidence" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "source_url" TEXT,
    "reason" TEXT,
    "value_hash" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT,
    "actor_name" TEXT,

    CONSTRAINT "field_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_costs" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "provider_profile_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "tax_included" BOOLEAN NOT NULL,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "source_revision_id" TEXT,
    "created_by_actor_id" TEXT,
    "created_by_actor_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_gaps_product_idx" ON "product_gaps"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_evidence_product_field_key" ON "field_evidence"("product_id", "field_key");

-- CreateIndex
CREATE INDEX "supplier_costs_product_provider_date_idx" ON "supplier_costs"("product_id", "provider_profile_id", "valid_from" DESC);

-- AddForeignKey
ALTER TABLE "product_gaps" ADD CONSTRAINT "product_gaps_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_evidence" ADD CONSTRAINT "field_evidence_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_costs" ADD CONSTRAINT "supplier_costs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_costs" ADD CONSTRAINT "supplier_costs_provider_profile_id_fkey" FOREIGN KEY ("provider_profile_id") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


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
