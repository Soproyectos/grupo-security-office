CREATE TABLE "export_bundles" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "bundleBytes" BYTEA NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "manifestJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "export_bundles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "export_bundles_size_check" CHECK ("sizeBytes" >= 0 AND "sizeBytes" <= 52428800),
  CONSTRAINT "export_bundles_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "catalog_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "export_bundles_jobId_key" ON "export_bundles"("jobId");
CREATE INDEX "export_bundles_actorId_createdAt_idx" ON "export_bundles"("actorId", "createdAt");
CREATE INDEX "export_bundles_expiresAt_idx" ON "export_bundles"("expiresAt");
