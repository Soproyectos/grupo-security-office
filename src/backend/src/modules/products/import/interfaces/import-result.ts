import { PipelineStage } from './import-context';

/**
 * Resultado de una operación de preview (dry-run).
 * Muestra qué pasaría sin ejecutar cambios en la BD.
 */
export interface ImportPreviewResult {
  /** ID de la importación */
  importId: string;

  /** Total de filas en el archivo */
  totalRows: number;

  /** Filas válidas (se importarían) */
  validRows: number;

  /** Filas con errores (se omitirían) */
  invalidRows: number;

  /** Desglose por tipo de operación */
  breakdown: {
    /** Productos que se crearían (SKU nuevo) */
    toCreate: number;
    /** Productos que se actualizarían (SKU existente) */
    toUpdate: number;
    /** Filas que se omitirían (errores de validación) */
    skipped: number;
  };

  /** Lista de errores de validación */
  validationErrors: ValidationRowError[];

  /** Lista de warnings */
  warnings: string[];

  /** Mapeo de columnas usado */
  columnMapping: Record<string, string>;

  /** Headers detectados */
  detectedHeaders: string[];

  /**
   * Valores únicos por columna (top 50 por frecuencia desc), para que el wizard
   * detecte las secciones/categorías que trae el archivo. Clave = header de columna.
   */
  distinctValuesByColumn: Record<string, Array<{ value: string; count: number }>>;

  /** Etapa del pipeline donde se detuvo */
  completedStage: PipelineStage;
}

/**
 * Error de validación de una fila para el endpoint de preview.
 */
export interface ValidationRowError {
  /** Índice de la fila (0-based) */
  rowIndex: number;

  /** Número de fila en Excel (1-based, incluyendo header) */
  excelRow: number;

  /** SKU de la fila (si está disponible) */
  sku: string;

  /** Lista de errores */
  errors: Array<{
    field: string;
    code: string;
    message: string;
  }>;
}

/**
 * Resultado de una operación de ejecución (commit).
 */
export interface ImportExecutionResult {
  /** ID de la importación */
  importId: string;

  /** Resumen de la ejecución */
  summary: {
    /** Total procesado */
    total: number;
    /** Creados exitosamente */
    created: number;
    /** Actualizados exitosamente */
    updated: number;
    /** Omitidos */
    skipped: number;
    /** Errores */
    errors: number;
    /** Filas que cayeron a categoría/marca default por falta de inferencia */
    defaultsByMissingInference: {
      category: number;
      brand: number;
    };
  };

  /** Errores durante la ejecución */
  executionErrors: Array<{
    rowIndex: number;
    sku: string;
    error: string;
  }>;

  /** Duración total en ms */
  durationMs: number;

  /** Timestamp de finalización */
  completedAt: string;
}

/**
 * Respuesta inmediata de `execute` (SEC-IMPORT-002).
 *
 * `execute` ya no espera a que termine el batch antes de responder: con
 * archivos de varias listas de precio por fila, cada producto cuesta ~20
 * idas y vueltas a la BD (Neon, remota) y el lote completo puede tardar
 * varios minutos — más que el límite de una sola petición HTTP. El batch
 * arranca en segundo plano al recibir esta respuesta; el cliente debe sondear
 * `GET /products/import/progress/:importId` hasta ver `status: 'completed'`
 * o `'failed'`, momento en el que trae el `result` con el resumen real.
 */
export interface ImportExecutionAck {
  /** ID de la importación (el mismo que se sondea en /progress) */
  importId: string;

  /** Siempre 'processing': el batch acaba de arrancar en segundo plano */
  status: 'processing';

  /** Mensaje para mostrar mientras se sondea el progreso */
  message: string;
}

/**
 * Resultado del endpoint de progreso de importación.
 */
export interface ImportProgressResult {
  /** ID de la importación */
  importId: string;

  /** Estado actual */
  status: 'pending' | 'processing' | 'completed' | 'failed';

  /** Progreso (0-100) */
  progress: number;

  /** Etapa actual */
  currentStage: PipelineStage;

  /** Mensaje descriptivo del progreso */
  message: string;

  /** Resultado final (solo si status es 'completed' o 'failed') */
  result?: ImportExecutionResult;
}

/**
 * Resultado del endpoint `GET /api/products/import/current-price`.
 * El interceptor global envuelve esta respuesta en `{ data }`.
 */
export interface CurrentPriceResult {
  /** SKU consultado (tal como se guarda en el producto) */
  sku: string;
  /** ID del producto encontrado */
  productId: string;
  /** Nombre del producto */
  name: string;
  /** Valor del precio vigente (null si el producto no tiene precio vigente) */
  price: number | null;
  /** Moneda del precio vigente (null sin precio vigente) */
  currency: string | null;
  /** Fin de vigencia del precio (null si es abierto o sin precio vigente) */
  validUntil: Date | null;
  /** true si existe un precio vigente hoy para comparar */
  exists: boolean;
}
