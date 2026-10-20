export const PRICE_IMPORT_TARIFFS = [
  'INSTALADOR_IVA', 'TIENDA_IVA', 'ORO_IVA', 'DPP_PLATINO_IVA', 'CLIENTE_FINAL_IVA',
] as const;
export type PriceImportTariff = typeof PRICE_IMPORT_TARIFFS[number];
export const MAX_PRICE_IMPORT_ROWS = 5000;

/** IMP-04: versiones para recuperar la interpretación exacta de una revisión. */
export const PRICE_IMPORT_PARSER_VERSION = 'template-v3-reader-1';
export const PRICE_IMPORT_TRAILER_VERSION = 'v3';

export interface PriceImportIssue {
  row: number | null;
  column?: string;
  code: string;
  message: string;
}

export interface PriceImportComparison {
  code: string;
  raw: string;
  rounded: string;
  previous: string | null;
  difference: string | null;
  wasRounded: boolean;
  change: 'new' | 'changed' | 'unchanged';
}

export interface PriceImportRow {
  row: number;
  sku: string;
  status: 'valid' | 'error';
  issues: PriceImportIssue[];
  prices: PriceImportComparison[];
}

export interface PriceImportPreview {
  listaId: string;
  fileName: string;
  currency: 'COP';
  taxIncluded: true;
  rounding: 'HALF_UP';
  readOnly: true;
  summary: {
    rows: number;
    validRows: number;
    errorRows: number;
    prices: number;
    newPrices: number;
    changedPrices: number;
    unchangedPrices: number;
    roundedPrices: number;
  };
  issues: PriceImportIssue[];
  rows: PriceImportRow[];
}

/** IMP-04 — tarifa resuelta guardada en la revisión (versiones de tarifas). */
export interface PriceImportRevisionTariff {
  code: string;
  priceListId: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

/** IMP-04 — cabecera de una revisión de precios guardada (recuperable). */
export interface PriceImportRevisionHeader {
  id: string;
  listaId: string;
  status: 'GUARDADA' | 'APLICADA' | 'DESCARTADA';
  fileName: string;
  fileHash: string;
  fileSize: number;
  fileAvailable: boolean;
  idempotencyKey: string;
  currency: 'COP';
  taxIncluded: true;
  rounding: 'HALF_UP';
  policyVersion: string;
  parserVersion: string;
  trailerVersion: string | null;
  tariffs: PriceImportRevisionTariff[];
  summary: PriceImportPreview['summary'];
  createdById: string | null;
  createdAt: string;
  appliedAt: string | null;
  appliedResult: PriceImportRevisionApplyResult | null;
}

/** IMP-05 — conflicto detectado entre revisar y aplicar (por fila/tarifa). */
export interface PriceImportRevisionApplyConflict {
  code: string;
  sku: string;
  tariffCode: string;
  expected: string | null;
  actual: string | null;
}

/** IMP-05 — resultado confirmado de aplicar una revisión. */
export interface PriceImportRevisionApplyResult {
  revisionId: string;
  status: 'APLICADA';
  alreadyApplied: boolean;
  appliedRows: number;
  appliedPrices: number;
  tariffs: string[];
  appliedAt: string;
}

/** IMP-04 — detalle paginado de una revisión (filas y precios guardados). */
export interface PriceImportRevisionDetail extends PriceImportRevisionHeader {
  rows: PriceImportRow[];
  totalRows: number;
  page: number;
  pageSize: number;
}

export interface PriceImportRevisionPage {
  items: PriceImportRevisionHeader[];
  total: number;
  page: number;
  pageSize: number;
}
