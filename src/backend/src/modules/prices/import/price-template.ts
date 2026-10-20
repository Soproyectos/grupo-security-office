import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CopPriceError, normalizeCopPrice } from '../../../common/money/cop-policy';
import { MAX_PRICE_IMPORT_ROWS, PRICE_IMPORT_TARIFFS, PriceImportComparison, PriceImportRow, PriceImportTariff } from './price-import.types';
import { readBoundedXlsxParts } from './xlsx-container';
import { validatePriceWorkbookStructure } from './price-workbook-structure';

const blank = (cell?: XLSX.CellObject) => !cell || cell.v === undefined || cell.v === null || cell.v === '';
const formula = (cell?: XLSX.CellObject) => cell?.f !== undefined || cell?.F !== undefined;

export function readPriceTemplate(buffer: Buffer): { tariffs: PriceImportTariff[]; rows: PriceImportRow[] } {
  validatePriceWorkbookStructure(readBoundedXlsxParts(buffer));
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer', cellFormula: true, cellDates: true, cellText: false,
      cellHTML: false, sheets: ['PRECIOS'], sheetRows: MAX_PRICE_IMPORT_ROWS + 2,
    });
  } catch {
    throw new BadRequestException('No pudimos abrir el Excel. Guarda una copia de la plantilla e inténtalo de nuevo.');
  }
  if (workbook.SheetNames.length !== 2 || !workbook.SheetNames.includes('PRECIOS') || !workbook.SheetNames.includes('INSTRUCCIONES')) {
    throw new BadRequestException('Usa la plantilla con las hojas PRECIOS e INSTRUCCIONES, sin añadir otras hojas.');
  }
  const sheet = workbook.Sheets.PRECIOS;
  let range: XLSX.Range;
  try {
    range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref'] ?? 'A1');
  } catch {
    throw new BadRequestException('La hoja PRECIOS tiene un rango inválido. Copia los datos en una plantilla nueva.');
  }
  if (![range.s.r, range.s.c, range.e.r, range.e.c].every((n) => Number.isSafeInteger(n) && n >= 0)) {
    throw new BadRequestException('La hoja PRECIOS tiene un rango inválido. Copia los datos en una plantilla nueva.');
  }
  if (range.e.r > MAX_PRICE_IMPORT_ROWS || range.e.c > PRICE_IMPORT_TARIFFS.length) {
    throw new BadRequestException(`La plantilla admite hasta ${MAX_PRICE_IMPORT_ROWS} filas de precios y las cinco tarifas acordadas.`);
  }
  if (sheet['!merges']?.length) throw new BadRequestException('La hoja PRECIOS no debe tener celdas combinadas.');
  const header = (index: number) => sheet[XLSX.utils.encode_cell({ r: 0, c: index })] as XLSX.CellObject | undefined;
  if (header(0)?.v !== 'REFERENCIA' || formula(header(0))) throw new BadRequestException('La primera columna debe llamarse REFERENCIA.');
  const tariffs: PriceImportTariff[] = [];
  for (let col = 1; col <= range.e.c; col++) {
    const cell = header(col);
    const code = cell?.v;
    if (formula(cell) || !PRICE_IMPORT_TARIFFS.includes(code as PriceImportTariff) || tariffs.includes(code as PriceImportTariff)) {
      throw new BadRequestException('Revisa los títulos de las columnas: solo se admiten tarifas con IVA de esta plantilla, sin repetirlas.');
    }
    tariffs.push(code as PriceImportTariff);
  }
  if (!tariffs.length) throw new BadRequestException('Incluye al menos una columna de precios con IVA.');

  const rows: PriceImportRow[] = [];
  const seen = new Map<string, PriceImportRow>();
  for (let r = 1; r <= range.e.r; r++) {
    const cells = Array.from({ length: tariffs.length + 1 }, (_, c) => sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined);
    if (cells.every((cell) => blank(cell) && !formula(cell))) continue;
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
      const code = tariffs[c - 1];
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
  if (!rows.length) throw new BadRequestException('La hoja PRECIOS está vacía. Añade una referencia y al menos un precio.');
  return { tariffs, rows };
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
