import { Link, useSearchParams } from 'react-router-dom'
import { CatalogGrid, CatalogPagination } from '../components/CatalogViews'
import { useCustomerCatalog } from '../hooks/useCatalog'
import { useCustomerPortalLogout } from '../hooks/useCustomerPortal'

export default function ClientCatalogPage() {
  const [params, setParams] = useSearchParams(); const logout = useCustomerPortalLogout()
  const search = params.get('search') || ''; const page = Number(params.get('page') || '1')
  const query = useCustomerCatalog({ search: search || undefined, page })
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const value = new FormData(event.currentTarget).get('search')?.toString().trim() || ''; const next = new URLSearchParams(params); if (value) { next.set('search', value) } else { next.delete('search') } next.delete('page'); setParams(next) }
  return <main className="min-h-screen bg-slate-50"><header className="flex items-center justify-between bg-white px-5 py-4 shadow-sm"><Link to="/" className="font-bold text-[#CE0203]">Grupo Security</Link><button type="button" onClick={() => logout.mutate()} className="text-sm font-medium text-slate-700">Cerrar sesión</button></header><main className="mx-auto max-w-7xl px-5 py-8"><h1 className="text-3xl font-black">Productos para clientes</h1><p className="mt-2 text-slate-600">Tus precios comerciales se muestran según tu tipo de cuenta.</p><form onSubmit={submit} className="mt-6 flex gap-2"><label className="sr-only" htmlFor="client-search">Buscar productos</label><input id="client-search" name="search" defaultValue={search} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3" placeholder="Buscar por producto o referencia"/><button className="rounded-lg bg-[#CE0203] px-5 py-3 font-bold text-white">Buscar</button></form><div className="mt-6"><CatalogGrid data={query.data} privateCatalog loading={query.isLoading} error={query.isError}/><CatalogPagination meta={query.data?.meta}/></div></main></main>
}
