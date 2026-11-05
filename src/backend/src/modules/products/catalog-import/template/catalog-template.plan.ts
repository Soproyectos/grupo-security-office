/**
 * Preview plan of a catalog template import: a PURE function over (parsed workbook, snapshot).
 *
 * Rules (same as the existing catalog importer, extended to the template sections):
 *  - A new product is created as a hidden draft; empty cells are "pending", never invented.
 *  - An existing product only gets EMPTY things filled. A different non-empty value is a proposal, never an overwrite.
 *  - A protected product (published, locked name, edited/approved sheet) is never written: every difference is a proposal.
 *  - Collections (specs, highlights, resources, related) are additive: a file row that is absent from the product is
 *    an addition, an identical one is unchanged, a conflicting one is a proposal. Omitting a row never deletes.
 *  - Nothing in a plan creates a brand, category, subcategory or attribute definition.
 */
import { createHash } from 'crypto';
import {
  CatalogSnapshot, ExistingProduct,
} from './catalog-template.snapshot';
import {
  ParsedCatalog, ProductContent, ROW_CODES, SHEETS, TEMPLATE_VERSION, TemplateDictionary, TemplateIssue, normalizeSku, stableJson, textKey,
} from './catalog-template.types';
import { ChildRows, resolveDesired } from './catalog-template.validator';

export type PlanAction = 'create' | 'update' | 'unchanged' | 'proposed' | 'invalid';
export interface PlanChange { field: string; key?: string; before: unknown; after: unknown }

export interface PlanRow {
  row: number;
  reference: string;
  sku: string;
  name: string;
  action: PlanAction;
  code: string;
  productId?: string;
  /** Concurrency token of the existing product at preview time (part of the plan hash). */
  productUpdatedAt?: string;
  /** What the file asks for, typed. The apply step writes only what `changes` lists (or everything for `create`). */
  desired: ProductContent;
  changes: PlanChange[];
  proposals: PlanChange[];
  /** Things still missing after this import (brand, subcategory, required data...). Informational. */
  pending: string[];
  protectedBy: string[];
  issues: TemplateIssue[];
}

