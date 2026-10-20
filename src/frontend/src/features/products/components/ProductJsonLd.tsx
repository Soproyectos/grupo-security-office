import { productImageSrc } from '../lib/image-src';
import type { ProductDetail } from '../types';

/**
 * Datos estructurados schema.org/Product para SEO. Solo se emiten los campos
 * que tienen valor. Se escapa "<" para que el JSON no pueda cerrar la etiqueta <script>.
 */
export function ProductJsonLd({ product, siteUrl = '' }: { product: ProductDetail; siteUrl?: string }) {
  const description = product.highlights.length > 0 ? product.highlights.join('. ') : (product.description ?? '').trim();
  const properties = product.specGroups.flatMap((g) =>
    g.items.filter((i) => i.label && i.value).map((i) => ({ '@type': 'PropertyValue', name: i.label, value: i.value })),
  );
  const image = product.image ? productImageSrc(product.image.src) : '';

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.model ? { sku: product.model, mpn: product.model } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(description ? { description } : {}),
    ...(image ? { image: /^https?:\/\//.test(image) ? image : siteUrl + image } : {}),
    ...(product.price
      ? {
          offers: {
            '@type': 'Offer',
            price: product.price.value,
            priceCurrency: product.price.currency,
            availability: 'https://schema.org/InStock',
          },
        }
      : {}),
    ...(properties.length > 0 ? { additionalProperty: properties } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
