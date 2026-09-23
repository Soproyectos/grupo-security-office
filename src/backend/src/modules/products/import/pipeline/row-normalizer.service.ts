import { Injectable } from '@nestjs/common';
import {
  NormalizedRow,
  PriceEntry,
  ValidatedRow,
  ImportContext,
  IvaMode,
} from '../interfaces/import-context';
import { SystemField, ColumnMapping } from '../interfaces/column-mapping';
import { RawRow } from '../interfaces/import-source.adapter';
import {
  normalizeSku,
  normalizeCategoryName,
  normalizeBrandName,
  normalizeDescription,
  resolveEffectiveName,
  truncateProductName,
} from '../helpers/text-normalizer';
import { parseNumericValue } from '../helpers/numeric-parser';

/**
 * Mapeo de campos de precio a códigos de lista de precios.
 */
const PRICE_FIELD_MAP: Record<string, { code: string; name: string; ivaMode: IvaMode }> = {
  price_instalador_iva: { code: 'INSTALADOR_IVA', name: 'Instalador (con IVA)', ivaMode: 'with_iva' },
  price_tienda_iva: { code: 'TIENDA_IVA', name: 'Tienda (con IVA)', ivaMode: 'with_iva' },
  price_dpp_oro_iva: { code: 'DPP_ORO_IVA', name: 'DPP Oro (con IVA)', ivaMode: 'with_iva' },
  price_dpp_platino_iva: { code: 'DPP_PLATINO_IVA', name: 'DPP Platino (con IVA)', ivaMode: 'with_iva' },
  price_cliente_final_iva: { code: 'CLIENTE_FINAL_IVA', name: 'Cliente Final (con IVA)', ivaMode: 'with_iva' },
  price_oro_sin_iva: { code: 'ORO_SIN_IVA', name: 'Oro (sin IVA)', ivaMode: 'without_iva' },
  price_installer_sin_iva: { code: 'INSTALLER_SIN_IVA', name: 'Installer (sin IVA)', ivaMode: 'without_iva' },
};

/**
 * Servicio de normalización de filas.
 *
 * Toma filas validadas y las convierte en objetos NormalizedRow
 * listos para inserción en base de datos.
 *
 * Responsabilidades:
 * - Normalizar texto (trim, capitalización, Unicode)
 * - Parsear precios a números
 * - Detectar si es actualización (SKU existente)
 * - Resolver categorías y marcas a IDs (en batch execution)
 */
@Injectable()
export class RowNormalizerService {
  /**
   * Normaliza todas las filas validadas del contexto.
   * Solo procesa filas válidas (isValid = true).
   */
  normalizeAll(ctx: ImportContext): NormalizedRow[] {
    return ctx.validatedRows
      .filter((row) => row.isValid)
      .map((row) => this.normalizeRow(row, ctx));
  }

  /**
   * Normaliza una fila individual.
   */
  normalizeRow(validatedRow: ValidatedRow, ctx: ImportContext): NormalizedRow {
    const raw = validatedRow.rawData;
    const mapping = ctx.columnMapping;
    const fixedValues = ctx.fixedValues;

    // Extraer valores mapeados.
    // Prioridad: valor de columna mapeada (no vacío) > fixedValue > null.
    const getValue = (field: SystemField): unknown =>
      this.resolveFieldValue(raw, mapping, fixedValues, field).value;

    // Normalizar campos de texto.
    // SKU/referencia: permanece EXCLUSIVAMENTE en `sku`; nunca se concatena a `name`.
    const sku = normalizeSku(getValue('sku'));

    // rawName: SOLO la columna de nombre explícita. Si está vacía/ausente, no se usa.
    const rawName = getValue('name');
    // rawDescription: fuente íntegra de `description`.
    const rawDescription = getValue('description');

    // name: prevalece el nombre explícito (solo normalización de espacios). Si no hay
    // nombre útil y sí hay descripción con texto útil, se deriva un nombre breve desde
    // la descripción (evita que una descripción extensa supere la validación de name).
    // Ambos caminos nacen ya truncados al presupuesto de vitrina (≤70, ADR-002).
    const effectiveName = resolveEffectiveName(rawName, rawDescription);
    // Último recurso: listas de proveedor que solo traen SKU/referencia y precio,
    // sin nombre ni descripción. Se usa el SKU como nombre provisional para no
    // perder el producto/precio, marcando `nameIsFallback` para que
    // BatchExecutorService NUNCA sobrescriba con esto un nombre real que el
    // producto ya tenga en catálogo (solo se usa al CREAR productos nuevos).
    const nameIsFallback = !effectiveName;
    const name = effectiveName || truncateProductName(sku);
    // description: se conserva completa, normalizando espacios (no se reemplaza por name).
    const description = normalizeDescription(rawDescription);

    // brand/category: si el valor proviene de fixedValues se aplica tal cual
    // (es un valor final del usuario y no debe re-capitalizarse con capitalizeFirst,
    // que degradaría acrónimos como "CCTV" → "Cctv").
    const categoryValue = this.resolveFieldValue(raw, mapping, fixedValues, 'category');
    const brandValue = this.resolveFieldValue(raw, mapping, fixedValues, 'brand');
    const categoryName = categoryValue.fromFixed
      ? String(categoryValue.value).trim()
      : normalizeCategoryName(categoryValue.value);
    const brandName = brandValue.fromFixed
      ? String(brandValue.value).trim()
      : normalizeBrandName(brandValue.value);

    // Inferir marca/categoría cuando no vienen mapeadas en columnas
    const inference = this.inferCategoryAndBrand({
      sku,
      name,
      mappedCategoryName: categoryName,
      mappedBrandName: brandName,
    });

    // Normalizar precios
    const prices = this.normalizePrices(getValue, mapping.entries);

    // Normalizar specs técnicas
    const technicalSpecs = this.normalizeSpecs(getValue('technicalSpecs'));

    // NUEVO: Recolectar atributos extra (columnas mapeadas a __extra)
    const extraAttributes = this.normalizeExtras(raw, mapping.entries);

    // Detectar si el SKU ya existe (se resolverá en batch execution)
    const isUpdate = false; // Se resolve en batch executor
    const existingProductId = undefined; // Se resolve en batch executor

    return {
      rowIndex: validatedRow.rowIndex,
      sku,
      name,
      nameIsFallback,
      description: description || undefined,
      categoryName: inference.categoryName,
      brandName: inference.brandName,
      categoryInferredSlug: inference.categoryInferredSlug,
      brandInferredSlug: inference.brandInferredSlug,
      prices,
      technicalSpecs,
      extraAttributes,
      isUpdate,
      existingProductId,
    };
  }

