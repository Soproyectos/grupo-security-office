import * as XLSX from 'xlsx';
import {
  CatalogSnapshot, EXAMPLE_DICTIONARY, ExistingProduct, META_SHEET, ParsedCatalog, ProductContent, SHEETS, TEMPLATE_VERSION, TemplateRows,
  buildCatalogPlan, buildCatalogTemplate, buildExample, coerceSpecValue, isPlanCurrent, normalizeSku, parseCatalogTemplate,
} from './index';

const P = (ref: string, name = 'Producto', brand = 'MarcaEjemplo', sub = 'Grabadores DVR', cat = '', desc = '') => [ref, name, brand, sub, cat, desc];

function parseRows(rows: TemplateRows): ParsedCatalog {
  const result = parseCatalogTemplate(buildCatalogTemplate(EXAMPLE_DICTIONARY, rows));
  if (!result.ok) throw new Error('unexpected fatal: ' + JSON.stringify(result.fatal));
  return result.catalog;
}
const emptySnapshot = (): CatalogSnapshot => ({ dictionary: EXAMPLE_DICTIONARY, products: new Map() });
const plan = (rows: TemplateRows, snapshot: CatalogSnapshot = emptySnapshot()) => buildCatalogPlan(parseRows(rows), snapshot);
const codes = (p: ReturnType<typeof plan>, i = 0) => p.rows[i].issues.map((x) => x.code);

