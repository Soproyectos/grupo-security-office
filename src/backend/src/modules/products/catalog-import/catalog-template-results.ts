/**
 * Downloadable per-product results of a template import (XLSX / CSV). Contains only business data already shown on screen:
 * no ids of users, no tokens, no file contents. Cells that could be read as a formula by a spreadsheet are neutralized.
 */
import * as XLSX from 'xlsx';
import { BatchRecord, BatchResultRow, ResultStatus } from './catalog-template-import.types';

const STATUS_LABELS: Record<ResultStatus, string> = {
  CREATED: 'Creado (borrador)', UPDATED: 'Actualizado', UNCHANGED: 'Sin cambios', PROPOSED: 'Propuesta (no aplicada)', INVALID: 'Con errores (no aplicado)',
  STALE: 'Cambió tras la vista previa (omitido)', NEEDS_CONFIRMATION: 'Pendiente de confirmar (no creado)', FAILED: 'Falló',
};

export const RESULT_HEADERS = ['Fila', 'Referencia', 'Nombre', 'Resultado', 'Codigo', 'Aplicado', 'Propuestas', 'Incidencias', 'Pendiente', 'Error'];

const safe = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};
const short = (value: unknown): string => {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

export function resultRows(rows: BatchResultRow[]): string[][] {
  return rows.map((r) => [
    String(r.row), r.reference, r.name, STATUS_LABELS[r.status] ?? r.status, r.code,
    r.applied.map((a) => (a.key ? `${a.field}: ${a.key}` : a.field)).join('; '),
    r.proposals.map((p) => `${p.field}${p.key ? ` (${p.key})` : ''}: ${short(p.before)} -> ${short(p.after)}`).join('\n'),
    r.issues.map((i) => `${i.code}: ${i.message}`).join('\n'),
    r.pending.join('; '),
    r.error ?? '',
  ].map(safe));
}

export function buildResultsFile(batch: BatchRecord, rows: BatchResultRow[], format: 'xlsx' | 'csv'): { buffer: Buffer; fileName: string; contentType: string } {
  const sheet = XLSX.utils.aoa_to_sheet([RESULT_HEADERS, ...resultRows(rows)]);
  sheet['!cols'] = [6, 22, 40, 30, 24, 40, 60, 60, 24, 40].map((wch) => ({ wch }));
  const base = `resultado-importacion-${batch.batchId.slice(0, 8)}`;
  if (format === 'csv') {
    return { buffer: Buffer.from(`﻿${XLSX.utils.sheet_to_csv(sheet)}`, 'utf8'), fileName: `${base}.csv`, contentType: 'text/csv; charset=utf-8' };
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Resultados');
  const summary = XLSX.utils.aoa_to_sheet([
    ['Archivo', safe(batch.fileName)], ['Plantilla', batch.templateVersion], ['Fecha', batch.createdAt], ['Estado', batch.state],
    ...Object.entries(batch.counts).map(([k, v]) => [STATUS_LABELS[k as ResultStatus] ?? k, v]),
  ]);
  summary['!cols'] = [{ wch: 40 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(book, summary, 'Resumen');
  return { buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer, fileName: `${base}.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
