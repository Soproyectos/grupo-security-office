import { Link, useParams } from 'react-router-dom'
import StorefrontChrome from '../../storefront/components/StorefrontChrome'
import { useCustomerCatalogProduct, usePublicCatalogProduct } from '../hooks/useCatalog'
import type { CatalogProduct } from '../types/customer-portal.types'
import { resolveAssetUrl } from '../../../services/api'

function ProductBody({ product, loading, privateCatalog }: { product?: CatalogProduct; loading: boolean; privateCatalog: boolean }) {
  if (loading) return <p aria-live="polite">Cargando producto…</p>
  if (!product) return <p role="alert">No encontramos este producto en el catálogo publicado.</p>
  return <article className="grid gap-8 md:grid-cols-2"><div className="flex aspect-square items-center justify-center rounded-card border border-surface-200 bg-white p-6">{product.image ? <img src={resolveAssetUrl(product.image.url)} alt={product.image.alt || product.name} className="max-h-full max-w-full object-contain"/> : <span className="text-5xl text-ink-400" aria-hidden="true">▣</span>}</div><div><p className="text-sm font-bold uppercase text-security-600">{product.brand.name}</p><h1 className="mt-2 text-3xl font-black">{product.name}</h1><p className="mt-2 font-mono text-sm text-ink-600">{product.sku}</p>{product.description && <p className="mt-6 leading-7 text-ink-900">{product.description}</p>}{privateCatalog ? <p className="mt-8 text-xl font-bold">{product.price ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: product.price.currency, maximumFractionDigits: 0 }).format(Number(product.price.value)) : 'Solicita cotización'}</p> : <Link to="/clientes/login" className="mt-8 inline-flex min-h-12 items-center rounded-control bg-security-600 px-5 font-bold !text-white hover:bg-security-500">Inicia sesión para ver precio</Link>}</div></article>
}
function PublicDetail() { const { productId } = useParams(); const query = usePublicCatalogProduct(productId); return <StorefrontChrome><main className="mx-auto max-w-5xl px-5 py-8"><Link to="/catalogo" className="font-bold text-security-600">← Catálogo</Link><div className="mt-6"><ProductBody product={query.data} loading={query.isLoading} privateCatalog={false}/></div></main></StorefrontChrome> }
function PrivateDetail() { const { productId } = useParams(); const query = useCustomerCatalogProduct(productId); return <div className="mx-auto max-w-5xl"><Link to="/clientes/productos" className="font-bold text-security-600">← Productos</Link><div className="mt-6"><ProductBody product={query.data} loading={query.isLoading} privateCatalog/></div></div> }
export default function PortalProductDetailPage({ privateCatalog }: { privateCatalog: boolean }) { return privateCatalog ? <PrivateDetail/> : <PublicDetail/> }
