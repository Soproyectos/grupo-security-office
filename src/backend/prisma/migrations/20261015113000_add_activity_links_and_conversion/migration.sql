-- BASE-03 `backend-vinculos` — sólo estructura (sin filas sembradas).
-- Aceptación: «Revocación oculta detalles; conversión explícita deduplica
-- producto+regla+revisión.»
--
-- 1) `team_activity_links` — vínculo actividad → recurso. El enlace NO concede
--    acceso: la revelación del detalle se resuelve al leer con `resolveAccess`.
-- 2) `team_activities.dedupKey` (índice ÚNICO) — clave
--    `productId|regla|revisión` de la conversión explícita (D6): dos
--    conversiones de la misma combinación no pueden crear dos actividades.
--    Sólo se rellena en la conversión; el resto queda NULL y Postgres no
--    colisiona NULL entre sí.
-- 3) `team_requests.convertedActivityId` — rastro de la conversión SIN borrar
--    ni mutar la solicitud («historial no se borra»).
--
-- Generado con `prisma migrate diff --from-url <t06> --to-schema-datamodel`
-- y recortado a ESTE incremento: el diff traía además un ajuste de
-- `notifications` que pertenece a otro cambio (drift preexistente) y se omite.
CREATE TYPE "ActivityLinkTarget" AS ENUM ('PRODUCT', 'LISTA', 'PRICE_LIST', 'IMPORT_SESSION');

-- AlterTable
ALTER TABLE "team_activities" ADD COLUMN "dedupKey" TEXT;

-- AlterTable
ALTER TABLE "team_requests" ADD COLUMN "convertedActivityId" TEXT;

-- CreateTable
CREATE TABLE "team_activity_links" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "targetType" "ActivityLinkTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_activity_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_activity_links_targetType_targetId_idx" ON "team_activity_links"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "team_activity_links_activityId_targetType_targetId_key" ON "team_activity_links"("activityId", "targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "team_activities_dedupKey_key" ON "team_activities"("dedupKey");

-- CreateIndex
CREATE INDEX "team_requests_convertedActivityId_idx" ON "team_requests"("convertedActivityId");

-- AddForeignKey
ALTER TABLE "team_activity_links" ADD CONSTRAINT "team_activity_links_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "team_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_requests" ADD CONSTRAINT "team_requests_convertedActivityId_fkey" FOREIGN KEY ("convertedActivityId") REFERENCES "team_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
