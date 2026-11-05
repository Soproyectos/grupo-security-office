import { BadRequestException, ConflictException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { LibraryAuditService } from '../../library-audit/library-audit.service';
import { ExcelAdapter } from '../import/sources/excel-adapter';
import { generateSlug, normalizeText } from '../import/helpers/text-normalizer';
import { findProductMatchesBySkus, normalizeSku } from '../helpers/sku-identity';
import { ProductRevisionsService } from '../product-revisions.service';
import { ClassificationService } from '../classification/classification.service';

export type CatalogImportKind = 'categories' | 'brands' | 'products';
type Actor = { id: string; roles: string[] };
/**
 * Row outcomes (preview and report):
 *  create     -> CREATE_DRAFT / CREATED_DRAFT: new product (draft, hidden); missing brand/subcategory is reported in `missing`.
 *  update     -> UPDATED_FILLED_EMPTY: only EMPTY fields of an unprotected product were filled (`changes`); different non-empty values stay (`proposals`).
 *  unchanged  -> UNCHANGED: the file adds nothing new; zero writes.
 *  proposed   -> PROPOSED_PROTECTED (published / locked name / edited or approved sheet) or PROPOSED_DIFFERENT_VALUE: report only (`proposals`), nothing written.
 *  skip       -> SKIPPED_HEADING_ROW: Decision = ROTULO (a list heading, not a product).
 *  invalid    -> SKU_MISSING, NAME_MISSING, DUPLICATE_SKU_IN_FILE, SKU_AMBIGUOUS_EXISTING, INVALID_JSON, CLASSIFICATION_BLOCKED, ...
 */
type RowAction = 'create' | 'update' | 'unchanged' | 'proposed' | 'skip' | 'invalid';
type FieldChange = { field: string; before: unknown; after: unknown };
type IssueRow = { row: number; sku?: string; name?: string; action: RowAction; code?: string; issues: string[]; changes?: FieldChange[]; proposals?: FieldChange[]; [key: string]: unknown };
type NeedsConfirmationLabel = { code: 'BRAND_NEEDS_CONFIRMATION' | 'CATEGORY_NEEDS_CONFIRMATION'; label: string };
type Lookup = { brandsByKey: Map<string, any>; rootsByKey: Map<string, any>; categoriesByKey: Map<string, any>; subsByKey: Map<string, any>; subsById: Map<string, any>; categoryById: Map<string, any>; brandById: Map<string, any> };
type Desired = { brand: any | null; root: any | null; sub: any | null; leaf: any | null; input: { subcategoryId?: string; categoryId?: string }; labels: NeedsConfirmationLabel[] };
type Plan = { data: Record<string, unknown>; classificationInput?: { subcategoryId?: string; categoryId?: string }; changes: FieldChange[]; proposals: FieldChange[]; missing: string[]; protectedReasons: string[] };
type ReportRow = { row: number; sku?: string; status: 'created' | 'updated' | 'unchanged' | 'proposed' | 'skipped' | 'invalid'; code: string; changes?: FieldChange[]; proposals?: FieldChange[]; missing?: string[]; reason?: string };
type ProposedCategory = { key: string; name: string; parentKey?: string };
type ProductPayload = { rowNumber: number; sku: string; name: string; description?: string; brandName: string; categoryName: string; subcategoryName?: string; technicalSpecs?: Record<string, unknown>; extraAttributes?: Record<string, unknown>; productId?: string; updatedAt?: string };
type PreviewState = { namespace: 'catalog-import'; kind: CatalogImportKind; expiresAt: string; rows: IssueRow[]; proposedBrands: Array<{ key: string; name: string }>; proposedCategories: ProposedCategory[]; payloads: ProductPayload[]; report?: Record<string, unknown> };
const MAX_ROWS = 10_000;
const TTL_MS = 30 * 60 * 1000;
const STRUCTURE_ROLES = ['Super Admin', 'Admin Comercial'];
const SKU_ALIASES = ['sku', 'referencia', 'referencia sku', 'código', 'codigo', 'item'];
const HEADER_SCAN_ROWS = 10;
const APPROVED_REVISION_STATUSES = ['PUBLICADA', 'LISTA_PARA_PUBLICAR'];
const PRICE_HEADER = /(^| )(precio|price|costo|cost|tarifa|iva|impuesto|vigencia|valid until|valor)( |$)/;

function headerKey(value: unknown): string {
  return normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function entityKey(value: unknown): string {
  return normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
}
function tupleKey(...parts: Array<string | null>): string { return JSON.stringify(parts); }
function rootCategoryKey(nameKey: string): string { return tupleKey('root', nameKey); }
function rootCategoryNameKey(rootKey: string): string {
  const parsed: unknown = JSON.parse(rootKey);
  if (Array.isArray(parsed) && parsed[0] === 'root' && typeof parsed[1] === 'string') return parsed[1];
  throw new Error('Clave de categoría principal inválida.');
}
function childCategoryKey(parentKey: string, nameKey: string): string { return tupleKey('child', parentKey, nameKey); }
function categoryIndexKey(parentId: string | null, nameKey: string): string { return tupleKey('category', parentId, nameKey); }
function containsNullCharacter(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === 'string') return value.includes('\0');
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsNullCharacter(item, seen));
  return Object.entries(value as Record<string, unknown>).some(([key, item]) => key.includes('\0') || containsNullCharacter(item, seen));
}
function cell(row: Record<string, unknown>, headers: string[], aliases: string[]): string {
  const keys = new Set(aliases.map(headerKey));
  const found = headers.find((h) => keys.has(headerKey(h)));
  return found ? normalizeText(row[found]) : '';
}
function jsonObject(value: string): Record<string, unknown> | undefined {
  if (!value) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('Debe ser un objeto JSON válido.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Debe ser un objeto JSON, no una lista ni un valor simple.');
  const keys = Object.keys(parsed as object);
  if (keys.some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('El objeto contiene una propiedad no permitida.');
  if (Buffer.byteLength(JSON.stringify(parsed), 'utf8') > 64 * 1024) throw new Error('El objeto supera el límite de 64 KiB.');
  return parsed as Record<string, unknown>;
}
function hasStructureRole(actor: Actor): boolean { return actor.roles.some((role) => STRUCTURE_ROLES.includes(role)); }
function stableJson(value: unknown): string { return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item); }

