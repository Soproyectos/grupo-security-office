import { whatsappUrl } from '../../storefront/constants/contact';
import type { ProductDetail } from '../types';

/** WhatsApp link with a prefilled quote request for the product. */
export function quoteUrl(product: Pick<ProductDetail, 'name' | 'model'>): string {
  return whatsappUrl(`Hola, quiero cotizar el producto ${product.name} (SKU: ${product.model}).`);
}
