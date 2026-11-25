import type { PortalAccount } from '../types/customer-portal.types'

/** «Cuentas vinculadas» section of Mis datos: read-only. The server joins Google by itself when the email matches. */
export default function LinkedAccountsSection({ account }: { account: PortalAccount }) {
  const linked = account.linkedProviders?.includes('google') === true
  const showJoinHint = !linked && account.hasPassword === true
  return (
    <section className="space-y-3 rounded-card border border-surface-200 bg-white p-4">
      <h2 className="text-lg font-semibold">Cuentas vinculadas</h2>
      <p className="text-sm font-medium text-ink-900">Google: <span className="font-semibold">{linked ? 'Vinculada' : 'No vinculada'}</span></p>
      {showJoinHint && <p className="text-sm text-ink-600">Si entras con Google usando este mismo correo ({account.email}), tu cuenta se une sola.</p>}
    </section>
  )
}
