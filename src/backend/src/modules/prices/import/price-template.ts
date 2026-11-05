import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CopPriceError, normalizeCopPrice } from '../../../common/money/cop-policy';
import { MAX_PRICE_IMPORT_ROWS, PriceImportComparison, PriceImportRow, PriceImportTariff, PriceImportTariffRef } from './price-import.types';
import { createTariffMatcher, orderTariffs } from './price-tariffs';
import { readBoundedXlsxParts } from './xlsx-container';
import { PRICE_DATA_SHEETS, validatePriceWorkbookStructure } from './price-workbook-structure';

const blank = (cell?: XLSX.CellObject) => !cell || cell.v === undefined || cell.v === null || cell.v === '';
const formula = (cell?: XLSX.CellObject) => cell?.f !== undefined || cell?.F !== undefined;

/** Informative columns of the template (price without IVA): never stored, always ignored. */
const IGNORED_HEADER = /^PRECIO [A-Z ]+ \(SIN IVA\)$/;
const MAX_TEMPLATE_COLUMNS = 8;
const NOTE_ROW = /^nota:/i;

/**
 * Single-price column for suppliers without tariff tiers (price with IVA). It is exclusive with the tariff
 * columns; `headerText` does not strip accents, so both spellings are listed explicitly.
 */
const SINGLE_PRICE_COLUMN = 'PRECIO UNICO (CON IVA)';
const SINGLE_PRICE_HEADERS = new Set<string>([SINGLE_PRICE_COLUMN, 'PRECIO ÚNICO (CON IVA)']);

const headerText = (value: unknown) => String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').replace(/ ?\*$/, '').toUpperCase();

/**
 * Validates the tariffs that receive a single price against the CODES of the tariffs available for the import
 * (active, COP, open validity): only known ones, at least one, no repeats, in the stable tariff order.
 * `undefined` means "every available tariff".
 */
function normalizeSinglePriceSelection(selection: readonly string[] | undefined, available: readonly PriceImportTariffRef[]): PriceImportTariff[] {
  const ordered = orderTariffs(available).map((t) => t.code);
  if (selection === undefined) {
    if (!ordered.length) throw new BadRequestException('No hay escalafones disponibles para aplicar el precio único. Revisa las tarifas en Biblioteca.');
    return ordered;
  }
  const requested = selection.map((name) => name.trim()).filter((name) => name !== '');
  const unknown = [...new Set(requested.filter((name) => !ordered.includes(name)))];
  if (unknown.length) {
    throw new BadRequestException(`Escalafón no reconocido: ${unknown.join(', ')}. Usa: ${ordered.join(', ')}.`);
  }
  const chosen = ordered.filter((code) => requested.includes(code));
  if (!chosen.length) throw new BadRequestException('Elige al menos un escalafón para aplicar el precio único.');
  return chosen;
}

/** Splits the multipart CSV of `singlePriceTariffs`; absent = undefined (every available tariff). */
export function splitSinglePriceTariffs(raw: string | null | undefined): string[] | undefined {
  return raw === undefined || raw === null ? undefined : raw.split(',');
}

/**
 * Parses the multipart field `singlePriceTariffs`: a CSV of tariff CODES (same convention as the `tariffs` of the
 * template endpoint) validated against the available tariffs. Absent = every available tariff; present but blank,
 * or with an unknown code = 400 (the message lists the valid codes).
 */
export function parseSinglePriceTariffs(raw: string | null | undefined, available: readonly PriceImportTariffRef[]): PriceImportTariff[] {
  return normalizeSinglePriceSelection(splitSinglePriceTariffs(raw), available);
}

export interface PriceTemplateReadOptions {
  /** Tariff codes that receive the price of a single-price file (default: every available tariff). Ignored for files with tariff columns. */
  singlePriceTariffs?: readonly string[];
  /** Tariffs eligible for the import (active, COP, open validity); defaults to every tariff given to the reader. */
  availableTariffs?: readonly PriceImportTariffRef[];
}

export interface PriceTemplateReadResult {
  tariffs: PriceImportTariff[];
  rows: PriceImportRow[];
  ignoredColumns: string[];
  /** True when the file carries the single-price column; its rows are already expanded to `tariffs`. */
  singlePrice: boolean;
}