function subcategoryKey(categoryId: string, nameKey: string): string { return tupleKey('sub', categoryId, nameKey); }
function isEmptyText(value: unknown): boolean { return value === null || value === undefined || (typeof value === 'string' && value.trim() === ''); }
function isEmptyJson(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'object' && Object.keys(value as object).length === 0;
}

@Injectable()
export class CatalogImportService {
  private readonly excel = new ExcelAdapter();
  constructor(private readonly library: BibliotecaPrismaService, private readonly audit: LibraryAuditService, @Optional() private readonly revisions?: ProductRevisionsService, @Optional() private readonly classification: ClassificationService = new ClassificationService()) {}
  private get db(): any { return this.library.client as any; }

  async preview(file: Buffer, fileName: string, kind: CatalogImportKind, actor: Actor) {
    let parsed: { headers: string[]; rows: Array<Record<string, unknown>>; rowNumbers: number[] };
    try { parsed = this.parseInput(file, fileName, kind); }
    catch (error) { throw new BadRequestException({ code: 'CATALOG_IMPORT_FILE_INVALID', message: error instanceof Error ? error.message : 'No se pudo leer el archivo.' }); }
    if (parsed.rows.length > MAX_ROWS) throw new BadRequestException({ code: 'CATALOG_IMPORT_TOO_MANY_ROWS', message: `El archivo supera el máximo de ${MAX_ROWS} filas con datos.` });
    const headers = parsed.headers;
    const aliases: Record<CatalogImportKind, string[][]> = {
      brands: [['marca', 'nombre', 'name', 'brand']],
      categories: [['categoría', 'categoria', 'categoría principal', 'categoria principal', 'category']],
      products: [['sku', 'referencia', 'referencia sku', 'código', 'codigo', 'item'], ['nombre', 'name', 'producto', 'descripción comercial'], ['marca', 'brand'], ['categoría', 'categoria', 'category'], ['subcategoría', 'subcategoria', 'subcategory']],
    };
    const missingHeaders = aliases[kind].filter((group) => !headers.some((h) => group.some((alias) => headerKey(alias) === headerKey(h))));
    if (missingHeaders.length) throw new BadRequestException({ code: 'CATALOG_IMPORT_HEADERS_MISSING', message: 'Faltan columnas obligatorias o sus nombres no se reconocen. Use: ' + (kind === 'products' ? 'SKU, Nombre, Marca, Categoría, Subcategoría.' : kind === 'brands' ? 'Marca o Nombre.' : 'Categoría.') });
    if (kind === 'products' && headers.some((h) => PRICE_HEADER.test(` ${headerKey(h)} `))) {
      throw new BadRequestException({ code: 'CATALOG_IMPORT_PRICE_COLUMNS', message: 'El archivo contiene columnas de precios, costos o vigencias. Este importador no lee ni modifica precios; quite esas columnas y vuelva a cargarlo.' });
    }
    for (let index = 0; index < parsed.rows.length; index++) {
      const raw = parsed.rows[index] as Record<string, unknown>;
      const nullColumn = Object.entries(raw).find(([key, value]) => key.includes('\0') || containsNullCharacter(value))?.[0];
      if (nullColumn !== undefined) throw new BadRequestException({ code: 'CATALOG_IMPORT_NULL_CHARACTER', message: `La fila ${parsed.rowNumbers[index]}, columna “${nullColumn.replace(/\0/g, '')}” contiene un carácter nulo y no se puede importar. Corrija esa celda y vuelva a cargar el archivo.` });
    }
    const id = randomUUID();
    const state: PreviewState = {
      namespace: 'catalog-import', kind, expiresAt: new Date(Date.now() + TTL_MS).toISOString(), rows: [],
      proposedBrands: [], proposedCategories: [], payloads: [],
    };
    const brands = await this.db.brand.findMany({ select: { id: true, name: true, slug: true } });
    const categories = await this.db.category.findMany({ select: { id: true, name: true, slug: true, parentId: true } });
    const brandsByKey = this.uniqueIndex(brands, (x: any) => entityKey(x.name), 'marca');
    const categoriesByKey = this.uniqueIndex(categories, (x: any) => categoryIndexKey(x.parentId ?? null, entityKey(x.name)), 'categoría');
    const categoryNamesByKey = this.uniqueIndex(categories.filter((x: any) => !x.parentId), (x: any) => entityKey(x.name), 'categoría principal');
    const proposedBrandByKey = new Map<string, { key: string; name: string }>();
    const proposedCategoryByPath = new Map<string, ProposedCategory>();
    const toResolveSku: string[] = [];

    parsed.rows.forEach((raw: Record<string, unknown>, index: number) => {
      const excelRow = parsed.rowNumbers[index];
      const row: IssueRow = { row: excelRow, action: 'create', issues: [] };
      const name = cell(raw, headers, ['nombre', 'name', 'producto', 'descripción comercial']);
      if (kind === 'brands') {
        const brandName = cell(raw, headers, ['marca', 'nombre', 'name', 'brand']);
        row.name = brandName; row.brand = brandName;
        if (!brandName) row.issues.push('Falta el nombre de la marca.');
        else if (brandsByKey.has(entityKey(brandName))) row.action = 'skip';
        else proposedBrandByKey.set(entityKey(brandName), { key: entityKey(brandName), name: brandName });
      } else if (kind === 'categories') {
        const category = cell(raw, headers, ['categoría', 'categoria', 'categoría principal', 'categoria principal', 'category']);
        const subcategory = cell(raw, headers, ['subcategoría', 'subcategoria', 'subcategory', 'sub category']);
        row.name = subcategory || category; row.category = category; row.subcategory = subcategory;
        if (!category) row.issues.push('Falta la categoría principal.');
        if (category) {
          if (subcategory) {
            const parentKey = rootCategoryKey(entityKey(category)); const path = childCategoryKey(parentKey, entityKey(subcategory));
            const existingParent = categoryNamesByKey.get(entityKey(category));
            if (existingParent && existingParent.parentId) row.issues.push(`“${category}” ya es una subcategoría; no puede ser padre.`);
            if (!existingParent) proposedCategoryByPath.set(parentKey, { key: parentKey, name: category });
            if (!categoriesByKey.has(categoryIndexKey(existingParent?.id ?? parentKey, entityKey(subcategory)))) {
              proposedCategoryByPath.set(path, { key: path, name: subcategory, parentKey });
            } else row.action = 'skip';
          } else if (categoryNamesByKey.has(entityKey(category))) row.action = 'skip';
          else proposedCategoryByPath.set(rootCategoryKey(entityKey(category)), { key: rootCategoryKey(entityKey(category)), name: category });
        }
      } else {
        const sku = cell(raw, headers, SKU_ALIASES);
        const brand = cell(raw, headers, ['marca', 'brand']);
        const category = cell(raw, headers, ['categoría', 'categoria', 'category']);
        const subcategory = cell(raw, headers, ['subcategoría', 'subcategoria', 'subcategory']);
        const description = cell(raw, headers, ['descripción', 'descripcion', 'description']);
        const decision = cell(raw, headers, ['decisión', 'decision']);
        row.sku = sku; row.name = name; row.brand = brand; row.category = category; row.subcategory = subcategory; row.description = description;
        if (decision) row.decision = decision;
        if (headerKey(decision) === 'rotulo') {
          // A list heading, not a product: never created, never validated, reported with its reason.
          row.action = 'skip'; row.code = 'SKIPPED_HEADING_ROW'; row.reason = 'Fila de rótulo (encabezado de lista): no es un producto y no se importa.';
          state.rows.push(row);
          return;
        }
        if (!sku) { row.issues.push('Falta SKU o referencia.'); row.code = 'SKU_MISSING'; }
        if (!name) { row.issues.push('Falta el nombre del producto.'); row.code ??= 'NAME_MISSING'; }
        // Brand / category / subcategory are NEVER required: an empty or unknown one leaves an unclassified draft.
        let technicalSpecs: Record<string, unknown> | undefined;
        let extraAttributes: Record<string, unknown> | undefined;
        const errorsBeforeJson = row.issues.length;
        try { technicalSpecs = jsonObject(cell(raw, headers, ['características', 'caracteristicas', 'características filtros', 'caracteristicas filtros', 'especificaciones técnicas', 'especificaciones tecnicas', 'technical specs'])); }
        catch (error) { row.issues.push(`Características: ${(error as Error).message}`); row.code ??= 'INVALID_JSON'; }
        try { extraAttributes = jsonObject(cell(raw, headers, ['atributos', 'atributos extra', 'extra attributes'])); }
        catch (error) { row.issues.push(`Atributos: ${(error as Error).message}`); row.code ??= 'INVALID_JSON'; }
        row.characteristics = technicalSpecs ?? cell(raw, headers, ['características', 'caracteristicas', 'características filtros', 'caracteristicas filtros', 'especificaciones técnicas', 'especificaciones tecnicas', 'technical specs']);
        row.extraAttributes = extraAttributes ?? cell(raw, headers, ['atributos', 'atributos extra', 'extra attributes']);
        if (row.issues.length === errorsBeforeJson && !row.issues.length) {
          const payload: ProductPayload = { rowNumber: excelRow, sku, name, brandName: brand, categoryName: category, ...(subcategory ? { subcategoryName: subcategory } : {}), ...(description ? { description } : {}), ...(technicalSpecs ? { technicalSpecs } : {}), ...(extraAttributes ? { extraAttributes } : {}) };
          state.payloads.push(payload); toResolveSku.push(sku);
        }
      }
      if (row.issues.length) row.action = 'invalid';
      state.rows.push(row);
    });

    state.proposedBrands = [...proposedBrandByKey.values()];
    state.proposedCategories = [...proposedCategoryByPath.values()];
    if (kind === 'products') {
      const subcategories = this.db.subcategory ? await this.db.subcategory.findMany({ select: { id: true, categoryId: true, name: true, slug: true, isActive: true, legacyCategoryId: true } }) : [];
      const lookup = this.makeLookup(brandsByKey, categoryNamesByKey, categoriesByKey, categories, brands, subcategories);
      await this.resolveProductActions(state, toResolveSku, lookup);
    }
    state.proposedBrands = [...proposedBrandByKey.values()];
    state.proposedCategories = [...proposedCategoryByPath.values()];
    const count = (action: RowAction) => state.rows.filter((r) => r.action === action).length;
    const creates = count('create'); const updates = count('update'); const invalid = count('invalid');
    const preview = {
      previewId: id, kind,
      summary: {
        total: state.rows.length, valid: state.rows.length - invalid, invalid, creates, updates,
        ...(kind === 'products' ? { unchanged: count('unchanged'), proposed: count('proposed'), skipped: count('skip'), needsConfirmation: state.rows.filter((r) => Array.isArray(r.needsConfirmation) && r.needsConfirmation.length).length } : {}),
      },
      columns: headers,
      rows: state.rows,
      proposedBrands: state.proposedBrands,
      proposedCategories: state.proposedCategories,
      canCreateStructure: hasStructureRole(actor),
    };
    this.assertProposalSlugs(state.proposedBrands, state.proposedCategories, brands, categories, proposedCategoryByPath, categoryNamesByKey);
    if (containsNullCharacter(state)) throw new BadRequestException({ code: 'CATALOG_IMPORT_NULL_CHARACTER', message: 'El archivo contiene un carácter nulo y no se puede guardar la vista previa. Revise los datos e intente de nuevo.' });
    await this.db.importSession.create({ data: { id, userId: actor.id, data: state as any } });
    return preview;
  }

