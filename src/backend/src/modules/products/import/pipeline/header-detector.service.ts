import { Injectable } from '@nestjs/common';
import {
  HeaderDetectionConfig,
  HeaderDetectionResult,
  ColumnMappingEntry,
  SystemField,
} from '../interfaces/column-mapping';
import { RawRow } from '../interfaces/import-source.adapter';

/**
 * Patrones conocidos de columnas del sistema → sinónimos en archivos de proveedores.
 * Orden: más específico primero.
 * NOTA: todos los sinónimos están en minúsculas y sin acentos.
 * El normalizador les aplica NFD + strip accents + toLowerCase automáticamente.
 */
const FIELD_SYNONYMS: Record<SystemField, string[]> = {
  sku: ['sku', 'codigo', 'referencia', 'ref', 'code', 'item', 'part number', 'part_number'],
  name: ['nombre', 'name', 'producto', 'producto/servicio'],
  description: ['detalle', 'observacion', 'obs', 'notas', 'details', 'specs', 'descripcion', 'description'],
  category: ['categoria', 'category', 'tipo', 'grupo', 'family', 'familia'],
  brand: ['marca', 'brand', 'fabricante', 'manufacturer', 'proveedor'],
  technicalSpecs: ['especificaciones', 'specs', 'caracteristicas', 'tech specs'],
  price_instalador_iva: [
    'precio instalador con iva',
    'precio instalador',
    'instalador con iva',
    'instalador iva',
    'instalador',
    'installer iva',
    'installer',
    'precio installer con iva',
  ],
  price_tienda_iva: [
    'precio tienda con iva',
    'precio tienda',
    'tienda con iva',
    'tienda iva',
    'tienda',
    'retail iva',
    'retail',
  ],
  price_dpp_oro_iva: [
    'precio dpp oro con iva',
    'dpp oro con iva',
    'dpp oro',
    'dpp gold',
    'oro iva',
    'preci dpp oro con iva',  // typo real de Hikvision
    'preci dpp oro',          // typo real de Hikvision
  ],
  price_dpp_platino_iva: [
    'precio dpp platino con iva',
    'dpp platino con iva',
    'dpp platino',
    'dpp platinum',
    'platino iva',
  ],
  price_cliente_final_iva: [
    'precio cliente final con iva',
    'cliente final con iva',
    'cliente final',
    'precio final',
    'final iva',
    'consumer iva',
    'consumer',
    'precio publico',
    'publico',
  ],
  price_oro_sin_iva: [
    'oro sin iva',
    'oro s/iva',
    'oro',
    'gold sin iva',
    'gold',
  ],
  price_installer_sin_iva: [
    'installer sin iva',
    'installer s/iva',
    'instalador sin iva',
    'instalador s/iva',
  ],
  __skip: [
    'unnamed',
    'columna',
    'obs',
    'notas',
    '',
    'nan',
  ],
  __extra: [], // nunca se matchea directamente; es el fallback
};

/**
 * Servicio de detección automática de headers.
 *
 * Detecta la fila de headers en el archivo, sugiere mappings a campos
 * del sistema usando fuzzy matching con sinónimos conocidos,
 * y reporta headers no mapeados.
 */
@Injectable()
export class HeaderDetectorService {
  /**
   * Detecta headers y sugiere mappings automáticos.
   *
   * @param headers - Lista de headers encontrados en el archivo
   * @param sampleRows - Filas de muestra para validar que los campos contienen datos esperados
   * @param config - Configuración de detección
   */
  detect(
    headers: string[],
    sampleRows: RawRow[],
    config?: Partial<HeaderDetectionConfig>,
  ): HeaderDetectionResult {
    const confidenceThreshold = config?.confidenceThreshold ?? 0.5;

    // NUEVO: sanitizar headers (colapsar newlines y whitespace)
    const sanitizedHeaders = this.sanitizeHeaders(headers);

    // NUEVO: auto-detectar la mejor fila de headers
    const bestHeaderRowIndex = this.findBestHeaderRow(sanitizedHeaders, sampleRows);

    const suggestedMappings: ColumnMappingEntry[] = [];
    const unmappedHeaders: string[] = [];
    let totalConfidence = 0;
    let mappedCount = 0;

    for (const header of sanitizedHeaders) {
      // NUEVO: saltar headers que son basura de SheetJS
      if (this.isGarbageHeader(header)) {
        unmappedHeaders.push(header);
        continue;
      }

      const mapping = this.matchHeader(header, sampleRows);

      if (mapping && mapping.confidence >= confidenceThreshold) {
        suggestedMappings.push(mapping);
        totalConfidence += mapping.confidence;
        mappedCount++;
      } else {
        // NUEVO: headers sin match se marcan como __extra en vez de solo unmapped
        unmappedHeaders.push(header);
      }
    }

    const overallConfidence = mappedCount > 0 ? totalConfidence / mappedCount : 0;

    return {
      headers: sanitizedHeaders,
      headerRowIndex: bestHeaderRowIndex,
      suggestedMappings,
      unmappedHeaders,
      overallConfidence,
    };
  }

