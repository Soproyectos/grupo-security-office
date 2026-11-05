-- CreateTable
CREATE TABLE "library_audit_events" (
    "id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "request_id" TEXT,

    CONSTRAINT "library_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_audit_events_occurred_at_idx" ON "library_audit_events"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "library_audit_events_entity_idx" ON "library_audit_events"("entity_type", "entity_id", "occurred_at" DESC);

