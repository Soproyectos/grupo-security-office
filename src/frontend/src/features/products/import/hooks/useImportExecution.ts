import { useMutation } from '@tanstack/react-query';
import api from '../../../../services/api';
import { useImportStore } from '../store/import.store';
import type {
  ImportExecutionResult,
  ImportExecutionAck,
  ImportProgressResult,
  ImportSectionDecision,
} from '../types/import.types';

interface ExecuteParams {
  importId: string;
  columnMappings: Array<{ sourceColumn: string; targetField: string }>;
  ivaMode?: string;
  presetName?: string;
  listaId?: string;
  sections?: ImportSectionDecision[];
}

/**
 * Defensivo: el backend usa ValidationPipe con forbidNonWhitelisted=true.
 * Si el runtime aún no acepta `sections` (campo nuevo en desarrollo), el 400
 * reintenta sin el campo, igual que se hace con codigo en createLista.
 */
function isSectionsNotWhitelisted(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status !== 400) return false;
  const data = JSON.stringify((err as { response?: { data?: unknown } })?.response?.data ?? '');
  return data.includes('sections');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * SEC-IMPORT-002: POST /execute solo arranca el batch y responde de
 * inmediato (`status: 'processing'`) — ya no espera a que termine. Con
 * archivos de varias listas de precio por fila, el batch puede tardar
 * varios minutos (cada producto cuesta ~20 idas y vueltas a la BD remota) y
 * una sola petición HTTP esperando eso se corta a la fuerza a mitad de
 * camino, perdiendo el resultado aunque el archivo fuera válido. Por eso el
 * mutationFn sondea /progress cada 2s hasta ver 'completed' o 'failed'.
 */
async function pollUntilDone(importId: string): Promise<ImportExecutionResult> {
  const setExecutionProgress = useImportStore.getState().setExecutionProgress;

  // Timeout propio del sondeo: 15 minutos. Si se pasa, algo real se rompió
  // (no la lentitud normal de un archivo grande) y hay que avisar, no
  // quedarse preguntando para siempre.
  const deadline = Date.now() + 15 * 60 * 1000;

  while (Date.now() < deadline) {
    const { data } = await api.get<ImportProgressResult>(`/products/import/progress/${importId}`);

    setExecutionProgress({ progress: data.progress, message: data.message });

    if (data.status === 'completed' && data.result) {
      return data.result;
    }

    if (data.status === 'failed') {
      throw new Error(data.message || 'La importación falló');
    }

    await sleep(2000);
  }

  throw new Error(
    'La importación sigue en curso pero se agotó el tiempo de espera de esta pantalla. ' +
      'Puede seguir corriendo en el servidor; vuelva a intentar la consulta más tarde.',
  );
}

export function useImportExecution() {
  return useMutation<ImportExecutionResult, Error, ExecuteParams>({
    mutationFn: async ({ importId, columnMappings, ivaMode, presetName, listaId, sections }) => {
      const hasSections = Array.isArray(sections) && sections.length > 0;
      const fixedValues = useImportStore.getState().fixedValues;
      const body: Record<string, unknown> = {
        importId,
        columnMappings,
        ivaMode,
        presetName,
        ...(listaId ? { listaId } : {}),
      };
      if (hasSections) body.sections = sections;
      if (fixedValues && Object.keys(fixedValues).length > 0) body.fixedValues = fixedValues;

      let ack: ImportExecutionAck;
      try {
        const { data } = await api.post('/products/import/execute', body);
        ack = data;
      } catch (err) {
        if (hasSections && isSectionsNotWhitelisted(err)) {
          const retryBody = { ...body };
          delete retryBody.sections;
          const { data } = await api.post('/products/import/execute', retryBody);
          ack = data;
        } else {
          throw err;
        }
      }

      useImportStore.getState().setExecutionProgress({ progress: 0, message: ack.message });
      return pollUntilDone(ack.importId);
    },
  });
}