export interface CatalogPlan {
  templateVersion: string;
  rows: PlanRow[];
  /** Errors and warnings that belong to no product row (orphan child rows, rows without REFERENCIA, unknown columns). */
  unassigned: TemplateIssue[];
  summary: { total: number; create: number; update: number; unchanged: number; proposed: number; invalid: number; incidents: number; unassignedErrors: number };
  /** Contract: a template import never creates masters. Kept explicit so a consumer can assert it. */
  mastersToCreate: { brands: 0; categories: 0; subcategories: 0; specDefinitions: 0 };
  hash: string;
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

function labelOf(dictionary: TemplateDictionary, subcategoryId: string | null, categoryId: string | null): string | null {
  const sub = subcategoryId ? dictionary.subcategories.find((s) => s.id === subcategoryId) : undefined;
  const cat = dictionary.categories.find((c) => c.id === (sub?.categoryId ?? categoryId));
  return [cat?.name, sub?.name].filter(Boolean).join(' > ') || null;
}

/** Empty-set-aware comparison of the key data, one entry per attribute. */
function diffProduct(desired: ProductContent, existing: ExistingProduct, dictionary: TemplateDictionary): { changes: PlanChange[]; proposals: PlanChange[] } {
  const protectedProduct = existing.protectedBy.length > 0;
  const changes: PlanChange[] = []; const proposals: PlanChange[] = [];
  const fill = (change: PlanChange) => (protectedProduct ? proposals : changes).push(change);
  const propose = (change: PlanChange) => proposals.push(change);

  if (desired.name && desired.name !== existing.name) propose({ field: 'name', before: existing.name, after: desired.name });
  if (!isBlank(desired.description)) {
    if (isBlank(existing.description)) fill({ field: 'description', before: null, after: desired.description });
    else if (existing.description !== desired.description) propose({ field: 'description', before: existing.description, after: desired.description });
  }
  if (desired.brandId && desired.brandId !== existing.brandId) {
    const nameOf = (id: string | null) => dictionary.brands.find((b) => b.id === id)?.name ?? id;
    if (!existing.brandId) fill({ field: 'brand', before: null, after: nameOf(desired.brandId) });
    else propose({ field: 'brand', before: nameOf(existing.brandId), after: nameOf(desired.brandId) });
  }

  // Classification: subcategory is the truth, the root category is derived from it.
  const before = labelOf(dictionary, existing.subcategoryId, existing.categoryId);
  if (desired.subcategoryId) {
    if (existing.subcategoryId !== desired.subcategoryId) {
      const change = { field: 'classification', before, after: labelOf(dictionary, desired.subcategoryId, desired.categoryId) };
      if (!existing.subcategoryId && (!existing.categoryId || existing.categoryId === desired.categoryId)) fill(change); else propose(change);
    }
  } else if (desired.categoryId && existing.categoryId !== desired.categoryId) {
    const change = { field: 'classification', before, after: labelOf(dictionary, null, desired.categoryId) };
    if (!existing.categoryId) fill(change); else propose(change);
  }

  // Key data (datos principales): UNKNOWN counts as "no answer yet" and may be filled.
  for (const [key, wanted] of Object.entries(desired.mainData)) {
    const current = existing.mainData[key];
    const label = dictionary.subcategories.flatMap((s) => s.specs).find((s) => s.key === key)?.label ?? key;
    if (!current || (current.state === 'UNKNOWN' && wanted.state !== 'UNKNOWN')) fill({ field: 'mainData', key: label, before: current ?? null, after: wanted });
    else if (!same(current, wanted)) propose({ field: 'mainData', key: label, before: current, after: wanted });
  }

  // Collections: additive.
  const collection = <T>(field: string, wanted: T[], have: T[], keyOf: (x: T) => string, valueOf: (x: T) => unknown) => {
    const index = new Map(have.map((x) => [keyOf(x), x]));
    for (const item of wanted) {
      const current = index.get(keyOf(item));
      if (!current) fill({ field, key: keyOf(item), before: null, after: item });
      else if (!same(valueOf(current), valueOf(item))) propose({ field, key: keyOf(item), before: current, after: item });
    }
  };
  collection('specs', desired.specs, existing.specs, (x) => `${textKey(x.group)} / ${textKey(x.label)}`, (x) => textKey(x.value));
  collection('highlights', desired.highlights, existing.highlights, (x) => textKey(x), () => '');
  collection('features', desired.features, existing.features, (x) => textKey(x), () => '');
  collection('badges', desired.badges, existing.badges, (x) => textKey(x), () => '');
  collection('resources', desired.resources, existing.resources, (x) => x.url, (x) => `${x.type}|${textKey(x.title)}`);
  collection('related', desired.related, existing.related, (x) => x, () => '');
  return { changes, proposals };
}

/** What remains empty after the import: brand, subcategory, description and required key data. */
function pendingOf(effective: ProductContent, dictionary: TemplateDictionary): string[] {
  const pending: string[] = [];
  if (!effective.brandId) pending.push('brand');
  if (!effective.subcategoryId) pending.push('subcategory');
  if (isBlank(effective.description)) pending.push('description');
  const sub = dictionary.subcategories.find((s) => s.id === effective.subcategoryId);
  for (const spec of sub?.specs ?? []) if (spec.required && !effective.mainData[spec.key]) pending.push(`mainData:${spec.label}`);
  return pending;
}

function merge(existing: ExistingProduct | undefined, desired: ProductContent): ProductContent {
  if (!existing) return desired;
  return {
    ...existing,
    brandId: existing.brandId ?? desired.brandId,
    categoryId: existing.categoryId ?? desired.categoryId,
    subcategoryId: existing.subcategoryId ?? desired.subcategoryId,
    description: isBlank(existing.description) ? desired.description : existing.description,
    mainData: { ...desired.mainData, ...existing.mainData },
  };
}

const PRECEDENCE = [ROW_CODES.duplicate, ROW_CODES.skuMissing, ROW_CODES.nameMissing];

export function buildCatalogPlan(parsed: ParsedCatalog, snapshot: CatalogSnapshot): CatalogPlan {
  const productSkus = new Set(parsed.products.map((p) => p.sku));
  const byRef = new Map<string, TemplateIssue[]>();
  const unassigned: TemplateIssue[] = [];
  for (const i of parsed.issues) {
    const sku = i.reference ? normalizeSku(i.reference) : '';
    if (sku && productSkus.has(sku) && i.code !== 'ORPHAN_REFERENCE') byRef.set(sku, [...(byRef.get(sku) ?? []), i]); else unassigned.push(i);
  }
  const childOf = (sku: string): ChildRows => ({
    mainData: parsed.mainData.filter((r) => r.sku === sku), specs: parsed.specs.filter((r) => r.sku === sku), highlights: parsed.highlights.filter((r) => r.sku === sku),
    resources: parsed.resources.filter((r) => r.sku === sku), related: parsed.related.filter((r) => r.sku === sku),
  });

  const rows: PlanRow[] = parsed.products.map((product) => {
    const existing = snapshot.products.get(product.sku);
    const ambiguous = snapshot.ambiguousSkus?.has(product.sku) ?? false;
    const child = childOf(product.sku);
    const resolved = resolveDesired(product, child, snapshot.dictionary, existing);
    const issues: TemplateIssue[] = [...(byRef.get(product.sku) ?? []), ...resolved.issues];
    for (const rel of child.related) {
      if (!productSkus.has(rel.relatedSku) && !snapshot.products.has(rel.relatedSku)) {
        issues.push({ severity: 'error', code: 'RELATED_REFERENCE_UNKNOWN', sheet: SHEETS.related, row: rel.row, reference: rel.reference, column: 'REFERENCIA RELACIONADA', message: `La referencia relacionada ${rel.relatedReference} no existe en el archivo ni en el catalogo.` });
      }
    }
    if (ambiguous) issues.push({ severity: 'error', code: 'SKU_AMBIGUOUS_EXISTING', sheet: SHEETS.products, row: product.row, reference: product.reference, message: 'La referencia coincide con mas de un producto existente; no se puede elegir con seguridad.' });
    const errors = issues.filter((i) => i.severity === 'error');
    const base = { row: product.row, reference: product.reference, sku: product.sku, name: product.name, desired: resolved.desired, issues };
    if (errors.length) {
      const code = PRECEDENCE.find((c) => errors.some((e) => e.code === c)) ?? errors[0].code;
      return { ...base, action: 'invalid' as const, code, changes: [], proposals: [], pending: [], protectedBy: [] };
    }
    if (!existing) {
      return { ...base, action: 'create' as const, code: ROW_CODES.create, changes: [], proposals: [], pending: pendingOf(resolved.desired, snapshot.dictionary), protectedBy: [] };
    }
    const { changes, proposals } = diffProduct(resolved.desired, existing, snapshot.dictionary);
    const protectedBy = existing.protectedBy;
    const common = { ...base, productId: existing.id, productUpdatedAt: existing.updatedAt, changes, proposals, pending: pendingOf(merge(existing, resolved.desired), snapshot.dictionary), protectedBy };
    if (changes.length) return { ...common, action: 'update' as const, code: ROW_CODES.updated };
    if (proposals.length) return { ...common, action: 'proposed' as const, code: protectedBy.length ? ROW_CODES.protectedProposal : ROW_CODES.differentValue };
    return { ...common, action: 'unchanged' as const, code: ROW_CODES.unchanged };
  });

  const count = (a: PlanAction) => rows.filter((r) => r.action === a).length;
  const plan: Omit<CatalogPlan, 'hash'> = {
    templateVersion: parsed.version || TEMPLATE_VERSION,
    rows,
    unassigned,
    summary: {
      total: rows.length, create: count('create'), update: count('update'), unchanged: count('unchanged'), proposed: count('proposed'), invalid: count('invalid'),
      incidents: rows.reduce((n, r) => n + r.issues.filter((i) => i.severity === 'warning' || i.severity === 'error').length, 0) + unassigned.length,
      unassignedErrors: unassigned.filter((i) => i.severity === 'error').length,
    },
    mastersToCreate: { brands: 0, categories: 0, subcategories: 0, specDefinitions: 0 },
  };
  return { ...plan, hash: planHash(plan) };
}

/** Content hash of a plan: file content + the DB state it was computed against (product ids and updatedAt tokens). */
export function planHash(plan: Omit<CatalogPlan, 'hash'> | CatalogPlan): string {
  const stable = {
    v: plan.templateVersion,
    rows: plan.rows.map((r) => ({ sku: r.sku, action: r.action, code: r.code, id: r.productId ?? null, upd: r.productUpdatedAt ?? null, desired: r.desired, changes: r.changes, proposals: r.proposals, protectedBy: r.protectedBy })),
  };
  return createHash('sha256').update(stableJson(stable)).digest('hex');
}

/**
 * Staleness check for the apply step: recompute the plan from the SAME parsed file against the CURRENT snapshot and compare
 * hashes. `false` means something changed between preview and apply (a product was edited, protected, created...), so the
 * preview must be regenerated instead of applied.
 */
export function isPlanCurrent(storedHash: string, parsed: ParsedCatalog, currentSnapshot: CatalogSnapshot): boolean {
  return buildCatalogPlan(parsed, currentSnapshot).hash === storedHash;
}