  private makeLookup(brandsByKey: Map<string, any>, rootsByKey: Map<string, any>, categoriesByKey: Map<string, any>, categories: any[], brands: any[], subcategories: any[]): Lookup {
    const subsByKey = new Map<string, any>();
    for (const sub of subcategories) if (sub.isActive !== false) subsByKey.set(subcategoryKey(sub.categoryId, entityKey(sub.name)), sub);
    return {
      brandsByKey, rootsByKey, categoriesByKey, subsByKey,
      subsById: new Map(subcategories.map((sub) => [sub.id, sub])),
      categoryById: new Map(categories.map((category) => [category.id, category])),
      brandById: new Map(brands.map((brand) => [brand.id, brand])),
    };
  }

  /** Lookup only (nothing is created): what the row's labels resolve to, and which labels need a person to confirm. */
  private resolveDesired(payload: ProductPayload, lk: Lookup): Desired {
    const brand = payload.brandName ? lk.brandsByKey.get(entityKey(payload.brandName)) ?? null : null;
    const root = payload.categoryName ? lk.rootsByKey.get(entityKey(payload.categoryName)) ?? null : null;
    const sub = root && payload.subcategoryName ? lk.subsByKey.get(subcategoryKey(root.id, entityKey(payload.subcategoryName))) ?? null : null;
    const leaf = root && payload.subcategoryName && !sub ? lk.categoriesByKey.get(categoryIndexKey(root.id, entityKey(payload.subcategoryName))) ?? null : null;
    const input = sub ? { subcategoryId: sub.id as string } : leaf ? { categoryId: leaf.id as string } : root ? { categoryId: root.id as string } : {};
    const labels: NeedsConfirmationLabel[] = [];
    if (payload.brandName && !brand) labels.push({ code: 'BRAND_NEEDS_CONFIRMATION', label: payload.brandName });
    const path = payload.categoryName && payload.subcategoryName ? `${payload.categoryName} > ${payload.subcategoryName}` : payload.categoryName || payload.subcategoryName || '';
    if (path && (!root || (payload.subcategoryName && !sub && !leaf))) labels.push({ code: 'CATEGORY_NEEDS_CONFIRMATION', label: path });
    return { brand, root, sub, leaf, input, labels };
  }

