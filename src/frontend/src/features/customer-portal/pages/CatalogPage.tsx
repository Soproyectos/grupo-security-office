import { useSearchParams } from 'react-router-dom'
import StorefrontChrome from '../../storefront/components/StorefrontChrome'
import { CatalogGrid, CatalogPagination } from '../components/CatalogViews'
import { usePublicCatalog } from '../hooks/useCatalog'

export default function CatalogPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const page = Number(params.get('page') || '1')
  const query = usePublicCatalog({ search: search || undefined, category: params.get('category') || undefined, brand: params.get('brand') || undefined, page })
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const value = new FormData(event.currentTarget).get('search')?.toString().trim() || ''; const next = new URLSearchParams(params); if (value) { next.set('search', value) } else { next.delete('search') } next.delete('page'); setParams(next) }
  return <StorefrontChrome><main className="mx-auto max-w-7xl px-5 py-8 lg:px-12"><h1 className="text-3xl font-black text-slate-900">Catálogo</h1><p className="mt-2 text-slate-600">Explora nuestra solución en seguridad profesional.</p><form onSubmit={submit} className="mt-6 flex gap-2"><label className="sr-only" htmlFor="catalog-search">Buscar productos</label><input id="catalog-search" name="search" defaultValue={search} placeholder="Buscar por producto o referencia" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3"/><button className="rounded-lg bg-[#CE0203] px-5 py-3 font-bold text-white">Buscar</button></form><p className="mt-5 text-sm text-slate-500">{query.data?.meta.total ?? 0} productos publicados</p><div className="mt-5"><CatalogGrid data={query.data} privateCatalog={false} loading={query.isLoading} error={query.isError}/><CatalogPagination meta={query.data?.meta}/></div></main></StorefrontChrome>
}
