/**
 * Readers for the catalog template: the dictionaries and the current state of the products named by the file.
 * The plan builder is pure; this file is the only one that touches a database client, and only to READ.
 */
import { findProductMatchesBySkus, normalizeSku } from '../../helpers/sku-identity';
import { ParsedCatalog, ProductContent, ResourceType, TemplateDictionary, MainDataValue } from './catalog-template.types';

export interface ExistingProduct extends ProductContent {
  id: string;
  sku: string;
  /** ISO timestamp: optimistic-concurrency token of the preview. */
  updatedAt: string;
  /** Why an import must not write this product (empty = unprotected): PUBLISHED, NAME_LOCKED, SHEET_EDITED, SHEET_APPROVED. */
  protectedBy: string[];
}

export interface CatalogSnapshot {
  dictionary: TemplateDictionary;
  /** Keyed by NORMALIZED sku. */
  products: Map<string, ExistingProduct>;
  /** Normalized SKUs that match more than one existing product (the file row is refused). */
  ambiguousSkus?: Set<string>;
}

/** Injected readers (the Nest layer provides the Prisma-backed ones). */
export interface CatalogSnapshotReader {
  readDictionary(): Promise<TemplateDictionary>;
  readProducts(skus: string[]): Promise<{ products: Map<string, ExistingProduct>; ambiguous: Set<string> }>;
}

/** Every normalized SKU the plan needs from the database: the products of the file and their related models. */
export function collectSnapshotSkus(parsed: ParsedCatalog): string[] {
  return [...new Set([...parsed.products.map((p) => p.sku), ...parsed.related.map((r) => r.relatedSku)])];
}

export async function loadSnapshot(reader: CatalogSnapshotReader, parsed: ParsedCatalog): Promise<CatalogSnapshot> {
  const [dictionary, found] = await Promise.all([reader.readDictionary(), reader.readProducts(collectSnapshotSkus(parsed))]);
  return { dictionary, products: found.products, ambiguousSkus: found.ambiguous };
}

/**
 * Same signals as the catalog importer (`protectionReasons` in catalog-import.service.ts): kept in sync by hand because
 * that method is private. `approvedProductIds` = products with a PUBLICADA / LISTA_PARA_PUBLICAR revision.
 */
export function computeProtectionReasons(product: { id: string; publicRevisionId?: string | null; publishedAt?: Date | null; catalogPublished?: boolean; nameLockedAt?: Date | null; sheetVersion?: number | null; catalogName?: string | null }, approvedProductIds: Set<string>): string[] {
  const reasons: string[] = [];
  if (product.publicRevisionId || product.publishedAt || product.catalogPublished) reasons.push('PUBLISHED');
  if (product.nameLockedAt) reasons.push('NAME_LOCKED');
  if ((product.sheetVersion ?? 0) > 0 || product.catalogName) reasons.push('SHEET_EDITED');
  if (approvedProductIds.has(product.id)) reasons.push('SHEET_APPROVED');
  return reasons;
}

const APPROVED_REVISION_STATUSES = ['PUBLICADA', 'LISTA_PARA_PUBLICAR'];
const READ_SLICE = 500;

/** Prisma-backed reader (read-only). `db` is the library client or a transaction. */
export class PrismaCatalogSnapshotReader implements CatalogSnapshotReader {
  constructor(private readonly db: any) {}

