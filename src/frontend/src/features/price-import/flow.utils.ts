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
