-- Reverts 20261029150200_library_product_sources. Every provenance row is lost,
-- so take a dump first if any was loaded. Dropping the table drops its indexes,
-- constraints and foreign key.

DROP TABLE IF EXISTS "product_sources";
