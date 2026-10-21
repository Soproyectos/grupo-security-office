import { BadRequestException } from '@nestjs/common';
import { posix } from 'node:path';
import { TextDecoder } from 'node:util';
import * as sax from 'sax';
import { MAX_PRICE_IMPORT_ROWS } from './price-import.types';

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CONTENT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const WORKBOOK_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
/** Data sheet names accepted next to INSTRUCCIONES; PLANTILLA is the name used by the purchasing template. */
export const PRICE_DATA_SHEETS = ['PRECIOS', 'PLANTILLA'] as const;
const STRUCTURAL_TAGS = new Set(['Types', 'Override', 'Default', 'workbook', 'sheets', 'sheet',
  'Relationships', 'Relationship', 'worksheet', 'dimension', 'sheetData', 'row', 'c', 'v', 'is', 'f']);

interface XmlAttribute { local: string; uri: string; value: string }
interface XmlTag { name: string; local: string; prefix: string; uri: string; attributes: Record<string, XmlAttribute> }

function invalid(): never {
  throw new BadRequestException('La estructura del Excel no coincide con la plantilla. Copia los datos en una plantilla nueva, sin fórmulas ni celdas repetidas.');
}

function attribute(tag: XmlTag, name: string, namespace = ''): string | undefined {
  const matches = Object.values(tag.attributes).filter((a) => a.local === name && a.uri === namespace);
  if (matches.length > 1) invalid();
  return matches[0]?.value;
}

function xmlText(bytes: Buffer | undefined): string {
  if (!bytes) invalid();
  try {
    const bigEndian = (bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0 && bytes[1] === 0x3c);
    const littleEndian = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0x3c && bytes[1] === 0);
    return new TextDecoder(bigEndian ? 'utf-16be' : littleEndian ? 'utf-16le' : 'utf-8', { fatal: true }).decode(bytes);
  } catch { return invalid(); }
}