  /**
   * Decides, for an EXISTING product, what the file may write. Rule: only EMPTY fields are filled, a different
   * non-empty value is never overwritten (reported as a proposal), and a protected product (published, locked name,
   * edited/approved sheet) is never written at all: every difference becomes a proposal.
   */
  private planProduct(payload: ProductPayload, product: any, lk: Lookup, desired: Desired, protectedReasons: string[]): Plan {
    const data: Record<string, unknown> = {};
    const changes: FieldChange[] = []; const proposals: FieldChange[] = [];
    let classificationInput: Plan['classificationInput'];
    const fill = (field: string, before: unknown, after: unknown, apply: () => void) => {
      if (protectedReasons.length) proposals.push({ field, before, after });
      else { apply(); changes.push({ field, before, after }); }
    };
    const propose = (field: string, before: unknown, after: unknown) => { proposals.push({ field, before, after }); };

    if (payload.name !== product.name) propose('name', product.name, payload.name);
    if (payload.description !== undefined) {
      if (isEmptyText(product.description)) fill('description', null, payload.description, () => { data.description = payload.description; });
      else if (product.description !== payload.description) propose('description', product.description, payload.description);
    }
    if (desired.brand && product.brandId !== desired.brand.id) {
      if (!product.brandId) fill('brand', null, desired.brand.name, () => { data.brandId = desired.brand.id; });
      else propose('brand', lk.brandById.get(product.brandId)?.name ?? product.brandId, desired.brand.name);
    }
    for (const field of ['technicalSpecs', 'extraAttributes'] as const) {
      const wanted = payload[field];
      if (wanted === undefined) continue;
      if (isEmptyJson(product[field])) fill(field, null, wanted, () => { data[field] = wanted; });
      else if (stableJson(product[field]) !== stableJson(wanted)) propose(field, product[field], wanted);
    }

    // Classification: the file names a target; compare it with what the product already has.
    const label = (cat: any, sub: any) => [cat?.name, sub?.name].filter(Boolean).join(' > ') || null;
    const curSub = product.subcategoryId ? lk.subsById.get(product.subcategoryId) ?? null : null;
    const curCat = product.categoryId ? lk.categoryById.get(product.categoryId) ?? null : null;
    const curRootId: string | null = curSub?.categoryId ?? (curCat ? curCat.parentId ?? curCat.id : null);
    const curLabel = label(curCat?.parentId ? lk.categoryById.get(curCat.parentId) : curCat, curSub ?? (curCat?.parentId ? curCat : null));
    const apply = (input: NonNullable<Plan['classificationInput']>, after: string | null) => fill('classification', curLabel, after, () => { classificationInput = input; });
    if (desired.sub) {
      const after = label(desired.root, desired.sub);
      if (product.subcategoryId === desired.sub.id) { /* same */ }
      else if (!product.subcategoryId && (!curRootId || curRootId === desired.root.id)) apply({ subcategoryId: desired.sub.id }, after);
      else propose('classification', curLabel, after);
    } else if (desired.leaf) {
      const after = label(desired.root, desired.leaf);
      if (product.categoryId === desired.leaf.id || curSub?.legacyCategoryId === desired.leaf.id) { /* same */ }
      else if (!product.subcategoryId && (!curRootId || curRootId === desired.root.id) && (!curCat || curCat.id === desired.root.id)) apply({ categoryId: desired.leaf.id }, after);
      else propose('classification', curLabel, after);
    } else if (desired.root && curRootId !== desired.root.id) {
      const after = label(desired.root, null);
      if (!curRootId) apply({ categoryId: desired.root.id }, after);
      else propose('classification', curLabel, after);
    }

    const hasBrand = Boolean(product.brandId || data.brandId);
    const hasSub = Boolean(product.subcategoryId || classificationInput?.subcategoryId || curCat?.parentId || (classificationInput?.categoryId && desired.leaf));
    const missing = [...(hasBrand ? [] : ['brand']), ...(hasSub ? [] : ['subcategory'])];
    return { data, classificationInput, changes, proposals, missing, protectedReasons };
  }

