import api from '../../services/api'
import type { BatchSummaryView, ValidationReportView } from './validation-model'

export const validationKeys = {
  report: (productId: string) => ['product-validation', productId] as const,
}

/** POST /products/:id/validation — recalcula sobre la revisión de trabajo. */
export async function validateProduct(productId: string): Promise<ValidationReportView> {
  const res = await api.post(`/products/${productId}/validation`)
  return res.data as ValidationReportView
}

/** GET /products/:id/validation — último informe con `stale` (null si nunca validó). */
export async function fetchValidationReport(productId: string): Promise<ValidationReportView | null> {
  const res = await api.get(`/products/${productId}/validation`)
  return (res.data ?? null) as ValidationReportView | null
}

/** POST /products/validation/batch — selección (tope 200; filtros completos = CAT-07). */
export async function validateBatch(productIds: string[]): Promise<BatchSummaryView> {
  const res = await api.post('/products/validation/batch', { productIds })
  return res.data as BatchSummaryView
}
