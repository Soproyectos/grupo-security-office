import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { resolveAssetUrl } from '../../../services/api'
import { fetchPublicProducts } from '../../../services/public-catalog.service'
import type { PublicProductResult } from '../types/publicProduct'
import { productHref } from './mega-menu/menu-model'
import ProductImageStage, { PRODUCT_STAGE_BORDER, PRODUCT_STAGE_LINK, PRODUCT_STAGE_TITLE_BORDER } from './ProductImageStage'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-600'
const COUNT = 4

function ArrivalCard({ product }: { product: PublicProductResult }) {
  const imageSrc = product.imageUrl ? resolveAssetUrl(product.imageUrl) : null

  return (
    <li>
      <Link
        to={productHref(product.id)}
        className={`group flex h-full min-h-11 flex-col overflow-hidden rounded-card border ${PRODUCT_STAGE_BORDER} bg-white hover:border-security-600 ${FOCUS}`}
      >
        <ProductImageStage src={imageSrc} />
        <span className={`flex flex-1 flex-col gap-1 border-t ${PRODUCT_STAGE_TITLE_BORDER} p-3`}>
          {product.brandName && (
            <span className="text-xs font-semibold uppercase text-ink-600">{product.brandName}</span>
          )}
          <span className="line-clamp-2 font-bold leading-snug text-storefront-ink group-hover:text-security-600">
            {product.name}
          </span>
          <span className="break-words font-mono text-xs text-ink-600">{product.sku}</span>
        </span>
      </Link>
    </li>
  )
}

/** Latest published products with a full card; any failure is an empty list. */
export async function loadNewArrivals(): Promise<PublicProductResult[]> {
  try {
    const listing = await fetchPublicProducts({ sort: 'recent' }, 0, COUNT)
    return listing.items.filter((item) => !item.isInformational).slice(0, COUNT)
  } catch {
    return []
  }
}

/** The section itself; nothing at all when there are no products. */
export function NewArrivalsView({ products }: { products: PublicProductResult[] }) {
  if (products.length === 0) return null

  return (
    <section aria-labelledby="home-new-title" className="mx-auto max-w-[80rem] px-5 py-3 sm:px-8 lg:px-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4">
        <h2 id="home-new-title" className="text-2xl font-bold">Novedades en el catálogo</h2>
        <Link to="/catalogo" className={`inline-flex min-h-11 items-center font-bold ${PRODUCT_STAGE_LINK} hover:underline ${FOCUS}`}>
          Ver todo <span aria-hidden="true" className="ml-2 text-xl">›</span>
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {products.map((product) => (
          <ArrivalCard key={product.id} product={product} />
        ))}
      </ul>
    </section>
  )
}

/** Home section with the most recently published products; no placeholders while loading or on error. */
export default function NewArrivals() {
  const [products, setProducts] = useState<PublicProductResult[]>([])

  useEffect(() => {
    let active = true
    void loadNewArrivals().then((items) => {
      if (active) setProducts(items)
    })
    return () => {
      active = false
    }
  }, [])

  return <NewArrivalsView products={products} />
}
