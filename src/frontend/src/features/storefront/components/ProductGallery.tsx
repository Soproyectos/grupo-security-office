import { useState } from 'react'
import { resolveAssetUrl } from '../../../services/api'
import type { PublicProductDetail } from '../types/publicProduct'
import { ProductPlaceholderIcon } from './PublicProductCard'

/**
 * Image gallery of the product sheet: a large square tile plus thumbnails when
 * there is more than one image. Without images it shows the same gradient
 * placeholder as the cards.
 */
export default function ProductGallery({
  images,
  productName,
}: {
  images: PublicProductDetail['images']
  productName: string
}) {
  const [selected, setSelected] = useState(0)
  const current = images[selected] ?? images[0]

  return (
    <div>
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-card border border-surface-200 bg-gradient-to-br from-surface-50 to-surface-200 text-ink-400">
        {current !== undefined ? (
          <img
            src={resolveAssetUrl(current.url)}
            alt={current.alt ?? productName}
            className="h-full w-full object-contain"
          />
        ) : (
          <ProductPlaceholderIcon className="h-20 w-20" />
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
