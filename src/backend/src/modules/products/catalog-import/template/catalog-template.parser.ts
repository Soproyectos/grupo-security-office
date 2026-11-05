import * as XLSX from 'xlsx';
import {
  COLUMNS, HIGHLIGHT_TYPES, LIMITS, META_SHEET, RESOURCE_TYPES, SHEETS, TEMPLATE_VERSION,
  HighlightType, ParsedCatalog, ParsedHighlightRow, ParsedMainDataRow, ParsedProductRow, ParsedRelatedRow, ParsedResourceRow, ParsedSpecRow,
  ResourceType, SpecState, TemplateIssue, normalizeSku, stableJson, textKey,
} from './catalog-template.types';

export type ParseResult =
  | { ok: true; catalog: ParsedCatalog; fatal: [] }
  | { ok: false; catalog?: undefined; fatal: TemplateIssue[] };

type Raw = string | number | boolean | null;
interface SheetRow { row: number; cells: Record<string, Raw> }

const PRICE_HEADER = /(^| )(precio|price|costo|cost|tarifa|iva|impuesto|vigencia)( |$)/;
const STATES: Record<string, SpecState> = { conocido: 'KNOWN', 'no aplica': 'NOT_APPLICABLE', desconocido: 'UNKNOWN' };
const HIGHLIGHT_BY_KEY = new Map<string, HighlightType>(HIGHLIGHT_TYPES.map((t) => [textKey(t), t]));
const RESOURCE_BY_KEY = new Map<string, ResourceType>(RESOURCE_TYPES.map((t) => [textKey(t), t]));

const issue = (severity: TemplateIssue['severity'], code: string, sheet: string, message: string, extra: Partial<TemplateIssue> = {}): TemplateIssue => ({ severity, code, sheet, message, ...extra });

function text(value: Raw | undefined): string {
  if (value === null || value === undefined) return '';
  return (typeof value === 'string' ? value : String(value)).normalize('NFC').trim();
}
function cellValue(value: Raw | undefined): Raw {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') { const t = value.normalize('NFC').trim(); return t === '' ? null : t; }
  return value;
}
function headerOf(value: unknown): string { return textKey(text(value as Raw).replace(/\s*\*$/, '')); }

/** Reads one sheet: validates header row 1 and returns data rows with their real Excel row numbers. */
function readSheet(wb: XLSX.WorkBook, name: string, expected: readonly string[], fatal: TemplateIssue[], warnings: TemplateIssue[]): SheetRow[] {
  const found = wb.SheetNames.find((n) => textKey(n) === textKey(name));
  if (!found) { fatal.push(issue('error', 'TEMPLATE_SHEET_MISSING', name, `Falta la hoja “${name}”. Use la plantilla oficial sin renombrar ni borrar hojas.`)); return []; }
  const ws = wb.Sheets[found];
  if (!ws || !ws['!ref']) { fatal.push(issue('error', 'TEMPLATE_COLUMN_MISSING', name, `La hoja “${name}” esta vacia: falta la fila de encabezados.`)); return []; }
  const firstRow = XLSX.utils.decode_range(ws['!ref']).s.r;
  const grid = XLSX.utils.sheet_to_json<Raw[]>(ws, { header: 1, defval: null, raw: true, blankrows: true });
  const headerCells = grid[0] ?? [];
  const positions = new Map<string, number>();
  headerCells.forEach((value, index) => {
    const key = headerOf(value);
    if (!key) return;
    if (PRICE_HEADER.test(` ${key} `)) { fatal.push(issue('error', 'TEMPLATE_PRICE_COLUMN', name, `La columna “${text(value)}” parece de precios o costos; esta plantilla no los admite.`, { column: text(value) })); return; }
    if (positions.has(key)) { fatal.push(issue('error', 'TEMPLATE_COLUMN_DUPLICATE', name, `La columna “${text(value)}” esta repetida en “${name}”.`, { column: text(value) })); return; }
    positions.set(key, index);
  });
  const wanted = new Set(expected.map(textKey));
  for (const column of expected) {
    if (!positions.has(textKey(column))) fatal.push(issue('error', 'TEMPLATE_COLUMN_MISSING', name, `Falta la columna ${column} en la hoja “${name}”.`, { column }));
  }
  for (const [key, index] of positions) {
    if (!wanted.has(key)) warnings.push(issue('warning', 'TEMPLATE_COLUMN_UNKNOWN', name, `La columna “${text(headerCells[index])}” no pertenece a la plantilla y se ignora.`, { column: text(headerCells[index]) }));
  }
  const rows: SheetRow[] = [];
  for (let index = 1; index < grid.length; index++) {
    const cells: Record<string, Raw> = {};
    let any = false;
    for (const column of expected) {
      const position = positions.get(textKey(column));
      const raw = position === undefined ? null : cellValue(grid[index][position]);
      cells[column] = raw;
      if (raw !== null) any = true;
    }
    if (any) rows.push({ row: firstRow + index + 1, cells });
  }
  if (rows.length > LIMITS.maxRowsPerSheet) fatal.push(issue('error', 'TEMPLATE_TOO_MANY_ROWS', name, `La hoja “${name}” supera el maximo de ${LIMITS.maxRowsPerSheet} filas.`));
  return rows;
}

