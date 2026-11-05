/**
 * Apply step of the catalog template import: ONE product per call, each in its own transaction.
 *
 * It writes only what the preview plan decided (`PlanRow.changes`, or every addition for a new product) and goes through the
 * same services/rules as the editors:
 *  - classification: ClassificationService (same as the sheet editor and the list importer);
 *  - key data (datos principales): ProductSpecValuesService.writeProductSpecValues (WORKING stage only, explicit states);
 *  - sheet lists/resources: validated with `normalizeSheet` (the sheet editor's own normalizer) and written ADDITIVELY.
 *
 * Guarantees: never auto-publishes (new products are DRAFT, hidden); a PUBLISHED / locked / edited product has no `changes`
 * (its differences are proposals) and is re-checked inside the transaction; an empty cell never deletes; no master is created;
 * the sheet version is NOT bumped (the importer is not a manual edit, otherwise a second import would see every product as
 * "edited"); the same (batchId, sku) applied twice does nothing the second time.
 */
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { LibraryAuditService } from '../../library-audit/library-audit.service';
import { ProductSpecValuesService } from '../../library-specs/product-spec-values.service';
import { ProductRevisionsService } from '../product-revisions.service';
import { ClassificationService } from '../classification/classification.service';
import { findProductMatchesBySkus } from '../helpers/sku-identity';
import { normalizeSheet } from '../sheet/product-sheet.service';
import {
  ExistingProduct, LIMITS, ParsedProductRow, PlanChange, PlanRow, PrismaCatalogSnapshotReader, TemplateDictionary, textKey,
} from './template';
import { AppliedItem, APPLY_MAX_RETRIES, DEFAULT_FEATURE_ICON, DEFAULT_RESOURCE_LANGUAGE, ResultIssue } from './catalog-template-import.types';

/** Deterministic refusal: retrying cannot help. */
export class RowRejected extends Error { constructor(readonly code: string, message: string) { super(message); } }
/** The product changed (or appeared) after the preview: skip it, never overwrite. */
export class RowStale extends Error { constructor(readonly code: string, message: string) { super(message); } }

export interface ApplyInput {
  batchId: string;
  actor: { id: string; name?: string | null };
  row: PlanRow;
  source: ParsedProductRow;
  dictionary: TemplateDictionary;
  /** normalized sku -> sku as written in the catalog / the file (display form for the related models). */
  skuDisplay: Map<string, string>;
}

export interface ApplyOutcome {
  status: 'CREATED' | 'UPDATED' | 'STALE' | 'FAILED';
  code: string;
  productId?: string;
  applied: AppliedItem[];
  issues: ResultIssue[];
  error?: string;
  attempts: number;
}

type ResourceAddition = { type: 'Imagen' | 'Documento' | 'Firmware'; title: string; url: string };
interface Additions {
  highlights: string[]; features: string[]; badges: string[]; related: string[];
  specs: Array<{ group: string; label: string; value: string }>;
  resources: ResourceAddition[];
}

interface Progress { productId?: string; txDone: boolean; applied: AppliedItem[]; issues: ResultIssue[]; created: boolean }

const warn = (code: string, text: string): ResultIssue => ({ severity: 'warning', code, message: text });
const slug = (text: string, max = 64) => textKey(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '');
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

function emptyAdditions(): Additions { return { highlights: [], features: [], badges: [], related: [], specs: [], resources: [] }; }

/** What a NEW product receives: every item of the file. */
export function additionsOfDesired(row: PlanRow, skuDisplay: Map<string, string>): Additions {
  const d = row.desired;
  return {
    highlights: [...d.highlights], features: [...d.features], badges: [...d.badges],
    related: d.related.map((sku) => skuDisplay.get(sku) ?? sku),
    specs: d.specs.map((s) => ({ group: s.group, label: s.label, value: s.value })),
    resources: d.resources.map((r) => ({ type: r.type, title: r.title, url: r.url })),
  };
}

