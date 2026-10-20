-- IMP-04 recuperación estructural: revierte por completo la migración
-- add_price_import_revisions (borra tablas, índice y enum). 0 datos comerciales.

DROP TABLE IF EXISTS "price_import_revision_prices";
DROP TABLE IF EXISTS "price_import_revision_rows";
DROP TABLE IF EXISTS "price_import_revisions";
DROP TYPE IF EXISTS "PriceImportRevisionStatus";
