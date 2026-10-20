import { useMemo, useState } from 'react';
import { useImportStore } from '../store/import.store';
import { detectHeaderMappings } from '../utils/header-detection';
import type { SystemField } from '../types/import.types';

const REQUIRED_FIELDS: SystemField[] = ['sku'];

const SYSTEM_FIELD_LABELS: Record<SystemField, string> = {
  sku: 'SKU',
  name: 'Nombre',
  description: 'Descripcion',
  category: 'Categoria',
  brand: 'Marca',
  technicalSpecs: 'Especificaciones Tecnicas',
  price_instalador_iva: 'Precio Instalador (IVA)',
  price_tienda_iva: 'Precio Tienda (IVA)',
  price_dpp_oro_iva: 'Precio DPP Oro (IVA)',
  price_dpp_platino_iva: 'Precio DPP Platino (IVA)',
  price_cliente_final_iva: 'Precio Cliente Final (IVA)',
  price_oro_sin_iva: 'Oro sin IVA',
  price_installer_sin_iva: 'Installer sin IVA',
  __skip: 'No importar',
  __extra: 'Atributo adicional',
};

const ALL_FIELDS: SystemField[] = Object.keys(SYSTEM_FIELD_LABELS) as SystemField[];

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.9) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
        Alta
      </span>
    );
  }
  if (confidence >= 0.7) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
        Media
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
      Baja
    </span>
  );
}

export default function ImportStepHeaders() {
  const preview = useImportStore((s) => s.preview);
  const setColumnMappings = useImportStore((s) => s.setColumnMappings);
  const nextStep = useImportStore((s) => s.nextStep);

  const [localMappings, setLocalMappings] = useState<
    Array<{ sourceColumn: string; targetField: SystemField; confidence: number; isRequired: boolean }>
  >(() => {
    if (!preview) return [];
    const { suggestedMappings } = detectHeaderMappings(preview.detectedHeaders);
    return suggestedMappings;
  });

  const [unmappedHeaders] = useState<string[]>(() => {
    if (!preview) return [];
    const { unmappedHeaders } = detectHeaderMappings(preview.detectedHeaders);
    return unmappedHeaders;
  });

  const mappedTargets = useMemo(
    () => new Set(localMappings.filter((m) => m.targetField !== '__skip').map((m) => m.targetField)),
    [localMappings],
  );

  const handleMappingChange = (sourceColumn: string, newTarget: SystemField) => {
    setLocalMappings((prev) =>
      prev.map((m) =>
        m.sourceColumn === sourceColumn ? { ...m, targetField: newTarget } : m,
      ),
    );
  };

  const handleConfirm = () => {
    setColumnMappings(
      localMappings
        .filter((m) => m.targetField !== '__skip')
        .map((m) => ({ sourceColumn: m.sourceColumn, targetField: m.targetField })),
    );
    nextStep();
  };

  if (!preview) {
    return (
      <div className="text-center text-gray-500 py-8">
        No hay datos de preview disponibles.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-security-900">
          Mapeo Automatico de Encabezados
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Revise las coincidencias detectadas para las {preview.detectedHeaders.length} columnas encontradas.
        </p>
        <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          El SKU es el único campo obligatorio. Las filas sin identidad comercial quedan como borradores pendientes.
        </p>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left font-medium text-gray-700">
                Columna detectada
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">
                Campo del sistema
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">
                Confianza
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {localMappings.map((mapping) => (
              <tr key={mapping.sourceColumn} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className="font-medium text-security-900">
                    {mapping.sourceColumn}
                  </span>
                  {mapping.isRequired && (
                    <span className="ml-1.5 text-security-500">*</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={mapping.targetField}
                    onChange={(e) =>
                      handleMappingChange(mapping.sourceColumn, e.target.value as SystemField)
                    }
                    className="w-full max-w-xs px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary focus:border-security-500"
                  >
                    {ALL_FIELDS.map((field) => {
                      const isUsed = mappedTargets.has(field) && field !== mapping.targetField;
                      const isRequiredField = REQUIRED_FIELDS.includes(field);
                      return (
                        <option
                          key={field}
                          value={field}
                          disabled={isUsed}
                        >
                          {SYSTEM_FIELD_LABELS[field]}{isRequiredField ? ' (requerido)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <ConfidenceBadge confidence={mapping.confidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unmappedHeaders.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Columnas sin mapeo ({unmappedHeaders.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {unmappedHeaders.map((header) => (
              <span
                key={header}
                className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 text-xs font-medium"
              >
                {header}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Estas columnas seran omitidas. Puede asignarlas manualmente en el paso de mapeo.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleConfirm}
          className="px-6 py-2.5 text-sm font-medium text-white bg-security-700 rounded-md hover:bg-security-800 transition-colors"
        >
          Confirmar Mapeo
        </button>
      </div>
    </div>
  );
}
