import { useEffect } from 'react';
import { useImportStore } from '../store/import.store';
import { useImportExecution } from '../hooks/useImportExecution';
import { runImportInBackground } from '../services/import-background-runner';
import { buildImportSectionDecisions } from '../utils/section-detection';

interface ImportStepExecutionProps {
  /** Cierra el wizard sin resetear el seguimiento en segundo plano. */
  onClose: () => void;
}

/**
 * SEC-IMPORT-003: este paso ya no espera a que la importación termine.
 *
 * Antes se quedaba aquí, con un spinner, hasta que el batch completo
 * respondía — con archivos grandes eso son varios minutos con la pantalla
 * bloqueada, y si el usuario cerraba la pestaña por accidente perdía el
 * resultado. Ahora: arranca el batch (POST execute, responde en <2s),
 * entrega el seguimiento a `runImportInBackground` (que sigue sondeando
 * aunque este wizard se cierre) y muestra de inmediato el mensaje de
 * "puedes seguir trabajando" — el progreso real se ve después en la
 * tarjeta flotante (`BackgroundImportWidget`, montada en `AdminLayout`,
 * visible en cualquier pantalla).
 */
export default function ImportStepExecution({ onClose }: ImportStepExecutionProps) {
  const preview = useImportStore((s) => s.preview);
  const columnMappings = useImportStore((s) => s.columnMappings);
  const ivaMode = useImportStore((s) => s.ivaMode);
  const listaId = useImportStore((s) => s.listaId);
  const sections = useImportStore((s) => s.sections);
  const fileName = useImportStore((s) => s.fileName);
  const setStep = useImportStore((s) => s.setStep);
  const setError = useImportStore((s) => s.setError);

  const executionMutation = useImportExecution();

  useEffect(() => {
    if (!preview) return;

    executionMutation.mutate(
      {
        importId: preview.importId,
        columnMappings: columnMappings.map((m) => ({
          sourceColumn: m.sourceColumn,
          targetField: m.targetField,
        })),
        ivaMode,
        listaId: listaId ?? undefined,
        sections: buildImportSectionDecisions(sections),
      },
      {
        onSuccess: (ack) => {
          runImportInBackground(ack.importId, fileName || 'archivo importado', listaId ?? undefined);
        },
        onError: (err) => {
          setError(err.message || 'Error durante el arranque de la importacion');
          setStep('confirm');
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (executionMutation.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-12">
        <div className="w-full max-w-md p-4 bg-security-50 border border-security-200 rounded-md">
          <p className="text-sm text-security-700">
            {executionMutation.error?.message || 'Error durante la importacion'}
          </p>
          <button
            type="button"
            onClick={() => setStep('confirm')}
            className="mt-3 text-sm font-medium text-security-700 underline hover:text-security-800"
          >
            Volver a confirmar
          </button>
        </div>
      </div>
    );
  }

  if (executionMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-12">
        <div className="w-14 h-14 flex items-center justify-center rounded-full bg-security-50">
          <div className="w-9 h-9 border-3 border-security-700 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm text-gray-500">Iniciando la importación...</p>
      </div>
    );
  }

  // executionMutation.isSuccess: el batch ya arrancó en el servidor.
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12 text-center">
      <div className="w-16 h-16 flex items-center justify-center rounded-full bg-green-50">
        <svg className="w-9 h-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div className="max-w-md">
        <h2 className="text-lg font-semibold text-security-900">
          Ya solo falta esperar que se suban los productos
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          La importación de <strong>{preview?.totalRows ?? 0} filas</strong> sigue corriendo en el
          servidor. Puedes cerrar esta ventana y seguir usando el sistema — el progreso se ve en
          la tarjeta de la esquina inferior, y te avisamos ahí cuando termine.
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="px-5 py-2.5 rounded-lg bg-security-700 text-white text-sm font-medium hover:bg-security-800 transition-colors"
      >
        Entendido, cerrar y seguir trabajando
      </button>
    </div>
  );
}
