/**
 * CAT-02 backend-publico — lente de revisión pública.
 *
 * La verdad pública es la REVISIÓN PUBLICADA activa (`Product.publicRevisionId`
 * → `ProductRevision` con `status: PUBLICADA`): cuando existe, sus campos de
 * ficha pisan las columnas vivas en TODAS las lecturas públicas (ID, slug,
 * listados y tienda). Si falta (o apunta a una revisión no publicada), las
 * lecturas sirven las columnas vivas tal cual (compatibilidad K4).
 *
 * Los precios NO viajan en el snapshot: siguen siendo datos comerciales vivos.
 */
import { PrismaService } from '../../prisma/prisma.service';

/** Campos de ficha que el snapshot puede reemplazar. */
// CAT-04 (D2): `images` y `catalogResources` son listas construidas por el
// servidor al guardar borrador/marcar pendiente (mismo contrato de
// inmutabilidad: pisan solo si el contenido los define).
export const LENS_FIELDS = ['sku', 'name', 'description', 'technicalSpecs', 'documents', 'catalogName', 'catalogModel', 'catalogBrand', 'images', 'catalogResources'] as const;

export interface LensRow {
  publicRevisionId?: string | null;
  [key: string]: unknown;
}

/**
 * Carga los contenidos de las revisiones activas (PUBLICADA) por id.
 * Filtra defensivamente: una referencia a revisión borrador/no existente se ignora.
 */
export async function loadActiveRevisionContents(
  prisma: PrismaService,
  revisionIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, Record<string, unknown>>> {
  const ids = [...new Set(revisionIds.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, Record<string, unknown>>();
  if (ids.length === 0) return map;
  const rows = await prisma.productRevision.findMany({
    where: { id: { in: ids }, status: 'PUBLICADA' as never },
    select: { id: true, content: true },
  });
  for (const row of rows) {
    if (row.content && typeof row.content === 'object') {
      map.set(row.id, row.content as Record<string, unknown>);
    }
  }
  return map;
}

/**
 * Aplica el snapshot sobre una fila pública: solo pisa los campos definidos en
 * el contenido; el resto de la respuesta (categoría, marca, imágenes, precios)
 * se conserva intacto (presentación compatible).
 */
export function applyRevisionLens<T extends LensRow>(row: T, contents: Map<string, Record<string, unknown>>): T {
  const content = row.publicRevisionId ? contents.get(row.publicRevisionId) : undefined;
  if (!content) return row;
  const next: Record<string, unknown> = { ...row };
  for (const field of LENS_FIELDS) {
    if (content[field] !== undefined && content[field] !== null) {
      next[field] = content[field];
    }
  }
  return next as T;
}
