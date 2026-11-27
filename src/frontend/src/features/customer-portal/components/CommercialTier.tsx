import { whatsappUrl } from '../../storefront/constants/contact'
import type { PortalAccount } from '../types/customer-portal.types'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

function BasicPriceAccess() {
  return (
    <div className="mt-2 rounded-control bg-surface-100 px-3 py-2 text-sm text-ink-900">
      <p>Tu acceso es básico. Un asesor puede habilitarte cotizaciones y precios.</p>
      <div className="flex flex-wrap items-center gap-x-3">
        <a
          href={whatsappUrl('Hola, quiero solicitar acceso a precios de Grupo Security.')}
          target="_blank"
          rel="noreferrer noopener"
          className={`inline-flex min-h-11 items-center font-semibold !text-security-600 hover:underline ${FOCUS}`}
        >
          Pedir acceso a precios
        </a>
        <p className="text-ink-600">Se abre WhatsApp para hablar con un asesor.</p>
      </div>
    </div>
  )
}

/** The company tariff level of the account (set by the advisor), shown in "Inicio" and "Mis datos". */
export default function CommercialTier({ account }: { account: PortalAccount }) {
  const tier = account.tier?.name || (account.type === 'INSTALLER' ? 'Instalador' : 'Cliente final')

  return (
    <section className="rounded-card border border-surface-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 className="text-lg font-semibold">Tu clasificación comercial</h2>
        <p className="rounded-full bg-security-50 px-3 py-1 text-sm font-semibold text-security-600">{tier}</p>
      </div>
      <p className="mt-2 text-sm text-ink-600">La administración actualiza tu escalafón y las condiciones comerciales de tu cuenta.</p>
      {!account.tier && <BasicPriceAccess />}
    </section>
  )
}
