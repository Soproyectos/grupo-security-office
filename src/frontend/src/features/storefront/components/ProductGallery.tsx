import { useState } from 'react'
import { resolveAssetUrl } from '../../../services/api'
import type { PublicProductDetail } from '../types/publicProduct'
import { ProductSpecLabel } from './ProductMedia'

/**
 * Image gallery of the product sheet: a large 4:3 tile plus thumbnails when
 * there is more than one image. Without images it shows the same spec label as
 * the cards, set larger.
 */
export default function ProductGallery({
  images,
  productName,
  sku,
  categorySlug,
}: {
  images: PublicProductDetail['images']
  productName: string
  sku: string
  categorySlug: string | null
}) {
  const [selected, setSelected] = useState(0)
  const current = images[selected] ?? images[0]

  return (
    <div>
      <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-card border border-surface-200 bg-surface-50">
        {current !== undefined ? (
          <img
            src={resolveAssetUrl(current.url)}
            alt={current.alt ?? productName}
            className="h-full w-full object-contain"
          />
        ) : (
          <ProductSpecLabel name={productName} sku={sku} categorySlug={categorySlug} size="detail" />
        )}
      </div>
      {images.length > 1 && (
        <ul role="list" aria-label="Imágenes del producto" className="mt-3 flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li key={`${image.url}-${index}`}>
              <button
                type="button"
                onClick={() => setSelected(index)}
                aria-label={`Ver imagen ${index + 1} de ${images.length}`}
                aria-current={index === selected}
                className={`h-16 w-16 overflow-hidden rounded-control border bg-white transition ${
                  index === selected ? 'border-security-500' : 'border-surface-200 hover:border-surface-300'
                }`}
              >
                <img src={resolveAssetUrl(image.url)} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
