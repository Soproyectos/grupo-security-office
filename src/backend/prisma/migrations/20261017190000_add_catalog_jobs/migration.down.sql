-- CAT-07: recuperación estructural. Revierte add_catalog_jobs por completo
-- (0 datos comerciales: son colas/metadata de trabajos de esta tanda).

ALTER TABLE IF EXISTS "catalog_job_units" DROP CONSTRAINT IF EXISTS "catalog_job_units_jobId_fkey";

DROP TABLE IF EXISTS "catalog_job_units";
DROP TABLE IF EXISTS "catalog_jobs";