function existing(content: ProductContent, sku: string, extra: Partial<ExistingProduct> = {}): ExistingProduct {
  return { ...JSON.parse(JSON.stringify(content)), id: `id-${sku}`, sku, updatedAt: '2026-10-01T00:00:00.000Z', protectedBy: [], ...extra };
}
function snapshotOf(...items: ExistingProduct[]): CatalogSnapshot {
  return { dictionary: EXAMPLE_DICTIONARY, products: new Map(items.map((e) => [normalizeSku(e.sku), e])) };
}
function mutate(buffer: Buffer, fn: (wb: XLSX.WorkBook) => void): Buffer {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  fn(wb);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('catalog template: build and parse', () => {
  const example = buildExample({ generatedAt: new Date('2026-10-30T00:00:00Z') });

  it('writes versioned sheets, a hidden metadata sheet and the dictionaries', () => {
    const wb = XLSX.read(example, { type: 'buffer' });
    expect(wb.SheetNames).toEqual([...Object.values(SHEETS), META_SHEET]);
    expect(wb.Workbook?.Sheets?.find((s) => s.name === META_SHEET)?.Hidden).toBe(1);
    const instructions = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[SHEETS.instructions], { header: 1 }).flat().join('\n');
    expect(instructions).toContain(TEMPLATE_VERSION);
    expect(instructions).toMatch(/NO sube el archivo/);
    const dict = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[SHEETS.dictionaries], { header: 1 }).flat().join('|');
    expect(dict).toContain('MarcaEjemplo');
    expect(dict).toContain('Presupuesto PoE');
    expect(JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[SHEETS.products], { header: 1 })[0])).not.toMatch(/id|estado interno/i);
  });

  it('round-trips the example and it validates clean', () => {
    const parsed = parseCatalogTemplate(example);
    expect(parsed.ok).toBe(true);
    const catalog = (parsed as { catalog: ParsedCatalog }).catalog;
    expect(catalog.products).toHaveLength(3);
    expect(catalog.mainData).toHaveLength(7);
    expect(catalog.issues).toEqual([]);
    const p = buildCatalogPlan(catalog, emptySnapshot());
    expect(p.summary).toMatchObject({ total: 3, create: 3, invalid: 0, incidents: 0, unassignedErrors: 0 });
    const dvr = p.rows[0];
    expect(dvr.desired.mainData.channels).toEqual({ state: 'KNOWN', value: 8 });
    expect(dvr.desired.mainData.poe).toEqual({ state: 'KNOWN', value: false });
    expect(dvr.desired.mainData.ai.value).toEqual(['face', 'line']);
    expect(p.rows[2].pending).toContain('description');
  });

  it('rejects structure problems', () => {
    expect(parseCatalogTemplate(Buffer.from('not an xlsx')).ok).toBe(false);
    expect(parseCatalogTemplate(Buffer.alloc(0)).fatal[0].code).toBe('TEMPLATE_UNREADABLE');
    const wrongVersion = mutate(example, (wb) => { wb.Sheets[META_SHEET].B1 = { t: 's', v: 'catalogo-v0' }; });
    expect(parseCatalogTemplate(wrongVersion).fatal.map((f) => f.code)).toEqual(['TEMPLATE_VERSION_MISMATCH']);
    const noMeta = mutate(example, (wb) => { delete wb.Sheets[META_SHEET]; wb.SheetNames = wb.SheetNames.filter((n) => n !== META_SHEET); });
    expect(parseCatalogTemplate(noMeta).fatal.map((f) => f.code)).toContain('TEMPLATE_VERSION_MISSING');
    const noSheet = mutate(example, (wb) => { delete wb.Sheets[SHEETS.resources]; wb.SheetNames = wb.SheetNames.filter((n) => n !== SHEETS.resources); });
    expect(parseCatalogTemplate(noSheet).fatal.map((f) => f.code)).toContain('TEMPLATE_SHEET_MISSING');
    const noColumn = mutate(example, (wb) => { wb.Sheets[SHEETS.products].C1 = { t: 's', v: 'PROVEEDOR' }; });
    const missing = parseCatalogTemplate(noColumn).fatal;
    expect(missing.map((f) => f.code)).toEqual(['TEMPLATE_COLUMN_MISSING']);
    expect(missing[0].column).toBe('MARCA');
    const price = mutate(example, (wb) => { wb.Sheets[SHEETS.products].G1 = { t: 's', v: 'PRECIO LISTA' }; wb.Sheets[SHEETS.products]['!ref'] = 'A1:G4'; });
    expect(parseCatalogTemplate(price).fatal.map((f) => f.code)).toEqual(['TEMPLATE_PRICE_COLUMN']);
    const extra = mutate(example, (wb) => { wb.Sheets[SHEETS.products].G1 = { t: 's', v: 'NOTAS' }; wb.Sheets[SHEETS.products]['!ref'] = 'A1:G4'; });
    const ok = parseCatalogTemplate(extra);
    expect(ok.ok && ok.catalog.issues.map((i) => i.code)).toEqual(['TEMPLATE_COLUMN_UNKNOWN']);
    expect(parseCatalogTemplate(buildCatalogTemplate(EXAMPLE_DICTIONARY)).fatal.map((f) => f.code)).toEqual(['TEMPLATE_NO_PRODUCTS']);
  });

  it('accepts accents, case and a trailing asterisk in headers', () => {
    const tweaked = mutate(example, (wb) => { wb.Sheets[SHEETS.products].D1 = { t: 's', v: 'Subcategoría *' }; });
    expect(parseCatalogTemplate(tweaked).ok).toBe(true);
  });
});

