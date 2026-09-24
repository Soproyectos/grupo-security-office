import { Injectable } from '@nestjs/common';
import {
  ValidatedRow,
  ValidationError,
  ImportContext,
} from '../interfaces/import-context';
import { SystemField, ColumnMapping } from '../interfaces/column-mapping';
import { RawRow } from '../interfaces/import-source.adapter';
import { resolveEffectiveName, normalizeSku, PRODUCT_NAME_MAX_LENGTH } from '../helpers/text-normalizer';

/**
 * Servicio de validación de filas de importación.
 *
 * Valida cada fila contra reglas de negocio antes de la normalización.
 * No modifica datos — solo reporta errores y warnings.
 *
 * Reglas de validación:
 * - SKU: requerido, string no vacío, sin espacios
 * - Nombre: requerido, string no vacío
 * - Categoría: opcional (se usa "Sin categoría" como default si falta)
 * - Marca: opcional (se usa "Sin marca" como default si falta)
 * - Precios: si están presentes, deben ser numéricos positivos
 * - SKU duplicado dentro del archivo
 */
@Injectable()
export class RowValidatorService {
  /**
   * Valida todas las filas del contexto y retorna resultados.
   */
  validateAll(ctx: ImportContext): ValidatedRow[] {
    const seenSkus = new Map<string, number>(); // sku → primer rowIndex
    const results: ValidatedRow[] = [];

    for (const validatedRow of ctx.validatedRows.length > 0
      ? ctx.validatedRows
      : ctx.rawRows.map((raw, index) => ({ rowIndex: index, rawData: raw, isValid: true, errors: [], warnings: [] }))) {

      // Solo re-validar si no tiene errores previos (optimización)
      if (validatedRow.errors.length === 0) {
        const newErrors = this.validateRow(
          validatedRow.rawData,
          ctx.columnMapping,
          seenSkus,
          validatedRow.rowIndex,
        );

        validatedRow.errors = newErrors;
        validatedRow.isValid = newErrors.length === 0;
      }

      results.push(validatedRow);
    }

    return results;
  }

