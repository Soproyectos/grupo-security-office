import { PENDING_ACCOUNT_MESSAGE, SETTING_UP_MESSAGE, quoteAccess } from '../utils/quote-access'
import type { PortalAccount } from '../types/customer-portal.types'

/** Notice for an account that cannot quote yet; renders nothing when quoting is available. */
export default function AccountStateNotice({ account }: { account: Pick<PortalAccount, 'state' | 'canQuote'> }) {
  const access = quoteAccess(account)
  if (access === 'ready') return null
  return (
    <section role="status" className="rounded-card border border-surface-200 bg-white p-4">
      <h2 className="text-lg font-semibold">{access === 'pending' ? PENDING_ACCOUNT_MESSAGE : SETTING_UP_MESSAGE}</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-600">
        {access === 'pending'
          ? 'Mientras tanto puedes ver el catálogo. Cuando tu cuenta esté activa verás tus precios y podrás pedir cotizaciones.'
          : 'En cuanto termine podrás armar tu cotización con tus precios. Si tienes prisa, escríbele por WhatsApp.'}
      </p>
    </section>
  )
}
