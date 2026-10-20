import { Link, useParams } from 'react-router-dom'
import StorefrontChrome from '../../storefront/components/StorefrontChrome'
import { useCustomerCatalogProduct, usePublicCatalogProduct } from '../hooks/useCatalog'
import type { CatalogProduct } from '../types/customer-portal.types'
import { resolveAssetUrl } from '../../../services/api'

function ProductBody({ product, loading, privateCatalog }: { product?: CatalogProduct; loading: boolean; privateCatalog: boolean }) {
  if (loading) return <p aria-live="polite">Cargando producto…</p>
  if (!product) return <p role="alert">No encontramos este producto en el catálogo publicado.</p>
  return <article className="grid gap-8 md:grid-cols-2"><div className="flex aspect-square items-center justify-center rounded-2xl bg-white p-6">{product.image ? <img src={resolveAssetUrl(product.image.url)} alt={product.image.alt || product.name} className="max-h-full max-w-full object-contain"/> : <span className="text-5xl text-slate-400" aria-hidden="true">▣</span>}</div><div><p className="text-sm font-bold uppercase text-[#CE0203]">{product.brand.name}</p><h1 className="mt-2 text-3xl font-black">{product.name}</h1><p className="mt-2 font-mono text-sm text-slate-500">{product.sku}</p>{product.description && <p className="mt-6 leading-7 text-slate-700">{product.description}</p>}{privateCatalog ? <p className="mt-8 text-xl font-bold">{product.price ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: product.price.currency, maximumFractionDigits: 0 }).format(Number(product.price.value)) : 'Solicita cotización'}</p> : <Link to="/clientes/login" className="mt-8 inline-block rounded-lg bg-[#CE0203] px-5 py-3 font-bold text-white">Inicia sesión para ver precio</Link>}</div></article>
}
function PublicDetail() { const { productId } = useParams(); const query = usePublicCatalogProduct(productId); return <StorefrontChrome><main className="mx-auto max-w-5xl px-5 py-8"><Link to="/catalogo" className="font-bold text-[#CE0203]">← Catálogo</Link><div className="mt-6"><ProductBody product={query.data} loading={query.isLoading} privateCatalog={false}/></div></main></StorefrontChrome> }
function PrivateDetail() { const { productId } = useParams(); const query = useCustomerCatalogProduct(productId); return <main className="min-h-screen bg-slate-50"><header className="bg-white px-5 py-4"><Link to="/clientes/productos" className="font-bold text-[#CE0203]">← Productos</Link></header><main className="mx-auto max-w-5xl px-5 py-8"><ProductBody product={query.data} loading={query.isLoading} privateCatalog/></main></main> }
export default function PortalProductDetailPage({ privateCatalog }: { privateCatalog: boolean }) { return privateCatalog ? <PrivateDetail/> : <PublicDetail/> }