describe('catalog template: identity and duplicates', () => {
  it('invalidates BOTH rows of a duplicated REFERENCIA (normalized) and the product shows DUPLICATE_SKU_IN_FILE', () => {
    const p = plan({ products: [P('EJ-DVR-0801', 'A'), P('ej-dvr- 0801', 'B'), P('OTRO-1')] });
    expect(p.rows.map((r) => r.action)).toEqual(['invalid', 'invalid', 'create']);
    expect(p.rows[0].code).toBe('DUPLICATE_SKU_IN_FILE');
    expect(p.rows[1].code).toBe('DUPLICATE_SKU_IN_FILE');
  });

  it('keeps suffixes and variants apart (never merges by similarity)', () => {
    const p = plan({ products: [P('IDS-E04HQHI-D'), P('IDS-E04HQHI-D/A'), P('IDS-E04HQHI-D-K')] });
    expect(p.rows.map((r) => r.action)).toEqual(['create', 'create', 'create']);
    expect(new Set(p.rows.map((r) => r.sku)).size).toBe(3);
  });

  it('reports a missing NOMBRE and a missing REFERENCIA', () => {
    const p = plan({ products: [P('A-1', ''), ['', 'Sin referencia', '', '', '', '']] });
    expect(p.rows[0]).toMatchObject({ action: 'invalid', code: 'NAME_MISSING' });
    expect(p.unassigned.map((i) => i.code)).toContain('SKU_MISSING');
    expect(p.summary.unassignedErrors).toBe(1);
  });

  it('flags child rows whose REFERENCIA is not in Productos', () => {
    const p = plan({ products: [P('A-1')], highlights: [['ZZ-9', 'Destacado', 'x', null]] });
    expect(p.unassigned.map((i) => i.code)).toEqual(['ORPHAN_REFERENCE']);
    expect(p.rows[0].action).toBe('create');
  });
});

describe('catalog template: mapping and classification (never creates masters)', () => {
  it('unknown brand and unknown subcategory are MAPPING incidents, product stays a draft with pending items', () => {
    const dictionary = JSON.stringify(EXAMPLE_DICTIONARY);
    const p = plan({ products: [P('A-1', 'N', 'MarcaNueva', 'Subinventada', 'Videovigilancia')] });
    expect(codes(p)).toEqual(['MAPPING_BRAND_UNKNOWN', 'MAPPING_SUBCATEGORY_UNKNOWN']);
    expect(p.rows[0]).toMatchObject({ action: 'create', code: 'CREATE_DRAFT' });
    expect(p.rows[0].desired).toMatchObject({ brandId: null, subcategoryId: null, categoryId: 'c-1' });
    expect(p.rows[0].pending).toEqual(expect.arrayContaining(['brand', 'subcategory']));
    expect(p.mastersToCreate).toEqual({ brands: 0, categories: 0, subcategories: 0, specDefinitions: 0 });
    expect(JSON.stringify(EXAMPLE_DICTIONARY)).toBe(dictionary);
    expect(JSON.stringify(p)).not.toMatch(/proposedBrands|proposedCategories/);
  });

  it('category incoherent with subcategory is a CLASSIFICATION_CONFLICT (row invalid)', () => {
    const p = plan({ products: [P('A-1', 'N', 'MarcaEjemplo', 'Switches', 'Videovigilancia')] });
    expect(p.rows[0]).toMatchObject({ action: 'invalid', code: 'CLASSIFICATION_CONFLICT' });
  });

  it('coherent category is accepted; subcategory alone resolves its category', () => {
    const p = plan({ products: [P('A-1', 'N', 'MarcaEjemplo', 'Switches', 'Redes'), P('A-2', 'N', 'MarcaEjemplo', 'Switches', '')] });
    expect(p.rows.map((r) => r.desired.categoryId)).toEqual(['c-2', 'c-2']);
    expect(p.summary.incidents).toBe(0);
  });

  it('an ambiguous subcategory name needs the CATEGORIA', () => {
    const dictionary = { ...EXAMPLE_DICTIONARY, subcategories: [...EXAMPLE_DICTIONARY.subcategories, { id: 's-acc2', categoryId: 'c-2', category: 'Redes', name: 'Accesorios', specs: [] }] };
    const parsed = parseRows({ products: [P('A-1', 'N', 'MarcaEjemplo', 'Accesorios', ''), P('A-2', 'N', 'MarcaEjemplo', 'Accesorios', 'Redes')] });
    const p = buildCatalogPlan(parsed, { dictionary, products: new Map() });
    expect(p.rows[0].issues.map((i) => i.code)).toEqual(['MAPPING_SUBCATEGORY_AMBIGUOUS']);
    expect(p.rows[1].desired.subcategoryId).toBe('s-acc2');
  });
});

