/**
 * Product media importer: pure logic (matching, plan building, file/DB apply).
 *
 * Input is the output directory of tools/enrich_hikvision_catalog.py:
 *   catalogo_hikvision_especificaciones.json   -> [{ sku_input, match_status, ... }]
 *   <SAFE_SKU>/images/hikvision__<SAFE_SKU>__NN.<ext>
 *   <SAFE_SKU>/pdfs/hikvision__<SAFE_SKU>__{datasheet|manual|quick_start}.pdf
 *
 * Only `matched` entries are imported. Products are matched by normalized SKU
 * (case and whitespace insensitive). The importer only ever ADDS rows and files:
 * it never deletes or modifies existing `product_images` rows and it appends to
 * `Product.documents` without touching the entries already there.
 *
 * The runnable wiring lives in scripts/import-product-media.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import { normalizeSku } from '../modules/products/import/helpers/text-normalizer';

export const ENRICHMENT_JSON = 'catalogo_hikvision_especificaciones.json';
export const UPLOADS_PRODUCTS_URL_PREFIX = '/uploads/products/';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const DOC_EXTENSIONS = new Set(['.pdf']);

// ---------- Types ----------

export interface MediaFile {
  /** Absolute path of the source file. */
  absPath: string;
  /** File name only (already validated as a safe name). */
  fileName: string;
  size: number;
}

export interface ProductMediaSource {
  /** SKU exactly as the enrichment tool wrote it. */
  sku: string;
  images: MediaFile[];
  docs: MediaFile[];
}

export interface ExistingImage {
  url: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface ExistingProduct {
  id: string;
  sku: string;
  name: string;
  documents: unknown;
  images: ExistingImage[];
}

export interface ProductDocument {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface PlannedImage {
  sourcePath: string;
  /** Path relative to the uploads dir: products/<productId>/<nn>.<ext> */
  destRelPath: string;
  url: string;
  alt: string;
  type: 'PRINCIPAL' | 'COMPLEMENTARIA';
  isPrimary: boolean;
  sortOrder: number;
}

export interface PlannedDoc {
  sourcePath: string;
  destRelPath: string;
  entry: ProductDocument;
}

export interface ProductMediaPlan {
  productId: string;
  sku: string;
  imagesToCreate: PlannedImage[];
  docsToAdd: PlannedDoc[];
  imagesAlreadyPresent: number;
  docsAlreadyPresent: number;
  /** Documents column had an unexpected shape: documents are left untouched. */
  documentsSkippedBadShape: boolean;
  /** Images of this product under /uploads/products/ once the plan is applied. */
  officialImagesAfter: number;
}

// ---------- SKU normalization ----------

/**
 * Case and whitespace insensitive SKU key: "ds-2ce16 (2.8mm)" == "DS-2CE16(2.8MM)".
 * Single shared implementation (same rule as the DB unique index).
 */
export { normalizeSku };

/** Port of sanitize_filename() in tools/enrich_hikvision_catalog.py (directory name per SKU). */
export function toSafeSku(sku: string): string {
  const collapsed = String(sku).trim().replace(/\s+/g, ' ').toUpperCase();
  return collapsed
    .replace(/ /g, '_')
    .replace(/-/g, '_')
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export interface ProductLookup {
  bySku: Map<string, ExistingProduct>;
  /** Normalized SKUs shared by more than one product: never imported. */
  ambiguous: Set<string>;
}

export function buildProductLookup(products: ExistingProduct[]): ProductLookup {
  const bySku = new Map<string, ExistingProduct>();
  const ambiguous = new Set<string>();
  for (const product of products) {
    const key = normalizeSku(product.sku);
    if (!key) continue;
    if (bySku.has(key)) {
      ambiguous.add(key);
    } else {
      bySku.set(key, product);
    }
  }
  for (const key of ambiguous) bySku.delete(key);
  return { bySku, ambiguous };
}

// ---------- Reading the enrichment output ----------

/** Compare file names by their embedded numbers so ...__2 sorts before ...__10. */
export function compareNatural(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function listFiles(dir: string, extensions: Set<string>): MediaFile[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const files: MediaFile[] = [];
  for (const fileName of names.sort(compareNatural)) {
    if (!SAFE_FILE_NAME.test(fileName)) continue;
    if (!extensions.has(path.extname(fileName).toLowerCase())) continue;
    const absPath = path.join(dir, fileName);
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size === 0) continue;
    files.push({ absPath, fileName, size: stat.size });
  }
  return files;
}

const DOC_RANK: Array<[RegExp, number]> = [
  [/datasheet/i, 0],
  [/manual/i, 1],
  [/quick[_-]?start/i, 2],
];

function docRank(fileName: string): number {
  for (const [re, rank] of DOC_RANK) if (re.test(fileName)) return rank;
  return DOC_RANK.length;
}

export interface EnrichmentLoad {
  sources: ProductMediaSource[];
  /** Entries in the JSON that were not `matched` (skipped). */
  skippedNotMatched: number;
  /** Matched entries repeated in the JSON (first wins). */
  duplicates: string[];
}

export function loadEnrichment(dir: string): EnrichmentLoad {
  const jsonPath = path.join(dir, ENRICHMENT_JSON);
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`No ${ENRICHMENT_JSON} found in ${dir}`);
  }
  const raw: unknown = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error(`${ENRICHMENT_JSON} must contain a JSON array`);
  }

