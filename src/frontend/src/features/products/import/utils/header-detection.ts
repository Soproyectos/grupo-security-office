import type { SystemField } from '../types/import.types';

const FIELD_SYNONYMS: Record<SystemField, string[]> = {
  sku: ['sku', 'código', 'codigo', 'referencia', 'ref', 'code', 'item'],
  name: ['nombre', 'name', 'producto'],
  description: ['detalle', 'observación', 'observacion', 'obs', 'notas', 'details', 'descripción', 'descripcion', 'description'],
  category: ['categoría', 'categoria', 'category', 'tipo', 'grupo', 'family', 'familia'],
  brand: ['marca', 'brand', 'fabricante', 'manufacturer', 'proveedor'],
  technicalSpecs: ['especificaciones', 'specs', 'características', 'caracteristicas'],
  price_instalador_iva: ['precio instalador con iva', 'precio instalador', 'instalador con iva', 'instalador'],
  price_tienda_iva: ['precio tienda con iva', 'precio tienda', 'tienda con iva', 'tienda'],
  price_dpp_oro_iva: ['precio dpp oro con iva', 'dpp oro con iva', 'dpp oro'],
  price_dpp_platino_iva: ['precio dpp platino con iva', 'dpp platino con iva', 'dpp platino'],
  price_cliente_final_iva: ['precio cliente final con iva', 'cliente final con iva', 'cliente final', 'precio final'],
  price_oro_sin_iva: ['oro sin iva', 'oro s/iva', 'oro'],
  price_installer_sin_iva: ['installer sin iva', 'installer s/iva', 'instalador sin iva'],
  __skip: ['unnamed', 'columna', 'obs', 'notas', '', 'nan'],
  __extra: [],
};

interface HeaderMatch {
  sourceColumn: string;
  targetField: SystemField;
  confidence: number;
  isRequired: boolean;
}

/** Normaliza un header o sinónimo: minúsculas, sin acentos y con espacios/saltos colapsados. */
function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectHeaderMappings(headers: string[]): {
  suggestedMappings: HeaderMatch[];
  unmappedHeaders: string[];
} {
  const suggestedMappings: HeaderMatch[] = [];
  const unmappedHeaders: string[] = [];

  for (const header of headers) {
    const normalizedHeader = normalizeHeader(header);

    let bestMatch: { field: SystemField; confidence: number } | null = null;

    for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
      for (const synonym of synonyms) {
        const normalizedSynonym = normalizeHeader(synonym);

        let confidence = 0;
        if (normalizedHeader === normalizedSynonym) confidence = 1.0;
        else if (normalizedHeader.includes(normalizedSynonym)) confidence = 0.9;
        else if (normalizedSynonym.includes(normalizedHeader)) confidence = 0.8;

        if (confidence > 0 && (!bestMatch || confidence > bestMatch.confidence)) {
          bestMatch = { field: field as SystemField, confidence };
        }
      }
    }

    if (bestMatch && bestMatch.confidence >= 0.5) {
      suggestedMappings.push({
        sourceColumn: header,
        targetField: bestMatch.field,
        confidence: bestMatch.confidence,
        isRequired: ['sku'].includes(bestMatch.field),
      });
    } else {
      unmappedHeaders.push(header);
    }
  }

  // Fallback de negocio: si no hay columna mapeada a "name" pero existe una mapeada a
  // "description" cuyo header (normalizado, sin acentos) contiene "descripcion"/"desc",
  // esa columna es el nombre del producto (ej: archivos Hikvision con columna DESCRIPCIÓN).
  const hasNameMapping = suggestedMappings.some((m) => m.targetField === 'name');
  if (!hasNameMapping) {
    const descriptionMapping = suggestedMappings.find((m) => {
      if (m.targetField !== 'description') return false;
      return /(descripcion|desc)/.test(normalizeHeader(m.sourceColumn));
    });
    if (descriptionMapping) {
      descriptionMapping.targetField = 'name';
      descriptionMapping.isRequired = false;
    }
  }

  return { suggestedMappings, unmappedHeaders };
}
