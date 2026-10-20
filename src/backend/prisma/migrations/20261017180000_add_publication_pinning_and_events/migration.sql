-- CAT-06 backend: publicar la revisión exacta + bandeja/historial.
-- Cambios ADITIVOS y reversibles:
--   * products.scheduledRevisionId (pin de la revisión congelada al programar).
--   * tabla publication_events (historial por producto; actorId null = scheduler).
-- 0 datos comerciales: no toca filas existentes.

-- AlterTable
ALTER TABLE "products" ADD COLUMN "scheduledRevisionId" TEXT;

-- CreateTable
CREATE TABLE "publication_events" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "revisionId" TEXT,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "actorId" TEXT,
    "issues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "publication_events_productId_createdAt_idx" ON "publication_events"("productId", "createdAt");
CREATE INDEX "publication_events_action_createdAt_idx" ON "publication_events"("action", "createdAt");
