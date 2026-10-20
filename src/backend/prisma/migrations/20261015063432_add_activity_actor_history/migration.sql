-- BASE-03 backend-propias (T-06) — historial de agenda y actor del cambio.
-- Estructura única sobre TeamActivity (decisión agenda-base: modelo único,
-- sin agenda por panel). Solo tablas/columnas/índices: ninguna fila.

-- AlterTable
ALTER TABLE "team_activities" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedById" TEXT;

-- CreateTable
CREATE TABLE "team_activity_events" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_activity_events_activityId_at_idx" ON "team_activity_events"("activityId", "at");

-- AddForeignKey
ALTER TABLE "team_activities" ADD CONSTRAINT "team_activities_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_activity_events" ADD CONSTRAINT "team_activity_events_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "team_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_activity_events" ADD CONSTRAINT "team_activity_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
