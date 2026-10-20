import { Injectable } from '@nestjs/common';
import {
  ColumnMapping,
  ColumnMappingEntry,
  SystemField,
  MappingPreset,
} from '../interfaces/column-mapping';
import { HeaderDetectionResult } from '../interfaces/column-mapping';

/**
 * Servicio de mapeo de columnas.
 *
 * Responsabilidades:
 * - Aplicar mapping automático del HeaderDetector
 * - Permitir ajustes manuales del usuario
 * - Validar que el SKU esté mapeado
 * - Gestionar presets de mapping guardados
 */
@Injectable()
export class ColumnMapperService {
  /**
   * Crea un mapping inicial basado en la detección automática.
   * El mapping queda en estado "no confirmado" para que el usuario lo revise.
   *
   * Reglas:
   * - Headers con match conocido → su campo del sistema
   * - Si múltiples columnas matchean el MISMO campo, solo la primera se mapea;
   *   las demás se marcan como __extra (para evitar sobreescribir datos)
   * - Headers sin match → __extra
   */
  createFromDetection(detection: HeaderDetectionResult): ColumnMapping {
    const entries: ColumnMappingEntry[] = [];
    const usedFields = new Set<SystemField>();

    // Agregar mapeos automáticos conocidos
    for (const m of detection.suggestedMappings) {
      if (usedFields.has(m.targetField)) {
        // Campo ya mapeado por otra columna → marcar como __extra
        entries.push({
          sourceColumn: m.sourceColumn,
          targetField: '__extra',
          isRequired: false,
          confidence: 0,
        });
      } else {
        entries.push({
          sourceColumn: m.sourceColumn,
          targetField: m.targetField,
          isRequired: m.isRequired,
          confidence: m.confidence,
        });
        usedFields.add(m.targetField);
      }
    }

    // Agregar headers sin match como __extra
    for (const unmapped of detection.unmappedHeaders) {
      const alreadyMapped = entries.some((e) => e.sourceColumn === unmapped);
      if (!alreadyMapped) {
        entries.push({
          sourceColumn: unmapped,
          targetField: '__extra',
          isRequired: false,
          confidence: 0,
        });
      }
    }

    return {
      entries,
      confirmed: false,
    };
  }

  /**
   * Actualiza un mapping con ajustes manuales del usuario.
   * Retorna el mapping actualizado con confirmed = true.
   */
  confirmMapping(
    currentMapping: ColumnMapping,
    manualOverrides: Array<{ sourceColumn: string; targetField: SystemField }>,
  ): ColumnMapping {
    // Crear mapa de overrides por sourceColumn (no por targetField)
    // para soportar múltiples columnas → __extra
    const overrideBySource = new Map<string, SystemField>();
    for (const override of manualOverrides) {
      overrideBySource.set(override.sourceColumn, override.targetField);
    }

    // Reconstruir entries con overrides aplicados
    const entries: ColumnMappingEntry[] = [];

    for (const entry of currentMapping.entries) {
      const override = overrideBySource.get(entry.sourceColumn);

      if (override !== undefined) {
        // Aplicar override del usuario
        entries.push({
          sourceColumn: entry.sourceColumn,
          targetField: override,
          isRequired: ['sku'].includes(override),
          confidence: override === entry.targetField ? entry.confidence : 1.0,
        });
      } else {
        // Mantener el mapping original
        entries.push(entry);
      }
    }

    return {
      entries,
      confirmed: true,
    };
  }

  /**
   * Valida que el mapping tenga todos los campos requeridos.
   * Retorna lista de campos faltantes.
   */
  validateMapping(mapping: ColumnMapping): string[] {
    const missingFields: string[] = [];
    const hasField = (field: SystemField) =>
      mapping.entries.some((e) => e.targetField === field);

    if (!hasField('sku')) {
      missingFields.push('sku');
    }
    // Nombre y descripción son opcionales: una fila que solo trae SKU se
    // crea como borrador pendiente de enriquecimiento. El normalizador usa el
    // SKU como nombre provisional y el ejecutor evita publicarlo.

    return missingFields;
  }

  /**
   * Aplica un mapping a una fila de datos crudos.
   * Extrae y retorna los valores mapeados.
   */
  applyMapping(
    rawRow: Record<string, unknown>,
    mapping: ColumnMapping,
  ): Record<SystemField, unknown> {
    const result = {} as Record<SystemField, unknown>;

    for (const entry of mapping.entries) {
      if (entry.targetField === '__skip') continue;
      result[entry.targetField] = rawRow[entry.sourceColumn] ?? null;
    }

    return result;
  }

  /**
   * Convierte un preset guardado a un mapping funcional.
   */
  applyPreset(
    preset: MappingPreset,
    availableHeaders: string[],
  ): ColumnMapping | null {
    // Verificar que todas las columnas del preset existan en el archivo
    const missingColumns = preset.mappings.filter(
      (m) => !availableHeaders.includes(m.sourceColumn),
    );

    if (missingColumns.length > 0) {
      return null; // El preset no es compatible con este archivo
    }

    return {
      entries: preset.mappings.map((m) => ({
        sourceColumn: m.sourceColumn,
        targetField: m.targetField,
        isRequired: ['sku'].includes(m.targetField),
        confidence: 1.0,
      })),
      confirmed: true,
    };
  }

  /**
   * Convierte un mapping funcional a formato de preset para guardar.
   */
  toPreset(
    mapping: ColumnMapping,
    name: string,
    userId: string,
    isDefault = false,
  ): Omit<MappingPreset, 'id' | 'createdAt'> {
    return {
      name,
      mappings: mapping.entries.map((e) => ({
        sourceColumn: e.sourceColumn,
        targetField: e.targetField,
      })),
      userId,
      isDefault,
    };
  }
}