/** What an EXISTING product receives: only the additions the plan listed in `changes`. */
export function additionsOfChanges(changes: PlanChange[], skuDisplay: Map<string, string>): Additions {
  const out = emptyAdditions();
  for (const change of changes) {
    const item = change.after as any;
    switch (change.field) {
      case 'highlights': out.highlights.push(String(item)); break;
      case 'features': out.features.push(String(item)); break;
      case 'badges': out.badges.push(String(item)); break;
      case 'related': out.related.push(skuDisplay.get(String(item)) ?? String(item)); break;
      case 'specs': out.specs.push({ group: item.group, label: item.label, value: item.value }); break;
      case 'resources': out.resources.push({ type: item.type, title: item.title, url: item.url }); break;
      default: break;
    }
  }
  return out;
}

/** First occurrence wins; items already present (by key) are skipped; the limit is respected and reported. */
function takeNew<T>(issues: ResultIssue[], field: string, have: T[], wanted: T[], max: number, keyOf: (x: T) => string): T[] {
  const known = new Set(have.map(keyOf));
  const out: T[] = [];
  for (const item of wanted) {
    const key = keyOf(item);
    if (known.has(key)) continue;
    if (have.length + out.length >= max) { issues.push(warn('COLLECTION_LIMIT', `Se omiten elementos de ${field}: el límite es ${max}.`)); break; }
    known.add(key);
    out.push(item);
  }
  return out;
}

@Injectable()
export class CatalogTemplateApplyService {
  constructor(
    private readonly library: BibliotecaPrismaService,
    private readonly audit: LibraryAuditService,
    private readonly specValues: ProductSpecValuesService,
    @Optional() private readonly revisions?: ProductRevisionsService,
    @Optional() private readonly classification: ClassificationService = new ClassificationService(),
  ) {}

  /**
   * Applies one plan row. Never throws: the outcome says what happened. Transient errors are retried (APPLY_MAX_RETRIES) and
   * the progress of the first attempts (transaction done, product id) is kept, so a retry never creates the product twice.
   */
  async applyRow(input: ApplyInput): Promise<ApplyOutcome> {
    const progress: Progress = { txDone: false, applied: [], issues: [], created: false };
    let attempts = 0;
    for (;;) {
      attempts++;
      try {
        await this.attempt(input, progress);
        return {
          status: progress.created ? 'CREATED' : 'UPDATED', code: progress.created ? 'CREATED_DRAFT' : 'UPDATED_FILLED_EMPTY',
          productId: progress.productId, applied: progress.applied, issues: progress.issues, attempts,
        };
      } catch (error) {
        if (error instanceof RowStale) return { status: 'STALE', code: error.code, productId: progress.productId, applied: progress.applied, issues: progress.issues, error: error.message, attempts };
        if (error instanceof RowRejected) return { status: 'FAILED', code: error.code, productId: progress.productId, applied: progress.applied, issues: progress.issues, error: error.message, attempts };
        if (attempts > APPLY_MAX_RETRIES) {
          const code = progress.txDone ? 'KEY_DATA_FAILED' : 'APPLY_FAILED';
          return { status: 'FAILED', code, productId: progress.productId, applied: progress.applied, issues: progress.issues, error: messageOf(error), attempts };
        }
      }
    }
  }

  private async attempt(input: ApplyInput, progress: Progress): Promise<void> {
    if (!progress.txDone) {
      if (input.row.action === 'create') await this.createProduct(input, progress);
      else await this.updateProduct(input, progress);
      progress.txDone = true;
    }
    await this.writeKeyData(input, progress);
  }

  // ------------------------------------------------------------------ create