/**
 * Reads a purchasing workbook. `tariffs` are ALL the tariffs of Biblioteca (`{ code, name }`): a column header is
 * matched by normalized name or by code, so a tariff that is inactive or expired is still recognized (the service
 * reports it as unavailable) while a header that matches nothing is an error.
 */
export function readPriceTemplate(buffer: Buffer, tariffs: readonly PriceImportTariffRef[], options: PriceTemplateReadOptions = {}): PriceTemplateReadResult {
  const matchTariff = createTariffMatcher(tariffs);
  const dataSheet = validatePriceWorkbookStructure(readBoundedXlsxParts(buffer));
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer', cellFormula: true, cellDates: true, cellText: false,
      cellHTML: false, sheets: [dataSheet], sheetRows: MAX_PRICE_IMPORT_ROWS + 2,
    });
  } catch {
    throw new BadRequestException('No pudimos abrir el Excel. Guarda una copia de la plantilla e inténtalo de nuevo.');
  }
  if (workbook.SheetNames.length !== 2 || !workbook.SheetNames.includes(dataSheet) || !workbook.SheetNames.includes('INSTRUCCIONES')) {
    throw new BadRequestException(`Usa la plantilla con las hojas ${PRICE_DATA_SHEETS.join(' o ')} e INSTRUCCIONES, sin añadir otras hojas.`);
  }
  const sheet = workbook.Sheets[dataSheet];
  let range: XLSX.Range;
  try {
    range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref'] ?? 'A1');
  } catch {
    throw new BadRequestException('La hoja de precios tiene un rango inválido. Copia los datos en una plantilla nueva.');
  }
  if (![range.s.r, range.s.c, range.e.r, range.e.c].every((n) => Number.isSafeInteger(n) && n >= 0)) {
    throw new BadRequestException('La hoja de precios tiene un rango inválido. Copia los datos en una plantilla nueva.');
  }
  if (range.e.r > MAX_PRICE_IMPORT_ROWS || range.e.c >= MAX_TEMPLATE_COLUMNS) {
    throw new BadRequestException(`La plantilla admite hasta ${MAX_PRICE_IMPORT_ROWS} filas de precios y ${MAX_TEMPLATE_COLUMNS} columnas.`);
  }
  if (sheet['!merges']?.length) throw new BadRequestException('La hoja de precios no debe tener celdas combinadas.');
  const header = (index: number) => sheet[XLSX.utils.encode_cell({ r: 0, c: index })] as XLSX.CellObject | undefined;
  if (!['REFERENCIA', 'REFERENCIA *'].includes(headerText(header(0)?.v)) || formula(header(0))) throw new BadRequestException('La primera columna debe llamarse REFERENCIA.');
  /** Tariff per physical column after REFERENCIA; null = informative column to ignore; SINGLE_PRICE_COLUMN = one price for every selected tariff. */
  const columns: (PriceImportTariff | typeof SINGLE_PRICE_COLUMN | null)[] = [];
  const found: PriceImportTariff[] = [];
  const ignoredColumns: string[] = [];
  let hasSinglePrice = false;
  // Excel keeps formatted-but-empty trailing columns in the sheet range: only the titled ones count,
  // and a value under an untitled trailing column is an error rather than silently dropped.
  let lastTitled = 0;
  for (let col = 1; col <= range.e.c; col++) if (!blank(header(col)) || formula(header(col))) lastTitled = col;
  for (let col = lastTitled + 1; col <= range.e.c; col++) {
    for (let r = 1; r <= range.e.r; r++) {
      const stray = sheet[XLSX.utils.encode_cell({ r, c: col })] as XLSX.CellObject | undefined;
      if (!blank(stray) || formula(stray)) {
        throw new BadRequestException(`La columna ${XLSX.utils.encode_col(col)} tiene datos pero no tiene título. Bórrala o ponle el nombre de una tarifa de Biblioteca.`);
      }
    }
  }
  for (let col = 1; col <= lastTitled; col++) {
    const cell = header(col);
    const text = headerText(cell?.v);
    if (!formula(cell) && SINGLE_PRICE_HEADERS.has(text)) {
      if (hasSinglePrice) {
        throw new BadRequestException(`Revisa el título de la columna ${XLSX.utils.encode_col(col)}: «${String(cell?.v).trim().slice(0, 60)}» está repetida. Solo se admite una columna de precio único.`);
      }
      hasSinglePrice = true;
      columns.push(SINGLE_PRICE_COLUMN);
      continue;
    }
    const match = formula(cell) ? ({ kind: 'none' } as const) : matchTariff(cell?.v);
    const code = match.kind === 'match' ? match.code : undefined;
    if (!formula(cell) && !code && match.kind !== 'ambiguous' && IGNORED_HEADER.test(text)) {
      columns.push(null);
      ignoredColumns.push(String(cell?.v).trim());
      continue;
    }
    if (formula(cell) || !code || found.includes(code)) {
      const where = `columna ${XLSX.utils.encode_col(col)}`;
      const shown = String(cell?.v ?? '').trim().slice(0, 60) || '(vacío)';
      const why = formula(cell) ? 'es una fórmula'
        : match.kind === 'ambiguous' ? 'coincide con más de una tarifa'
          : code ? 'está repetida' : 'no es una tarifa de la plantilla';
      throw new BadRequestException(`Revisa el título de la ${where}: «${shown}» ${why}. Solo se admiten los nombres de las tarifas definidas en Biblioteca, sin repetirlas.`);
    }
    columns.push(code);
    found.push(code);
  }
  if (hasSinglePrice && found.length) {
    throw new BadRequestException(`El archivo tiene la columna «${SINGLE_PRICE_COLUMN}» y también columnas de escalafón. Usa solo una de las dos formas: o el precio único, o las columnas de escalafón. Borra las que sobren y vuelve a subirlo.`);
  }
  if (!hasSinglePrice && !found.length) throw new BadRequestException('Incluye al menos una columna de precios con IVA.');
  // Single price: the same value goes to every selected tariff, so everything downstream sees normal rows.
  const selected = hasSinglePrice ? normalizeSinglePriceSelection(options.singlePriceTariffs, options.availableTariffs ?? tariffs) : [];

  const rows: PriceImportRow[] = [];
  const seen = new Map<string, PriceImportRow>();
  for (let r = 1; r <= range.e.r; r++) {
    const cells = Array.from({ length: columns.length + 1 }, (_, c) => sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined);
    if (cells.every((cell) => blank(cell) && !formula(cell))) continue;
    // Example-row reminder shipped inside the template: not a product.
    if (cells[0]?.t === 's' && NOTE_ROW.test(String(cells[0].v).trim()) && cells.slice(1).every((cell) => blank(cell) && !formula(cell))) continue;
    const row: PriceImportRow = { row: r + 1, sku: '', status: 'valid', issues: [], prices: [] };
    const issue = (column: string, code: string, message: string) => row.issues.push({ row: row.row, column, code, message });
    const reference = cells[0];
    if (formula(reference) || reference?.t !== 's' || !String(reference.v).trim() || String(reference.v).length > 100 || /[\u0000-\u001f\u007f]/.test(String(reference.v))) {
      issue('REFERENCIA', 'INVALID_REFERENCE', 'Copia la referencia completa como texto, conservando sus ceros, letras y guiones.');
    } else {
      row.sku = String(reference.v).trim().normalize('NFC');
      const key = row.sku.toUpperCase();
      const first = seen.get(key);
      if (first) {
        issue('REFERENCIA', 'DUPLICATE_REFERENCE', `Esta referencia ya aparece en la fila ${first.row}. Deja una sola fila por producto.`);
        if (!first.issues.some((i) => i.code === 'DUPLICATE_REFERENCE')) {
          first.issues.push({ row: first.row, column: 'REFERENCIA', code: 'DUPLICATE_REFERENCE', message: `Esta referencia se repite en la fila ${row.row}. Deja una sola fila por producto.` });
          first.status = 'error';
        }
      } else seen.set(key, row);
    }
    for (let c = 1; c < cells.length; c++) {
      const cell = cells[c];
      const code = columns[c - 1];
      if (!code) continue;
      if (blank(cell) && !formula(cell)) continue;
      const numeric = cell?.t === 'n' && typeof cell.v === 'number' && Number.isFinite(cell.v);
      const integerText = cell?.t === 's' && String(cell.v).length <= 15 && /^\d+$/.test(String(cell.v));
      if (formula(cell) || (!numeric && !integerText)) {
        issue(code, 'INVALID_PRICE', 'Escribe un precio como número de Excel, sin fórmulas, símbolos de moneda ni texto.');
        continue;
      }
      let normalized;
      try {
        normalized = normalizeCopPrice(String(cell.v));
      } catch (error) {
        if (error instanceof CopPriceError) {
          issue(code, 'PRICE_OUT_OF_RANGE', 'El precio debe ser mayor que cero y caber en el sistema después de redondearlo.');
          continue;
        }
        throw error;
      }
      const price: PriceImportComparison = {
        code, raw: normalized.raw, rounded: normalized.rounded, previous: null,
        difference: null, wasRounded: normalized.wasRounded, change: 'new',
      };
      if (code === SINGLE_PRICE_COLUMN) for (const tariff of selected) row.prices.push({ ...price, code: tariff });
      else row.prices.push(price);
    }
    if (!row.prices.length && !row.issues.some((i) => i.column !== 'REFERENCIA')) {
      issue('PRECIOS', 'PRICE_REQUIRED', hasSinglePrice
        ? 'Escribe el precio único de esta referencia; con la celda vacía no hay nada que revisar.'
        : 'Añade al menos un precio para esta referencia; deja vacías solo las tarifas que no cambiarán.');
    }
    row.status = row.issues.length ? 'error' : 'valid';
    rows.push(row);
  }
  if (!rows.length) throw new BadRequestException('La hoja de precios está vacía. Añade una referencia y al menos un precio.');
  return { tariffs: hasSinglePrice ? selected : found, rows, ignoredColumns, singlePrice: hasSinglePrice };
}