  /**
   * Resuelve el valor efectivo de un campo para una fila.
   *
   * Prioridad: valor de columna mapeada (no vacío) > fixedValue > null.
   * `fromFixed: true` indica que el valor proviene de `ctx.fixedValues` y debe
   * tratarse como un valor final del usuario (sin re-normalización destructiva).
   */
  private resolveFieldValue(
    raw: RawRow,
    mapping: ColumnMapping,
    fixedValues: ImportContext['fixedValues'],
    field: SystemField,
  ): { value: unknown; fromFixed: boolean } {
    const entry = mapping.entries.find((e) => e.targetField === field);
    const rawValue = entry ? raw[entry.sourceColumn] : null;

    const isEmpty =
      rawValue === null || rawValue === undefined || rawValue === '';

    if (isEmpty) {
      const fixed = fixedValues?.[field];
      if (fixed !== undefined) {
        return { value: fixed, fromFixed: true };
      }
    }

    return { value: rawValue, fromFixed: false };
  }

  /**
   * Extrae y normaliza todos los precios de una fila.
   */
  private normalizePrices(
    getValue: (field: SystemField) => unknown,
    _entries: Array<{ targetField: SystemField }>,
  ): PriceEntry[] {
    const prices: PriceEntry[] = [];

    for (const [field, config] of Object.entries(PRICE_FIELD_MAP)) {
      const rawValue = getValue(field as SystemField);
      if (rawValue === null || rawValue === undefined || rawValue === '') continue;

      const numericValue = parseNumericValue(rawValue);
      if (numericValue === null) continue;

      // Solo incluir precios con valor > 0
      if (numericValue <= 0) continue;

      prices.push({
        priceListCode: config.code,
        priceListName: config.name,
        value: numericValue,
        ivaMode: config.ivaMode,
        currency: 'COP',
      });
    }

    return prices;
  }

