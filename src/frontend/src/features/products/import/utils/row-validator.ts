import type { SystemField, ColumnMappingEntry } from '../types/import.types';

export interface ClientValidationError {
  field: string;
  code: string;
  message: string;
}

export function validateRowClient(
  rawRow: Record<string, unknown>,
  mappings: ColumnMappingEntry[],
  seenSkus: Map<string, number>,
  rowIndex: number,
): ClientValidationError[] {
  const errors: ClientValidationError[] = [];

  const getValue = (field: SystemField): unknown => {
    const entry = mappings.find(m => m.targetField === field);
    if (!entry) return null;
    return rawRow[entry.sourceColumn] ?? null;
  };

  const skuValue = getValue('sku');
  const sku = skuValue ? String(skuValue).trim().toUpperCase() : '';

  if (!sku) {
    errors.push({ field: 'sku', code: 'SKU_REQUIRED', message: 'El SKU es requerido' });
  } else {
    const existingRow = seenSkus.get(sku);
    if (existingRow !== undefined) {
      errors.push({ field: 'sku', code: 'SKU_DUPLICATE', message: `SKU duplicado en fila ${existingRow + 2}` });
    } else {
      seenSkus.set(sku, rowIndex);
    }
  }

  // Nombre, categoría y marca son opcionales. El backend crea SKU-only como
  // borrador pendiente y resuelve defaults para categoría/marca.

  return errors;
}