  private async createProduct(input: ApplyInput, progress: Progress): Promise<void> {
    const { row, source, batchId, actor } = input;
    await this.library.writeTransaction(async (tx) => {
      const db = tx as any;
      const found = (await findProductMatchesBySkus(db, [row.sku], { id: true } as any)).get(row.sku)?.[0] as { id: string } | undefined;
      if (found) {
        if (await this.appliedByBatch(db, found.id, batchId)) { progress.productId = found.id; progress.created = true; return; }
        throw new RowStale('SKU_APPEARED', `El producto ${row.reference} apareció después de la vista previa. Genere una nueva vista previa.`);
      }
      const d = row.desired;
      const data: Record<string, unknown> = { sku: row.reference.trim(), name: d.name, description: d.description || null, brandId: d.brandId, lifecycleStatus: 'DRAFT', isActive: false, isVisible: false };
      if (d.categoryId || d.subcategoryId) {
        const classified = await this.classification.resolve(db, { categoryId: d.subcategoryId ? undefined : d.categoryId, subcategoryId: d.subcategoryId ?? undefined, brandId: d.brandId }, undefined);
        const blocking = classified.issues.find((i) => i.blocking);
        if (blocking) throw new RowRejected('CLASSIFICATION_BLOCKED', blocking.message);
        Object.assign(data, this.classification.toData(classified));
      }
      const product = await db.product.create({ data });
      progress.productId = product.id;
      progress.created = true;
      const fields = ['sku', 'name', 'description', 'brandId', 'categoryId', 'subcategoryId'].filter((f) => product[f] !== null && product[f] !== undefined);
      for (const field of fields) await this.change(db, product, field, undefined, product[field], batchId, actor.id);
      progress.applied.push(...fields.map((field) => ({ field })));
      progress.applied.push(...await this.writeCollections(db, product, additionsOfDesired(row, input.skuDisplay), progress.issues, batchId, actor.id));
      for (const key of Object.keys(d.mainData)) progress.applied.push({ field: 'mainData', key: this.labelOf(input.dictionary, key) });
      await this.recordUnresolved(db, product.id, input, source);
      await this.audit.append(tx as never, { actor: { id: actor.id, name: actor.name }, action: 'PRODUCT_CREATED', entityType: 'Product', entityId: product.id, summary: { source: 'CATALOG_TEMPLATE_IMPORT', batchId, sku: product.sku } });
    }, { timeout: 30_000, maxWait: 15_000 } as never);
  }