  /** Why an existing product must not be written by an import (empty = unprotected). */
  private async protectionReasons(db: any, products: any[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    const approved = new Set<string>();
    if (products.length && db.productRevision?.findMany) {
      const revisions = await db.productRevision.findMany({ where: { productId: { in: products.map((p) => p.id) }, status: { in: APPROVED_REVISION_STATUSES } }, select: { productId: true } });
      for (const revision of revisions) approved.add(revision.productId);
    }
    for (const product of products) {
      const reasons: string[] = [];
      if (product.publicRevisionId || product.publishedAt || product.catalogPublished) reasons.push('PUBLISHED');
      if (product.nameLockedAt) reasons.push('NAME_LOCKED');
      if ((product.sheetVersion ?? 0) > 0 || product.catalogName) reasons.push('SHEET_EDITED');
      if (approved.has(product.id)) reasons.push('SHEET_APPROVED');
      result.set(product.id, reasons);
    }
    return result;
  }

  private outcome(plan: Plan): { action: 'update' | 'unchanged' | 'proposed'; code: string } {
    if (plan.changes.length) return { action: 'update', code: 'UPDATED_FILLED_EMPTY' };
    if (plan.proposals.length) return { action: 'proposed', code: plan.protectedReasons.length ? 'PROPOSED_PROTECTED' : 'PROPOSED_DIFFERENT_VALUE' };
    return { action: 'unchanged', code: 'UNCHANGED' };
  }

  private uniqueIndex<T>(items: T[], keyOf: (item: T) => string, label: string): Map<string, T> {
    const result = new Map<string, T>();
    for (const item of items) {
      const key = keyOf(item);
      if (result.has(key)) throw new ConflictException({ code: 'CATALOG_IMPORT_AMBIGUOUS_ENTITY', message: `Hay más de una ${label} con el mismo nombre normalizado; resuelva el catálogo antes de importar.` });
      result.set(key, item);
    }
    return result;
  }

  /**
   * Reads the file into header + rows + real spreadsheet row numbers. For products in .xlsx/.xls the header row is
   * the first of the first rows that holds a SKU alias (rows above, such as a title and a caption, are ignored) and
   * the "Productos" sheet is preferred; anything else keeps the generic adapter behaviour.
   */
  private parseInput(file: Buffer, fileName: string, kind: CatalogImportKind): { headers: string[]; rows: Array<Record<string, unknown>>; rowNumbers: number[] } {
    const generic = () => {
      const parsed = this.excel.parse(file, fileName);
      return { headers: parsed.headers, rows: parsed.rows as Array<Record<string, unknown>>, rowNumbers: parsed.rows.map((_, index) => index + 2) };
    };
    if (kind !== 'products' || !/\.(xlsx|xls)$/i.test(fileName)) return generic();
    const workbook = XLSX.read(file, { type: 'buffer' });
    const sheetName = workbook.SheetNames.find((name) => headerKey(name) === 'productos') ?? workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet || !sheet['!ref']) return generic();
    const firstRow = XLSX.utils.decode_range(sheet['!ref']).s.r;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    const skuKeys = new Set(SKU_ALIASES.map(headerKey));
    const headerIndex = grid.slice(0, HEADER_SCAN_ROWS).findIndex((cells) => cells.some((c) => skuKeys.has(headerKey(c))));
    if (headerIndex < 0) return generic();
    const headers: string[] = []; const columns: number[] = [];
    grid[headerIndex].forEach((value, column) => {
      const name = normalizeText(value);
      if (!name || ['__proto__', 'constructor', 'prototype'].includes(name) || headers.includes(name)) return;
      headers.push(name); columns.push(column);
    });
    const rows: Array<Record<string, unknown>> = []; const rowNumbers: number[] = [];
    for (let index = headerIndex + 1; index < grid.length; index++) {
      const cells = grid[index] ?? [];
      const record = Object.create(null) as Record<string, unknown>;
      let hasData = false;
      headers.forEach((header, position) => {
        const value = cells[columns[position]] ?? null;
        if (value !== null && String(value).trim() !== '') hasData = true;
        record[header] = value;
      });
      if (!hasData) continue;
      rows.push(record); rowNumbers.push(firstRow + index + 1);
    }
    if (!rows.length) throw new BadRequestException('La hoja de cálculo no contiene datos después de los headers');
    return { headers, rows, rowNumbers };
  }