  const sources: ProductMediaSource[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];
  let skippedNotMatched = 0;

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (record.match_status !== 'matched') {
      skippedNotMatched += 1;
      continue;
    }
    const sku = typeof record.sku_input === 'string' ? record.sku_input.trim() : '';
    const key = normalizeSku(sku);
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.push(sku);
      continue;
    }
    seen.add(key);

    const skuDir = path.join(dir, toSafeSku(sku));
    const docs = listFiles(path.join(skuDir, 'pdfs'), DOC_EXTENSIONS).sort(
      (a, b) => docRank(a.fileName) - docRank(b.fileName) || compareNatural(a.fileName, b.fileName),
    );
    sources.push({ sku, images: listFiles(path.join(skuDir, 'images'), IMAGE_EXTENSIONS), docs });
  }
  return { sources, skippedNotMatched, duplicates };
}

// ---------- Plan building ----------

function imageExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return ext === '.jpeg' ? '.jpg' : ext;
}

function docLabel(fileName: string): { name: string; type: string } {
  if (/datasheet/i.test(fileName)) return { name: 'Ficha técnica', type: 'datasheet' };
  if (/manual/i.test(fileName)) return { name: 'Manual de usuario', type: 'manual' };
  if (/quick[_-]?start/i.test(fileName)) {
    return { name: 'Guía de inicio rápido', type: 'quick_start' };
  }
  return { name: fileName, type: 'document' };
}

function existingDocumentUrls(documents: unknown): Set<string> | null {
  if (documents === null || documents === undefined) return new Set();
  if (!Array.isArray(documents)) return null;
  const urls = new Set<string>();
  for (const doc of documents) {
    if (typeof doc === 'object' && doc !== null && typeof (doc as { url?: unknown }).url === 'string') {
      urls.add((doc as { url: string }).url);
    }
  }
  return urls;
}

/**
 * Decide what to add for one product. Idempotent: images and documents whose
 * URL already exists are skipped, so a second run plans nothing.
 *
 * - Image `i` (1-based, source order) always maps to /uploads/products/<id>/<nn>.<ext>.
 * - The first image created becomes primary only when the product has no primary yet.
 * - New images sort after the existing ones.
 */
export function buildProductMediaPlan(
  product: ExistingProduct,
  source: ProductMediaSource,
): ProductMediaPlan {
  const presentUrls = new Set(product.images.map((img) => img.url));
  const hasPrimary = product.images.some((img) => img.isPrimary);
  const sortBase = product.images.length
    ? Math.max(...product.images.map((img) => img.sortOrder)) + 1
    : 0;

  const imagesToCreate: PlannedImage[] = [];
  let imagesAlreadyPresent = 0;
  source.images.forEach((file, index) => {
    const nn = String(index + 1).padStart(2, '0');
    const destRelPath = `products/${product.id}/${nn}${imageExtension(file.fileName)}`;
    const url = `/uploads/${destRelPath}`;
    if (presentUrls.has(url)) {
      imagesAlreadyPresent += 1;
      return;
    }
    const isPrimary = !hasPrimary && imagesToCreate.length === 0;
    imagesToCreate.push({
      sourcePath: file.absPath,
      destRelPath,
      url,
      alt: product.name,
      type: isPrimary ? 'PRINCIPAL' : 'COMPLEMENTARIA',
      isPrimary,
      sortOrder: sortBase + index,
    });
  });

  const knownDocUrls = existingDocumentUrls(product.documents);
  const documentsSkippedBadShape = knownDocUrls === null;
  const docsToAdd: PlannedDoc[] = [];
  let docsAlreadyPresent = 0;
  if (knownDocUrls !== null) {
    for (const file of source.docs) {
      const destRelPath = `products/${product.id}/docs/${file.fileName}`;
      const url = `/uploads/${destRelPath}`;
      if (knownDocUrls.has(url)) {
        docsAlreadyPresent += 1;
        continue;
      }
      const { name, type } = docLabel(file.fileName);
      docsToAdd.push({
        sourcePath: file.absPath,
        destRelPath,
        entry: { name, url, type, size: file.size },
      });
    }
  }

  const officialBefore = product.images.filter((img) =>
    img.url.startsWith(UPLOADS_PRODUCTS_URL_PREFIX),
  ).length;

  return {
    productId: product.id,
    sku: product.sku,
    imagesToCreate,
    docsToAdd,
    imagesAlreadyPresent,
    docsAlreadyPresent,
    documentsSkippedBadShape,
    officialImagesAfter: officialBefore + imagesToCreate.length,
  };
}