  async readDictionary(): Promise<TemplateDictionary> {
    const [brands, categories, subcategories, moldes] = await Promise.all([
      this.db.brand.findMany({ select: { id: true, name: true } }),
      this.db.category.findMany({ where: { parentId: null }, select: { id: true, name: true } }),
      this.db.subcategory ? this.db.subcategory.findMany({ where: { isActive: true }, select: { id: true, name: true, categoryId: true } }) : [],
      this.db.subcategorySpec ? this.db.subcategorySpec.findMany({
        where: { status: 'APPROVED', definition: { isActive: true } },
        select: { subcategoryId: true, isRequired: true, sortOrder: true, definition: { select: { key: true, label: true, dataType: true, unit: true, options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { key: true, label: true } } } } },
        orderBy: { sortOrder: 'asc' },
      }) : [],
    ]);
    const categoryName = new Map<string, string>(categories.map((c: any) => [c.id, c.name]));
    return {
      brands: brands.map((b: any) => ({ id: b.id, name: b.name })),
      categories: categories.map((c: any) => ({ id: c.id, name: c.name })),
      subcategories: subcategories.map((s: any) => ({
        id: s.id, categoryId: s.categoryId, category: categoryName.get(s.categoryId) ?? '', name: s.name,
        specs: moldes.filter((m: any) => m.subcategoryId === s.id).map((m: any) => ({
          key: m.definition.key, label: m.definition.label, dataType: m.definition.dataType, unit: m.definition.unit ?? null, required: Boolean(m.isRequired),
          options: (m.definition.options ?? []).map((o: any) => ({ key: o.key, label: o.label })),
        })),
      })),
    };
  }

  async readProducts(skus: string[]): Promise<{ products: Map<string, ExistingProduct>; ambiguous: Set<string> }> {
    const products = new Map<string, ExistingProduct>(); const ambiguous = new Set<string>();
    if (!skus.length) return { products, ambiguous };
    const matches = await findProductMatchesBySkus(this.db, skus, { id: true, sku: true, name: true, description: true, brandId: true, categoryId: true, subcategoryId: true, updatedAt: true, nameLockedAt: true, publicRevisionId: true, publishedAt: true, catalogPublished: true, catalogName: true, sheetVersion: true, catalogHighlights: true, catalogFeatures: true, catalogBadges: true, catalogAvailableModels: true } as any);
    const rows = [...matches.values()].flat() as any[];
    const ids = rows.map((r) => r.id);
    // Read in bounded slices: Prisma expands nested includes into a second query with ~4 bind variables per row, and PostgreSQL
    // refuses more than 32767 (a 5000-product file that already exists would fail its preview otherwise).
    const slices = async (read: (part: string[]) => Promise<any[]>): Promise<any[]> => {
      const out: any[] = [];
      for (let i = 0; i < ids.length; i += READ_SLICE) out.push(...(await read(ids.slice(i, i + READ_SLICE))));
      return out;
    };
    const [revisions, values, groups, resources, images] = ids.length ? await Promise.all([
      this.db.productRevision?.findMany ? slices((part) => this.db.productRevision.findMany({ where: { productId: { in: part }, status: { in: APPROVED_REVISION_STATUSES } }, select: { productId: true } })) : [],
      this.db.productSpecValue ? slices((part) => this.db.productSpecValue.findMany({ where: { productId: { in: part }, stage: 'WORKING' }, select: { productId: true, state: true, dataType: true, valueText: true, valueNumber: true, valueBoolean: true, definition: { select: { key: true } }, options: { select: { optionKey: true } } } })) : [],
      slices((part) => this.db.productCatalogSpecGroup.findMany({ where: { productId: { in: part } }, orderBy: { position: 'asc' }, select: { productId: true, title: true, items: { orderBy: { position: 'asc' }, select: { label: true, value: true } } } })),
      slices((part) => this.db.productCatalogResource.findMany({ where: { productId: { in: part } }, orderBy: { position: 'asc' }, select: { productId: true, kind: true, title: true, url: true } })),
      slices((part) => this.db.productImage.findMany({ where: { productId: { in: part } }, orderBy: { sortOrder: 'asc' }, select: { productId: true, url: true, alt: true } })),
    ]) : [[], [], [], [], []];
    const approved = new Set<string>((revisions as any[]).map((r) => r.productId));
    const related = new Map<string, string[]>();
    for (const row of rows) {
      const content: ExistingProduct = {
        id: row.id, sku: row.sku, updatedAt: row.updatedAt.toISOString(), protectedBy: computeProtectionReasons(row, approved),
        name: row.name, description: row.description ?? null, brandId: row.brandId ?? null, categoryId: null, subcategoryId: row.subcategoryId ?? null,
        mainData: {}, specs: [], highlights: row.catalogHighlights ?? [], features: Array.isArray(row.catalogFeatures) ? row.catalogFeatures.map((f: any) => String(f?.label ?? '')).filter(Boolean) : [],
        badges: row.catalogBadges ?? [], resources: [], related: [],
      };
      related.set(row.id, (row.catalogAvailableModels ?? []).map((m: string) => normalizeSku(m)));
      content.related = related.get(row.id) ?? [];
      content.categoryId = row.categoryId ?? null;
      for (const v of (values as any[]).filter((x) => x.productId === row.id)) {
        const value = v.state !== 'KNOWN' ? null
          : v.dataType === 'NUMBER' ? Number(v.valueNumber)
          : v.dataType === 'BOOLEAN' ? v.valueBoolean
          : v.dataType === 'OPTION' ? (v.options[0]?.optionKey ?? null)
          : v.dataType === 'MULTI_OPTION' ? v.options.map((o: any) => o.optionKey).sort()
          : v.valueText;
        content.mainData[v.definition.key] = { state: v.state, value } as MainDataValue;
      }
      let position = 0;
      for (const g of (groups as any[]).filter((x) => x.productId === row.id)) for (const item of g.items) content.specs.push({ group: g.title, label: item.label, value: item.value, position: position++ });
      let rp = 0;
      for (const img of (images as any[]).filter((x) => x.productId === row.id)) content.resources.push({ type: 'Imagen', title: img.alt ?? '', url: img.url, position: rp++ });
      for (const res of (resources as any[]).filter((x) => x.productId === row.id)) content.resources.push({ type: (res.kind === 'FIRMWARE' ? 'Firmware' : 'Documento') as ResourceType, title: res.title, url: res.url, position: rp++ });
      const key = normalizeSku(row.sku);
      if (products.has(key)) ambiguous.add(key); else products.set(key, content);
    }
    return { products, ambiguous };
  }
}
