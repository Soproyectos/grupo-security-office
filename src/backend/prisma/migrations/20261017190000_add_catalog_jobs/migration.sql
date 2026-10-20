-- CAT-07: contrato común de trabajos persistidos (sin broker externo, diseño :314).
-- Tablas NUEVAS aditivas: catalog_jobs + catalog_job_units.
-- 0 datos comerciales; no toca tablas existentes.

-- CreateTable
CREATE TABLE "catalog_jobs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "progressDone" INTEGER NOT NULL DEFAULT 0,
    "progressTotal" INTEGER NOT NULL DEFAULT 0,
    "checkpoint" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "leaseUntil" TIMESTAMP(3),
    "retryKey" TEXT,
    "resultSummary" JSONB,
    "error" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "catalog_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_job_units" (
    "jobId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_job_units_pkey" PRIMARY KEY ("jobId","unitId")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_jobs_kind_actor_retry_key_key" ON "catalog_jobs"("kind","actorId","retryKey");

-- CreateIndex
CREATE INDEX "catalog_jobs_state_leaseUntil_idx" ON "catalog_jobs"("state","leaseUntil");

-- CreateIndex
CREATE INDEX "catalog_jobs_actorId_createdAt_idx" ON "catalog_jobs"("actorId","createdAt");

-- CreateIndex
CREATE INDEX "catalog_job_units_jobId_state_idx" ON "catalog_job_units"("jobId","state");

-- AddForeignKey
ALTER TABLE "catalog_job_units" ADD CONSTRAINT "catalog_job_units_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "catalog_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
