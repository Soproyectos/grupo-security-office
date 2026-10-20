import type { ValidationRowError } from '../types/import.types';

export async function exportValidationErrors(errors: ValidationRowError[], fileName: string): Promise<void> {
  const XLSX = await import('xlsx');

  const data = errors.map(err => ({
    'Fila Excel': err.excelRow,
    'SKU': err.sku || 'N/A',
    'Errores': err.errors.map(e => e.message).join('; '),
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Errores');

  ws['!cols'] = [
    { wch: 10 },
    { wch: 20 },
    { wch: 60 },
  ];

  XLSX.writeFile(wb, `${fileName.replace(/\.[^.]+$/, '')}_errores.xlsx`);
}

export async function exportImportSummary(
  params: {
    created: number;
    pendingEnrichment: number;
    updated: number;
    skipped: number;
    errors: Array<{ sku: string; error: string }>;
  },
  fileName: string,
): Promise<void> {
  const XLSX = await import('xlsx');

  const summaryData = [
    { Concepto: 'Productos creados', Valor: params.created },
    { Concepto: 'Pendientes de enriquecimiento', Valor: params.pendingEnrichment },
    { Concepto: 'Productos actualizados', Valor: params.updated },
    { Concepto: 'Filas omitidas', Valor: params.skipped },
    { Concepto: 'Errores', Valor: params.errors.length },
  ];

  const ws1 = XLSX.utils.json_to_sheet(summaryData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

  if (params.errors.length > 0) {
    const errorData = params.errors.map(e => ({
      SKU: e.sku,
      Error: e.error,
    }));
    const ws2 = XLSX.utils.json_to_sheet(errorData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Errores');
  }

  XLSX.writeFile(wb, `${fileName.replace(/\.[^.]+$/, '')}_reporte.xlsx`);
}

/**
 * Genera un log de importación en texto plano (.txt) descargable con fecha,
 * archivo, lista destino, totales y errores por fila.
 */
export function exportImportLog(params: {
  fileName: string;
  listaLabel?: string;
  totals: { total: number; created: number; updated: number; skipped: number; errors: number; pendingEnrichment: number };
  errors: Array<{ rowIndex?: number; sku?: string; error: string }>;
}): void {
  const lines: string[] = [];
  lines.push('LOG DE IMPORTACION');
  lines.push('=================');
  lines.push(`Fecha: ${new Date().toLocaleString('es-CL')}`);
  lines.push(`Archivo: ${params.fileName}`);
  lines.push(`Lista destino: ${params.listaLabel || 'Sin lista'}`);
  lines.push('');
  lines.push('Totales:');
  lines.push(`  - Total filas procesadas: ${params.totals.total}`);
  lines.push(`  - Productos creados: ${params.totals.created}`);
  lines.push(`  - Pendientes de enriquecimiento: ${params.totals.pendingEnrichment}`);
  lines.push(`  - Productos actualizados: ${params.totals.updated}`);
  lines.push(`  - Filas omitidas: ${params.totals.skipped}`);
  lines.push(`  - Filas con error: ${params.totals.errors}`);
  if (params.errors.length > 0) {
    lines.push('');
    lines.push('Errores por fila:');
    for (const e of params.errors) {
      lines.push(`  - Fila ${e.rowIndex ?? '?'} | SKU ${e.sku || 'N/A'} | ${e.error}`);
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${params.fileName.replace(/\.[^.]+$/, '')}_log.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
