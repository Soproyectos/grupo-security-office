import { useSearchParams } from 'react-router-dom'
import { CatalogGrid, CatalogPagination } from '../components/CatalogViews'
import { useCustomerCatalog } from '../hooks/useCatalog'

export default function ClientCatalogPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''; const page = Number(params.get('page') || '1')
  const query = useCustomerCatalog({ search: search || undefined, page })
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const value = new FormData(event.currentTarget).get('search')?.toString().trim() || ''; const next = new URLSearchParams(params); if (value) { next.set('search', value) } else { next.delete('search') } next.delete('page'); setParams(next) }
  return <section><h1 className="font-condensed text-3xl font-semibold">Catálogo para clientes</h1><p className="mt-2 text-slate-600">Los precios disponibles corresponden a tu clasificación comercial. Si no hay una tarifa configurada, solicita cotización.</p><form onSubmit={submit} className="mt-6 flex gap-2"><label className="sr-only" htmlFor="client-search">Buscar productos</label><input id="client-search" name="search" defaultValue={search} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3" placeholder="Buscar por producto o referencia"/><button className="rounded-lg bg-[#CE0203] px-5 py-3 font-bold text-white">Buscar</button></form><div className="mt-6"><CatalogGrid data={query.data} privateCatalog loading={query.isLoading} error={query.isError}/><CatalogPagination meta={query.data?.meta}/></div></section>
}
