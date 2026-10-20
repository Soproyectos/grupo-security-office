export const PRICE_IMPORT_TARIFFS = [
  'INSTALADOR_IVA', 'TIENDA_IVA', 'ORO_IVA', 'DPP_PLATINO_IVA', 'CLIENTE_FINAL_IVA',
] as const;
export type PriceImportTariff = typeof PRICE_IMPORT_TARIFFS[number];
export const MAX_PRICE_IMPORT_ROWS = 5000;

/** Default threshold (percent, up or down) above which a price change is flagged. */
export const LARGE_PRICE_CHANGE_PERCENT = 30;

/**
 * Effective large-change threshold. `PRICE_IMPORT_LARGE_CHANGE_PCT` may override
 * the default; invalid, non-finite or out-of-range (1-1000) values fall back to 30.
 */
export function resolveLargeChangeThresholdPct(
  raw: string | undefined = process.env.PRICE_IMPORT_LARGE_CHANGE_PCT,
): number {
  if (raw === undefined || raw.trim() === '' || !/^\d+(\.\d+)?$/.test(raw.trim())) {
    return LARGE_PRICE_CHANGE_PERCENT;
  }
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < 1 || value > 1000) return LARGE_PRICE_CHANGE_PERCENT;
  return value;
}

/** Incidence codes for rows rejected by the SKU-matching rules (2026-10-20). */
export const PRICE_IMPORT_INCIDENCE_CODES = {
  UNKNOWN_REFERENCE: 'UNKNOWN_REFERENCE',
  LISTA_FORBIDDEN: 'LISTA_FORBIDDEN',
  AMBIGUOUS_REFERENCE: 'AMBIGUOUS_REFERENCE',
} as const;
export type PriceImportIncidenceCode =
  typeof PRICE_IMPORT_INCIDENCE_CODES[keyof typeof PRICE_IMPORT_INCIDENCE_CODES];

/** Where a matched product stands relative to listas. */
export type PriceImportListaState = 'LISTA' | 'SIN_LISTA' | 'UNKNOWN';

/** Resolution of an unknown-SKU row (null while unresolved). */
export type PriceImportRowResolution = 'PENDING_PRODUCT' | 'PRODUCT_CREATED' | 'SKIPPED';

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
  /** Signed percent change vs. previous (2 decimals, as text); null when there is no previous or it is zero. */
  changePercent?: string | null;
  /** True when |changePercent| is above the large-change threshold. */
  largeChange?: boolean;
}

export interface PriceImportRow {
  row: number;
  sku: string;
  status: 'valid' | 'error';
  issues: PriceImportIssue[];
  prices: PriceImportComparison[];
  productId?: string | null;
  listaId?: string | null;
  listaState?: PriceImportListaState;
  resolution?: PriceImportRowResolution | null;
}

export interface PriceImportListaSummary {
  listaId: string;
  rows: number;
  prices: number;
}

export interface PriceImportPreview {
  /** Optional: a mixed-lista preview has no single destination lista. */
  listaId?: string | null;
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
    byLista?: PriceImportListaSummary[];
    unlistedRows?: number;
    unknownRows?: number;
    rejectedRows?: number;
    largeChangePrices?: number;
    largeChangeThresholdPct?: number;
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
  listaId: string | null;
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