describe('catalog template: key data (datos principales)', () => {
  const DVR = P('A-1');

  it('keeps 0 and false as real values, distinct from empty', () => {
    const p = plan({ products: [DVR], mainData: [['A-1', 'Canales', 'Conocido', 0], ['A-1', 'Puertos PoE', 'Conocido', 'No'], ['A-1', 'Resolucion maxima', '', '']] });
    expect(p.rows[0].desired.mainData.channels).toEqual({ state: 'KNOWN', value: 0 });
    expect(p.rows[0].desired.mainData.poe).toEqual({ state: 'KNOWN', value: false });
    expect(p.rows[0].desired.mainData.resolution).toBeUndefined();
    expect(p.rows[0].pending.some((x) => x.startsWith('mainData:'))).toBe(false);
  });

  it('an unknown attribute or one outside the molde is an incident and is never created', () => {
    const p = plan({ products: [DVR], mainData: [['A-1', 'Color favorito', 'Conocido', 'rojo'], ['A-1', 'Puertos', 'Conocido', 8]] });
    expect(codes(p)).toEqual(['ATTRIBUTE_UNKNOWN', 'ATTRIBUTE_NOT_IN_MOLDE']);
    expect(p.rows[0].action).toBe('create');
    expect(p.rows[0].desired.mainData).toEqual({});
  });

  it('without a subcategory attributes cannot be validated and are skipped with an incident', () => {
    const p = plan({ products: [P('A-1', 'N', 'MarcaEjemplo', '')], mainData: [['A-1', 'Canales', 'Conocido', 4]] });
    expect(codes(p)).toEqual(['ATTRIBUTE_NO_SUBCATEGORY']);
  });

  it('invalid value, unknown option, bad state, and contradictions are errors', () => {
    const bad = (row: unknown[]) => plan({ products: [DVR], mainData: [row] });
    expect(bad(['A-1', 'Canales', 'Conocido', 'muchos']).rows[0].code).toBe('ATTRIBUTE_VALUE_INVALID');
    expect(bad(['A-1', 'Resolucion maxima', 'Conocido', '16 MP']).rows[0].code).toBe('ATTRIBUTE_OPTION_UNKNOWN');
    expect(bad(['A-1', 'Canales', 'Quizas', 4]).rows[0].code).toBe('INVALID_STATE');
    expect(bad(['A-1', 'Canales', 'Conocido', '']).rows[0].code).toBe('VALUE_MISSING');
    expect(bad(['A-1', 'Canales', 'No aplica', 4]).rows[0].code).toBe('VALUE_CONTRADICTS_STATE');
    const dup = plan({ products: [DVR], mainData: [['A-1', 'Canales', 'Conocido', 4], ['A-1', 'canales', 'Conocido', 8]] });
    expect(dup.rows[0].code).toBe('CONTRADICTORY_DUPLICATE');
    const alias = plan({ products: [DVR], mainData: [['A-1', 'Canales', 'Conocido', 4], ['A-1', 'channels', 'Conocido', 8]] });
    expect(alias.rows[0].code).toBe('CONTRADICTORY_DUPLICATE');
    const same = plan({ products: [DVR], mainData: [['A-1', 'Canales', 'Conocido', 4], ['A-1', 'canales', 'Conocido', 4]] });
    expect(same.rows[0].action).toBe('create');
    expect(codes(same)).toEqual(['DUPLICATE_ROW_IGNORED']);
  });

  it('No aplica and Desconocido are explicit answers without value', () => {
    const p = plan({ products: [DVR], mainData: [['A-1', 'Canales', 'Desconocido', ''], ['A-1', 'Puertos PoE', 'No aplica', '']] });
    expect(p.rows[0].desired.mainData).toEqual({ channels: { state: 'UNKNOWN', value: null }, poe: { state: 'NOT_APPLICABLE', value: null } });
  });

  it('coerces numbers with decimal comma, booleans and multi options', () => {
    const num = EXAMPLE_DICTIONARY.subcategories[1].specs[1];
    expect(coerceSpecValue(num, '12,5')).toEqual({ ok: true, value: 12.5 });
    expect(coerceSpecValue(num, '1.2.3').ok).toBe(false);
    const bool = EXAMPLE_DICTIONARY.subcategories[1].specs[2];
    expect(coerceSpecValue(bool, 'Sí')).toEqual({ ok: true, value: true });
    expect(coerceSpecValue(bool, false)).toEqual({ ok: true, value: false });
    const multi = EXAMPLE_DICTIONARY.subcategories[0].specs[3];
    expect(coerceSpecValue(multi, 'cruce de linea; Rostros; rostros')).toEqual({ ok: true, value: ['face', 'line'] });
  });
});