  private assertProposalSlugs(brands: PreviewState['proposedBrands'], categories: ProposedCategory[], existingBrands: any[], existingCategories: any[], categoryProposals: Map<string, ProposedCategory>, roots: Map<string, any>) {
    const brandSlugs = new Set(existingBrands.map((x) => x.slug));
    for (const brand of brands) {
      const slug = generateSlug(brand.name);
      if (!slug || brandSlugs.has(slug)) throw new ConflictException({ code: 'CATALOG_IMPORT_SLUG_CONFLICT', message: `El nombre de marca “${brand.name}” produce un slug ocupado. Ajuste el catálogo antes de importar.` });
      brandSlugs.add(slug);
    }
    const reserved = new Set(existingCategories.map((x) => x.slug));
    const ordered = [...categories].sort((a, b) => Number(Boolean(a.parentKey)) - Number(Boolean(b.parentKey)));
    const slugFor = (name: string, parentKey?: string) => {
      if (!parentKey) return generateSlug(name);
      const parent = roots.get(rootCategoryNameKey(parentKey)) as any;
      const parentName = parent?.name ?? categoryProposals.get(parentKey)?.name;
      const prefix = generateSlug(parentName ?? '');
      return prefix ? `${prefix}-${generateSlug(name)}` : generateSlug(name);
    };
    for (const category of ordered) {
      const slug = slugFor(category.name, category.parentKey);
      if (!slug || reserved.has(slug)) throw new ConflictException({ code: 'CATALOG_IMPORT_SLUG_CONFLICT', message: `La categoría “${category.name}” produce un slug ocupado. Ajuste el catálogo antes de importar.` });
      reserved.add(slug);
    }
  }

  private async resolveProductActions(state: PreviewState, skus: string[], lk: Lookup) {
    const withSub = Boolean(this.db.subcategory);
    const matches = await findProductMatchesBySkus(this.db, skus, { id: true, sku: true, name: true, description: true, brandId: true, categoryId: true, ...(withSub ? { subcategoryId: true } : {}), technicalSpecs: true, extraAttributes: true, nameLockedAt: true, publicRevisionId: true, publishedAt: true, catalogPublished: true, catalogName: true, sheetVersion: true, updatedAt: true });
    const protection = await this.protectionReasons(this.db, [...matches.values()].flat());
    const rowBySku = new Map<string, IssueRow[]>();
    for (const row of state.rows) if (row.sku && row.action !== 'skip') rowBySku.set(normalizeSku(row.sku), [...(rowBySku.get(normalizeSku(row.sku)) ?? []), row]);
    for (const [sku, rows] of rowBySku) {
      if (rows.length > 1) for (const row of rows) { row.action = 'invalid'; row.code = 'DUPLICATE_SKU_IN_FILE'; row.issues.push('SKU duplicado en el archivo; se invalidan todas sus filas.'); }
      const found = matches.get(sku) ?? [];
      if (found.length > 1) for (const row of rows) { row.action = 'invalid'; row.code = 'SKU_AMBIGUOUS_EXISTING'; row.issues.push('El SKU coincide con más de un producto existente; no se puede elegir con seguridad.'); }
      const row = rows[0];
      const payload = state.payloads.find((p) => p.rowNumber === row.row);
      if (rows.length > 1 || found.length > 1 || !payload || row.action === 'invalid') continue;
      const desired = this.resolveDesired(payload, lk);
      if (desired.labels.length) row.needsConfirmation = desired.labels;
      if (found.length === 0) {
        row.action = 'create'; row.code = 'CREATE_DRAFT';
        row.missing = [...(desired.brand ? [] : ['brand']), ...(desired.sub || desired.leaf ? [] : ['subcategory'])];
        continue;
      }
      const product = found[0] as any;
      payload.productId = product.id; payload.updatedAt = product.updatedAt.toISOString();
      const plan = this.planProduct(payload, product, lk, desired, protection.get(product.id) ?? []);
      const outcome = this.outcome(plan);
      row.action = outcome.action; row.code = outcome.code; row.missing = plan.missing;
      if (plan.changes.length) row.changes = plan.changes;
      if (plan.proposals.length) row.proposals = plan.proposals;
      if (plan.protectedReasons.length) row.protectedBy = plan.protectedReasons;
    }
  }

