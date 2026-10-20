-- CAT-06 backend: recuperación estructural. Revierte por completo
-- add_publication_pinning_and_events (0 datos comerciales implicados).

DROP TABLE IF EXISTS "publication_events";

ALTER TABLE "products" DROP COLUMN IF EXISTS "scheduledRevisionId";
