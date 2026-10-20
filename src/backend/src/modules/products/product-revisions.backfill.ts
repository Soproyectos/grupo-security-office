/**
 * CAT-02 backend-esquema — backfill y recuperación de revisiones de producto.
 *
 * El SQL es EL MISMO que el bloque BACKFILL de
 * `prisma/migrations/20261016170000_add_product_revisions/migration.sql`
 * (mantener ambos sincronizados: la migración despliega, esta función es la que
 * prueban los specs con fixtures reales y permite re-ejecuciones controladas).
 *
 * Reglas del contrato (CAT-02 §3/§5):
 *  - El backfill NO escribe en `products` salvo `publicRevisionId` (IDs/datos/medios intactos).
 *  - El snapshot referencia los MISMOS ids/urls de imágenes (medios preservados).
 *  - Recuperación: borra solo el efecto del backfill y devuelve `publicRevisionId` a NULL.
 *
 * K1: en producción real su corrida queda para el coordinador (TANDA-COMPLETA
 * prohíbe operaciones sobre datos comerciales en esta tanda; aquí solo se ensaya
 * en BD desechables).
 */

/** SQL del backfill (paridad con migration.sql). */
const BACKFILL_SQL = `
WITH ins AS (
  INSERT INTO "product_revisions" ("id", "productId", "createdById", "status", "version", "content", "publishedAt", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text,
         p."id",
         p."publishedById",
         'PUBLICADA'::"RevisionStatus",
         1,
         jsonb_build_object(
           'id', p."id", 'sku', p."sku", 'name', p."name", 'description', p."description",
           'categoryId', p."categoryId", 'brandId', p."brandId", 'listaId', p."listaId",
           'technicalSpecs', to_jsonb(p."technicalSpecs"), 'extraAttributes', to_jsonb(p."extraAttributes"),
           'documents', to_jsonb(p."documents"),
           'publishStatus', p."publishStatus", 'publishedAt', to_jsonb(p."publishedAt"),
           'catalogPublished', p."catalogPublished", 'catalogSlug', p."catalogSlug",
           'catalogName', p."catalogName", 'catalogModel', p."catalogModel", 'catalogBrand', p."catalogBrand",
           'catalogImageUrl', p."catalogImageUrl", 'catalogImageAlt', p."catalogImageAlt",
           'catalogHighlights', to_jsonb(p."catalogHighlights"), 'catalogFeatures', to_jsonb(p."catalogFeatures"),
           'catalogBreadcrumb', p."catalogBreadcrumb", 'catalogBadges', to_jsonb(p."catalogBadges"),
           'catalogAvailableModels', to_jsonb(p."catalogAvailableModels"), 'catalogFirmwareNote', p."catalogFirmwareNote",
           'catalogSpecsDisclaimer', p."catalogSpecsDisclaimer", 'catalogStatus', p."catalogStatus"::text,
           'updatedAt', to_jsonb(p."updatedAt"),
           'snapshotAt', to_jsonb(CURRENT_TIMESTAMP),
           'images', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'id', i."id", 'url', i."url", 'alt', i."alt",
               'isPrimary', i."isPrimary", 'sortOrder', i."sortOrder", 'type', i."type"::text
             ) ORDER BY i."sortOrder")
             FROM "product_images" i WHERE i."productId" = p."id"
           ), '[]'::jsonb)
         ),
         COALESCE(p."publishedAt", p."createdAt"),
         CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP
  FROM "products" p
  WHERE p."catalogPublished" = true
    AND p."publicRevisionId" IS NULL
  RETURNING "id", "productId"
)
UPDATE "products" p
SET "publicRevisionId" = ins."id"
FROM ins
WHERE ins."productId" = p."id"
`;

/** Inverso de datos (recuperación del backfill conservando la estructura). */
const RECOVER_SQL = [
  `UPDATE "products" SET "publicRevisionId" = NULL`,
  `DELETE FROM "product_revisions"`,
] as const;

export interface BackfillResult {
  /** Filas de revisión creadas (aprox: 0 en BD vacía). */
  backfilled: number;
}

export interface RecoveryResult {
  /** Revisiones eliminadas. */
  removed: number;
}

/**
 * Crea la revisión PUBLICADA (v1) de cada producto con `catalogPublished` y
 * enlaza `Product.publicRevisionId`. Idempotente: solo productos sin referencia.
 * Idempotente-: solo productos sin referencia.
 */
export async function runProductRevisionBackfill(
  // Tipado mínimo para no acoplar el spec a PrismaClient concreto.
  prisma: {
    $executeRawUnsafe(sql: string): Promise<number>;
  },
): Promise<BackfillResult> {
  const backfilled = await prisma.$executeRawUnsafe(BACKFILL_SQL);
  return { backfilled };
}

/**
 * Recuperación del backfill: referencias a NULL y revisiones borradas.
 * No toca productos, imágenes ni precios (IDs/datos/medios intactos).
 */
export async function recoverProductRevisionBackfill(
  prisma: {
    $executeRawUnsafe(sql: string): Promise<number>;
  },
): Promise<RecoveryResult> {
  await prisma.$executeRawUnsafe(RECOVER_SQL[0]);
  const removed = await prisma.$executeRawUnsafe(RECOVER_SQL[1]);
  return { removed };
}
