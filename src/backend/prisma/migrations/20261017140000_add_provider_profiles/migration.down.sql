-- IMP-07B (07B) recuperación estructural: revierte por completo la migración
-- add_provider_profiles (borra tablas e índices). 0 datos comerciales.

DROP TABLE IF EXISTS "provider_equivalences";
DROP TABLE IF EXISTS "provider_profiles";
