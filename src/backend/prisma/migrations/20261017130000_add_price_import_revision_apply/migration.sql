-- IMP-05 backend-transaccion: campos de aplicación de una revisión de precios.
-- Solo estructura; aplicar escribe Price (por (productId,priceListId)) en
-- transacción y marca la revisión APLICADA. No toca Product ni identidad.

-- AlterTable
ALTER TABLE "price_import_revisions" ADD COLUMN "appliedAt" TIMESTAMP(3);
ALTER TABLE "price_import_revisions" ADD COLUMN "appliedById" TEXT;
ALTER TABLE "price_import_revisions" ADD COLUMN "appliedResult" JSONB;

-- CreateIndex
CREATE INDEX "price_import_revisions_status_idx" ON "price_import_revisions"("status");

-- AddForeignKey
ALTER TABLE "price_import_revisions" ADD CONSTRAINT "price_import_revisions_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
