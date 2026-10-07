import api from '../../../services/api'
import type { ProductSheetApi, ProductSheetPayload } from './sheet-form'

export const sheetKeys = {
  detail: (productId: string) => ['product-sheet', productId] as const,
}

/** GET /products/:id/sheet: the editable public sheet of a product. */
export async function fetchProductSheet(productId: string): Promise<ProductSheetApi> {
  const res = await api.get(`/products/${productId}/sheet`)
  return res.data as ProductSheetApi
}

/** PUT /products/:id/sheet: replaces the whole sheet in one transaction. */
export async function saveProductSheet(productId: string, payload: ProductSheetPayload): Promise<ProductSheetApi> {
  const res = await api.put(`/products/${productId}/sheet`, payload)
  return res.data as ProductSheetApi
}
