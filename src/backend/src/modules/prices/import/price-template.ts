import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CopPriceError, normalizeCopPrice } from '../../../common/money/cop-policy';
import { MAX_PRICE_IMPORT_ROWS, PRICE_IMPORT_TARIFFS, PriceImportComparison, PriceImportRow, PriceImportTariff } from './price-import.types';
import { readBoundedXlsxParts } from './xlsx-container';
import { PRICE_DATA_SHEETS, validatePriceWorkbookStructure } from './price-workbook-structure';

const blank = (cell?: XLSX.CellObject) => !cell || cell.v === undefined || cell.v === null || cell.v === '';
const formula = (cell?: XLSX.CellObject) => cell?.f !== undefined || cell?.F !== undefined;

/** Purchasing template headers (with IVA) and their tariff codes; "DPP ORO" is the ORO_IVA tariff. */
const TARIFF_HEADERS: Record<string, PriceImportTariff> = {
  'PRECIO INSTALADOR (CON IVA)': 'INSTALADOR_IVA',
  'PRECIO TIENDA (CON IVA)': 'TIENDA_IVA',
  'PRECIO DPP ORO (CON IVA)': 'ORO_IVA',
  'PRECIO DPP PLATINO (CON IVA)': 'DPP_PLATINO_IVA',
  'PRECIO CLIENTE FINAL (CON IVA)': 'CLIENTE_FINAL_IVA',
};
/** Informative columns of the template (price without IVA): never stored, always ignored. */
const IGNORED_HEADER = /^PRECIO [A-Z ]+ \(SIN IVA\)$/;
const MAX_TEMPLATE_COLUMNS = 8;
const NOTE_ROW = /^nota:/i;

const headerText = (value: unknown) => String(value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').replace(/ ?\*$/, '').toUpperCase();

export function readPriceTemplate(buffer: Buffer): { tariffs: PriceImportTariff[]; rows: PriceImportRow[]; ignoredColumns: string[] } {
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
  /** Tariff per physical column after REFERENCIA; null = informative column to ignore. */
  const columns: (PriceImportTariff | null)[] = [];
  const tariffs: PriceImportTariff[] = [];
  const ignoredColumns: string[] = [];
  // Excel keeps formatted-but-empty trailing columns in the sheet range: only the titled ones count,
  // and a value under an untitled trailing column is an error rather than silently dropped.
  let lastTitled = 0;
  for (let col = 1; col <= range.e.c; col++) if (!blank(header(col)) || formula(header(col))) lastTitled = col;
  for (let col = lastTitled + 1; col <= range.e.c; col++) {
    for (let r = 1; r <= range.e.r; r++) {
      const stray = sheet[XLSX.utils.encode_cell({ r, c: col })] as XLSX.CellObject | undefined;
      if (!blank(stray) || formula(stray)) {
        throw new BadRequestException(`La columna ${XLSX.utils.encode_col(col)} tiene datos pero no tiene título. Bórrala o ponle el título de una tarifa de la plantilla.`);
      }
    }
  }
  for (let col = 1; col <= lastTitled; col++) {
    const cell = header(col);
    const text = headerText(cell?.v);
    const code = TARIFF_HEADERS[text] ?? (PRICE_IMPORT_TARIFFS.includes(cell?.v as PriceImportTariff) ? (cell?.v as PriceImportTariff) : undefined);
    if (!formula(cell) && !code && IGNORED_HEADER.test(text)) {
      columns.push(null);
      ignoredColumns.push(String(cell?.v).trim());
      continue;
    }
    if (formula(cell) || !code || tariffs.includes(code)) {
      const where = `columna ${XLSX.utils.encode_col(col)}`;
      const shown = String(cell?.v ?? '').trim().slice(0, 60) || '(vacío)';
      const why = formula(cell) ? 'es una fórmula' : code ? 'está repetida' : 'no es una tarifa de la plantilla';
      throw new BadRequestException(`Revisa el título de la ${where}: «${shown}» ${why}. Solo se admiten las tarifas con IVA de la plantilla, sin repetirlas.`);
    }
    columns.push(code);
    tariffs.push(code);
  }
  if (!tariffs.length) throw new BadRequestException('Incluye al menos una columna de precios con IVA.');

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
      row.prices.push(price);
    }
    if (!row.prices.length && !row.issues.some((i) => i.column !== 'REFERENCIA')) issue('PRECIOS', 'PRICE_REQUIRED', 'Añade al menos un precio para esta referencia; deja vacías solo las tarifas que no cambiarán.');
    row.status = row.issues.length ? 'error' : 'valid';
    rows.push(row);
  }
  if (!rows.length) throw new BadRequestException('La hoja de precios está vacía. Añade una referencia y al menos un precio.');
  return { tariffs, rows, ignoredColumns };
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
  /** Subconjunto de PRICE_IMPORT_TARIFFS; se emite SIEMPRE en el orden canónico. */
  tariffs: PriceImportTariff[];
  references?: TemplateReferenceInput[];
}

/**
 * IMP-02 §3 — genera un XLSX NUEVO con las hojas exactas PRECIOS+INSTRUCCIONES.
 * Nunca parte del archivo del usuario (regla 1); las columnas son exactamente
 * las tarifas IVA seleccionadas en orden canónico (regla 2; ORO_IVA exacto).
 */
export function buildPriceTemplate(input: BuildPriceTemplateInput): Buffer {
  const selected = PRICE_IMPORT_TARIFFS.filter((code) => input.tariffs.includes(code));
  if (selected.length === 0) throw new BadRequestException('Selecciona al menos una tarifa válida.');
  const rows: (string | number | undefined)[][] = [['REFERENCIA', ...selected]];
  if (input.mode === 'referencias') {
    for (const ref of input.references ?? []) {
      rows.push([ref.sku, ...selected.map((code) => {
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

const OFFICIAL_HEADERS: [string, PriceImportTariff][] = Object.entries(TARIFF_HEADERS).map(([header, code]) => [header, code]);

/** Guide of the official template (sheet INSTRUCCIONES); it must describe exactly what the reader accepts. */
const OFFICIAL_GUIDE: string[][] = [
  ['Plantilla de precios — Grupo Security'],
  ['Trabaja en la hoja PLANTILLA. Una fila por referencia (SKU).'],
  ['REFERENCIA: el código del producto, escrito como texto y sin repetirlo en el archivo. Debe existir ya en el catálogo; si no, la fila se rechaza y puedes omitirla o pedir que se cree en Biblioteca.'],
  ['Precios: todos con IVA incluido, como número de Excel, sin símbolo de moneda, fórmulas ni texto. Se redondean al peso entero.'],
  ['Celda vacía: conserva el precio actual de esa tarifa. Deja al menos un precio por fila.'],
  ['No cambies los títulos de las columnas ni el nombre de la hoja. Borra las filas de ejemplo antes de subir el archivo.'],
  ['Cada producto conserva su lista; el archivo no mueve productos entre listas. Los cambios de más del 30 % se avisan y hay que confirmarlos.'],
  ['Sube el archivo en Listas → Importar precios.'],
];

/**
 * Official purchasing template: sheet PLANTILLA with readable "(CON IVA)" headers and the guide.
 * It needs no lista and carries no data; the reader accepts it as is.
 */
export function buildOfficialPriceTemplate(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['REFERENCIA *', ...OFFICIAL_HEADERS.map(([header]) => header)]]), 'PLANTILLA');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(OFFICIAL_GUIDE), 'INSTRUCCIONES');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}
