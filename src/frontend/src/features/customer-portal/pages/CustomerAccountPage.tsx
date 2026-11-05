import { useEffect } from 'react'
import { Link, Navigate, NavLink, Outlet, useOutletContext } from 'react-router-dom'
import { useCustomerPortalSession, useCustomerPortalLogout } from '../hooks/useCustomerPortal'
import { useCustomerPortalAuthStore } from '../../../stores/customer-portal-auth.store'
import StorefrontChrome from '../../storefront/components/StorefrontChrome'
import type { PortalAccount } from '../types/customer-portal.types'
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

/**
 * Layout of every /clientes/* portal route. It wraps the section in the common
 * storefront chrome ONCE (header, footer and WhatsApp), so the subroutes inherit
 * it; the chrome contributes no <main>, so the shell owns the only one. The
 * session bar (contact name, sign out) and the portal navigation stay here;
 * the common AccountMenu only offers "Mi portal" / "Salir" shortcuts.
 */
export function CustomerPortalShell() {
 const session=useCustomerPortalSession(),logout=useCustomerPortalLogout()
 useEffect(()=>{if(session.data)useCustomerPortalAuthStore.getState().setAccount(session.data)},[session.data])
 if(session.isPending)return <StorefrontChrome><main className="mx-auto max-w-7xl px-5 py-8"><p role="status" className="text-ink-600">Comprobando tu cuenta…</p></main></StorefrontChrome>
 if(session.isError)return <Navigate to="/clientes/login" replace/>
 if(!session.data)return null
 return <StorefrontChrome><div className="border-b border-surface-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 pt-3"><p className="text-sm font-semibold text-ink-900">{session.data.contactName||session.data.email}</p><button type="button" disabled={logout.isPending} onClick={()=>logout.mutate(undefined,{onSuccess:()=>window.location.assign('/clientes/login')})} className={`min-h-11 rounded-control px-3 text-sm font-semibold text-ink-600 hover:text-security-600 disabled:opacity-60 ${FOCUS}`}>Cerrar sesión</button></div><nav aria-label="Mi cuenta de cliente" className="mx-auto flex max-w-7xl gap-5 overflow-x-auto px-5">{[['/clientes','Mi cuenta'],['/clientes/productos','Catálogo'],['/clientes/perfil','Mis datos']].map(([to,label])=><NavLink key={to} to={to!} end={to==='/clientes'} className={({isActive})=>`inline-flex min-h-11 items-center whitespace-nowrap border-b-[3px] text-sm font-semibold ${FOCUS} ${isActive?'border-security-600 !text-security-600':'border-transparent !text-ink-600 hover:!text-security-600'}`}>{label}</NavLink>)}</nav></div>{logout.isError&&<p role="alert" className="mx-auto max-w-7xl px-5 pt-4 text-security-600">No se pudo cerrar sesión. Vuelve a intentarlo.</p>}<main className="mx-auto max-w-7xl px-5 py-8"><Outlet context={session.data}/></main></StorefrontChrome>
}
export default function CustomerAccountPage({profile=false}:{profile?:boolean}) {
 const account=useOutletContext<PortalAccount>()
 const tier=account.tier?.name||(account.type==='INSTALLER'?'Instalador':'Cliente final')
 return <div className="space-y-6"><header><p className="text-sm font-semibold text-security-600">Portal de clientes</p><h1 className="mt-2 font-condensed text-3xl font-semibold">{profile?'Mis datos':`Bienvenido, ${account.contactName||'cliente'}`}</h1><p className="mt-2 text-ink-600">{account.companyName}</p></header><section className="rounded-card border border-surface-200 bg-white p-6"><h2 className="text-xl font-semibold">Tu clasificación comercial</h2><p className="mt-3 inline-block rounded-full bg-security-50 px-4 py-2 font-semibold text-security-600">{tier}</p><p className="mt-3 text-sm text-ink-600">La administración actualiza tu escalafón y las condiciones comerciales de tu cuenta.</p></section>{profile?<section className="space-y-3 rounded-card border border-surface-200 bg-white p-6"><h2 className="text-xl font-semibold">Datos de tu cuenta</h2><p>Contacto: {account.contactName}</p><p>Empresa: {account.companyName}</p><p>Correo: {account.email}</p></section>:<div className="grid gap-5 sm:grid-cols-2"><Link to="/clientes/productos" className="rounded-card border border-surface-200 bg-white p-6 hover:border-security-500"><h2 className="text-xl font-semibold">Consultar catálogo</h2><p className="mt-2 text-sm text-ink-600">Encuentra productos y consulta los precios disponibles para tu cuenta.</p></Link><Link to="/clientes/perfil" className="rounded-card border border-surface-200 bg-white p-6 hover:border-security-500"><h2 className="text-xl font-semibold">Mis datos</h2><p className="mt-2 text-sm text-ink-600">Consulta la empresa y el contacto registrados.</p></Link></div>}</div>
}