  /**
   * NUEVO: Limpia headers de artefactos comunes de Excel/SheetJS.
   * - Colapsa newlines en espacio
   * - Colapsa múltiples espacios
   * - Trim
   */
  private sanitizeHeaders(headers: string[]): string[] {
    return headers.map((h) =>
      h
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }

  /**
   * NUEVO: Detecta basura de SheetJS que no debe ser ni mapeada.
   */
  private isGarbageHeader(header: string): boolean {
    const lower = header.toLowerCase().trim();
    // Patrones de basura de SheetJS para celdas vacías
    if (lower.startsWith('__empty')) return true;
    if (lower === '') return true;
    if (lower === 'nan') return true;
    if (lower === 'undefined') return true;
    if (lower === 'null') return true;
    return false;
  }

  /**
   * NUEVO: Busca la mejor fila de headers entre las primeras filas del archivo.
   * Retorna el índice de la fila con más matches contra sinónimos conocidos.
   */
  private findBestHeaderRow(
    headers: string[],
    sampleRows: RawRow[],
  ): number {
    let bestRow = 0;
    let bestScore = 0;

    // Evaluar la fila 0 (headers tal cual) + las primeras 5 filas de datos
    const candidates = [headers]; // índice 0 = fila 0
    for (let i = 0; i < Math.min(5, sampleRows.length); i++) {
      const rowKeys = Object.keys(sampleRows[i]);
      candidates.push(rowKeys);
    }

    for (let i = 0; i < candidates.length; i++) {
      const score = this.countKnownMatches(candidates[i]);
      if (score > bestScore) {
        bestScore = score;
        bestRow = i;
      }
    }

    return bestRow;
  }

  /**
   * NUEVO: Cuenta cuántos headers matchean con sinónimos conocidos.
   */
  private countKnownMatches(headers: string[]): number {
    let count = 0;
    for (const header of headers) {
      if (this.isGarbageHeader(header)) continue;
      const mapping = this.matchHeader(header, []);
      if (mapping && mapping.confidence >= 0.5) count++;
    }
    return count;
  }

  /**
   * Intenta hacer match de un header con un campo del sistema.
   * Retorna el mapping con su nivel de confianza.
   */
  private matchHeader(
    header: string,
    sampleRows: RawRow[],
  ): ColumnMappingEntry | null {
    const normalizedHeader = header
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\n/g, ' ')           // strips embedded newlines
      .replace(/\s+/g, ' ')          // collapses whitespace
      .trim();

    // Skip empty or too-short headers
    if (normalizedHeader.length < 2) return null;

    let bestMatch: { field: SystemField; confidence: number } | null = null;

    for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS) as [SystemField, string[]][]) {
      // Saltar campos sin sinónimos
      if (field === '__extra' || synonyms.length === 0) continue;

      const confidence = this.calculateMatchConfidence(normalizedHeader, synonyms);

      if (confidence > 0 && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = { field, confidence };
      }
    }

    if (!bestMatch) return null;

    // Bonus por datos de muestra: si la columna contiene datos numéricos para precios
    if (bestMatch.field.startsWith('price_') && sampleRows.length > 0) {
      const hasNumericData = sampleRows.some((row) => {
        const val = row[header];
        return val !== null && val !== undefined && !isNaN(Number(String(val).replace(/[$.,\s]/g, '')));
      });
      if (hasNumericData) {
        bestMatch.confidence = Math.min(1, bestMatch.confidence + 0.2);
      }
    }

    // Solo SKU es requerido; nombre, categoría y marca pueden completarse
    // después del cargue y categoría/marca tienen defaults de importación.
    const isRequired = ['sku'].includes(bestMatch.field);

    return {
      sourceColumn: header,
      targetField: bestMatch.field,
      isRequired,
      confidence: bestMatch.confidence,
    };
  }

  /**
   * Calcula el nivel de confianza de match entre un header normalizado
   * y una lista de sinónimos.
   *
   * Estrategia:
   * - Match exacto → 1.0
   * - El header contiene el sinónimo → 0.9
   * - El sinónimo contiene el header → 0.8
   * - Match parcial (Levenshtein distante ≤ 2) → 0.6
   * - Sin match → 0
   */
  private calculateMatchConfidence(header: string, synonyms: string[]): number {
    for (const synonym of synonyms) {
      const normalizedSynonym = synonym
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

      // Skip empty or too-short synonyms to avoid false positives
      if (normalizedSynonym.length < 2) continue;

      // Match exacto
      if (header === normalizedSynonym) return 1.0;

      // Header contiene el sinónimo
      if (header.includes(normalizedSynonym)) return 0.9;

      // Sinónimo contiene el header
      if (normalizedSynonym.includes(header)) return 0.8;
    }

    // Levenshtein distance para fuzzy matching
    for (const synonym of synonyms) {
      const normalizedSynonym = synonym
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

      const distance = this.levenshteinDistance(header, normalizedSynonym);
      const maxLen = Math.max(header.length, normalizedSynonym.length);

      if (maxLen > 0 && distance <= 2 && distance / maxLen < 0.3) {
        return 0.6;
      }
    }

    return 0;
  }

  /**
   * Calcula la distancia de Levenshtein entre dos strings.
   */
  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }
}
