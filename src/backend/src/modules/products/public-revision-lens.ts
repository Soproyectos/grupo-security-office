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
/** Both generated clients implement only this query contract; no operational relations. */
interface RevisionContentReader {
  productRevision: {
    findMany(args: {
      where: { id: { in: string[] }; status: 'PUBLICADA' };
      select: { id: true; content: true };
    }): PromiseLike<Array<{ id: string; content: unknown }>>;
  };
}

/** Campos de ficha que el snapshot puede reemplazar. */
// CAT-04 (D2): `images` y `catalogResources` son listas construidas por el
// servidor al guardar borrador/marcar pendiente (mismo contrato de
// inmutabilidad: pisan solo si el contenido los define).
export const LENS_FIELDS = ['sku', 'name', 'description', 'technicalSpecs', 'documents', 'catalogName', 'catalogModel', 'catalogBrand', 'images', 'catalogResources'] as const;

/**
 * Snapshot version marker written ONLY by the server (`ProductRevisionsService`). From version 2 on,
 * every public-facing sheet field present in the snapshot is authoritative (null/empty included).
 * A revision without the marker (legacy) keeps the original behavior: null ignored, live fallback.
 */
export const SHEET_SNAPSHOT_VERSION_KEY = 'sheetSnapshotVersion';
export const SHEET_SNAPSHOT_VERSION = 2;
export function hasSheetSnapshotV2(content: Record<string, unknown> | undefined): boolean {
  const v = content?.[SHEET_SNAPSHOT_VERSION_KEY];
  return typeof v === 'number' && v >= SHEET_SNAPSHOT_VERSION;
}
const NON_NULLABLE_LENS_FIELDS: ReadonlyArray<string> = ['sku', 'name'];
const V2_PREVIEW_LIVE_FIELDS: ReadonlyArray<string> = ['description', 'catalogBrand'];
/** Fields frozen only from snapshot version 2 on (server-built). */
export const V2_SHEET_SNAPSHOT_FIELDS = ['catalogStatus', 'catalogSpecsDisclaimer', 'catalogAvailableModels', 'catalogFirmwareNote'] as const;

export interface LensRow {
  publicRevisionId?: string | null;
  [key: string]: unknown;
}

/**
 * Carga los contenidos de las revisiones activas (PUBLICADA) por id.
 * Filtra defensivamente: una referencia a revisión borrador/no existente se ignora.
 */
