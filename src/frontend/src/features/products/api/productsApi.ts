import api from '../../../services/api';
import type { ProductDetail } from '../types';

export class ProductNotFoundError extends Error {
  readonly idOrSlug: string;

  constructor(idOrSlug: string) {
    super(`Producto no encontrado: ${idOrSlug}`);
    this.name = 'ProductNotFoundError';
    this.idOrSlug = idOrSlug;
  }
}

/**
 * GET /api/public/products/:idOrSlug/detail. Accepts a product id or a published
 * catalog slug; 404 (unknown/not visible) and 400 (malformed) are "not found".
 */
export async function fetchProduct(idOrSlug: string, signal?: AbortSignal): Promise<ProductDetail> {
  try {
    const response = await api.get<ProductDetail>(`/public/products/${encodeURIComponent(idOrSlug)}/detail`, {
      signal,
    });
    return response.data;
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404 || status === 400) throw new ProductNotFoundError(idOrSlug);
    throw error;
  }
}
