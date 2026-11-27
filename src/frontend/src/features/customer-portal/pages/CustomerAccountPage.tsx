import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useOutletContext, useSearchParams } from 'react-router-dom'
import { useCustomerPortalSession } from '../hooks/useCustomerPortal'
import DeleteAccountForm from '../components/DeleteAccountForm'
import ChangePasswordForm from '../components/ChangePasswordForm'
import ChangeEmailForm from '../components/ChangeEmailForm'
import CreatePasswordForm, { PASSWORD_CREATED_MESSAGE } from '../components/CreatePasswordForm'
import LinkedAccountsSection from '../components/LinkedAccountsSection'
import { useRefreshPortalSession } from '../hooks/usePortalProfile'
import { useCustomerPortalAuthStore } from '../../../stores/customer-portal-auth.store'
import StorefrontChrome from '../../storefront/components/StorefrontChrome'
import CommercialTier from '../components/CommercialTier'
import CustomerHome from './CustomerHome'
import { quoteAccess } from '../utils/quote-access'
import { usePortalQuoteList } from '../../../stores/portal-quote-list.store'
import type { PortalAccount } from '../types/customer-portal.types'
const COMPLETE_PROFILE_PATH='/clientes/completar-perfil'
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

function portalNavigationClass(active: boolean) {
  const state = active ? 'border-security-600 !text-security-600' : 'border-transparent !text-ink-600 hover:!text-security-600'
  return `inline-flex min-h-11 items-center whitespace-nowrap border-b-[3px] text-sm font-semibold ${state} ${FOCUS}`
}