describe('catalog template: cell rules of the other sheets', () => {
  it('ORDEN must be an integer >= 0 (empty keeps file order)', () => {
    const order = (v: unknown) => plan({ products: [P('A-1')], specs: [['A-1', 'G', 'D', 'V', v]] }).rows[0];
    expect(order(-1).code).toBe('INVALID_ORDER');
    expect(order(1.5).code).toBe('INVALID_ORDER');
    expect(order('x').code).toBe('INVALID_ORDER');
    expect(order(0).action).toBe('create');
    expect(order('3').action).toBe('create');
    expect(order(null).action).toBe('create');
    const sorted = plan({ products: [P('A-1')], specs: [['A-1', 'G', 'B', 'v', 5], ['A-1', 'G', 'A', 'v', 1]] }).rows[0].desired.specs;
    expect(sorted.map((s) => s.label)).toEqual(['A', 'B']);
  });

  it('URL must be http/https; local paths are explained', () => {
    const url = (u: string) => plan({ products: [P('A-1')], resources: [['A-1', 'Imagen', 'Foto', u, 0]] }).rows[0];
    expect(url('https://ejemplo.invalid/a.jpg').action).toBe('create');
    expect(url('ftp://ejemplo.invalid/a.jpg').code).toBe('INVALID_URL');
    expect(url('javascript:alert(1)').code).toBe('INVALID_URL');
    expect(url('C:\\Users\\yo\\foto.jpg').code).toBe('LOCAL_PATH_NOT_SUPPORTED');
    expect(url('/api/files/abc').code).toBe('LOCAL_PATH_NOT_SUPPORTED');
    expect(plan({ products: [P('A-1')], resources: [['A-1', 'Video', 'Foto', 'https://x.invalid/a', 0]] }).rows[0].code).toBe('INVALID_TYPE');
  });

  it('highlights split into highlights, features and badges and enforce limits', () => {
    const p = plan({ products: [P('A-1')], highlights: [['A-1', 'Destacado', 'uno', 0], ['A-1', 'Caracteristica', 'dos', 0], ['A-1', 'Insignia', 'tres', 0]] });
    expect(p.rows[0].desired).toMatchObject({ highlights: ['uno'], features: ['dos'], badges: ['tres'] });
    const long = plan({ products: [P('A-1')], highlights: [['A-1', 'Insignia', 'x'.repeat(41), 0]] });
    expect(long.rows[0].code).toBe('TEXT_TOO_LONG');
    const many = plan({ products: [P('A-1')], highlights: Array.from({ length: 13 }, (_, i) => ['A-1', 'Caracteristica', `c${i}`, i]) });
    expect(many.rows[0].code).toBe('TOO_MANY_ITEMS');
  });

  it('related models must exist in the file or the catalog; omission never deletes', () => {
    const unknown = plan({ products: [P('A-1')], related: [['A-1', 'NO-EXISTE']] });
    expect(unknown.rows[0]).toMatchObject({ action: 'invalid', code: 'RELATED_REFERENCE_UNKNOWN' });
    const dbOnly = existing(plan({ products: [P('B-2')] }).rows[0].desired, 'B-2');
    expect(plan({ products: [P('A-1')], related: [['A-1', 'b-2']] }, snapshotOf(dbOnly)).rows[0].action).toBe('create');
    expect(plan({ products: [P('A-1')], related: [['A-1', 'A-1']] }).rows[0].issues.map((i) => i.code)).toContain('RELATED_SELF');
  });
});