/** Guía corta de la plantilla (hoja INSTRUCCIONES; sin EJEMPLO/TARIFAS/CONTRATO). */
const TEMPLATE_GUIDE: string[][] = [
  ['Plantilla de precios — Grupo Security'],
  ['Trabaja en la hoja PRECIOS. Esta guía te acompaña mientras la llenas.'],
  ['Una fila por referencia (SKU). Rellena al menos una tarifa con IVA por fila.'],
  ['Las celdas vacías conservan el precio actual al revisar.'],
  ['Guarda el archivo y súbelo en Listas → Revisar precios.'],
  ['Esta descarga genera un archivo NUEVO: no sobrescribe tus archivos anteriores.'],
];

export interface TemplateReferenceInput {
  sku: string;
  /** Precios actuales como referencia (solo con prices:read). Tarifa → valor. */
  prices?: Partial<Record<PriceImportTariff, string>>;
}

export interface BuildPriceTemplateInput {
  mode: 'vacias' | 'referencias';
  /** Tarifas a emitir (código + nombre), en el orden recibido; el encabezado de cada columna es el NOMBRE de la tarifa. */
  tariffs: readonly PriceImportTariffRef[];
  references?: TemplateReferenceInput[];
}

/**
 * IMP-02 §3 — genera un XLSX NUEVO con las hojas exactas PRECIOS+INSTRUCCIONES.
 * Nunca parte del archivo del usuario (regla 1); las columnas son exactamente
 * las tarifas seleccionadas, con el NOMBRE definido en Biblioteca como encabezado (el lector también acepta el código).
 */
