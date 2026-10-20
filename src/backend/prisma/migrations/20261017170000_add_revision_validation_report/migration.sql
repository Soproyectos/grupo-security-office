-- CAT-05 backend-reglas (D4): informe de validación por revisión.
-- Columnas ADITIVAS en product_revisions: validatedAt, rulesVersion, issues.
-- Un informe pertenece a la revisión que lo obtuvo; editar crea otra revisión
-- (REVISION_PENDIENTE) y el informe anterior queda obsoleto por construcción.
-- 0 datos comerciales; no altera contenido existente.

-- AlterTable
ALTER TABLE "product_revisions" ADD COLUMN "validatedAt" TIMESTAMP(3);
ALTER TABLE "product_revisions" ADD COLUMN "rulesVersion" TEXT;
ALTER TABLE "product_revisions" ADD COLUMN "issues" JSONB;