  /**
   * Valida una fila individual contra las reglas de negocio.
   */
  validateRow(
    rawRow: RawRow,
    mapping: ColumnMapping,
    seenSkus: Map<string, number>,
    rowIndex: number,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Obtener valor de cada campo mapeado
    const getFieldValue = (field: SystemField): unknown => {
      const entry = mapping.entries.find((e) => e.targetField === field);
      if (!entry) return null;
      return rawRow[entry.sourceColumn] ?? null;
    };

    // === Validar SKU ===
    const skuValue = getFieldValue('sku');
    const sku = this.normalizeString(skuValue);

    if (!sku) {
      errors.push({
        field: 'sku',
        code: 'SKU_REQUIRED',
        message: 'El SKU es requerido',
      });
    } else {
      // Verificar SKU duplicado dentro del archivo. La clave de comparación usa
      // normalizeSku (mayúsculas, sin espacios) — la MISMA normalización que
      // BatchExecutorService aplica antes de persistir. Comparar el valor crudo
      // (como antes) deja pasar SKUs que solo difieren en mayúsculas/espacios;
      // esas filas colisionan igual en la base de datos, y un choque real de
      // restricción única en medio de un lote aborta la transacción de Postgres
      // completa (todas las filas restantes del lote fallan en cascada, incluso
      // filas válidas no relacionadas).
      const dedupeKey = normalizeSku(sku);
      const existingRowIndex = seenSkus.get(dedupeKey);
      if (existingRowIndex !== undefined) {
        errors.push({
          field: 'sku',
          code: 'SKU_DUPLICATE',
          message: `SKU duplicado en fila ${existingRowIndex + 2} (esta fila: ${rowIndex + 2})`,
        });
      } else {
        seenSkus.set(dedupeKey, rowIndex);
      }

      // Verificar longitud
      if (sku.length > 100) {
        errors.push({
          field: 'sku',
          code: 'SKU_TOO_LONG',
          message: 'El SKU no puede tener más de 100 caracteres',
        });
      }
    }

    // === Validar Nombre ===
    // Un nombre explícito no es la única fuente válida: si la columna de nombre
    // no viene mapeada o está vacía, RowNormalizerService deriva un nombre breve
    // desde la descripción (ver resolveEffectiveName). Y si tampoco hay
    // descripción (listas de proveedor que solo traen SKU/referencia y precio),
    // RowNormalizerService usa el SKU como nombre provisional — por eso ya no
    // se rechaza la fila aquí: bloquearla dejaba sin actualizar el precio de
    // productos que ya existían en el catálogo solo por no traer nombre.
    const nameValue = getFieldValue('name');
    const descriptionValue = getFieldValue('description');
    const name = resolveEffectiveName(nameValue, descriptionValue);

    // Presupuesto de vitrina (ADR-002): el tope pasó de 500 a 70 caracteres.
    // En el camino estándar este guard es defensivo y nunca debe dispararse:
    // resolveEffectiveName ya trunca al presupuesto (nunca se RECHAZA una
    // fila por longitud — el rechazo dejaría sin refrescar el precio de
    // productos con identidad bloqueada). Solo atraparía un camino que
    // bypasseara la normalización.
    if (name && name.length > PRODUCT_NAME_MAX_LENGTH) {
      errors.push({
        field: 'name',
        code: 'NAME_TOO_LONG',
        message: `El nombre no puede tener más de ${PRODUCT_NAME_MAX_LENGTH} caracteres`,
      });
    }

    // === Validar Categoría ===
    // Categoría es OPCIONAL en importación.
    // Si no está mapeada o está vacía, se usará "Sin categoría" como default.
    const categoryValue = getFieldValue('category');
    const category = this.normalizeString(categoryValue);

    if (category && category.length > 200) {
      errors.push({
        field: 'category',
        code: 'CATEGORY_TOO_LONG',
        message: 'La categoría no puede tener más de 200 caracteres',
      });
    }

    // === Validar Marca ===
    // Marca es OPCIONAL en importación.
    // Si no está mapeada o está vacía, se usará "Sin marca" como default.
    const brandValue = getFieldValue('brand');
    const brand = this.normalizeString(brandValue);

    if (brand && brand.length > 200) {
      errors.push({
        field: 'brand',
        code: 'BRAND_TOO_LONG',
        message: 'La marca no puede tener más de 200 caracteres',
      });
    }

    // === Validar Precios (si están mapeados) ===
    const priceFields: SystemField[] = [
      'price_instalador_iva',
      'price_tienda_iva',
      'price_dpp_oro_iva',
      'price_dpp_platino_iva',
      'price_cliente_final_iva',
      'price_oro_sin_iva',
      'price_installer_sin_iva',
    ];

    for (const priceField of priceFields) {
      const priceValue = getFieldValue(priceField);
      if (priceValue !== null && priceValue !== undefined && priceValue !== '') {
        const parsed = this.parseNumeric(priceValue);
        if (parsed === null) {
          errors.push({
            field: priceField,
            code: 'PRICE_INVALID',
            message: `Precio inválido: "${priceValue}" no es un número válido`,
          });
        } else if (parsed < 0) {
          errors.push({
            field: priceField,
            code: 'PRICE_NEGATIVE',
            message: `El precio no puede ser negativo: ${parsed}`,
          });
        } else if (parsed > 999999999) {
          errors.push({
            field: priceField,
            code: 'PRICE_TOO_HIGH',
            message: 'El precio excede el valor máximo permitido',
          });
        }
      }
    }

    return errors;
  }

  /**
   * Normaliza un valor a string limpio.
   * Retorna null si el valor es vacío/nulo.
   */
  private normalizeString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    return str.length > 0 ? str : null;
  }

  /**
   * Parsea un valor numérico (formato colombiano o internacional).
   */
  private parseNumeric(value: unknown): number | null {
    if (typeof value === 'number') return isNaN(value) ? null : value;

    let str = String(value).trim();
    if (!str) return null;

    // Remover símbolos de moneda
    str = str.replace(/[\s$€£COPUSD]/gi, '');

    // Detectar formato
    const hasDot = str.includes('.');
    const hasComma = str.includes(',');

    if (hasDot && hasComma) {
      const lastDotIndex = str.lastIndexOf('.');
      const lastCommaIndex = str.lastIndexOf(',');
      if (lastDotIndex > lastCommaIndex) {
        str = str.replace(/,/g, '');
      } else {
        str = str.replace(/\./g, '').replace(',', '.');
      }
    } else if (hasComma) {
      const parts = str.split(',');
      const lastPart = parts[parts.length - 1];
      if (lastPart.length <= 2 && parts.length === 2) {
        str = str.replace(',', '.');
      } else {
        str = str.replace(/,/g, '');
      }
    } else if (hasDot) {
      const parts = str.split('.');
      const lastPart = parts[parts.length - 1];
      if (lastPart.length === 3 && parts.length > 1) {
        str = str.replace(/\./g, '');
      }
    }

    const result = parseFloat(str);
    return isNaN(result) ? null : result;
  }
}
