import { useContext } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { useCustomerPortalSession } from '../../customer-portal/hooks/useCustomerPortal'
import { PENDING_ACCOUNT_MESSAGE, SETTING_UP_MESSAGE, quoteAccess } from '../../customer-portal/utils/quote-access'

const LINK = 'inline-flex min-h-11 items-center font-semibold !text-security-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'
const COMPLETE_PROFILE_PATH = '/clientes/completar-perfil'

/**
 * A signed-in customer who cannot see their prices yet gets one line under the header explaining why and
 * where to go. Nothing for visitors and nothing once the account can quote.
 */
function SessionNotice() {
  const session = useCustomerPortalSession()
  const account = session.isSuccess && !session.isError ? session.data : undefined
  if (!account) return null
  if (account.profileComplete === false) {
    return <Notice text="Completa tus datos para ver tus precios y cotizar." to={COMPLETE_PROFILE_PATH} action="Completar mis datos" />
  }
  const access = quoteAccess(account)
  if (access === 'ready') return null
  return <Notice text={access === 'pending' ? PENDING_ACCOUNT_MESSAGE : SETTING_UP_MESSAGE} to="/clientes" action="Ver mi cuenta" />
}

function Notice({ text, to, action }: { text: string; to: string; action: string }) {
  return (
    <div role="status" className="border-b border-surface-200 bg-surface-100">
      <div className="mx-auto flex max-w-[105rem] flex-wrap items-center justify-between gap-x-4 px-5 text-sm text-ink-900 sm:px-8 lg:px-12">
        <p className="py-2">{text.endsWith('.') ? text : `${text}.`} Mientras tanto ves los precios públicos.</p>
        <Link to={to} className={LINK}>{action}</Link>
      </div>
    </div>
  )
}

export default function CatalogAccountNotice() {
  const queryClient = useContext(QueryClientContext)
  const { pathname } = useLocation()
  const inShop = pathname.startsWith('/catalogo') || pathname.startsWith('/productos')
  return queryClient && inShop ? <SessionNotice /> : null
}
