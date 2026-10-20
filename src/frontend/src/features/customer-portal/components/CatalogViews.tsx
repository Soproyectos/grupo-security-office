import { Link, useSearchParams } from 'react-router-dom'
import { resolveAssetUrl } from '../../../services/api'
import type { CatalogProduct, CatalogResponse } from '../types/customer-portal.types'

function formatPrice(price: NonNullable<CatalogProduct['price']>) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: price.currency, maximumFractionDigits: 0 }).format(Number(price.value))
}

export function CatalogProductCard({ product, privateCatalog }: { product: CatalogProduct; privateCatalog: boolean }) {
  const destination = privateCatalog ? `/clientes/productos/${product.id}` : `/catalogo/productos/${product.id}`
  return <article className="rounded-[14px] border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <Link to={destination} className="block text-inherit">
      <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-slate-100">
        {product.image ? <img src={resolveAssetUrl(product.image.url)} alt={product.image.alt || product.name} className="h-full w-full object-contain" /> : <span className="text-3xl text-slate-400" aria-hidden="true">▣</span>}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#CE0203]">{product.brand.name}</p>
      <h2 className="mt-1 min-h-10 text-[13px] font-medium leading-5 text-slate-800">{product.name}</h2>
      <p className="mt-1 font-mono text-[10px] text-slate-400">{product.sku}</p>
      {privateCatalog ? <p className="mt-3 text-sm font-bold text-slate-900">{product.price ? formatPrice(product.price) : 'Solicita cotización'}</p> : <p className="mt-3 text-xs font-medium text-slate-600">Inicia sesión para ver precio</p>}
    </Link>
  </article>
}

export function CatalogGrid({ data, privateCatalog, loading, error }: { data?: CatalogResponse; privateCatalog: boolean; loading: boolean; error: boolean }) {
  if (loading) return <p className="py-12 text-center text-slate-500" aria-live="polite">Cargando productos…</p>
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">No fue posible cargar el catálogo. Intenta nuevamente.</div>
  if (!data?.data.length) return <p className="py-12 text-center text-slate-500">No encontramos productos con esos filtros.</p>
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{data.data.map((product) => <CatalogProductCard key={product.id} product={product} privateCatalog={privateCatalog} />)}</div>
}

export function CatalogPagination({ meta }: { meta?: CatalogResponse['meta'] }) {
  const [params, setParams] = useSearchParams()
  if (!meta || meta.totalPages <= 1) return null
  const change = (page: number) => { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next) }
  return <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Paginación de catálogo">
    <button type="button" disabled={meta.page <= 1} onClick={() => change(meta.page - 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Anterior</button>
    <span className="text-sm text-slate-600">Página {meta.page} de {meta.totalPages}</span>
    <button type="button" disabled={meta.page >= meta.totalPages} onClick={() => change(meta.page + 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Siguiente</button>
  </nav>
}
