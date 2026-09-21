export type SystemField =
  | 'sku' | 'name' | 'description' | 'category' | 'brand' | 'technicalSpecs'
  | 'price_instalador_iva' | 'price_tienda_iva' | 'price_dpp_oro_iva'
  | 'price_dpp_platino_iva' | 'price_cliente_final_iva' | 'price_oro_sin_iva'
  | 'price_installer_sin_iva' | '__skip' | '__extra';

export interface ColumnMappingEntry {
  sourceColumn: string;
  targetField: SystemField;
  isRequired: boolean;
  confidence: number;
}

export interface ColumnMapping {
  entries: ColumnMappingEntry[];
  confirmed: boolean;
}

export interface ImportPreviewResult {
  importId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  breakdown: { toCreate: number; toUpdate: number; skipped: number };
  validationErrors: ValidationRowError[];
  warnings: string[];
  columnMapping: Record<string, string>;
  detectedHeaders: string[];
  completedStage: string;
  /**
   * Contrato real del backend: valores distintos (top 50) por columna del archivo.
   * Clave = nombre de columna (header). Se consume en el paso de Secciones para
   * detectar categorías sin parsear el archivo en el navegador.
   */
  distinctValuesByColumn?: Record<string, Array<{ value: string; count: number }>>;
  /**
   * Análisis por columna (contrato legacy del paso headers/mapping).
   * `distinctValues` (top 50) y/o `sample_values`. Defensivo: si el runtime
   * aún no lo entrega, se cae al parseo local del fileBuffer.
   */
  columnValues?: Record<string, ImportColumnValueInfo>;
}

export interface ImportColumnValueInfo {
  distinctValues?: Array<{ value: string; count: number }>;
  sample_values?: string[];
}

export interface ValidationRowError {
  rowIndex: number;
  excelRow: number;
  sku: string;
  errors: Array<{ field: string; code: string; message: string }>;
}

export interface ImportExecutionResult {
  importId: string;
  summary: { total: number; created: number; updated: number; skipped: number; errors: number };
  executionErrors: Array<{ rowIndex: number; sku: string; error: string }>;
  durationMs: number;
  completedAt: string;
}

/**
 * Respuesta inmediata de POST /products/import/execute (SEC-IMPORT-002).
 * El batch arranca en segundo plano; hay que sondear /progress hasta ver
 * `status: 'completed'` o `'failed'` — ver useImportExecution.
 */
export interface ImportExecutionAck {
  importId: string;
  status: 'processing';
  message: string;
}

/** Respuesta de GET /products/import/progress/:importId. */
export interface ImportProgressResult {
  importId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentStage: string;
  message: string;
  result?: ImportExecutionResult;
}

/** Acción que el backend debe aplicar a un valor de categoría del archivo en el execute. */
export type ImportSectionAction = 'create' | 'reuse' | 'skip';

/**
 * Decisión de sección enviada al backend en `POST /products/import/execute`
 * (contrato nuevo: `sections?: Array<{ sourceValue, targetName, action }>`).
 * - `sourceValue`: valor original de la celda categoría del archivo (antes de renombrar/fusionar).
 * - `targetName`: nombre final decidido (renombrado/fusionado).
 * - `action`: `create` (nueva), `reuse` (ya existe en la web), `skip` (descartada → sin categoría).
 */
export interface ImportSectionDecision {
  sourceValue: string;
  targetName: string;
  action: ImportSectionAction;
}

export interface MappingPreset {
  id: string;
  name: string;
  mappings: Array<{ sourceColumn: string; targetField: SystemField }>;
  userId: string;
  createdAt: string;
  isDefault: boolean;
}

export type ImportStep = 'upload' | 'headers' | 'mapping' | 'sections' | 'documentar' | 'validation' | 'confirm' | 'execution' | 'result';

/** Sección detectada del archivo (categorías únicas de la columna mapeada a "categoria"). */
export interface ImportSection {
  key: string;
  /** Valores originales del archivo que alimentan esta sección (varios tras fusionar). */
  values: string[];
  /** Nombre final (editable): es el nombre de la categoría que se creará/reutilizará. */
  name: string;
  /** Total de filas del archivo que caen en esta sección. */
  count: number;
  /** true si ya existe una categoría en la web con nombre normalizado equivalente. */
  exists: boolean;
  /** Id de la categoría existente a reutilizar (solo cuando exists). */
  existingCategoryId?: string;
  /** true = crear/reutilizar; false = descartar. */
  selected: boolean;
  /** false cuando la sección proviene de una fusión de varias. */
  original: boolean;
}

export interface ImportListaMetadata {
  mode: 'create' | 'select';
  listaId: string | null;
  name: string;
  codigo: string;
  currency: string;
  validFrom: string;
  validUntil: string;
  notes: string;
}

export interface ImportWizardState {
  currentStep: ImportStep;
  file: File | null;
  fileBuffer: ArrayBuffer | null;
  fileName: string;
  preview: ImportPreviewResult | null;
  executionResult: ImportExecutionResult | null;
  /** Progreso en vivo del batch en segundo plano (sondeo de /progress). */
  executionProgress: { progress: number; message: string } | null;
  columnMappings: Array<{ sourceColumn: string; targetField: SystemField }>;
  /** Valores fijos para campos sin columna en el archivo (ej: Marca="Hikvision", Categoría="CCTV"). */
  fixedValues: Partial<Record<SystemField, string>>;
  ivaMode: 'with_iva' | 'without_iva' | 'mixed';
  listaId: string | null;
  /** Decisiones de secciones (renombradas/fusionadas/descartadas). */
  sections: ImportSection[];
  /** Metadata de la Lista destino definida en el paso "Documentar". */
  listaMetadata: ImportListaMetadata;
  isLoading: boolean;
  error: string | null;
}
