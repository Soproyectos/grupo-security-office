import {
  DictionarySpec, DictionarySubcategory, LIMITS, MainDataValue, ParsedHighlightRow, ParsedMainDataRow, ParsedProductRow, ParsedRelatedRow, ParsedResourceRow, ParsedSpecRow,
  ProductContent, SHEETS, TemplateDictionary, TemplateIssue, textKey,
} from './catalog-template.types';

export interface ChildRows {
  mainData: ParsedMainDataRow[]; specs: ParsedSpecRow[]; highlights: ParsedHighlightRow[]; resources: ParsedResourceRow[]; related: ParsedRelatedRow[];
}

/** Classification of the existing product, used only to validate attributes when the file names no subcategory. */
export interface ExistingClassification { subcategoryId: string | null }

const issue = (severity: TemplateIssue['severity'], code: string, sheet: string, message: string, extra: Partial<TemplateIssue> = {}): TemplateIssue => ({ severity, code, sheet, message, ...extra });
const TRUE_WORDS = new Set(['si', 'true', 'verdadero', 'yes', '1']);
const FALSE_WORDS = new Set(['no', 'false', 'falso', '0']);

type Coerced = { ok: true; value: MainDataValue['value'] } | { ok: false; code: string; message: string };

/** Zero and false are real values (never "empty"); that is why NUMBER/BOOLEAN never go through a truthiness check. */
export function coerceSpecValue(spec: DictionarySpec, raw: string | number | boolean): Coerced {
  const bad = (code: string, message: string): Coerced => ({ ok: false, code, message });
  switch (spec.dataType) {
    case 'TEXT': {
      const value = String(raw).trim();
      return value.length > LIMITS.specValue ? bad('TEXT_TOO_LONG', `El valor supera ${LIMITS.specValue} caracteres.`) : { ok: true, value };
    }
    case 'NUMBER': {
      let n: number;
      if (typeof raw === 'number') n = raw;
      else if (typeof raw === 'string' && /^-?\d+([.,]\d+)?$/.test(raw.trim())) n = Number(raw.trim().replace(',', '.'));
      else n = Number.NaN;
      return Number.isFinite(n) ? { ok: true, value: n } : bad('ATTRIBUTE_VALUE_INVALID', `“${spec.label}” debe ser un numero${spec.unit ? ` (en ${spec.unit})` : ''}.`);
    }
    case 'BOOLEAN': {
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      const key = textKey(raw);
      if (TRUE_WORDS.has(key)) return { ok: true, value: true };
      if (FALSE_WORDS.has(key)) return { ok: true, value: false };
      return bad('ATTRIBUTE_VALUE_INVALID', `“${spec.label}” debe ser Si o No.`);
    }
    case 'OPTION': {
      const key = textKey(raw);
      const option = spec.options.find((o) => textKey(o.label) === key || textKey(o.key) === key);
      return option ? { ok: true, value: option.key } : bad('ATTRIBUTE_OPTION_UNKNOWN', `“${String(raw)}” no es una opcion de “${spec.label}”. Opciones: ${spec.options.map((o) => o.label).join(', ')}.`);
    }
    case 'MULTI_OPTION': {
      const parts = String(raw).split(/[;|]/).map((p) => p.trim()).filter(Boolean);
      if (!parts.length) return bad('ATTRIBUTE_VALUE_INVALID', `“${spec.label}” necesita al menos una opcion.`);
      const keys: string[] = [];
      for (const part of parts) {
        const option = spec.options.find((o) => textKey(o.label) === textKey(part) || textKey(o.key) === textKey(part));
        if (!option) return bad('ATTRIBUTE_OPTION_UNKNOWN', `“${part}” no es una opcion de “${spec.label}”. Opciones: ${spec.options.map((o) => o.label).join(', ')}.`);
        if (!keys.includes(option.key)) keys.push(option.key);
      }
      return { ok: true, value: keys.sort() };
    }
  }
}

export interface ResolvedProduct {
  desired: ProductContent;
  issues: TemplateIssue[];
  /** The subcategory used to validate attributes (file first, then the existing product). */
  effectiveSubcategory: DictionarySubcategory | null;
}

/**
 * Maps the text of a product row and its child rows onto the dictionaries. Never creates anything:
 * unknown brand/category/subcategory/attribute are incidents. Empty cells stay `null`/absent in `desired`.
 */