describe('catalog template: plan against existing products', () => {
  const base = (): ProductContent => plan({
    products: [P('A-1', 'Grabador', 'MarcaEjemplo', 'Grabadores DVR', '', 'Descripcion')],
    mainData: [['A-1', 'Canales', 'Conocido', 8]],
    specs: [['A-1', 'Video', 'Compresion', 'H.265', 0]],
    highlights: [['A-1', 'Destacado', 'Uno', 0]],
    resources: [['A-1', 'Imagen', 'Foto', 'https://x.invalid/a.jpg', 0]],
    related: [['A-1', 'B-2']],
  }, snapshotOf(existing(plan({ products: [P('B-2')] }).rows[0].desired, 'B-2'))).rows[0].desired;
  const rows: TemplateRows = {
    products: [P('A-1', 'Grabador', 'MarcaEjemplo', 'Grabadores DVR', '', 'Descripcion')],
    mainData: [['A-1', 'Canales', 'Conocido', 8]],
    specs: [['A-1', 'Video', 'Compresion', 'H.265', 0]],
    highlights: [['A-1', 'Destacado', 'Uno', 0]],
    resources: [['A-1', 'Imagen', 'Foto', 'https://x.invalid/a.jpg', 0]],
    related: [['A-1', 'B-2']],
  };
  const withB = (a: ExistingProduct) => snapshotOf(a, existing({ ...base(), related: [] }, 'B-2'));

  it('re-importing an unchanged file is idempotent: everything UNCHANGED, zero changes and proposals', () => {
    const created = plan(rows, snapshotOf(existing({ ...base(), related: [] }, 'B-2')));
    expect(created.rows[0].action).toBe('create');
    const again = plan(rows, withB(existing(created.rows[0].desired, 'A-1')));
    expect(again.rows.map((r) => [r.action, r.code])).toEqual([['unchanged', 'UNCHANGED']]);
    expect(again.rows[0].changes).toEqual([]);
    expect(again.rows[0].proposals).toEqual([]);
  });

  it('fills empty fields of an unprotected product and proposes different values', () => {
    const empty: ProductContent = { ...base(), description: null, brandId: null, subcategoryId: null, categoryId: null, mainData: {}, specs: [], highlights: [], resources: [], related: [], name: 'Grabador' };
    const first = plan(rows, withB(existing(empty, 'A-1')));
    expect(first.rows[0]).toMatchObject({ action: 'update', code: 'UPDATED_FILLED_EMPTY', productId: 'id-A-1' });
    expect(first.rows[0].changes.map((c) => c.field).sort()).toEqual(['brand', 'classification', 'description', 'mainData', 'related', 'resources', 'highlights', 'specs'].sort());
    expect(first.rows[0].proposals).toEqual([]);

    const different = existing({ ...base(), name: 'Otro nombre', description: 'Otra', mainData: { channels: { state: 'KNOWN', value: 16 } } }, 'A-1');
    const second = plan(rows, withB(different));
    expect(second.rows[0].action).toBe('proposed');
    expect(second.rows[0].code).toBe('PROPOSED_DIFFERENT_VALUE');
    expect(second.rows[0].proposals.map((c) => c.field).sort()).toEqual(['description', 'mainData', 'name']);
    expect(second.rows[0].changes).toEqual([]);
  });

  it('a protected product is never written: PROPOSED_PROTECTED with every difference as proposal', () => {
    const empty: ProductContent = { ...base(), description: null, mainData: {}, highlights: [] };
    const p = plan(rows, withB(existing(empty, 'A-1', { protectedBy: ['PUBLISHED', 'SHEET_EDITED'] })));
    expect(p.rows[0]).toMatchObject({ action: 'proposed', code: 'PROPOSED_PROTECTED', protectedBy: ['PUBLISHED', 'SHEET_EDITED'] });
    expect(p.rows[0].changes).toEqual([]);
    expect(p.rows[0].proposals.length).toBeGreaterThan(0);
  });

  it('empty cells on an update keep what the product has; omitted rows delete nothing', () => {
    const rich = existing({ ...base(), highlights: ['Uno', 'Dos'], related: ['B-2', 'C-3'], mainData: { channels: { state: 'KNOWN', value: 8 }, poe: { state: 'KNOWN', value: true } } }, 'A-1');
    const p = plan({ products: [P('A-1', 'Grabador', 'MarcaEjemplo', 'Grabadores DVR', '', '')] }, snapshotOf(rich));
    expect(p.rows[0]).toMatchObject({ action: 'unchanged', code: 'UNCHANGED' });
  });

  it('UNKNOWN stored answers can be filled by a known value; a known one is only proposed', () => {
    const unknown = existing({ ...base(), mainData: { channels: { state: 'UNKNOWN', value: null } } }, 'A-1');
    const filled = plan({ products: [P('A-1')], mainData: [['A-1', 'Canales', 'Conocido', 8]] }, snapshotOf(unknown));
    expect(filled.rows[0].changes.map((c) => c.field)).toContain('mainData');
    const known = existing({ ...base(), mainData: { channels: { state: 'KNOWN', value: 4 } } }, 'A-1');
    const proposed = plan({ products: [P('A-1', 'Grabador', 'MarcaEjemplo', 'Grabadores DVR', '', 'Descripcion')], mainData: [['A-1', 'Canales', 'Conocido', 8]] }, snapshotOf(known));
    expect(proposed.rows[0].proposals.map((c) => c.field)).toEqual(['mainData']);
  });

  it('refuses an ambiguous existing SKU', () => {
    const snap = { ...snapshotOf(existing(base(), 'A-1')), ambiguousSkus: new Set(['A-1']) };
    expect(plan({ products: [P('A-1')] }, snap).rows[0].code).toBe('SKU_AMBIGUOUS_EXISTING');
  });

  it('staleness: the hash detects a product that changed between preview and apply', () => {
    const snap = snapshotOf(existing({ ...base(), description: null }, 'A-1'));
    const parsed = parseRows({ products: [P('A-1', 'Grabador', 'MarcaEjemplo', 'Grabadores DVR', '', 'Nueva')] });
    const preview = buildCatalogPlan(parsed, snap);
    expect(preview.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(isPlanCurrent(preview.hash, parsed, snap)).toBe(true);
    const touched = snapshotOf(existing({ ...base(), description: null }, 'A-1', { updatedAt: '2026-10-02T00:00:00.000Z' }));
    expect(isPlanCurrent(preview.hash, parsed, touched)).toBe(false);
    const protectedNow = snapshotOf(existing({ ...base(), description: null }, 'A-1', { protectedBy: ['PUBLISHED'] }));
    expect(isPlanCurrent(preview.hash, parsed, protectedNow)).toBe(false);
  });
});

describe('catalog template: preparation capacity', () => {
  it.each([5001, 10000])('accepts %i products with optional sections empty', (count) => {
    const result = parseCatalogTemplate(buildCatalogTemplate(EXAMPLE_DICTIONARY, {
      products: Array.from({ length: count }, (_, i) => [`SKU-${i}`, `Producto ${i}`, '', '', '', '']),
    }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.catalog.products).toHaveLength(count);
      expect(result.catalog.issues.filter((i) => i.severity === 'error')).toEqual([]);
      expect(result.catalog.resources).toEqual([]);
    }
  });

  it('rejects 10001 products with an actionable limit error', () => {
    const result = parseCatalogTemplate(buildCatalogTemplate(EXAMPLE_DICTIONARY, {
      products: Array.from({ length: 10001 }, (_, i) => [`SKU-${i}`, `Producto ${i}`, '', '', '', '']),
    }));
    expect(result.ok).toBe(false);
    expect(result.fatal).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TEMPLATE_TOO_MANY_ROWS', sheet: SHEETS.products, message: expect.stringContaining('10000') }),
    ]));
  });
});