/** Strict XML events, bounded nesting and default element namespaces keep both readers in agreement. */
function walkXml(bytes: Buffer | undefined, root: string, namespace: string, open: (tag: XmlTag, parents: string[]) => void): void {
  const stack: string[] = [];
  let roots = 0;
  const parser = sax.parser(true, { xmlns: true, strictEntities: true, position: false });
  parser.ondoctype = invalid;
  parser.oncomment = invalid;
  parser.oncdata = invalid;
  parser.onprocessinginstruction = (instruction: { name: string }) => { if (instruction.name !== 'xml' || roots) invalid(); };
  parser.onerror = invalid;
  parser.onopentag = (tag: XmlTag) => {
    if (stack.length >= 32 || tag.prefix || tag.uri !== namespace) invalid();
    if (!stack.length && (++roots !== 1 || tag.local !== root)) invalid();
    open(tag, stack);
    stack.push(tag.local);
  };
  parser.onclosetag = () => { stack.pop(); };
  const text = xmlText(bytes);
  // Structural attributes must have one literal representation for both XML readers.
  // Ordinary text cells may still contain escaped characters such as &amp;.
  for (const tag of text.matchAll(/<(?:[^'"<>]|"[^"]*"|'[^']*')*>/g)) {
    const name = /^<\/?([\w:.-]+)/.exec(tag[0])?.[1];
    if (STRUCTURAL_TAGS.has(name ?? '') && tag[0].includes('&')) invalid();
  }
  try { parser.write(text).close(); } catch (error) {
    if (error instanceof BadRequestException) throw error;
    invalid();
  }
  if (stack.length || roots !== 1) invalid();
}

function validateContentTypes(parts: Map<string, Buffer>): void {
  let workbooks = 0;
  const overrides = new Set<string>();
  walkXml(parts.get('[Content_Types].xml'), 'Types', CONTENT_NS, (tag, parents) => {
    if (tag.local !== 'Override') return;
    const name = attribute(tag, 'PartName');
    const type = attribute(tag, 'ContentType');
    if (parents.join('/') !== 'Types' || !name || !type || overrides.has(name)) invalid();
    overrides.add(name!);
    if (name === '/xl/workbook.xml' || type!.includes('.main')) {
      if (name !== '/xl/workbook.xml' || type !== WORKBOOK_TYPE || ++workbooks !== 1) invalid();
    }
  });
  if (workbooks !== 1) invalid();
}

function worksheetTargets(parts: Map<string, Buffer>): Map<string, string> {
  const sheets = new Map<string, string>();
  const sheetIds = new Set<string>();
  let groups = 0;
  walkXml(parts.get('xl/workbook.xml'), 'workbook', MAIN_NS, (tag, parents) => {
    if (tag.local === 'sheets') {
      if (parents.length !== 1 || ++groups !== 1) invalid();
    }
    if (tag.local !== 'sheet') return;
    const name = attribute(tag, 'name');
    const id = attribute(tag, 'id', OFFICE_REL_NS);
    if (parents.join('/') !== 'workbook/sheets' || !(['INSTRUCCIONES', ...PRICE_DATA_SHEETS] as string[]).includes(name ?? '') ||
      !id || sheets.has(name!) || sheetIds.has(id)) invalid();
    sheets.set(name!, id!);
    sheetIds.add(id!);
  });
  if (groups !== 1 || sheets.size !== 2 || !sheets.has('INSTRUCCIONES')) invalid();

  const relationships = new Map<string, string>();
  const ids = new Set<string>();
  walkXml(parts.get('xl/_rels/workbook.xml.rels'), 'Relationships', REL_NS, (tag, parents) => {
    if (tag.local !== 'Relationship') return;
    const id = attribute(tag, 'Id');
    if (parents.join('/') !== 'Relationships' || !id || ids.has(id)) invalid();
    ids.add(id!);
    if (!sheetIds.has(id!)) return;
    const target = attribute(tag, 'Target');
    if (attribute(tag, 'Type') !== `${OFFICE_REL_NS}/worksheet` || attribute(tag, 'TargetMode') ||
      !target || !/^[A-Za-z0-9_./-]+$/.test(target)) invalid();
    const resolved = posix.resolve('/xl', target!);
    if (!resolved.startsWith('/xl/worksheets/') || !parts.has(resolved.slice(1))) invalid();
    relationships.set(id!, resolved.slice(1));
  });
  const targets = new Map<string, string>();
  for (const [name, id] of sheets) {
    const target = relationships.get(id);
    if (!target || [...targets.values()].includes(target)) invalid();
    targets.set(name, target!);
  }
  return targets;
}

function address(value: string | undefined): { row: number; col: number } {
  const match = /^([A-H])([1-9]\d*)$/.exec(value ?? '');
  if (!match) invalid();
  if (match![2].length > 4 || Number(match![2]) > MAX_PRICE_IMPORT_ROWS + 1) {
    throw new BadRequestException(`Divide el archivo en listas de hasta ${MAX_PRICE_IMPORT_ROWS} filas de precios, más la fila de títulos.`);
  }
  return { col: match![1].charCodeAt(0) - 65, row: Number(match![2]) };
}

/** Check physical rows and cells before SheetJS can truncate or overwrite them. */
export function validatePriceWorkbookStructure(parts: Map<string, Buffer>): 'PRECIOS' | 'PLANTILLA' {
  validateContentTypes(parts);
  const targets = worksheetTargets(parts);
  const dataSheet = PRICE_DATA_SHEETS.find((name) => targets.has(name))!;
  walkXml(parts.get(targets.get('INSTRUCCIONES')!), 'worksheet', MAIN_NS, () => undefined);
  let dimension: { row: number; col: number } | undefined;
  let largestRow = 0;
  let largestCol = 0;
  let dataGroups = 0;
  let currentRow = 0;
  let currentCell = '';
  let valueCount = 0;
  const rows = new Set<number>();
  const cells = new Set<string>();
  walkXml(parts.get(targets.get(dataSheet)!), 'worksheet', MAIN_NS, (tag, parents) => {
    const parent = parents[parents.length - 1];
    if (tag.local === 'dimension') {
      if (parent !== 'worksheet' || dimension) invalid();
      const range = (attribute(tag, 'ref') ?? '').split(':');
      if (range.length > 2) invalid();
      const start = address(range[0]);
      if (start.row !== 1 || start.col !== 0) invalid();
      dimension = address(range[1] ?? range[0]);
    }
    if (tag.local === 'sheetData' && (parent !== 'worksheet' || ++dataGroups !== 1)) invalid();
    if (tag.local === 'row') {
      const ref = attribute(tag, 'r') ?? '';
      currentRow = Number(ref);
      if (parents.join('/') !== 'worksheet/sheetData' || !/^[1-9]\d*$/.test(ref) || rows.has(currentRow)) invalid();
      if (ref.length > 4 || currentRow > MAX_PRICE_IMPORT_ROWS + 1) {
        throw new BadRequestException(`Divide el archivo en listas de hasta ${MAX_PRICE_IMPORT_ROWS} filas de precios, más la fila de títulos.`);
      }
      rows.add(currentRow);
    }
    if (tag.local === 'c') {
      const ref = attribute(tag, 'r');
      const cell = address(ref);
      if (parents.join('/') !== 'worksheet/sheetData/row' || cell.row !== currentRow || cells.has(ref!)) invalid();
      cells.add(ref!);
      currentCell = ref!;
      largestRow = Math.max(largestRow, cell.row);
      largestCol = Math.max(largestCol, cell.col);
      valueCount = 0;
    }
    if (tag.local === 'f') {
      throw new BadRequestException(`La celda ${currentCell} contiene una fórmula. Copia su resultado y pégalo como valor antes de subir el Excel.`);
    }
    if (parent === 'c' && !['v', 'is'].includes(tag.local)) invalid();
    if (['v', 'is'].includes(tag.local) && (parent !== 'c' || ++valueCount > 1)) invalid();
  });
  if (dataGroups !== 1 || (dimension && (largestRow > dimension.row || largestCol > dimension.col))) invalid();
  return dataSheet;
}