/** ORDEN: empty = null (file order); otherwise an integer >= 0. */
function parseOrder(raw: Raw, sheet: string, row: number, reference: string, issues: TemplateIssue[]): number | null {
  if (raw === null) return null;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
    issues.push(issue('error', 'INVALID_ORDER', sheet, `ORDEN debe ser un numero entero igual o mayor que 0 (recibido: ${text(raw)}).`, { row, reference, column: 'ORDEN' }));
    return null;
  }
  return n;
}

function tooLong(value: string, max: number, column: string, sheet: string, row: number, reference: string, issues: TemplateIssue[]): boolean {
  if (value.length <= max) return false;
  issues.push(issue('error', 'TEXT_TOO_LONG', sheet, `${column} supera ${max} caracteres.`, { row, reference, column }));
  return true;
}

function checkUrl(value: string, row: number, reference: string, issues: TemplateIssue[]): boolean {
  const sheet = SHEETS.resources;
  if (/^[a-z]:[\\/]/i.test(value) || value.startsWith('\\\\') || /^file:/i.test(value) || value.startsWith('/')) {
    issues.push(issue('error', 'LOCAL_PATH_NOT_SUPPORTED', sheet, 'Una ruta local no sube el archivo. Use un enlace http/https o suba el archivo desde el editor del producto.', { row, reference, column: 'URL' }));
    return false;
  }
  let parsed: URL | null = null;
  try { parsed = new URL(value); } catch { parsed = null; }
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || /\s/.test(value) || !parsed.hostname) {
    issues.push(issue('error', 'INVALID_URL', sheet, 'La URL debe empezar por http:// o https:// y no contener espacios.', { row, reference, column: 'URL' }));
    return false;
  }
  if (value.length > LIMITS.url) { issues.push(issue('error', 'TEXT_TOO_LONG', sheet, `URL supera ${LIMITS.url} caracteres.`, { row, reference, column: 'URL' })); return false; }
  return true;
}

function hasNullChar(value: Raw): boolean { return typeof value === 'string' && value.includes('\0'); }

export function readTemplateVersion(wb: XLSX.WorkBook): string | null {
  const meta = wb.SheetNames.find((n) => n === META_SHEET);
  if (meta) {
    const grid = XLSX.utils.sheet_to_json<Raw[]>(wb.Sheets[meta], { header: 1, defval: null, raw: true });
    const row = grid.find((cells) => text(cells[0]) === 'version');
    if (row && text(row[1])) return text(row[1]);
  }
  return null;
}

