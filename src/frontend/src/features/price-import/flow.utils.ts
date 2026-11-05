import type { PriceImportPreview } from '../../services/price-import.service'

export const FLOW_STEPS = ['Plantilla', 'Revisar', 'Aplicar'] as const

export interface ApplyRequirements {
  rejectedRows: number
  largeChangePrices: number
  validRows: number
}

/** What the person must confirm before the apply call is allowed (mirrors the server's 409 codes). */
export function applyRequirements(summary: PriceImportPreview['summary']): ApplyRequirements {
  return {
    rejectedRows: summary.rejectedRows ?? summary.errorRows,
    largeChangePrices: summary.largeChangePrices ?? 0,
    validRows: summary.validRows,
  }
}

export function canApply(req: ApplyRequirements, confirmedRejected: boolean, confirmedLarge: boolean): boolean {
  if (req.validRows === 0) return false
  if (req.rejectedRows > 0 && !confirmedRejected) return false
  if (req.largeChangePrices > 0 && !confirmedLarge) return false
  return true
}

// ─── Single-price mode ───

/** Canonical tariff order (same as the server's PRICE_IMPORT_TARIFFS). */
export const SINGLE_PRICE_TARIFFS = ['INSTALADOR_IVA', 'TIENDA_IVA', 'DPP_ORO_IVA', 'DPP_PLATINO_IVA', 'CLIENTE_FINAL_IVA'] as const

export const SINGLE_PRICE_EMPTY_MESSAGE = 'Elige al menos un escalafón para aplicar el precio único.'

/** Keeps only known tariffs, de-duplicated, in canonical order. */
export function normalizeSinglePriceSelection(selection: readonly string[]): string[] {
  return SINGLE_PRICE_TARIFFS.filter((code) => selection.includes(code))
}

/** Selection to send to preview/save: undefined for normal files (no `singlePrice` in the response). */
export function singlePriceSelectionToSend(preview: PriceImportPreview | null, selection: readonly string[]): string[] | undefined {
  if (!preview?.singlePrice) return undefined
  return normalizeSinglePriceSelection(selection)
}

export function isSinglePriceSelectionValid(selection: readonly string[]): boolean {
  return normalizeSinglePriceSelection(selection).length > 0
}

export function toggleSinglePriceTariff(selection: readonly string[], code: string, checked: boolean): string[] {
  const next = checked ? [...selection, code] : selection.filter((item) => item !== code)
  return normalizeSinglePriceSelection(next)
}

/** A save with another selection must not reuse the previous key (the server answers 409). */
export function needsNewIdempotencyKey(previous: readonly string[], next: readonly string[]): boolean {
  return normalizeSinglePriceSelection(previous).join(',') !== normalizeSinglePriceSelection(next).join(',')
}

export function singlePriceBannerText(selection: readonly string[]): string {
  return `Este precio se aplicará tal cual (con IVA) a: ${normalizeSinglePriceSelection(selection).join(', ')}. Un precio de proveedor no es un precio de venta: revísalo antes de aplicar.`
}

/** Cached data that shows prices; refreshed after a successful apply. */
export const PRICE_APPLY_INVALIDATE_KEYS: ReadonlyArray<readonly string[]> = [
  ['products'], ['product'], ['product-prices'], ['product-audit'], ['priceLists'],
]