export function buildPriceTemplate(input: BuildPriceTemplateInput): Buffer {
  const selected = [...input.tariffs];
  if (selected.length === 0) throw new BadRequestException('Selecciona al menos una tarifa válida.');
  const rows: (string | number | undefined)[][] = [['REFERENCIA', ...selected.map((t) => t.name)]];
  if (input.mode === 'referencias') {
    for (const ref of input.references ?? []) {
      rows.push([ref.sku, ...selected.map(({ code }) => {
        const raw = ref.prices?.[code];
        if (raw === undefined || raw === null || raw === '') return undefined;
        const numeric = Number(raw);
        return Number.isFinite(numeric) ? numeric : undefined;
      })]);
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'PRECIOS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(TEMPLATE_GUIDE), 'INSTRUCCIONES');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

/** The columns are matched by tariff name, so the guide must say where those names come from. */
const TARIFF_NAMES_NOTE = 'Los nombres de las columnas de precios son los nombres de las tarifas definidas en Biblioteca. Si una tarifa cambia de nombre en Biblioteca, el archivo debe usar el nombre nuevo.';

/** Guide of the official template (sheet INSTRUCCIONES); it must describe exactly what the reader accepts. */
const OFFICIAL_GUIDE: string[][] = [
  ['Plantilla de precios — Grupo Security'],
  ['Trabaja en la hoja PLANTILLA. Una fila por referencia (SKU).'],
  ['REFERENCIA: el código del producto, escrito como texto y sin repetirlo en el archivo. Debe existir ya en el catálogo; si no, la fila se rechaza y puedes omitirla o pedir que se cree en Biblioteca.'],
  ['Precios: todos con IVA incluido, como número de Excel, sin símbolo de moneda, fórmulas ni texto. Se redondean al peso entero.'],
  ['Celda vacía: conserva el precio actual de esa tarifa. Deja al menos un precio por fila.'],
  [TARIFF_NAMES_NOTE],
  ['Si tu proveedor no maneja escalafones, usa una sola columna «PRECIO UNICO (CON IVA)» en vez de las columnas de escalafón. No las mezcles: usa solo una de las dos formas. En pantalla eliges a cuáles escalafones se aplica ese precio.'],
  ['No cambies los títulos de las columnas ni el nombre de la hoja. Borra las filas de ejemplo antes de subir el archivo.'],
  ['Cada producto conserva su lista; el archivo no mueve productos entre listas. Los cambios de más del 30 % se avisan y hay que confirmarlos.'],
  ['Sube el archivo en Listas → Importar precios.'],
];

/**
 * Official purchasing template: sheet PLANTILLA with one column per available tariff (header = tariff name) and the guide.
 * It needs no lista and carries no data; the reader accepts it as is.
 */
export function buildOfficialPriceTemplate(tariffs: readonly PriceImportTariffRef[]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['REFERENCIA *', ...tariffs.map((t) => t.name)]]), 'PLANTILLA');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(OFFICIAL_GUIDE), 'INSTRUCCIONES');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

