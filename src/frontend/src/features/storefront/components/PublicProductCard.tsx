import { Link } from 'react-router-dom'
import { resolveAssetUrl } from '../../../services/api'
import type { PublicProductResult } from '../types/publicProduct'
import { formatCop } from '../utils/formatCop'
import { productHref } from './mega-menu/menu-model'
import { ProductSpecLabel } from './ProductMedia'

/**
 * Product card shared by the search, category and home pages. The price is the
 * strongest element: condensed 700 in ink with tabular numbers and "IVA
 * incluido", or "Precio a consultar" with a quote affordance when the product
 * has no public price. Red stays reserved for actions. The whole card is one
 * link, and hover only changes the border color. The image is a relative API
 * route (`/api/files/:id`) resolved through `resolveAssetUrl`; without one the
 * media tile shows the spec label (family icon plus key specs).
 */
export default function PublicProductCard({ product }: { product: PublicProductResult }) {
  return (
    <li>
      <Link
        to={productHref(product.id)}
        className="group flex h-full flex-col overflow-hidden rounded-card border border-surface-200 bg-white transition-colors duration-150 hover:border-storefront-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500"
      >
        <span className="block aspect-[4/3] w-full overflow-hidden bg-surface-50">
          {product.imageUrl !== null ? (
            <img
              src={resolveAssetUrl(product.imageUrl)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <ProductSpecLabel name={product.name} sku={product.sku} categorySlug={product.categorySlug} />
          )}
        </span>
        <span className="flex flex-1 flex-col gap-1.5 p-4">
          {product.brandName !== null && product.brandName !== '' && (
            <span className="text-eyebrow uppercase text-security-500">{product.brandName}</span>
          )}
          <span className="line-clamp-2 min-h-[2.5rem] font-condensed text-base font-bold leading-5 text-storefront-ink">
            {product.name}
          </span>
          <span className="font-mono text-micro text-ink-500">{product.sku}</span>
          {product.isInformational && (
            <span className="w-fit rounded-full bg-surface-100 px-2 py-0.5 text-micro font-semibold text-ink-600">
              Ficha informativa
            </span>
          )}
          <span className="mt-auto pt-2">
            {product.price !== null ? (
              <>
                <span className="block font-condensed text-2xl font-bold leading-tight tabular-nums text-storefront-ink">
                  {formatCop(product.price.value)}
                </span>
                <span className="text-micro text-ink-500">IVA incluido</span>
              </>
            ) : (
              <>
                <span className="block font-condensed text-lg font-bold text-ink-700">
                  {product.isInformational ? 'Datos en preparación' : 'Precio a consultar'}
                </span>
                {!product.isInformational && (
                  <span className="mt-1 inline-flex rounded-full border border-security-500 px-3 py-0.5 text-micro font-bold text-security-500">
                    Cotizar
                  </span>
                )}
              </>
            )}
          </span>
        </span>
      </Link>
    </li>
  )
}
