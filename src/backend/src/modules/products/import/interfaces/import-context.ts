import { RawRow } from './import-source.adapter';
import { ColumnMapping, SystemField } from './column-mapping';

/**
 * Modo de manejo de IVA para precios importados.
 * - 'with_iva': precios incluyen IVA (almacenados tal cual)
 * - 'without_iva': precios sin IVA (se aplica cálculo posterior)
 * - 'mixed': algunas columnas con IVA, otras sin IVA
 */
export type IvaMode = 'with_iva' | 'without_iva' | 'mixed';

/**
 * Etapa del pipeline de importación.
 */
export type PipelineStage =
  | 'parse'
  | 'header_detection'
  | 'column_mapping'
  | 'validation'
  | 'normalization'
  | 'batch_execution';

/**
 * Contexto compartido que circula por todas las etapas del pipeline.
 * Cada etapa lee y escribe en el contexto según su responsabilidad.
 */
export interface ImportContext {
  /** ID de la importación (generado al inicio) */
  importId: string;

  /** ID del usuario que ejecuta la importación */
  userId: string;

  /** Archivo original */
  fileName: string;
  fileSize: number;

  /** Datos parseados por el adaptador */
  rawRows: RawRow[];
  headers: string[];

  /** Mapping de columnas seleccionado (manual o automático) */
  columnMapping: ColumnMapping;

  /** Modo de IVA para precios */
  ivaMode: IvaMode;

  /** ID de la Lista destino (opcional). Si falta, se resuelve LISTA-GENERAL en batch execution */
  listaId?: string;

  /** Decisiones de secciones del wizard, keyed por sourceValue normalizado (slug).
   *  key ej: 'cctv' → decisión. Solo se aplica si el valor fuente coincide. */
  sectionDecisions?: Record<string, { targetName?: string; action: 'create' | 'reuse' | 'skip' }>;

  /** Valores fijos por campo del sistema aplicados a todas las filas cuando la
   *  columna no existe o viene vacía (ej: { brand: 'Hikvision', category: 'CCTV' }). */
  fixedValues?: Partial<Record<SystemField, string>>;

  /** Resultados de validación por fila */
  validatedRows: ValidatedRow[];

  /** Filas normalizadas listas para insertar */
  normalizedRows: NormalizedRow[];

  /** Resultado final de la ejecución en batch (marca la importación como completada) */
  executionResult?: BatchExecutionResult;

  /**
   * Mensaje de fallo si el batch en segundo plano revienta antes de producir
   * un `executionResult` (excepción no controlada, no un error por fila —
   * esos van dentro de `executionResult.errors`). Marca la importación como
   * fallida para quien esté sondeando `getProgress`.
   */
  executionError?: string;

  /** Timestamp ISO de cuándo terminó el batch (éxito o fallo) */
  completedAt?: string;

  /** Errores acumulados del pipeline */
  pipelineErrors: PipelineError[];

  /** Timestamp de inicio */
  startedAt: Date;

  /** Etapa actual */
  currentStage: PipelineStage;
}

/**
 * Resultado de validación de una fila individual.
 */
export interface ValidatedRow {
  /** Índice original de la fila (0-based) */
  rowIndex: number;

  /** Datos crudos de la fila */
  rawData: RawRow;

  /** ¿Es válida? */
  isValid: boolean;

  /** Errores de validación (vacío si es válida) */
  errors: ValidationError[];

  /** Warnings (no bloquean la importación) */
  warnings: string[];
}

/**
 * Error de validación de una fila.
 */
export interface ValidationError {
  /** Campo que falló */
  field: string;

  /** Código del error */
  code: string;

  /** Mensaje descriptivo */
  message: string;
}

/**
 * Fila normalizada, lista para inserción en base de datos.
 */
export interface NormalizedRow {
  /** Índice original de la fila */
  rowIndex: number;

  /** SKU del producto */
  sku: string;

  /** Nombre del producto */
  name: string;

  /**
   * true si `name` es un valor de relleno (se usó el SKU porque la fila no
   * traía nombre ni descripción). BatchExecutorService lo usa para no
   * sobrescribir el nombre real de un producto ya existente con este relleno.
   */
  nameIsFallback: boolean;

  /** Descripción (opcional) */
  description?: string;

  /** Nombre de categoría (se resolverá a ID en batch execution) */
  categoryName: string;

  /** Nombre de marca (se resolverá a ID en batch execution) */
  brandName: string;

  /** Slug de categoría inferido (si la categoría no vino mapeada y se infirió) */
  categoryInferredSlug?: string;

  /** Slug de marca inferido (si la marca no vino mapeada y se infirió) */
  brandInferredSlug?: string;

  /** Precios mapeados por lista de precios */
  prices: PriceEntry[];

  /** Specs técnicas (JSON) */
  technicalSpecs?: Record<string, unknown>;

  /** Atributos adicionales del proveedor no canonizados */
  extraAttributes?: Record<string, string | number | boolean>;

  /** ¿Es actualización de producto existente? */
  isUpdate: boolean;

  /** ID del producto existente (si isUpdate es true) */
  existingProductId?: string;
}

/**
 * Entrada de precio para un producto.
 */
export interface PriceEntry {
  /** Código de la lista de precios (ej: 'INSTALADOR_IVA', 'TIENDA_IVA') */
  priceListCode: string;

  /** Nombre de la lista de precios */
  priceListName: string;

  /** Valor numérico del precio */
  value: number;

  /** Modo IVA de esta entrada específica */
  ivaMode: IvaMode;

  /** Moneda (default COP) */
  currency: string;
}

/**
 * Resultado de la ejecución en batch.
 */
export interface BatchExecutionResult {
  /** Total de filas procesadas */
  total: number;

  /** Productos creados */
  created: number;

  /** Productos actualizados */
  updated: number;

  /** Filas omitidas (duplicados, errores) */
  skipped: number;

  /** Errores durante la inserción */
  errors: BatchError[];

  /** IDs de productos creados/actualizados */
  productIds: string[];

  /** Duración total en ms */
  durationMs: number;

  /** Filas que cayeron a categoría/marca default por falta de inferencia */
  defaultsByMissingInference?: {
    category: number;
    brand: number;
  };

  /**
   * Filas de productos con identidad bloqueada (nameLockedAt) cuya identidad
   * propuesta por la fila difiere de la almacenada. Solo se cuentan para
   * revisión humana — nunca fallan el import ni sobrescriben la identidad.
   */
  identityChangesDetected?: number;
}

/**
 * Error durante la ejecución en batch.
 */
export interface BatchError {
  /** Índice de la fila */
  rowIndex: number;

  /** SKU de la fila */
  sku: string;

  /** Mensaje del error */
  error: string;

  /** Stack trace (solo en desarrollo) */
  stack?: string;
}

/**
 * Error del pipeline (error global, no de fila).
 */
export interface PipelineError {
  /** Etapa donde ocurrió */
  stage: PipelineStage;

  /** Mensaje del error */
  message: string;

  /** Código del error */
  code: string;
}