  /** The text that had no master stays with the product (provenance), so a person can map it later. */
  private async recordUnresolved(db: any, productId: string, input: ApplyInput, source: ParsedProductRow): Promise<void> {
    const codes = input.row.issues.filter((i) => i.code.startsWith('MAPPING_')).map((i) => i.code);
    if (!codes.length || !db.productSource) return;
    const now = new Date();
    const identity = { sourceFile: `catalogo:${input.batchId}`, sourceSheet: 'Productos', sourceRow: Math.max(1, source.row), cutoffDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) };
    if (await db.productSource.findUnique({ where: { sourceFile_sourceSheet_sourceRow_cutoffDate: identity } })) return;
    await db.productSource.create({
      data: {
        productId, ...identity, originalReference: source.reference, originalDescription: source.description || null,
        originalSection: [source.category, source.subcategory].filter(Boolean).join(' > ') || null, originalBrandLabel: source.brand || null,
        classificationCriterion: 'catalog-template:unresolved-mapping', extra: { batchId: input.batchId, codes },
      },
    });
  }

  // ------------------------------------------------------------------ update

  private async updateProduct(input: ApplyInput, progress: Progress): Promise<void> {
    const { row, batchId, actor } = input;
    await this.library.writeTransaction(async (tx) => {
      const db = tx as any;
      await db.$queryRaw`SELECT id FROM products WHERE id=${row.productId} FOR UPDATE`;
      progress.productId = row.productId;
      if (await this.appliedByBatch(db, row.productId!, batchId)) return;
      const fresh = (await new PrismaCatalogSnapshotReader(db).readProducts([row.sku])).products.get(row.sku) as ExistingProduct | undefined;
      if (!fresh || fresh.id !== row.productId) throw new RowStale('PRODUCT_CHANGED', `El producto ${row.reference} ya no existe o cambió. Genere una nueva vista previa.`);
      if (fresh.updatedAt !== row.productUpdatedAt) throw new RowStale('PRODUCT_CHANGED', `El producto ${row.reference} cambió después de la vista previa. Genere una nueva vista previa.`);
      if (fresh.protectedBy.length > 0) throw new RowStale('PRODUCT_PROTECTED', `El producto ${row.reference} quedó protegido (${fresh.protectedBy.join(', ')}) después de la vista previa.`);
      const before = await db.product.findUnique({ where: { id: row.productId } });
      const has = (field: string) => row.changes.some((c) => c.field === field);
      const data: Record<string, unknown> = {};
      const d = row.desired;
      if (has('description') && !fresh.description) data.description = d.description;
      if (has('brand') && !before.brandId) data.brandId = d.brandId;
      if (has('classification')) {
        const classified = await this.classification.resolve(db, { categoryId: d.subcategoryId ? undefined : d.categoryId, subcategoryId: d.subcategoryId ?? undefined }, { categoryId: before.categoryId ?? null, subcategoryId: before.subcategoryId ?? null, brandId: (data.brandId as string | undefined) ?? before.brandId ?? null });
        const blocking = classified.issues.find((i) => i.blocking);
        if (blocking) throw new RowRejected('CLASSIFICATION_BLOCKED', blocking.message);
        Object.assign(data, this.classification.toData(classified));
      }
      const after = await db.product.update({ where: { id: before.id }, data: { ...data, updatedAt: new Date() } });
      for (const field of Object.keys(data)) {
        if (JSON.stringify(before[field] ?? null) === JSON.stringify(after[field] ?? null)) continue;
        await this.change(db, after, field, before[field], after[field], batchId, actor.id);
        progress.applied.push({ field });
      }
      progress.applied.push(...await this.writeCollections(db, after, additionsOfChanges(row.changes, input.skuDisplay), progress.issues, batchId, actor.id));
      for (const change of row.changes.filter((c) => c.field === 'mainData')) progress.applied.push({ field: 'mainData', key: change.key });
      // Marks the batch on the product even when only key data changed, so a re-run of the same batch never re-applies it.
      if (!(await this.appliedByBatch(db, after.id, batchId))) await this.change(db, after, 'catalog:import', undefined, { batchId, fields: progress.applied.map((a) => a.field) }, batchId, actor.id);
      await this.audit.append(tx as never, { actor: { id: actor.id, name: actor.name }, action: 'PRODUCT_UPDATED', entityType: 'Product', entityId: after.id, summary: { source: 'CATALOG_TEMPLATE_IMPORT', batchId, sku: after.sku, fields: progress.applied.map((a) => a.field) } });
      await this.revisions?.markPendingFromLive(after.id, tx as never, { id: actor.id });
    }, { timeout: 30_000, maxWait: 15_000 } as never);
  }

  // ------------------------------------------------------------- key data

  private labelOf(dictionary: TemplateDictionary, key: string): string {
    return dictionary.subcategories.flatMap((s) => s.specs).find((s) => s.key === key)?.label ?? key;
  }

  /** Key data goes through the editor's writer (WORKING stage). A rejected datum is reported, never silently dropped. */
  private async writeKeyData(input: ApplyInput, progress: Progress): Promise<void> {
    const { row, dictionary } = input;
    const changed = new Set(row.changes.filter((c) => c.field === 'mainData').map((c) => c.key));
    const entries: Array<Record<string, unknown>> = [];
    for (const [key, value] of Object.entries(row.desired.mainData)) {
      if (row.action === 'update' && !changed.has(this.labelOf(dictionary, key))) continue;
      const spec = dictionary.subcategories.flatMap((s) => s.specs).find((s) => s.key === key);
      if (value.state !== 'KNOWN') { entries.push({ specKey: key, state: value.state }); continue; }
      const entry: Record<string, unknown> = { specKey: key, state: 'KNOWN' };
      switch (spec?.dataType) {
        case 'NUMBER': entry.valueNumber = value.value; break;
        case 'BOOLEAN': entry.valueBoolean = value.value; break;
        case 'OPTION': entry.optionKeys = [value.value]; break;
        case 'MULTI_OPTION': entry.optionKeys = value.value; break;
        default: entry.valueText = value.value;
      }
      entries.push(entry);
    }
    if (!entries.length || !progress.productId) return;
    const results = await this.specValues.writeProductSpecValues(progress.productId, entries as never, {
      source: { kind: 'catalog-template', ref: input.batchId, sheet: 'Datos principales', row: Math.max(1, input.source.row) },
      actor: { userId: input.actor.id },
    });
    for (const r of results) if (r.outcome === 'rejected') progress.issues.push(warn(`KEY_DATA_${String(r.code ?? 'REJECTED').toUpperCase()}`, `${this.labelOf(dictionary, r.specKey)}: ${r.message ?? 'dato rechazado'}`));
  }

  // ------------------------------------------------------------- collections

  /** Appends the additions to the product's sheet lists/groups/resources/images. Never removes or rewrites existing items. */
  private async writeCollections(db: any, product: { id: string; sku: string }, adds: Additions, issues: ResultIssue[], batchId: string, actorId: string): Promise<AppliedItem[]> {
    const applied: AppliedItem[] = [];
    const cur = await db.product.findUnique({ where: { id: product.id }, select: { catalogHighlights: true, catalogFeatures: true, catalogBadges: true, catalogAvailableModels: true } });
    const groups: any[] = await db.productCatalogSpecGroup.findMany({ where: { productId: product.id }, orderBy: { position: 'asc' }, include: { items: { select: { label: true, position: true } } } });
    const existingResources: any[] = await db.productCatalogResource.findMany({ where: { productId: product.id }, select: { url: true } });
    const existingImages: any[] = await db.productImage.findMany({ where: { productId: product.id }, select: { url: true } });

    const curFeatures: Array<{ id: string; label: string; icon: string }> = Array.isArray(cur.catalogFeatures) ? cur.catalogFeatures : [];
    const newHighlights = takeNew<string>(issues, 'destacados', cur.catalogHighlights ?? [], adds.highlights, LIMITS.maxHighlights, textKey);
    const featureIds = new Set(curFeatures.map((f) => f.id));
    const newFeatures = takeNew<string>(issues, 'características', curFeatures.map((f) => f.label), adds.features, LIMITS.maxFeatures, textKey).map((label, i) => {
      const base = slug(label) || 'caracteristica';
      let id = slug(label) || `caracteristica-${curFeatures.length + i + 1}`; let n = 2;
      while (featureIds.has(id)) id = `${base}-${n++}`.slice(-64);
      featureIds.add(id);
      return { id, label, icon: DEFAULT_FEATURE_ICON };
    });
    const newBadges = takeNew<string>(issues, 'insignias', cur.catalogBadges ?? [], adds.badges, LIMITS.maxBadges, textKey);
    const modelKey = (x: string) => textKey(x).replace(/\s+/g, '');
    const newModels = takeNew(issues, 'modelos relacionados', cur.catalogAvailableModels ?? [], adds.related, LIMITS.maxRelated, modelKey);
    const specKey = (x: { group: string; label: string }) => `${textKey(x.group)} / ${textKey(x.label)}`;
    const haveSpecs = groups.flatMap((g) => g.items.map((i: any) => ({ group: g.title, label: i.label })));
    const newSpecs = takeNew(issues, 'especificaciones', haveSpecs, adds.specs, Number.MAX_SAFE_INTEGER, specKey);
    const haveUrls = [...existingResources, ...existingImages].map((r) => ({ url: r.url as string }));
    const newResources = takeNew<{ url: string }>(issues, 'recursos', haveUrls, adds.resources, Number.MAX_SAFE_INTEGER, (x) => x.url) as ResourceAddition[];

    // The sheet editor's own normalizer validates what will be stored (non-empty texts, allowed icon, unique keys...).
    try {
      normalizeSheet({
        name: null, slug: null, published: false, status: 'ACTIVE', brand: null, model: null,
        badges: newBadges, highlights: newHighlights, features: newFeatures, availableModels: newModels, imageUrl: null, imageAlt: null, specsDisclaimer: null, firmwareNote: null, manufacturerRefs: [],
        specGroups: [...new Set(newSpecs.map((s) => s.group))].map((title) => ({ title, items: newSpecs.filter((s) => s.group === title).map((s) => ({ label: s.label, value: s.value })) })),
        resources: newResources.filter((r) => r.type !== 'Imagen').map((r) => ({ kind: r.type === 'Firmware' ? 'FIRMWARE' : 'DATASHEET', title: r.title || r.url, language: DEFAULT_RESOURCE_LANGUAGE, url: r.url, fileName: null, version: null, region: null, requiresLicense: false })),
      } as never);
    } catch (error) {
      if (error instanceof BadRequestException) throw new RowRejected('SHEET_VALIDATION', messageOf(error));
      throw error;
    }

    const data: Record<string, unknown> = {};
    if (newHighlights.length) data.catalogHighlights = [...(cur.catalogHighlights ?? []), ...newHighlights];
    if (newFeatures.length) data.catalogFeatures = [...curFeatures, ...newFeatures];
    if (newBadges.length) data.catalogBadges = [...(cur.catalogBadges ?? []), ...newBadges];
    if (newModels.length) data.catalogAvailableModels = [...(cur.catalogAvailableModels ?? []), ...newModels];
    if (Object.keys(data).length) await db.product.update({ where: { id: product.id }, data });

    if (newSpecs.length) {
      const keys = new Set<string>(groups.map((g) => g.key));
      let position = groups.reduce((max, g) => Math.max(max, g.position), -1);
      const byTitle = new Map<string, { id: string; next: number }>(groups.map((g) => [textKey(g.title), { id: g.id, next: g.items.reduce((m: number, i: any) => Math.max(m, i.position), -1) + 1 }]));
      for (const spec of newSpecs) {
        let group = byTitle.get(textKey(spec.group));
        if (!group) {
          if (byTitle.size >= LIMITS.maxSpecGroups) { issues.push(warn('COLLECTION_LIMIT', `Se omiten grupos de especificaciones: el límite es ${LIMITS.maxSpecGroups}.`)); continue; }
          const base = slug(spec.group) || 'grupo';
          let key = slug(spec.group) || `grupo-${byTitle.size + 1}`; let n = 2;
          while (keys.has(key)) key = `${base}-${n++}`.slice(-64);
          keys.add(key);
          const created = await db.productCatalogSpecGroup.create({ data: { productId: product.id, key, title: spec.group, position: ++position } });
          group = { id: created.id, next: 0 };
          byTitle.set(textKey(spec.group), group);
        }
        await db.productCatalogSpecItem.create({ data: { groupId: group.id, label: spec.label, value: spec.value, position: group.next++ } });
      }
    }
    let resourcePosition = existingResources.length; let imagePosition = existingImages.length;
    for (const r of newResources) {
      if (r.type === 'Imagen') await db.productImage.create({ data: { productId: product.id, url: r.url, alt: r.title || null, isPrimary: existingImages.length === 0 && imagePosition === 0, sortOrder: imagePosition++ } });
      else await db.productCatalogResource.create({ data: { productId: product.id, kind: r.type === 'Firmware' ? 'FIRMWARE' : 'DATASHEET', title: r.title || r.url, language: DEFAULT_RESOURCE_LANGUAGE, url: r.url, position: resourcePosition++, requiresLicense: false } });
    }
    const log = async (field: string, items: any[], labelOf: (item: any) => string) => {
      if (!items.length) return;
      await this.change(db, product, `catalog:${field}`, undefined, items, batchId, actorId);
      applied.push(...items.map((item) => ({ field, key: labelOf(item) })));
    };
    await log('highlights', newHighlights, (x) => x); await log('features', newFeatures, (x) => x.label); await log('badges', newBadges, (x) => x); await log('related', newModels, (x) => x);
    await log('specs', newSpecs, (x) => `${x.group} / ${x.label}`); await log('resources', newResources, (x) => x.url);
    return applied;
  }

  // ------------------------------------------------------------- helpers

  private async appliedByBatch(db: any, productId: string, batchId: string): Promise<boolean> {
    return Boolean(await db.productChange.findFirst({ where: { productId, sourceRef: batchId }, select: { id: true } }));
  }

  private change(db: any, product: { id: string; sku: string }, field: string, oldValue: unknown, newValue: unknown, batchId: string, actorId: string) {
    return db.productChange.create({
      data: {
        productId: product.id, sku: product.sku, field, ...(oldValue === undefined || oldValue === null ? {} : { oldValue: oldValue as never }), newValue: (newValue ?? null) as never,
        source: 'PRODUCT_IMPORT', sourceRef: batchId, batchId, actorId,
      },
    });
  }
}
