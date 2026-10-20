import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useImportStore } from '../store/import.store';
import { exportImportSummary, exportImportLog } from '../utils/excel-generator';
import { fetchPriceLists } from '../../../../services/prices.service';

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

interface ImportStepResultProps {
  onNewImport: () => void;
  onClose: () => void;
}

export default function ImportStepResult({ onNewImport, onClose }: ImportStepResultProps) {
  const executionResult = useImportStore((s) => s.executionResult);
  const fileName = useImportStore((s) => s.fileName);
  const listaId = useImportStore((s) => s.listaId);

  const { data: priceLists } = useQuery({
    queryKey: ['priceLists'],
    queryFn: fetchPriceLists,
  });

  const listaLabel = priceLists?.find((l) => l.id === listaId)?.name;

  const handleDownloadReport = useCallback(async () => {
    if (!executionResult) return;
    await exportImportSummary(
      {
        created: executionResult.summary.created,
        pendingEnrichment: executionResult.summary.pendingEnrichment ?? 0,
        updated: executionResult.summary.updated,
        skipped: executionResult.summary.skipped,
        errors: executionResult.executionErrors,
      },
      fileName,
    );
  }, [executionResult, fileName]);

  const handleDownloadLog = useCallback(() => {
    if (!executionResult) return;
    exportImportLog({
      fileName,
      listaLabel,
      totals: {
        total: executionResult.summary.total,
        created: executionResult.summary.created,
        updated: executionResult.summary.updated,
        skipped: executionResult.summary.skipped,
        errors: executionResult.summary.errors,
        pendingEnrichment: executionResult.summary.pendingEnrichment ?? 0,
      },
      errors: executionResult.executionErrors,
    });
  }, [executionResult, fileName, listaLabel]);

  if (!executionResult) {
    return (
      <div className="text-center text-gray-500 py-8">
        No hay resultado de importacion disponible.
      </div>
    );
  }

  const hasErrors = executionResult.executionErrors.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-security-900">
          Resultado de Importacion
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          La importacion se ha completado.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Total
          </p>
          <p className="mt-1 text-2xl font-bold text-security-900">
            {executionResult.summary.total}
          </p>
        </div>
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">
            Pendientes
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-800">
            {executionResult.summary.pendingEnrichment ?? 0}
          </p>
        </div>
        <div className="border border-green-200 bg-green-50 rounded-lg p-4">
          <p className="text-xs font-medium text-green-700 uppercase tracking-wide">
            Creados
          </p>
          <p className="mt-1 text-2xl font-bold text-green-800">
            {executionResult.summary.created}
          </p>
        </div>
        <div className="border border-security-200 bg-security-50 rounded-lg p-4">
          <p className="text-xs font-medium text-security-700 uppercase tracking-wide">
            Actualizados
          </p>
          <p className="mt-1 text-2xl font-bold text-security-800">
            {executionResult.summary.updated}
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Omitidos
          </p>
          <p className="mt-1 text-2xl font-bold text-security-900">
            {executionResult.summary.skipped}
          </p>
        </div>
        <div className={`border rounded-lg p-4 ${hasErrors ? 'border-security-200 bg-security-50' : 'border-gray-200'}`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${hasErrors ? 'text-security-700' : 'text-gray-500'}`}>
            Errores
          </p>
          <p className={`mt-1 text-2xl font-bold ${hasErrors ? 'text-security-800' : 'text-security-900'}`}>
            {executionResult.summary.errors}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-500">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Duracion: {formatDuration(executionResult.durationMs)}</span>
        <span className="mx-1 text-gray-300">|</span>
        <span>Completado: {new Date(executionResult.completedAt).toLocaleString('es-CL')}</span>
      </div>

      {hasErrors && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Errores ({executionResult.executionErrors.length})
          </h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">
                    Fila
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">
                    SKU
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-700">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {executionResult.executionErrors.map((err, idx) => (
                  <tr key={idx} className="bg-security-50">
                    <td className="px-4 py-2.5 text-gray-600">
                      {err.rowIndex}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-security-900">
                      {err.sku || 'N/A'}
                    </td>
                    <td className="px-4 py-2.5 text-security-700">
                      {err.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleDownloadLog}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Descargar log
        </button>
        {hasErrors && (
          <button
            type="button"
            onClick={handleDownloadReport}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-security-700 bg-security-50 rounded-md hover:bg-security-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Descargar reporte
          </button>
        )}
        <button
          type="button"
          onClick={onNewImport}
          className="px-6 py-2.5 text-sm font-medium text-white bg-security-700 rounded-md hover:bg-security-800 transition-colors"
        >
          Nueva Importacion
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
