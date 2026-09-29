import { Link } from 'react-router-dom'
import { resolveAssetUrl } from '../../../services/api'
import type { PublicProductResult } from '../types/publicProduct'
import { formatCop } from '../utils/formatCop'
import { categoryHref } from './mega-menu/menu-model'

/** Neutral icon of the media tile when the product has no image. */
export function ProductPlaceholderIcon({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeLinejoin="round" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Product card shared by the search and category pages. The price is the
 * strongest element: whole pesos with "IVA incluido", or "Precio a consultar"
 * with a quote affordance when the product has no public price. The whole card
 * is one link. The image is a relative API route (`/api/files/:id`) resolved
 * through `resolveAssetUrl`.
 */
export default function PublicProductCard({ product }: { product: PublicProductResult }) {
  return (
    <li>
      <Link
        to={categoryHref(product.categorySlug)}
        className="group flex h-full flex-col overflow-hidden rounded-card border border-surface-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-surface-300 hover:shadow-lg"
      >
        <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-gradient-to-br from-surface-50 to-surface-200 text-ink-400">
          {product.imageUrl !== null ? (
            <img
              src={resolveAssetUrl(product.imageUrl)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <ProductPlaceholderIcon />
          )}
        </span>
        <span className="flex flex-1 flex-col gap-1.5 p-4">
          {product.brandName !== null && product.brandName !== '' && (
            <span className="text-eyebrow uppercase text-security-500">{product.brandName}</span>
          )}
          <span className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5 text-ink-900 transition group-hover:text-security-500">
            {product.name}
          </span>
          <span className="font-mono text-micro text-ink-400">{product.sku}</span>
          <span className="mt-auto pt-2">
            {product.price !== null ? (
              <>
                <span className="block text-xl font-bold leading-tight text-ink-900">
                  {formatCop(product.price.value)}
                </span>
                <span className="text-micro text-ink-500">IVA incluido</span>
              </>
            ) : (
              <>
                <span className="block text-sm font-semibold text-ink-700">Precio a consultar</span>
                <span className="mt-1 inline-flex rounded-full border border-security-500 px-3 py-0.5 text-micro font-bold text-security-500">
                  Cotizar
                </span>
              </>
            )}
          </span>
        </span>
      </Link>
    </li>
  )
}