  /**
   * Intenta parsear specs técnicas desde un valor crudo.
   * Si ya es un objeto, lo retorna tal cual.
   * Si es un string JSON válido, lo parsea.
   * Si no, retorna undefined.
   */
  private normalizeSpecs(
    value: unknown,
  ): Record<string, unknown> | undefined {
    if (!value) return undefined;

    if (typeof value === 'object' && value !== null) {
      return value as Record<string, unknown>;
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed;
        }
      } catch {
        // No es JSON válido, ignorar
      }
    }

    return undefined;
  }

  /**
   * NUEVO: Recolecta columnas mapeadas a __extra y las normaliza
   * en un objeto plano de atributos del proveedor.
   *
   * Reglas:
   * - Solo valores primitivos (string, number, boolean)
   * - Keys normalizadas a UPPER_SNAKE_CASE
   * - Máximo 50 entradas
   * - Se ignora vacío/null/undefined
   */
  private normalizeExtras(
    raw: RawRow,
    entries: Array<{ sourceColumn: string; targetField: SystemField }>,
  ): Record<string, string | number | boolean> | undefined {
    const extras: Record<string, string | number | boolean> = {};
    const MAX_EXTRAS = 50;
    let count = 0;

    for (const entry of entries) {
      if (entry.targetField !== '__extra') continue;
      if (count >= MAX_EXTRAS) break;

      const value = raw[entry.sourceColumn];
      if (value === null || value === undefined || value === '') continue;

      // Normalizar key: UPPER_SNAKE_CASE, solo alfanuméricos y guiones bajos
      const key = entry.sourceColumn
        .trim()
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .toUpperCase();

      if (!key) continue;

      // Normalizar valor a primitivo
      const numericParsed = parseNumericValue(String(value));
      if (numericParsed !== null && numericParsed > 0) {
        extras[key] = numericParsed;
      } else {
        const str = String(value).trim();
        if (str) {
          extras[key] = str;
        }
      }
      count++;
    }

    return Object.keys(extras).length > 0 ? extras : undefined;
  }

  /**
   * Inferencia de marca y categoría cuando las columnas mapeadas llegan vacías.
   *
   * - Marca: SKUs DS-/IDS- o nombres con "hikvision" → slug existente `hikvision`.
   * - Categoría: keywords sobre nombre/SKU contra categorías existentes
   *   (slugs: control-de-acceso, alarmas, smart-home, nvr, cctv, camaras-ip).
   *
   * La resolución final a IDs se hace en batch execution SOLO contra
   * categorías/marcas existentes; si el slug no existe, se cae al default.
   */
  private inferCategoryAndBrand(params: {
    sku: string;
    name: string;
    mappedCategoryName: string;
    mappedBrandName: string;
  }): {
    categoryName: string;
    brandName: string;
    categoryInferredSlug?: string;
    brandInferredSlug?: string;
  } {
    const { sku, name, mappedCategoryName, mappedBrandName } = params;

    const brandInference = this.inferBrand(sku, name, mappedBrandName);
    const categoryInference = this.inferCategory(sku, name, mappedCategoryName);

    return {
      categoryName: categoryInference.categoryName,
      brandName: brandInference.brandName,
      categoryInferredSlug: categoryInference.inferredSlug,
      brandInferredSlug: brandInference.inferredSlug,
    };
  }

  /**
   * Inferencia de marca. Solo usa marcas existentes (Hikvision).
   * Si no hay match, deja la marca vacía → default "Sin marca".
   */
  private inferBrand(
    sku: string,
    name: string,
    mappedBrandName: string,
  ): { brandName: string; inferredSlug?: string } {
    if (mappedBrandName) {
      return { brandName: mappedBrandName };
    }

    const skuUpper = sku.toUpperCase();
    const nameLower = name.toLowerCase();
    const matchesHikvision =
      skuUpper.startsWith('DS-') ||
      skuUpper.startsWith('IDS-') ||
      nameLower.includes('hikvision');

    if (matchesHikvision) {
      return { brandName: 'Hikvision', inferredSlug: 'hikvision' };
    }

    return { brandName: '' };
  }

  /**
   * Categorías conocidas por slug con keywords priorizadas.
   * Orden de prioridad: control-de-acceso, alarmas, smart-home, nvr, cctv, camaras-ip.
   */
  private readonly CATEGORY_RULES: Array<{
    slug: string;
    name: string;
    keywords: string[];
  }> = [
    {
      slug: 'control-de-acceso',
      name: 'Control de Acceso',
      keywords: ['control de acceso', 'lector', 'prox', 'cerradura'],
    },
    {
      slug: 'alarmas',
      name: 'Alarmas',
      keywords: ['alarma', 'sirena', 'sensor', 'detector'],
    },
    {
      slug: 'smart-home',
      name: 'Smart Home',
      keywords: ['intercom', 'smart', 'wifi', 'hub'],
    },
    {
      slug: 'nvr',
      name: 'NVR',
      keywords: ['nvr'],
    },
    {
      slug: 'cctv',
      name: 'CCTV',
      keywords: ['dvr', 'xvr'],
    },
    {
      slug: 'camaras-ip',
      name: 'Cámaras IP',
      keywords: ['camara', 'domo', 'torreta', 'turret', 'bala', 'dome', 'colorvu', 'bullet'],
    },
  ];

  /**
   * Inferencia de categoría por keywords en nombre/SKU.
   * Solo sugiere slugs de categorías existentes; si no hay match,
   * devuelve vacío → default "Sin categoría".
   */
  private inferCategory(
    sku: string,
    name: string,
    mappedCategoryName: string,
  ): { categoryName: string; inferredSlug?: string } {
    if (mappedCategoryName) {
      return { categoryName: mappedCategoryName };
    }

    // Normalizar acentos para matchear "cámara" → "camara"
    const normalizeForMatch = (value: string): string =>
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const haystack = `${normalizeForMatch(name)} ${normalizeForMatch(sku)}`;

    for (const rule of this.CATEGORY_RULES) {
      const hasMatch = rule.keywords.some((keyword) => haystack.includes(keyword));
      if (hasMatch) {
        return { categoryName: rule.name, inferredSlug: rule.slug };
      }
    }

    return { categoryName: '' };
  }
}
