/**
 * Versioned product-catalog XLSX template: shared constants and types.
 *
 * The workbook relates its sheets through the REFERENCIA column (the SKU). Nothing in this folder
 * touches the database: readers are injected (see catalog-template.snapshot.ts) and the plan is a pure function.
 */
import { normalizeSku } from '../../helpers/sku-identity';

export const TEMPLATE_VERSION = 'catalogo-v1';
export const META_SHEET = '_plantilla';

export const SHEETS = {
  instructions: 'Instrucciones',
  products: 'Productos',
  mainData: 'Datos principales',
  specs: 'Especificaciones',
  highlights: 'Destacados',
  resources: 'Recursos',
  related: 'Modelos relacionados',
  dictionaries: 'Diccionarios',
} as const;

/** Data sheets read by the parser, in workbook order. Header is always row 1. */
export const COLUMNS = {
  products: ['REFERENCIA', 'NOMBRE', 'MARCA', 'SUBCATEGORIA', 'CATEGORIA', 'DESCRIPCION'],
  mainData: ['REFERENCIA', 'ATRIBUTO', 'ESTADO', 'VALOR'],
  specs: ['REFERENCIA', 'GRUPO', 'DATO', 'VALOR', 'ORDEN'],
  highlights: ['REFERENCIA', 'TIPO', 'TEXTO', 'ORDEN'],
  resources: ['REFERENCIA', 'TIPO', 'TITULO', 'URL', 'ORDEN'],
  related: ['REFERENCIA', 'REFERENCIA RELACIONADA'],
} as const;

export const STATE_LABELS = { KNOWN: 'Conocido', NOT_APPLICABLE: 'No aplica', UNKNOWN: 'Desconocido' } as const;
export const HIGHLIGHT_TYPES = ['Destacado', 'Caracteristica', 'Insignia'] as const;
export const RESOURCE_TYPES = ['Imagen', 'Documento', 'Firmware'] as const;

/** Limits mirror the sheet DTO (product-sheet.dto.ts) so a valid template is always accepted by the editor. */
export const LIMITS = {
  maxProducts: 10_000,
  maxRowsPerSheet: 50_000,
  maxFileBytes: 10 * 1024 * 1024,
  sku: 100,
  name: 200,
  description: 2000,
  groupTitle: 120,
  specLabel: 200,
  specValue: 2000,
  highlightText: 500,
  featureText: 80,
  badgeText: 40,
  resourceTitle: 200,
  url: 2048,
  relatedSku: 120,
  maxHighlights: 20,
  maxFeatures: 12,
  maxBadges: 10,
  maxSpecGroups: 20,
  maxItemsPerGroup: 100,
  maxResources: 50,
  maxRelated: 50,
} as const;

export type SpecDataType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'OPTION' | 'MULTI_OPTION';
export type SpecState = 'KNOWN' | 'NOT_APPLICABLE' | 'UNKNOWN';
export type HighlightType = (typeof HIGHLIGHT_TYPES)[number];
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** Dictionaries read from the database (never created by the template). */
export interface DictionarySpec { key: string; label: string; dataType: SpecDataType; unit?: string | null; required?: boolean; options: Array<{ key: string; label: string }> }
export interface DictionarySubcategory { id: string; categoryId: string; category: string; name: string; specs: DictionarySpec[] }
export interface TemplateDictionary {
  brands: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  subcategories: DictionarySubcategory[];
}

export type IssueSeverity = 'error' | 'warning';
export interface TemplateIssue {
  severity: IssueSeverity;
  code: string;
  sheet: string;
  row?: number;
  reference?: string;
  column?: string;
  message: string;
}

/** Row codes of the plan. The first five are the ones the existing catalog importer already uses. */
export const ROW_CODES = {
  create: 'CREATE_DRAFT',
  updated: 'UPDATED_FILLED_EMPTY',
  unchanged: 'UNCHANGED',
  protectedProposal: 'PROPOSED_PROTECTED',
  differentValue: 'PROPOSED_DIFFERENT_VALUE',
  duplicate: 'DUPLICATE_SKU_IN_FILE',
  skuMissing: 'SKU_MISSING',
  nameMissing: 'NAME_MISSING',
  // Added by the template (names follow the importer's UPPER_SNAKE style).
  orphan: 'ORPHAN_REFERENCE',
  invalid: 'ROW_INVALID',
} as const;

export interface ParsedProductRow { row: number; reference: string; sku: string; name: string; brand: string; subcategory: string; category: string; description: string }
export interface ParsedMainDataRow { row: number; reference: string; sku: string; attribute: string; state: SpecState | null; value: string | number | boolean | null }
export interface ParsedSpecRow { row: number; reference: string; sku: string; group: string; label: string; value: string; order: number | null }
export interface ParsedHighlightRow { row: number; reference: string; sku: string; type: HighlightType; text: string; order: number | null }
export interface ParsedResourceRow { row: number; reference: string; sku: string; type: ResourceType; title: string; url: string; order: number | null }
export interface ParsedRelatedRow { row: number; reference: string; sku: string; relatedReference: string; relatedSku: string }

export interface ParsedCatalog {
  version: string;
  products: ParsedProductRow[];
  mainData: ParsedMainDataRow[];
  specs: ParsedSpecRow[];
  highlights: ParsedHighlightRow[];
  resources: ParsedResourceRow[];
  related: ParsedRelatedRow[];
  /** Row-level and warning issues found while reading cells (dictionary and DB rules come later). */
  issues: TemplateIssue[];
}

/** Typed content of a product: what the file asks for (desired) and what the snapshot holds (existing). */
export type MainDataValue = { state: SpecState; value: string | number | boolean | string[] | null };
export interface ProductContent {
  name: string;
  description: string | null;
  brandId: string | null;
  categoryId: string | null;
  subcategoryId: string | null;
  mainData: Record<string, MainDataValue>;
  specs: Array<{ group: string; label: string; value: string; position: number }>;
  highlights: string[];
  features: string[];
  badges: string[];
  resources: Array<{ type: ResourceType; title: string; url: string; position: number }>;
  /** Normalized SKUs of the related models. */
  related: string[];
}

/** Text key used to compare names, labels and headers: no accents, lower case, collapsed spaces. */
export function textKey(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
export { normalizeSku };

export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : item);
}
