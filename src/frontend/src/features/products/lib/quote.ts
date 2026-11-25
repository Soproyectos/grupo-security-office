import { whatsappUrl } from '../../storefront/constants/contact';
import type { ProductDetail } from '../types';

/** WhatsApp link with a prefilled quote request for the product. */
export function quoteUrl(product: Pick<ProductDetail, 'name' | 'model'>, askEquivalent = false): string {
  const intent = askEquivalent ? 'consultar por un equivalente del producto' : 'cotizar el producto';
  return whatsappUrl(`Hola, quiero ${intent} ${product.name} (SKU: ${product.model}).`);
}
