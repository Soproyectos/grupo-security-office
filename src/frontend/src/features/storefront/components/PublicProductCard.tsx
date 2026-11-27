import { Link } from 'react-router-dom'
import { resolveAssetUrl } from '../../../services/api'
import type { PublicPrice, PublicProductResult } from '../types/publicProduct'
import { formatCop } from '../utils/formatCop'
import { productHref } from './mega-menu/menu-model'
import { ProductSpecLabel } from './ProductMedia'
import ProductImageStage, { PRODUCT_STAGE_BORDER, PRODUCT_STAGE_TITLE_BORDER } from './ProductImageStage'
import AddToQuoteButton, { type QuoteAction } from './AddToQuoteButton'

/**
 * Product card shared by the search, category and home pages. The price is the
 * strongest element: condensed 700 in ink with tabular numbers and "IVA
 * incluido", or the single quote action when the product
 * has no public price. Red stays reserved for actions. The whole card is one
 * link, and hover only changes the border color. The image is a relative API
 * route (`/api/files/:id`) resolved through `resolveAssetUrl`; without one the
 * media tile shows the spec label (family icon plus key specs).
 */
export default function PublicProductCard({ product, eagerImage = false, compact = false, assignedPrice = null, quoteAction }: { product: PublicProductResult; eagerImage?: boolean; compact?: boolean; assignedPrice?: PublicPrice | null; /** Present only for a signed-in client with an active account. */ quoteAction?: QuoteAction }) {
  const imageSrc = product.imageUrl ? resolveAssetUrl(product.imageUrl) : null

  const canQuote = quoteAction !== undefined && !product.isInformational
  return (
    <li className={canQuote ? 'flex h-full flex-col gap-2' : undefined}>
      <Link
        to={productHref(product.id)}
        className={`group flex flex-col overflow-hidden rounded-card border ${PRODUCT_STAGE_BORDER} bg-white transition-colors duration-150 hover:border-storefront-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500 ${canQuote ? 'flex-1' : 'h-full'}`}
      >
        <ProductImageStage
          src={imageSrc}
          eager={eagerImage}
          sizeClass="aspect-[var(--product-card-media-ratio,4/3)] w-full"
          fallback={(
            <span className="absolute inset-0 block p-3">
              <ProductSpecLabel name={product.name} sku={product.sku} categorySlug={product.categorySlug} />
            </span>
          )}
        />
        <span className={`flex flex-1 flex-col gap-1.5 border-t ${PRODUCT_STAGE_TITLE_BORDER} ${compact ? 'p-3' : 'p-4'}`}>
          {product.brandName !== null && product.brandName !== '' && (
            <span className="text-eyebrow uppercase text-security-500">{product.brandName}</span>
          )}
          <span className="line-clamp-2 min-h-[2.5rem] font-condensed text-base font-bold leading-5 text-storefront-ink">
            {product.name}
          </span>
          <span className={`font-mono text-xs text-ink-500 ${compact ? 'break-words' : ''}`}>{product.sku}</span>
          {product.isInformational && (
            <span className="w-fit rounded-full bg-surface-100 px-2 py-0.5 text-micro font-semibold text-ink-600">
              Ficha informativa
            </span>
          )}
          <span className="mt-auto pt-2">
            {assignedPrice !== null || product.price !== null ? (
              <>
                <span className="block font-condensed text-2xl font-bold leading-tight tabular-nums text-storefront-ink">
                  {formatCop((assignedPrice ?? product.price)!.value)}
                </span>
                <span className="text-micro text-ink-500">{assignedPrice !== null ? 'Tu tarifa' : 'IVA incluido'}</span>
              </>
            ) : (
              <>
                {product.isInformational && (
                  <span className="block font-condensed text-lg font-bold text-ink-700">
                    Datos en preparación
                  </span>
                )}
                {canQuote && <span className="block text-sm font-semibold text-ink-600">Precio por confirmar</span>}
                {!product.isInformational && !canQuote && (
                  <span className="mt-1 inline-flex min-h-11 items-center rounded-control border border-security-500 px-4 text-sm font-bold text-security-500 transition-colors group-hover:bg-security-500 group-hover:text-white">
                    Cotizar
                  </span>
                )}
              </>
            )}
          </span>
        </span>
      </Link>
      {quoteAction && !product.isInformational && (
        <AddToQuoteButton
          action={quoteAction}
          productName={product.name}
          className="w-full rounded-control border border-security-500 px-3 text-sm font-bold text-security-600 transition-colors hover:bg-security-50 disabled:opacity-60"
        />
      )}
    </li>
  )
}