export function resolveDesired(product: ParsedProductRow, child: ChildRows, dictionary: TemplateDictionary, existing?: ExistingClassification): ResolvedProduct {
  const issues: TemplateIssue[] = [];
  const at = { row: product.row, reference: product.reference };
  const desired: ProductContent = { name: product.name, description: product.description || null, brandId: null, categoryId: null, subcategoryId: null, mainData: {}, specs: [], highlights: [], features: [], badges: [], resources: [], related: [] };

  // Brand
  if (product.brand) {
    const brand = dictionary.brands.find((b) => textKey(b.name) === textKey(product.brand));
    if (brand) desired.brandId = brand.id;
    else issues.push(issue('warning', 'MAPPING_BRAND_UNKNOWN', SHEETS.products, `La marca “${product.brand}” no existe en el catalogo; el producto queda con la marca pendiente. Pida crearla a quien administra la estructura.`, { ...at, column: 'MARCA' }));
  }

  // Category / subcategory
  const category = product.category ? dictionary.categories.find((c) => textKey(c.name) === textKey(product.category)) : undefined;
  if (product.category && !category) issues.push(issue('warning', 'MAPPING_CATEGORY_UNKNOWN', SHEETS.products, `La categoria “${product.category}” no existe en el catalogo.`, { ...at, column: 'CATEGORIA' }));
  if (product.subcategory) {
    const matches = dictionary.subcategories.filter((s) => textKey(s.name) === textKey(product.subcategory));
    if (!matches.length) {
      issues.push(issue('warning', 'MAPPING_SUBCATEGORY_UNKNOWN', SHEETS.products, `La subcategoria “${product.subcategory}” no existe en el catalogo; el producto queda por clasificar.`, { ...at, column: 'SUBCATEGORIA' }));
      if (category) { desired.categoryId = category.id; }
    } else if (product.category) {
      const inCategory = matches.filter((s) => category && s.categoryId === category.id);
      if (inCategory.length === 1) { desired.subcategoryId = inCategory[0].id; desired.categoryId = inCategory[0].categoryId; }
      else issues.push(issue('error', 'CLASSIFICATION_CONFLICT', SHEETS.products, `La subcategoria “${product.subcategory}” no pertenece a la categoria “${product.category}”.`, { ...at, column: 'SUBCATEGORIA' }));
    } else if (matches.length === 1) { desired.subcategoryId = matches[0].id; desired.categoryId = matches[0].categoryId; }
    else issues.push(issue('warning', 'MAPPING_SUBCATEGORY_AMBIGUOUS', SHEETS.products, `La subcategoria “${product.subcategory}” existe en varias categorias; indique la CATEGORIA.`, { ...at, column: 'SUBCATEGORIA' }));
  } else if (category) desired.categoryId = category.id;

  // Attributes are validated against the molde of the subcategory (file first, otherwise the existing one).
  const effectiveSubcategory = dictionary.subcategories.find((s) => s.id === (desired.subcategoryId ?? existing?.subcategoryId)) ?? null;
  for (const row of child.mainData) {
    const rowAt = { row: row.row, reference: row.reference, column: 'ATRIBUTO' };
    if (!effectiveSubcategory) { issues.push(issue('warning', 'ATTRIBUTE_NO_SUBCATEGORY', SHEETS.mainData, `“${row.attribute}” se omite: el producto no tiene subcategoria que defina sus datos principales.`, rowAt)); continue; }
    const spec = effectiveSubcategory.specs.find((s) => textKey(s.label) === textKey(row.attribute) || textKey(s.key) === textKey(row.attribute));
    if (!spec) {
      const elsewhere = dictionary.subcategories.some((s) => s.specs.some((x) => textKey(x.label) === textKey(row.attribute) || textKey(x.key) === textKey(row.attribute)));
      issues.push(issue('warning', elsewhere ? 'ATTRIBUTE_NOT_IN_MOLDE' : 'ATTRIBUTE_UNKNOWN', SHEETS.mainData, elsewhere ? `“${row.attribute}” no forma parte de los datos de la subcategoria ${effectiveSubcategory.name}; se omite.` : `“${row.attribute}” no existe en el diccionario de atributos; se omite (no se crea).`, rowAt));
      continue;
    }
    let next: MainDataValue;
    if (row.state !== 'KNOWN') next = { state: row.state as MainDataValue['state'], value: null };
    else {
      const coerced = coerceSpecValue(spec, row.value as string | number | boolean);
      if (coerced.ok === false) { issues.push(issue('error', coerced.code, SHEETS.mainData, coerced.message, rowAt)); continue; }
      next = { state: 'KNOWN', value: coerced.value };
    }
    const previous = desired.mainData[spec.key];
    if (previous && JSON.stringify(previous) !== JSON.stringify(next)) { issues.push(issue('error', 'CONTRADICTORY_DUPLICATE', SHEETS.mainData, `“${spec.label}” aparece dos veces con valores distintos.`, rowAt)); continue; }
    desired.mainData[spec.key] = next;
  }

  // Collections keep file order unless ORDEN says otherwise.
  const ordered = <T extends { order: number | null }>(rows: T[]): T[] => rows.map((r, i) => ({ r, i })).sort((a, b) => (a.r.order ?? a.i) - (b.r.order ?? b.i) || a.i - b.i).map((x) => x.r);
  ordered(child.specs).forEach((s, position) => desired.specs.push({ group: s.group, label: s.label, value: s.value, position }));
  for (const h of ordered(child.highlights)) {
    if (h.type === 'Destacado') desired.highlights.push(h.text);
    else if (h.type === 'Caracteristica') desired.features.push(h.text);
    else desired.badges.push(h.text);
  }
  ordered(child.resources).forEach((r, position) => desired.resources.push({ type: r.type, title: r.title, url: r.url, position }));
  desired.related = [...new Set(child.related.map((r) => r.relatedSku))];
  return { desired, issues, effectiveSubcategory };
}