/** Reads and validates the workbook structure and every cell format. Dictionary and database rules come later. */
export function parseCatalogTemplate(buffer: Buffer): ParseResult {
  const fatal: TemplateIssue[] = [];
  const issues: TemplateIssue[] = [];
  if (!buffer || !buffer.length) return { ok: false, fatal: [issue('error', 'TEMPLATE_UNREADABLE', '-', 'El archivo esta vacio.')] };
  if (buffer.length > LIMITS.maxFileBytes) return { ok: false, fatal: [issue('error', 'TEMPLATE_TOO_LARGE', '-', `El archivo supera ${LIMITS.maxFileBytes / (1024 * 1024)} MB.`)] };
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false }); }
  catch { return { ok: false, fatal: [issue('error', 'TEMPLATE_UNREADABLE', '-', 'No se pudo leer el archivo. Debe ser un .xlsx generado con la plantilla.')] }; }

  const version = readTemplateVersion(wb);
  if (!version) fatal.push(issue('error', 'TEMPLATE_VERSION_MISSING', META_SHEET, 'El archivo no trae la version de la plantilla. Descargue la plantilla vigente.'));
  else if (version !== TEMPLATE_VERSION) fatal.push(issue('error', 'TEMPLATE_VERSION_MISMATCH', META_SHEET, `La plantilla es de la version ${version}; la vigente es ${TEMPLATE_VERSION}. Descargue la plantilla nueva.`));

  const productRows = readSheet(wb, SHEETS.products, COLUMNS.products, fatal, issues);
  const mainRows = readSheet(wb, SHEETS.mainData, COLUMNS.mainData, fatal, issues);
  const specRows = readSheet(wb, SHEETS.specs, COLUMNS.specs, fatal, issues);
  const highlightRows = readSheet(wb, SHEETS.highlights, COLUMNS.highlights, fatal, issues);
  const resourceRows = readSheet(wb, SHEETS.resources, COLUMNS.resources, fatal, issues);
  const relatedRows = readSheet(wb, SHEETS.related, COLUMNS.related, fatal, issues);
  if (productRows.length > LIMITS.maxProducts) fatal.push(issue('error', 'TEMPLATE_TOO_MANY_ROWS', SHEETS.products, `El archivo supera el maximo de ${LIMITS.maxProducts} productos.`));
  if (fatal.length) return { ok: false, fatal };
  if (!productRows.length) return { ok: false, fatal: [issue('error', 'TEMPLATE_NO_PRODUCTS', SHEETS.products, 'La hoja Productos no tiene filas con datos.')] };

  const nullChar = (sheet: string, rows: SheetRow[]) => rows.forEach((r) => {
    for (const [column, value] of Object.entries(r.cells)) if (hasNullChar(value)) issues.push(issue('error', 'NULL_CHARACTER', sheet, `La celda ${column} contiene un caracter nulo.`, { row: r.row, reference: text(r.cells.REFERENCIA), column }));
  });
  nullChar(SHEETS.products, productRows); nullChar(SHEETS.mainData, mainRows); nullChar(SHEETS.specs, specRows);
  nullChar(SHEETS.highlights, highlightRows); nullChar(SHEETS.resources, resourceRows); nullChar(SHEETS.related, relatedRows);

  const refOf = (sheet: string, r: SheetRow): string | null => {
    const reference = text(r.cells.REFERENCIA);
    if (!reference) { issues.push(issue('error', 'SKU_MISSING', sheet, 'Falta la REFERENCIA en una fila con datos.', { row: r.row, column: 'REFERENCIA' })); return null; }
    if (reference.length > LIMITS.sku) { issues.push(issue('error', 'TEXT_TOO_LONG', sheet, `REFERENCIA supera ${LIMITS.sku} caracteres.`, { row: r.row, reference, column: 'REFERENCIA' })); return null; }
    return reference;
  };

  // --- Productos
  const products: ParsedProductRow[] = [];
  for (const r of productRows) {
    const reference = refOf(SHEETS.products, r);
    const name = text(r.cells.NOMBRE);
    if (reference === null) continue;
    if (!name) issues.push(issue('error', 'NAME_MISSING', SHEETS.products, 'Falta el NOMBRE del producto.', { row: r.row, reference, column: 'NOMBRE' }));
    tooLong(name, LIMITS.name, 'NOMBRE', SHEETS.products, r.row, reference, issues);
    const description = text(r.cells.DESCRIPCION);
    tooLong(description, LIMITS.description, 'DESCRIPCION', SHEETS.products, r.row, reference, issues);
    products.push({ row: r.row, reference, sku: normalizeSku(reference), name, brand: text(r.cells.MARCA), subcategory: text(r.cells.SUBCATEGORIA), category: text(r.cells.CATEGORIA), description });
  }
  const bySku = new Map<string, ParsedProductRow[]>();
  for (const p of products) bySku.set(p.sku, [...(bySku.get(p.sku) ?? []), p]);
  for (const group of bySku.values()) {
    if (group.length > 1) for (const p of group) issues.push(issue('error', 'DUPLICATE_SKU_IN_FILE', SHEETS.products, 'REFERENCIA duplicada en el archivo; se invalidan todas sus filas.', { row: p.row, reference: p.reference, column: 'REFERENCIA' }));
  }

  // --- Datos principales
  const mainData: ParsedMainDataRow[] = [];
  for (const r of mainRows) {
    const reference = refOf(SHEETS.mainData, r); if (reference === null) continue;
    const attribute = text(r.cells.ATRIBUTO);
    const stateText = text(r.cells.ESTADO);
    const value = r.cells.VALOR;
    const at = { row: r.row, reference };
    if (!attribute) { issues.push(issue('error', 'ATTRIBUTE_MISSING', SHEETS.mainData, 'Falta el ATRIBUTO.', { ...at, column: 'ATRIBUTO' })); continue; }
    if (!stateText && value === null) continue; // absent: nothing was said about this attribute
    let state: SpecState | null = null;
    if (stateText) {
      state = STATES[textKey(stateText)] ?? null;
      if (!state) { issues.push(issue('error', 'INVALID_STATE', SHEETS.mainData, `ESTADO “${stateText}” no es valido. Use Conocido, No aplica o Desconocido.`, { ...at, column: 'ESTADO' })); continue; }
    } else state = 'KNOWN';
    if (state === 'KNOWN' && value === null) { issues.push(issue('error', 'VALUE_MISSING', SHEETS.mainData, `El atributo “${attribute}” esta Conocido pero no trae VALOR.`, { ...at, column: 'VALOR' })); continue; }
    if (state !== 'KNOWN' && value !== null) { issues.push(issue('error', 'VALUE_CONTRADICTS_STATE', SHEETS.mainData, `El atributo “${attribute}” dice ${stateText} pero trae un VALOR; deje el valor vacio o marque Conocido.`, { ...at, column: 'VALOR' })); continue; }
    if (typeof value === 'string' && value.length > LIMITS.specValue) { issues.push(issue('error', 'TEXT_TOO_LONG', SHEETS.mainData, `VALOR supera ${LIMITS.specValue} caracteres.`, { ...at, column: 'VALOR' })); continue; }
    mainData.push({ ...at, sku: normalizeSku(reference), attribute, state, value });
  }
  const dedupe = <T extends { row: number; reference: string; sku: string }>(sheet: string, rows: T[], keyOf: (r: T) => string, sameOf: (r: T) => string): T[] => {
    const seen = new Map<string, T>(); const kept: T[] = []; const dead = new Set<T>();
    for (const r of rows) {
      const key = `${r.sku}\u0000${keyOf(r)}`;
      const first = seen.get(key);
      if (!first) { seen.set(key, r); kept.push(r); continue; }
      if (sameOf(first) === sameOf(r)) { issues.push(issue('warning', 'DUPLICATE_ROW_IGNORED', sheet, 'Fila repetida identica; se usa una sola vez.', { row: r.row, reference: r.reference })); dead.add(r); }
      else {
        issues.push(issue('error', 'CONTRADICTORY_DUPLICATE', sheet, `La fila ${first.row} y la fila ${r.row} dicen cosas distintas para el mismo dato.`, { row: r.row, reference: r.reference }));
        issues.push(issue('error', 'CONTRADICTORY_DUPLICATE', sheet, `La fila ${first.row} y la fila ${r.row} dicen cosas distintas para el mismo dato.`, { row: first.row, reference: first.reference }));
      }
    }
    return kept.filter((r) => !dead.has(r));
  };
  const mainKept = dedupe(SHEETS.mainData, mainData, (r) => textKey(r.attribute), (r) => stableJson([r.state, typeof r.value === 'string' ? textKey(r.value) : r.value]));

  // --- Especificaciones
  const specs: ParsedSpecRow[] = [];
  for (const r of specRows) {
    const reference = refOf(SHEETS.specs, r); if (reference === null) continue;
    const group = text(r.cells.GRUPO); const label = text(r.cells.DATO); const value = text(r.cells.VALOR);
    const at = { row: r.row, reference };
    if (!group) { issues.push(issue('error', 'GROUP_MISSING', SHEETS.specs, 'Falta el GRUPO.', { ...at, column: 'GRUPO' })); continue; }
    if (!label) { issues.push(issue('error', 'LABEL_MISSING', SHEETS.specs, 'Falta el DATO.', { ...at, column: 'DATO' })); continue; }
    if (!value) { issues.push(issue('warning', 'SPEC_VALUE_EMPTY', SHEETS.specs, `El dato “${label}” no tiene VALOR; se omite.`, { ...at, column: 'VALOR' })); continue; }
    const bad = tooLong(group, LIMITS.groupTitle, 'GRUPO', SHEETS.specs, r.row, reference, issues) || tooLong(label, LIMITS.specLabel, 'DATO', SHEETS.specs, r.row, reference, issues) || tooLong(value, LIMITS.specValue, 'VALOR', SHEETS.specs, r.row, reference, issues);
    const order = parseOrder(r.cells.ORDEN, SHEETS.specs, r.row, reference, issues);
    if (!bad) specs.push({ ...at, sku: normalizeSku(reference), group, label, value, order });
  }
  const specsKept = dedupe(SHEETS.specs, specs, (r) => `${textKey(r.group)}\u0000${textKey(r.label)}`, (r) => textKey(r.value));

  // --- Destacados
  const highlights: ParsedHighlightRow[] = [];
  const hlLimit: Record<HighlightType, [string, number]> = { Destacado: ['TEXTO', LIMITS.highlightText], Caracteristica: ['TEXTO', LIMITS.featureText], Insignia: ['TEXTO', LIMITS.badgeText] };
  for (const r of highlightRows) {
    const reference = refOf(SHEETS.highlights, r); if (reference === null) continue;
    const at = { row: r.row, reference };
    const typeText = text(r.cells.TIPO); const body = text(r.cells.TEXTO);
    const type = HIGHLIGHT_BY_KEY.get(textKey(typeText));
    if (!type) { issues.push(issue('error', 'INVALID_TYPE', SHEETS.highlights, `TIPO “${typeText}” no es valido. Use ${HIGHLIGHT_TYPES.join(', ')}.`, { ...at, column: 'TIPO' })); continue; }
    if (!body) { issues.push(issue('warning', 'EMPTY_TEXT', SHEETS.highlights, 'La fila no trae TEXTO; se omite.', { ...at, column: 'TEXTO' })); continue; }
    const bad = tooLong(body, hlLimit[type][1], 'TEXTO', SHEETS.highlights, r.row, reference, issues);
    const order = parseOrder(r.cells.ORDEN, SHEETS.highlights, r.row, reference, issues);
    if (!bad) highlights.push({ ...at, sku: normalizeSku(reference), type, text: body, order });
  }
  const highlightsKept = dedupe(SHEETS.highlights, highlights, (r) => `${r.type}\u0000${textKey(r.text)}`, () => '');

  // --- Recursos
  const resources: ParsedResourceRow[] = [];
  for (const r of resourceRows) {
    const reference = refOf(SHEETS.resources, r); if (reference === null) continue;
    const at = { row: r.row, reference };
    const typeText = text(r.cells.TIPO); const title = text(r.cells.TITULO); const url = text(r.cells.URL);
    const type = RESOURCE_BY_KEY.get(textKey(typeText));
    if (!type) { issues.push(issue('error', 'INVALID_TYPE', SHEETS.resources, `TIPO “${typeText}” no es valido. Use ${RESOURCE_TYPES.join(', ')}.`, { ...at, column: 'TIPO' })); continue; }
    if (!title) { issues.push(issue('error', 'TITLE_MISSING', SHEETS.resources, 'Falta el TITULO del recurso.', { ...at, column: 'TITULO' })); continue; }
    if (!url) { issues.push(issue('error', 'URL_MISSING', SHEETS.resources, 'Falta la URL del recurso.', { ...at, column: 'URL' })); continue; }
    const bad = tooLong(title, LIMITS.resourceTitle, 'TITULO', SHEETS.resources, r.row, reference, issues) || !checkUrl(url, r.row, reference, issues);
    const order = parseOrder(r.cells.ORDEN, SHEETS.resources, r.row, reference, issues);
    if (!bad) resources.push({ ...at, sku: normalizeSku(reference), type, title, url, order });
  }
  const resourcesKept = dedupe(SHEETS.resources, resources, (r) => r.url, (r) => textKey(r.title));

  // --- Modelos relacionados
  const related: ParsedRelatedRow[] = [];
  for (const r of relatedRows) {
    const reference = refOf(SHEETS.related, r); if (reference === null) continue;
    const at = { row: r.row, reference };
    const relatedReference = text(r.cells['REFERENCIA RELACIONADA']);
    if (!relatedReference) { issues.push(issue('error', 'RELATED_REFERENCE_MISSING', SHEETS.related, 'Falta la REFERENCIA RELACIONADA.', { ...at, column: 'REFERENCIA RELACIONADA' })); continue; }
    if (tooLong(relatedReference, LIMITS.relatedSku, 'REFERENCIA RELACIONADA', SHEETS.related, r.row, reference, issues)) continue;
    const relatedSku = normalizeSku(relatedReference);
    if (relatedSku === normalizeSku(reference)) { issues.push(issue('error', 'RELATED_SELF', SHEETS.related, 'Un producto no puede ser relacionado de si mismo.', { ...at, column: 'REFERENCIA RELACIONADA' })); continue; }
    related.push({ ...at, sku: normalizeSku(reference), relatedReference, relatedSku });
  }
  const relatedKept = dedupe(SHEETS.related, related, (r) => r.relatedSku, () => '');

  // --- Per-product item counts
  const count = <T extends { sku: string; reference: string; row: number }>(sheet: string, rows: T[], max: number, what: string, groupOf: (r: T) => string = () => '') => {
    const tally = new Map<string, number>();
    for (const r of rows) { const key = `${r.sku}\u0000${groupOf(r)}`; const n = (tally.get(key) ?? 0) + 1; tally.set(key, n); if (n === max + 1) issues.push(issue('error', 'TOO_MANY_ITEMS', sheet, `Un producto admite como maximo ${max} ${what}.`, { row: r.row, reference: r.reference })); }
  };
  count(SHEETS.highlights, highlightsKept.filter((h) => h.type === 'Destacado'), LIMITS.maxHighlights, 'destacados');
  count(SHEETS.highlights, highlightsKept.filter((h) => h.type === 'Caracteristica'), LIMITS.maxFeatures, 'caracteristicas');
  count(SHEETS.highlights, highlightsKept.filter((h) => h.type === 'Insignia'), LIMITS.maxBadges, 'insignias');
  count(SHEETS.resources, resourcesKept, LIMITS.maxResources, 'recursos');
  count(SHEETS.related, relatedKept, LIMITS.maxRelated, 'modelos relacionados');
  const groups = new Map<string, Set<string>>();
  for (const s of specsKept) { const set = groups.get(s.sku) ?? new Set<string>(); set.add(textKey(s.group)); groups.set(s.sku, set); if (set.size === LIMITS.maxSpecGroups + 1) issues.push(issue('error', 'TOO_MANY_ITEMS', SHEETS.specs, `Un producto admite como maximo ${LIMITS.maxSpecGroups} grupos de especificaciones.`, { row: s.row, reference: s.reference })); }
  count(SHEETS.specs, specsKept, LIMITS.maxItemsPerGroup, 'datos por grupo', (r) => textKey(r.group));

  // --- Child rows pointing to a REFERENCIA that is not in Productos
  const known = new Set(products.map((p) => p.sku));
  const orphan = (sheet: string, rows: Array<{ row: number; reference: string; sku: string }>) => rows.forEach((r) => {
    if (!known.has(r.sku)) issues.push(issue('error', 'ORPHAN_REFERENCE', sheet, `La REFERENCIA ${r.reference} no esta en la hoja Productos.`, { row: r.row, reference: r.reference, column: 'REFERENCIA' }));
  });
  orphan(SHEETS.mainData, mainKept); orphan(SHEETS.specs, specsKept); orphan(SHEETS.highlights, highlightsKept); orphan(SHEETS.resources, resourcesKept); orphan(SHEETS.related, relatedKept);

  return { ok: true, fatal: [], catalog: { version: version as string, products, mainData: mainKept, specs: specsKept, highlights: highlightsKept, resources: resourcesKept, related: relatedKept, issues } };
}