  async execute(previewId: string | undefined, confirmNewEntities: boolean, actor: Actor) {
    if (!previewId) throw new BadRequestException({ code: 'CATALOG_IMPORT_PREVIEW_REQUIRED', message: 'Falta el identificador de la vista previa.' });
    const session = await this.db.importSession.findUnique({ where: { id: previewId } });
    if (!session || session.userId !== actor.id) throw new BadRequestException({ code: 'CATALOG_IMPORT_PREVIEW_NOT_FOUND', message: 'La vista previa no existe o no pertenece a esta sesión.' });
    const state = session.data as unknown as PreviewState;
    if (state.namespace !== 'catalog-import') throw new BadRequestException({ code: 'CATALOG_IMPORT_PREVIEW_INVALID', message: 'La vista previa no corresponde al importador de catálogo.' });
    if (new Date(state.expiresAt).getTime() < Date.now()) throw new BadRequestException({ code: 'CATALOG_IMPORT_PREVIEW_EXPIRED', message: 'La vista previa venció. Cargue el archivo de nuevo.' });
    if (state.report) return state.report;
    if (!state.rows.some((row) => row.action !== 'invalid')) throw new BadRequestException({ code: 'CATALOG_IMPORT_NO_VALID_ROWS', message: 'No hay filas válidas para aplicar. Corrija los errores y vuelva a generar la vista previa.' });
    if ((state.proposedBrands.length || state.proposedCategories.length) && !confirmNewEntities) throw new BadRequestException({ code: 'CATALOG_IMPORT_CONFIRM_ENTITIES', message: 'Confirme explícitamente la creación de las marcas y categorías propuestas.' });
    if ((state.proposedBrands.length || state.proposedCategories.length) && !hasStructureRole(actor)) throw new ForbiddenException({ code: 'CATALOG_IMPORT_STRUCTURE_FORBIDDEN', message: 'Su cargo no permite crear marcas o categorías; solicite a Super Admin o Admin Comercial que importe la estructura.' });

    const report = await this.library.writeTransaction(async (tx) => {
      this.library.assertWritesAllowed();
      const db = tx as any;
      await db.$queryRaw`SELECT id FROM import_sessions WHERE id=${previewId} FOR UPDATE`;
      const locked = await db.importSession.findUnique({ where: { id: previewId } });
      if (!locked || locked.userId !== actor.id) throw new BadRequestException({ code: 'CATALOG_IMPORT_PREVIEW_NOT_FOUND', message: 'La vista previa no existe o no pertenece a esta sesión.' });
      const current = locked.data as unknown as PreviewState;
      if (current.namespace !== 'catalog-import' || current.kind !== state.kind) throw new BadRequestException({ code: 'CATALOG_IMPORT_PREVIEW_INVALID', message: 'La vista previa no corresponde a este tipo de importación.' });
      if (current.report) return current.report;
      if (new Date(current.expiresAt).getTime() < Date.now()) throw new BadRequestException({ code: 'CATALOG_IMPORT_PREVIEW_EXPIRED', message: 'La vista previa venció. Cargue el archivo de nuevo.' });
      if (!current.rows.some((row) => row.action !== 'invalid')) throw new BadRequestException({ code: 'CATALOG_IMPORT_NO_VALID_ROWS', message: 'No hay filas válidas para aplicar. Corrija los errores y vuelva a generar la vista previa.' });
      const brandByKey = new Map<string, any>();
      const categoryByKey = new Map<string, any>();
      for (const brand of await db.brand.findMany()) brandByKey.set(entityKey(brand.name), brand);
      for (const category of await db.category.findMany()) {
        categoryByKey.set(categoryIndexKey(category.parentId ?? null, entityKey(category.name)), category);
        if (!category.parentId) categoryByKey.set(rootCategoryKey(entityKey(category.name)), category);
      }
      const createdBrands = new Set<string>();
      const createdCategories = new Set<string>();
      for (const proposed of current.proposedBrands) {
        if (brandByKey.has(proposed.key)) continue;
        const slug = generateSlug(proposed.name);
        if (!slug || (await db.brand.findUnique({ where: { slug } }))) throw new ConflictException({ code: 'CATALOG_IMPORT_SLUG_CONFLICT', message: `No se pudo crear la marca “${proposed.name}” porque su slug ya está ocupado.` });
        const result = await db.brand.create({ data: { name: proposed.name, slug, isActive: true } });
        brandByKey.set(proposed.key, result); createdBrands.add(proposed.key);
        await this.audit.append(tx as never, { actor: { id: actor.id }, action: 'BRAND_CREATED', entityType: 'Brand', entityId: result.id, summary: { source: 'CATALOG_IMPORT', name: result.name } });
      }
      for (const proposed of current.proposedCategories) {
        const parent = proposed.parentKey ? categoryByKey.get(proposed.parentKey) : null;
        if (proposed.parentKey && !parent) throw new ConflictException({ code: 'CATALOG_IMPORT_PARENT_MISSING', message: `No se pudo resolver la categoría principal de “${proposed.name}”.` });
        const key = categoryIndexKey(parent?.id ?? null, entityKey(proposed.name));
        if (categoryByKey.has(key)) continue;
        if (parent?.parentId) throw new ConflictException({ code: 'CATALOG_IMPORT_TREE_DEPTH', message: 'La jerarquía de categorías admite únicamente categoría principal y subcategoría.' });
        const slug = proposed.parentKey
          ? `${generateSlug(parent?.name ?? '')}-${generateSlug(proposed.name)}`
          : generateSlug(proposed.name);
        if (!slug || (await db.category.findUnique({ where: { slug } }))) throw new ConflictException({ code: 'CATALOG_IMPORT_SLUG_CONFLICT', message: `No se pudo crear la categoría “${proposed.name}” porque su slug ya está ocupado.` });
        const result = await db.category.create({ data: { name: proposed.name, slug, parentId: parent?.id ?? null, isActive: true } });
        categoryByKey.set(key, result); createdCategories.add(proposed.key);
        if (!parent) categoryByKey.set(rootCategoryKey(entityKey(proposed.name)), result);
        await this.audit.append(tx as never, { actor: { id: actor.id }, action: 'CATEGORY_CREATED', entityType: 'Category', entityId: result.id, summary: { source: 'CATALOG_IMPORT', name: result.name, parentId: result.parentId } });
      }
      let created = 0; let updated = 0; let unchanged = 0; let proposed = 0; let skipped = 0; let invalid = 0;
      const issues: string[] = [];
      const needsConfirmation: Array<{ row: number; sku: string; code: string; label: string }> = [];
      const results: ReportRow[] = [];
      const payloadByRow = new Map(current.payloads.map((p) => [p.rowNumber, p]));
      const liveBrands = [...brandByKey.values()];
      const liveCategories = await db.category.findMany();
      const liveSubs = db.subcategory ? await db.subcategory.findMany() : [];
      const rootsByKey = new Map<string, any>(liveCategories.filter((c: any) => !c.parentId).map((c: any) => [entityKey(c.name), c]));
      const lookup = this.makeLookup(new Map([...brandByKey].filter(([key]) => !key.startsWith('[')) as Array<[string, any]>), rootsByKey, categoryByKey, liveCategories, liveBrands, liveSubs);
      for (const row of current.rows) {
        if (row.action === 'invalid') { invalid++; results.push({ row: row.row, sku: row.sku, status: 'invalid', code: row.code ?? 'INVALID', reason: row.issues.join(' ') }); for (const issue of row.issues) issues.push(`Fila ${row.row}: ${issue}`); continue; }
        if (row.action === 'skip') { skipped++; if (current.kind === 'products') results.push({ row: row.row, sku: row.sku, status: 'skipped', code: row.code ?? 'SKIPPED', reason: String(row.reason ?? '') }); continue; }
        if (current.kind === 'brands' || current.kind === 'categories') { created++; continue; }
        const payload = payloadByRow.get(row.row);
        if (!payload) { skipped++; continue; }
        // Lookup only: an unknown brand/category is never created here; the product continues unclassified.
        const desired = this.resolveDesired(payload, lookup);
        const noteLabels = () => { for (const label of desired.labels) { needsConfirmation.push({ row: row.row, sku: payload.sku, ...label }); issues.push(`Fila ${row.row}: ${label.code}: ${label.label}`); } };
        if (payload.productId) {
          await db.$queryRaw`SELECT id FROM products WHERE id=${payload.productId} FOR UPDATE`;
          const before = await db.product.findUnique({ where: { id: payload.productId } });
          if (!before || before.updatedAt.toISOString() !== payload.updatedAt) throw new ConflictException({ code: 'CATALOG_IMPORT_PRODUCT_CHANGED', message: `El producto ${payload.sku} cambió después de la vista previa. Genere una nueva vista previa.` });
          const protection = await this.protectionReasons(db, [before]);
          const plan = this.planProduct(payload, before, lookup, desired, protection.get(before.id) ?? []);
          const outcome = this.outcome(plan);
          if (outcome.action !== 'update') {
            // Nothing to write (unchanged / report-only proposals): no updatedAt bump, no ProductChange, no revision.
            if (outcome.action === 'unchanged') unchanged++; else proposed++;
            results.push({ row: row.row, sku: payload.sku, status: outcome.action, code: outcome.code, ...(plan.proposals.length ? { proposals: plan.proposals } : {}), ...(plan.missing.length ? { missing: plan.missing } : {}) });
            noteLabels();
            continue;
          }
          const data: Record<string, unknown> = { ...plan.data };
          if (plan.classificationInput) {
            const classified = await this.classification.resolve(db, { ...plan.classificationInput }, { categoryId: before.categoryId ?? null, subcategoryId: before.subcategoryId ?? null, brandId: (data.brandId as string | undefined) ?? before.brandId ?? null });
            const blockingIssue = classified.issues.find((issue) => issue.blocking);
            if (blockingIssue) { invalid++; issues.push(`Fila ${row.row}: ${blockingIssue.code}: ${blockingIssue.message}`); results.push({ row: row.row, sku: payload.sku, status: 'invalid', code: 'CLASSIFICATION_BLOCKED', reason: blockingIssue.message }); continue; }
            Object.assign(data, this.classification.toData(classified));
          }
          const after = await db.product.update({ where: { id: before.id }, data });
          for (const field of Object.keys(data)) {
            const oldValue = (before as any)[field] ?? null; const newValue = (after as any)[field] ?? null;
            if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
            await db.productChange.create({ data: { productId: after.id, sku: after.sku, field, oldValue, newValue, source: 'PRODUCT_IMPORT', sourceRef: previewId, actorId: actor.id } });
          }
          await this.audit.append(tx as never, { actor: { id: actor.id }, action: 'PRODUCT_UPDATED', entityType: 'Product', entityId: after.id, summary: { source: 'PRODUCT_IMPORT', sku: after.sku, fields: Object.keys(data) } });
          await this.revisions?.markPendingFromLive(after.id, tx as never, { id: actor.id });
          updated++;
          results.push({ row: row.row, sku: payload.sku, status: 'updated', code: outcome.code, changes: plan.changes, ...(plan.proposals.length ? { proposals: plan.proposals } : {}), ...(plan.missing.length ? { missing: plan.missing } : {}) });
          noteLabels();
        } else {
          const collision = await findProductMatchesBySkus(db, [payload.sku], { id: true });
          if (collision.get(normalizeSku(payload.sku))?.length) throw new ConflictException({ code: 'CATALOG_IMPORT_PRODUCT_CHANGED', message: `El SKU ${payload.sku} apareció después de la vista previa. Genere una nueva vista previa.` });
          // A known root with an unknown subcategory keeps the root only (the draft stays "por clasificar").
          const classified = await this.classification.resolve(db, { ...desired.input, brandId: desired.brand?.id ?? null });
          const blockingIssue = classified.issues.find((issue) => issue.blocking);
          if (blockingIssue) { invalid++; issues.push(`Fila ${row.row}: ${blockingIssue.code}: ${blockingIssue.message}`); results.push({ row: row.row, sku: payload.sku, status: 'invalid', code: 'CLASSIFICATION_BLOCKED', reason: blockingIssue.message }); continue; }
          const product = await db.product.create({ data: { sku: payload.sku, name: payload.name, description: payload.description || null, brandId: desired.brand?.id ?? null, ...this.classification.toData(classified), technicalSpecs: payload.technicalSpecs as any, extraAttributes: payload.extraAttributes as any, lifecycleStatus: 'DRAFT', isActive: false, isVisible: false } });
          for (const field of ['sku', 'name', 'description', 'brandId', 'categoryId', 'subcategoryId', 'technicalSpecs', 'extraAttributes']) {
            const value = (product as any)[field];
            if (value !== null && value !== undefined) await db.productChange.create({ data: { productId: product.id, sku: product.sku, field, oldValue: null, newValue: value, source: 'PRODUCT_IMPORT', sourceRef: previewId, actorId: actor.id } });
          }
          await this.audit.append(tx as never, { actor: { id: actor.id }, action: 'PRODUCT_CREATED', entityType: 'Product', entityId: product.id, summary: { source: 'PRODUCT_IMPORT', sku: product.sku } });
          created++;
          results.push({ row: row.row, sku: payload.sku, status: 'created', code: 'CREATED_DRAFT', ...(classified.missing.length ? { missing: classified.missing } : {}) });
          noteLabels();
        }
      }
      const finalReport = { created, updated, unchanged, proposed, skipped, invalid, issues, needsConfirmation, rows: results };
      const saved: PreviewState = { ...current, report: finalReport };
      await db.importSession.update({ where: { id: previewId }, data: { data: saved as any } });
      return finalReport;
    });
    return report;
  }
}