/** Existing documents followed by the new entries (existing ones are never altered). */
export function mergeDocuments(existing: unknown, added: ProductDocument[]): ProductDocument[] {
  const base = Array.isArray(existing) ? (existing as ProductDocument[]) : [];
  return [...base, ...added];
}

// ---------- Report ----------

export interface ImportReport {
  enrichedMatched: number;
  productsFound: number;
  unmatchedSkus: string[];
  ambiguousSkus: string[];
  imagesCreated: number;
  docsAdded: number;
  /** Counts of official (/uploads/products/) images per product after the import. */
  productsWith3OrMore: number;
  productsWith1To2: number;
  productsWith0: number;
  failedProducts: string[];
}

export function buildReport(input: {
  enrichedMatched: number;
  plans: ProductMediaPlan[];
  unmatchedSkus: string[];
  ambiguousSkus: string[];
  failedSkus: string[];
}): ImportReport {
  const failed = new Set(input.failedSkus);
  const ok = input.plans.filter((plan) => !failed.has(plan.sku));
  const total = (plan: ProductMediaPlan): number =>
    failed.has(plan.sku) ? plan.officialImagesAfter - plan.imagesToCreate.length : plan.officialImagesAfter;
  const counts = input.plans.map(total);
  return {
    enrichedMatched: input.enrichedMatched,
    productsFound: input.plans.length,
    unmatchedSkus: input.unmatchedSkus,
    ambiguousSkus: input.ambiguousSkus,
    imagesCreated: ok.reduce((sum, plan) => sum + plan.imagesToCreate.length, 0),
    docsAdded: ok.reduce((sum, plan) => sum + plan.docsToAdd.length, 0),
    productsWith3OrMore: counts.filter((n) => n >= 3).length,
    productsWith1To2: counts.filter((n) => n >= 1 && n <= 2).length,
    productsWith0: counts.filter((n) => n === 0).length,
    failedProducts: input.failedSkus,
  };
}

// ---------- Apply (files, then one transaction per product) ----------

export interface MediaFs {
  mkdir(dir: string): void;
  copyFile(from: string, to: string): void;
}

export const nodeMediaFs: MediaFs = {
  mkdir: (dir) => fs.mkdirSync(dir, { recursive: true }),
  copyFile: (from, to) => fs.copyFileSync(from, to),
};

/** Minimal Prisma surface used to write one product's media. */
export interface MediaTx {
  productImage: { createMany(args: { data: unknown[] }): Promise<unknown> };
  product: {
    update(args: { where: { id: string }; data: { documents: unknown } }): Promise<unknown>;
  };
}

export interface MediaDb {
  $transaction<T>(fn: (tx: MediaTx) => Promise<T>): Promise<T>;
}

/**
 * Copy the planned files under `uploadsDir`, then create the rows in a single
 * transaction. Files first: a row must never point to a missing file. If the
 * transaction fails the copied files are harmless and the next run reuses them.
 */
export async function applyProductPlan(
  db: MediaDb,
  plan: ProductMediaPlan,
  existingDocuments: unknown,
  uploadsDir: string,
  mediaFs: MediaFs = nodeMediaFs,
): Promise<void> {
  if (plan.imagesToCreate.length === 0 && plan.docsToAdd.length === 0) return;

  for (const item of [...plan.imagesToCreate, ...plan.docsToAdd]) {
    const dest = path.join(uploadsDir, item.destRelPath);
    mediaFs.mkdir(path.dirname(dest));
    mediaFs.copyFile(item.sourcePath, dest);
  }

  await db.$transaction(async (tx) => {
    if (plan.imagesToCreate.length > 0) {
      await tx.productImage.createMany({
        data: plan.imagesToCreate.map((img) => ({
          productId: plan.productId,
          url: img.url,
          alt: img.alt,
          type: img.type,
          isPrimary: img.isPrimary,
          sortOrder: img.sortOrder,
        })),
      });
    }
    if (plan.docsToAdd.length > 0) {
      await tx.product.update({
        where: { id: plan.productId },
        data: {
          documents: mergeDocuments(
            existingDocuments,
            plan.docsToAdd.map((doc) => doc.entry),
          ),
        },
      });
    }
  });
}
