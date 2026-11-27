import { useContext, useEffect, useRef, useState } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useCustomerPortalLogout, useCustomerPortalSession } from '../../customer-portal/hooks/useCustomerPortal'
import { usePortalQuoteList } from '../../../stores/portal-quote-list.store'

const ACCOUNT_ICON = 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M4 21v-2a8 8 0 0 1 16 0v2z'

const QUOTE_ICON = 'M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z M6 5h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M9 11h6 M9 15h6'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

const ITEM =
  `flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-storefront-ink transition hover:bg-surface-100 hover:text-security-600 ${FOCUS}`

interface AccountMenuViewProps {
  signedIn: boolean
  accountName?: string
  onSignOut?: () => Promise<void>
  signingOut?: boolean
  signOutFailed?: boolean
  /** Products in the quote list; undefined = this person does not quote (no indicator). */
  quoteCount?: number
}

/**
 * The storefront header keeps visitor and signed-in actions in a single panel.
 * Session hooks run inside the query provider. Without one, the visitor menu
 * can still render in static contexts.
 *
 * The panel stays in the DOM and is hidden with `hidden` while closed, so it
 * is out of the tab order and the accessibility tree until opened.
 */
export default function AccountMenu() {
  const queryClient = useContext(QueryClientContext)
  return queryClient ? <SessionAccountMenu /> : <AccountMenuView signedIn={false} />
}

function SessionAccountMenu() {
  const session = useCustomerPortalSession()
  const logout = useCustomerPortalLogout()
  const navigate = useNavigate()
  // Show session options only once the query succeeded with data (no flicker while loading).
  const signedIn = session.isSuccess && Boolean(session.data) && !session.isError
  const onSignOut = async () => {
    await logout.mutateAsync()
    navigate('/clientes/login', { replace: true })
  }
  const quoteAccountId = signedIn && session.data?.state === 'ACTIVE' && session.data.canQuote !== false && session.data.profileComplete !== false ? session.data.id : undefined
  const quoteList = usePortalQuoteList(quoteAccountId)
  const accountName = signedIn ? session.data?.contactName?.trim() || session.data?.email : undefined
  return <AccountMenuView signedIn={signedIn} accountName={accountName} onSignOut={onSignOut} signingOut={logout.isPending} signOutFailed={logout.isError} quoteCount={quoteAccountId ? quoteList.count : undefined} />
}

function AccountMenuView({ signedIn, accountName, onSignOut, signingOut = false, signOutFailed = false, quoteCount }: AccountMenuViewProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
    {quoteCount !== undefined && (
      <Link to="/clientes/cotizacion" aria-label={`Mi cotización, ${quoteCount} ${quoteCount === 1 ? 'producto' : 'productos'}`} className={`inline-flex min-h-11 items-center gap-2 rounded-control px-1 text-sm font-semibold text-storefront-ink transition hover:text-security-600 ${FOCUS}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
          <path d={QUOTE_ICON} />
        </svg>
        <span className="hidden sm:inline">Mi cotización</span>
        {quoteCount > 0 && <span className="min-w-5 rounded-full bg-security-600 px-1.5 text-center text-xs font-bold text-white" aria-hidden="true">{quoteCount}</span>}
      </Link>
    )}
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="storefront-account-menu"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-control px-1 text-sm font-semibold text-storefront-ink transition hover:text-security-600 ${FOCUS}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
          <path d={ACCOUNT_ICON} />
        </svg>
        {accountName ? <span title={accountName} className="max-w-24 truncate sm:max-w-40 xl:max-w-56">{accountName}</span> : 'Mi cuenta'}
      </button>
      <div
        id="storefront-account-menu"
        hidden={!open}
        className="absolute right-0 top-full z-50 mt-1 w-48 rounded-card border border-surface-200 bg-white p-1 shadow-lg"
      >
        {signedIn ? (
          <>
            <Link to="/clientes" className={ITEM} onClick={() => setOpen(false)}>
              Mi portal
            </Link>
            {quoteCount !== undefined && (
              <>
                <Link to="/clientes/cotizacion" className={ITEM} onClick={() => setOpen(false)}>
                  Mi cotización ({quoteCount})
                </Link>
                <Link to="/clientes/cotizaciones" className={ITEM} onClick={() => setOpen(false)}>
                  Mis cotizaciones
                </Link>
              </>
            )}
            <button
              type="button"
              disabled={signingOut}
              className={`${ITEM} w-full text-left disabled:opacity-60`}
              onClick={() => { void onSignOut?.().then(() => setOpen(false)).catch(() => undefined) }}
            >
              {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
            {signOutFailed && <p role="alert" className="px-3 py-2 text-sm text-security-600">No se pudo cerrar sesión. Vuelve a intentarlo.</p>}
          </>
        ) : (
          <>
            <Link to="/clientes/login" className={ITEM} onClick={() => setOpen(false)}>
              Ingresar
            </Link>
            <Link to="/clientes/registro" className={ITEM} onClick={() => setOpen(false)}>
              Crear cuenta
            </Link>
          </>
        )}
      </div>
    </div>
    </div>
  )
}