/** Guide of the single-price template; it must describe exactly what the reader accepts. */
const SINGLE_PRICE_GUIDE: string[][] = [
  ['Plantilla de precio único — Grupo Security'],
  ['Trabaja en la hoja PLANTILLA. Una fila por referencia (SKU).'],
  ['REFERENCIA: el código del producto, escrito como texto y sin repetirlo en el archivo. Debe existir ya en el catálogo; si no, la fila se rechaza y puedes omitirla o pedir que se cree en Biblioteca.'],
  ['PRECIO UNICO (CON IVA): el precio del proveedor con IVA incluido, como número de Excel, sin símbolo de moneda, fórmulas ni texto. Se redondea al peso entero.'],
  ['Es el precio del proveedor, no un precio de venta: se copia tal cual a los escalafones que elijas en pantalla (por defecto, todos). Los escalafones son las tarifas definidas en Biblioteca.'],
  ['No agregues columnas de escalafón: el precio único y las columnas de escalafón no se pueden mezclar en el mismo archivo.'],
  ['No dejes vacía la celda del precio: una fila sin precio no se puede revisar. Los cambios de más del 30 % se avisan y hay que confirmarlos.'],
  ['No cambies los títulos de las columnas ni el nombre de la hoja. Borra las filas de ejemplo antes de subir el archivo.'],
  ['Sube el archivo en Listas → Importar precios.'],
];

/**
 * Single-price purchasing template for suppliers without tariff tiers: sheet PLANTILLA with REFERENCIA and one
 * "PRECIO UNICO (CON IVA)" column. Like the official template it needs no lista and carries no data.
 */
export function buildSinglePriceTemplate(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['REFERENCIA *', SINGLE_PRICE_COLUMN]]), 'PLANTILLA');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(SINGLE_PRICE_GUIDE), 'INSTRUCCIONES');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}
