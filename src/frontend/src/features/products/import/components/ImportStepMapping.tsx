import { useMemo } from 'react';
import { useImportStore } from '../store/import.store';
import type { SystemField } from '../types/import.types';
import MappingLine, { SYSTEM_FIELD_LABELS } from './MappingLine';
import MappingPresetManager from './MappingPresetManager';

const REQUIRED_FIELDS: SystemField[] = ['sku'];

/** Campos que pueden completarse con un valor fijo si el archivo no trae columna. */
const FIXED_VALUE_FIELDS: SystemField[] = ['brand', 'category', 'description', 'technicalSpecs'];

const FIXED_VALUE_PLACEHOLDERS: Partial<Record<SystemField, string>> = {
  brand: 'Hikvision',
  category: 'CCTV',
  description: '...',
  technicalSpecs: '...',
};

export default function ImportStepMapping() {
  const columnMappings = useImportStore((s) => s.columnMappings);
  const updateMapping = useImportStore((s) => s.updateMapping);
  const fixedValues = useImportStore((s) => s.fixedValues);
  const setFixedValue = useImportStore((s) => s.setFixedValue);
  const preview = useImportStore((s) => s.preview);
  const nextStep = useImportStore((s) => s.nextStep);

  const allColumns = useMemo(() => {
    if (!preview) return [];
    return preview.detectedHeaders;
  }, [preview]);

  const mappingEntries = useMemo(() => {
    return allColumns.map((col) => {
      const existing = columnMappings.find((m) => m.sourceColumn === col);
      return {
        sourceColumn: col,
        targetField: existing?.targetField || '__skip',
        confidence: existing ? 1.0 : 0,
        isRequired: REQUIRED_FIELDS.includes(existing?.targetField as SystemField),
      };
    });
  }, [allColumns, columnMappings]);

  // Conteo de mapeos por tipo
  const mappingSummary = useMemo(() => {
    let mapped = 0;
    let extras = 0;
    let skipped = 0;
    for (const entry of mappingEntries) {
      if (entry.targetField === '__extra') extras++;
      else if (entry.targetField === '__skip') skipped++;
      else mapped++;
    }
    return { mapped, extras, skipped, total: mappingEntries.length };
  }, [mappingEntries]);

  const requiredMapped = useMemo(() => {
    return REQUIRED_FIELDS.every((field) =>
      columnMappings.some((m) => m.targetField === field),
    );
  }, [columnMappings]);

  const missingFields = useMemo(() => {
    return REQUIRED_FIELDS.filter(
      (f) => !columnMappings.some((m) => m.targetField === f),
    );
  }, [columnMappings]);

  /** Campos candidatos a valor fijo que NO están mapeados por ninguna columna. */
  const fixedValueFields = useMemo(() => {
    return FIXED_VALUE_FIELDS.filter(
      (f) => !columnMappings.some((m) => m.targetField === f),
    );
  }, [columnMappings]);

  /** Columnas duplicadas apuntando al mismo campo (ignora no-importar/atributo). */
  const duplicateGroups = useMemo(() => {
    const groups = new Map<SystemField, string[]>();
    for (const entry of mappingEntries) {
      if (entry.targetField === '__skip' || entry.targetField === '__extra') continue;
      const list = groups.get(entry.targetField) ?? [];
      list.push(entry.sourceColumn);
      groups.set(entry.targetField, list);
    }
    return Array.from(groups.entries())
      .filter(([, cols]) => cols.length > 1)
      .map(([field, cols]) => ({ field, cols }));
  }, [mappingEntries]);

  const handleMappingChange = (sourceColumn: string, targetField: SystemField) => {
    updateMapping(sourceColumn, targetField);
  };

  if (!preview) {
    return (
      <div className="text-center text-gray-500 py-8">
        No hay datos disponibles.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-security-900">
            Mapeo de Columnas
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Asigne cada columna del archivo a un campo del sistema.
            Las columnas sin mapeo se guardarán como atributos adicionales del proveedor.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Si el archivo no contiene columnas de Categoría o Marca, asígnales un valor fijo abajo
            (se aplicará a todos los productos y se creará si no existe).
          </p>
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Solo el SKU es obligatorio. Si una fila no trae nombre, descripción ni otros datos de identidad,
            se creará como borrador inactivo y no visible para completarla después.
          </p>
        </div>
        <MappingPresetManager />
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="inline-block w-2 h-2 rounded-full bg-security-500" />
        Campo requerido
        {!requiredMapped && (
          <span className="ml-2 text-security-600 font-medium">
            Faltan campos requeridos:{' '}
            {missingFields.map((f) => SYSTEM_FIELD_LABELS[f]).join(', ')}{' '}
            (asígnalos a una columna o usa valores fijos)
          </span>
        )}
      </div>

      {/* Resumen de mapeo */}
      <div className="flex items-center gap-4 text-xs text-gray-600 bg-gray-50 rounded-lg px-4 py-2">
        <span><strong className="text-gray-900">{mappingSummary.mapped}</strong> campos del sistema</span>
        {mappingSummary.extras > 0 && (
          <span className="text-purple-700"><strong>{mappingSummary.extras}</strong> atributos del proveedor</span>
        )}
        {mappingSummary.skipped > 0 && (
          <span><strong>{mappingSummary.skipped}</strong> no importados</span>
        )}
        <span className="ml-auto text-gray-400">{mappingSummary.total} columnas totales</span>
      </div>

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {mappingEntries.map((entry) => (
          <MappingLine
            key={entry.sourceColumn}
            sourceColumn={entry.sourceColumn}
            targetField={entry.targetField}
            confidence={entry.confidence}
            isRequired={entry.isRequired}
            onChange={handleMappingChange}
          />
        ))}
      </div>

      {/* Aviso de columnas duplicadas */}
      {duplicateGroups.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            Columnas duplicadas detectadas
          </p>
          <ul className="mt-2 space-y-1">
            {duplicateGroups.map(({ field, cols }) => (
              <li key={field} className="text-sm text-amber-800">
                Columnas duplicadas hacia <strong>{SYSTEM_FIELD_LABELS[field]}</strong>:{' '}
                {cols.map((c, i) => (i === 0 ? c : <span key={c} className="text-amber-900">, {c}</span>))}{' '}
                — solo se usará la primera; cambia las demás a "No importar" si prefieres.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Info box */}
      {mappingSummary.extras > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 text-sm text-purple-800">
          <strong>{mappingSummary.extras} columnas</strong> se guardarán como atributos adicionales del proveedor
          en el campo <code>extraAttributes</code> del producto. Estos valores son consultables
          pero no afectan el catálogo de precios canónico.
        </div>
      )}

      {/* Valores fijos para campos sin columna */}
      {fixedValueFields.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-security-900">
            Valores fijos (archivo sin columna)
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Si tu archivo no trae Marca o Categoría, escríbela aquí: se aplicará a todos los
            productos y se creará si no existe.
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fixedValueFields.map((field) => (
              <label key={field} className="block">
                <span className="block text-xs font-medium text-gray-700 mb-1">
                  {SYSTEM_FIELD_LABELS[field]}
                </span>
                <input
                  type="text"
                  value={fixedValues[field] ?? ''}
                  onChange={(e) => setFixedValue(field, e.target.value)}
                  placeholder={FIXED_VALUE_PLACEHOLDERS[field]}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary focus:border-security-500"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={nextStep}
          disabled={!requiredMapped}
          className={`
            px-6 py-2.5 text-sm font-medium rounded-md transition-colors
            ${requiredMapped
              ? 'bg-security-700 text-white hover:bg-security-800'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          Validar
        </button>
      </div>
    </div>
  );
}