export async function loadActiveRevisionContents(
  prisma: RevisionContentReader,
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
export function applyRevisionLens<T extends LensRow>(row: T, contents: Map<string, Record<string, unknown>>, opts: { preview?: boolean } = {}): T {
  const content = row.publicRevisionId ? contents.get(row.publicRevisionId) : undefined;
  if (!content) return row;
  const next: Record<string, unknown> = { ...row };
  const v2 = hasSheetSnapshotV2(content);
  for (const field of LENS_FIELDS) {
    if (content[field] === undefined) continue;
    if (v2) {
      // Admin preview shows the live/draft value of these two fields (not the frozen one).
      if (opts.preview && V2_PREVIEW_LIVE_FIELDS.includes(field)) continue;
      // Version 2: a present key is authoritative, null included (no fallback to live),
      // except the non-nullable identity columns.
      if (content[field] === null && NON_NULLABLE_LENS_FIELDS.includes(field)) continue;
      next[field] = content[field];
    } else if (content[field] !== null) {
      next[field] = content[field];
    }
  }
  return next as T;
}

/**
 * Published-isolation: detailed-sheet fields frozen in the revision by the server
 * (see `ProductRevisionsService.buildSheetSnapshot`). Unlike LENS_FIELDS, a KEY
 * PRESENT with `null` is authoritative (e.g. "no hero image when published").
 * A revision without the key (legacy) falls back to the live value.
 */
export const SHEET_SNAPSHOT_FIELDS = ['catalogSpecGroups', 'catalogHighlights', 'catalogBadges', 'catalogFeatures', 'catalogImageUrl', 'catalogImageAlt'] as const;

export function applySheetSnapshot<T extends LensRow>(row: T, contents: Map<string, Record<string, unknown>>): T {
  const content = row.publicRevisionId ? contents.get(row.publicRevisionId) : undefined;
  if (!content) return row;
  const next: Record<string, unknown> = { ...row };
  for (const field of SHEET_SNAPSHOT_FIELDS) {
    if (content[field] !== undefined) next[field] = content[field];
  }
  if (hasSheetSnapshotV2(content)) {
    for (const field of V2_SHEET_SNAPSHOT_FIELDS) {
      if (content[field] !== undefined) next[field] = content[field];
    }
  }
  return next as T;
}

/**
 * Published-isolation: identity keys the server freezes in the revision (see
 * `ProductRevisionsService.buildSheetSnapshot`). They drive public search, filters, facets and
 * slug resolution. KEY PRESENT (even null) is authoritative; a revision without the key (legacy)
 * or a product without a pinned revision falls back to the live column.
 */
export const SNAPSHOT_IDENTITY_KEYS = ['categoryId', 'brandId', 'subcategoryId', 'catalogSlug'] as const;
export type SnapshotIdentityKey = (typeof SNAPSHOT_IDENTITY_KEYS)[number];

export function effectiveIdentity(
  row: LensRow,
  contents: Map<string, Record<string, unknown>>,
  key: SnapshotIdentityKey,
  live: string | null | undefined,
): string | null {
  const content = row.publicRevisionId ? contents.get(row.publicRevisionId) : undefined;
  if (content && Object.prototype.hasOwnProperty.call(content, key)) {
    const value = content[key];
    return typeof value === 'string' ? value : null;
  }
  return live ?? null;
}

type ImageLike = { url?: unknown; alt?: unknown; isPrimary?: unknown };
/** Gallery order as the sheet shows it: primary first, stable otherwise; only url+alt matter. */
const galleryKey = (images: ImageLike[]) =>
  [...images].sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary))).map((i) => [i.url ?? null, i.alt ?? null]);

/**
 * True when the live (draft) detailed sheet differs from the published snapshot.
 * Fields the snapshot does not hold (legacy revision) are ignored: there the public
 * view is the live one, so there is nothing pending. Deterministic JSON comparison.
 */
export function sheetDiffersFromSnapshot(
  live: { images: ImageLike[] } & Record<string, unknown>,
  content: Record<string, unknown> | undefined,
): boolean {
  if (!content) return false;
  const norm = (v: unknown) => JSON.stringify(v ?? null);
  const groups = (v: unknown) =>
    (Array.isArray(v) ? v : []).map((g: any) => [g?.key, g?.title, (Array.isArray(g?.items) ? g.items : []).map((i: any) => [i?.label, i?.value])]);
  for (const field of ['catalogHighlights', 'catalogBadges', 'catalogFeatures', 'catalogImageUrl', 'catalogImageAlt'] as const) {
    if (content[field] !== undefined && norm(content[field]) !== norm(live[field])) return true;
  }
  if (hasSheetSnapshotV2(content)) {
    const blank = (v: unknown) => (v === '' || (Array.isArray(v) && v.length === 0) ? null : v ?? null);
    for (const field of ['description', 'catalogBrand', 'catalogSpecsDisclaimer', 'catalogFirmwareNote', 'catalogAvailableModels'] as const) {
      if (content[field] !== undefined && norm(blank(content[field])) !== norm(blank(live[field]))) return true;
    }
    if (content.catalogStatus !== undefined && (content.catalogStatus ?? 'ACTIVE') !== (live.catalogStatus ?? 'ACTIVE')) return true;
  }
  if (content.catalogSpecGroups !== undefined && norm(groups(content.catalogSpecGroups)) !== norm(groups(live.catalogSpecGroups))) return true;
  if (Array.isArray(content.images) && norm(galleryKey(content.images)) !== norm(galleryKey(live.images))) return true;
  return false;
}