/** Sections of the portal. The quote ones appear once the account can quote; the count shows what is being built. */
function PortalTabs({ account }: { account: PortalAccount }) {
  const { count } = usePortalQuoteList(account.id)
  const canQuote = quoteAccess(account) === 'ready' && account.state === 'ACTIVE'
  const tabs: [string, string][] = [
    ['/clientes', 'Inicio'],
    ...(canQuote ? [['/clientes/cotizacion', count > 0 ? `Mi cotización (${count})` : 'Mi cotización'], ['/clientes/cotizaciones', 'Mis cotizaciones']] as [string, string][] : []),
    ['/clientes/perfil', 'Mis datos'],
  ]
  return (
    <nav aria-label="Mi cuenta de cliente" className="mx-auto flex max-w-7xl gap-4 overflow-x-auto px-4 sm:px-5">
      {tabs.map(([to, label]) => (
        <NavLink key={to} to={to} end={to === '/clientes' || to === '/clientes/cotizacion'} className={({ isActive }) => portalNavigationClass(isActive)}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

/**
 * The portal shares the storefront header. Its account menu owns sign-out and
 * the navigation below it takes the customer to the main portal sections.
 */
export function CustomerPortalShell() {
  const session = useCustomerPortalSession()
  const location = useLocation()

  useEffect(() => {
    if (session.data) useCustomerPortalAuthStore.getState().setAccount(session.data)
  }, [session.data])

  if (session.isPending) {
    return <StorefrontChrome><main className="mx-auto max-w-7xl px-5 py-4"><p role="status" className="text-ink-600">Comprobando tu cuenta…</p></main></StorefrontChrome>
  }
  if (session.isError) return <Navigate to="/clientes/login" replace />
  if (!session.data) return null
  if (session.data.profileComplete === false && location.pathname !== COMPLETE_PROFILE_PATH) {
    return <Navigate to={COMPLETE_PROFILE_PATH} replace />
  }

  return (
    <StorefrontChrome>
      <div className="border-b border-surface-200 bg-white">
        <PortalTabs account={session.data} />
      </div>
      <main className="mx-auto w-full max-w-7xl px-4 py-2 sm:px-5 sm:py-3">
        <Outlet context={session.data} />
      </main>
    </StorefrontChrome>
  )
}

function DeleteAccountSection({account}:{account:PortalAccount}) {
 const [confirming,setConfirming]=useState(false)
 return <section className="space-y-2 rounded-card border border-surface-200 bg-white p-4"><h2 className="text-lg font-semibold">Eliminar mi cuenta</h2><p className="max-w-prose text-sm text-ink-600">Se borrará tu cuenta y tus datos de acceso de inmediato. Esta acción no se puede deshacer. Los registros comerciales que tengamos contigo (cotizaciones, pedidos) los conserva la empresa.</p>{confirming?<DeleteAccountForm account={account} onCancel={()=>setConfirming(false)}/>:<button type="button" onClick={()=>setConfirming(true)} className={`min-h-11 rounded-control border border-security-600 px-4 text-sm font-semibold !text-security-600 hover:bg-security-50 ${FOCUS}`}>Eliminar mi cuenta</button>}</section>
}

function EmailChangedNotice() {
 const refresh=useRefreshPortalSession()
 useEffect(()=>{void refresh()},[])// eslint-disable-line react-hooks/exhaustive-deps
 return <p role="status" className="rounded-control bg-surface-100 p-3 text-sm font-semibold text-ink-900">Tu correo se actualizó.</p>
}

const PROFILE_SECTIONS = [
  { id: 'datos', label: 'Datos', to: '/clientes/perfil' },
  { id: 'seguridad', label: 'Seguridad', to: '/clientes/perfil?seccion=seguridad' },
  { id: 'cuentas-vinculadas', label: 'Cuentas vinculadas', to: '/clientes/perfil?seccion=cuentas-vinculadas' },
] as const

function CustomerProfile({ account }: { account: PortalAccount }) {
  const [params] = useSearchParams()
  const [passwordCreated, setPasswordCreated] = useState(false)
  const emailChanged = params.get('email') === 'cambiado'
  const requestedSection = params.get('seccion')
  const activeSection = PROFILE_SECTIONS.find(({ id }) => id === requestedSection)?.id
    ?? (emailChanged ? 'seguridad' : 'datos')

  return (
    <div className="space-y-3">
      <nav aria-label="Secciones de Mis datos" className="flex flex-wrap gap-x-4 border-b border-surface-200">
        {PROFILE_SECTIONS.map(({ id, label, to }) => (
          <Link
            key={id}
            to={to}
            aria-current={id === activeSection ? 'page' : undefined}
            className={portalNavigationClass(id === activeSection)}
          >
            {label}
          </Link>
        ))}
      </nav>

      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-condensed text-2xl font-semibold">Mis datos</h1>
        <p className="min-w-0 break-words text-sm text-ink-600">{account.companyName}</p>
      </header>

      {emailChanged && <EmailChangedNotice />}
      {activeSection === 'datos' && (
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          <section className="space-y-2 rounded-card border border-surface-200 bg-white p-4">
            <h2 className="text-lg font-semibold">Datos de tu cuenta</h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              <dt className="font-medium text-ink-600">Contacto</dt>
              <dd className="break-words">{account.contactName}</dd>
              <dt className="font-medium text-ink-600">Empresa</dt>
              <dd className="break-words">{account.companyName}</dd>
              <dt className="font-medium text-ink-600">Correo</dt>
              <dd className="break-words">{account.email}</dd>
            </dl>
            <Link to={COMPLETE_PROFILE_PATH} className={`inline-flex min-h-11 items-center text-sm font-semibold !text-security-600 hover:underline ${FOCUS}`}>
              Editar mis datos
            </Link>
          </section>
          <CommercialTier account={account} />
        </div>
      )}
      {activeSection === 'seguridad' && (
        <>
          {passwordCreated && <p role="status" className="rounded-control bg-surface-100 p-3 text-sm font-semibold text-ink-900">{PASSWORD_CREATED_MESSAGE}</p>}
          {account.hasPassword === true && (
            <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
              <ChangePasswordForm account={account} />
              <ChangeEmailForm account={account} />
            </div>
          )}
          {account.hasPassword === false && <CreatePasswordForm account={account} onCreated={() => setPasswordCreated(true)} />}
          <DeleteAccountSection account={account} />
        </>
      )}
      {activeSection === 'cuentas-vinculadas' && <LinkedAccountsSection account={account} />}
    </div>
  )
}

export default function CustomerAccountPage({ profile = false }: { profile?: boolean }) {
  const account = useOutletContext<PortalAccount>()

  if (profile) return <CustomerProfile account={account} />

  return <CustomerHome account={account} />
}
