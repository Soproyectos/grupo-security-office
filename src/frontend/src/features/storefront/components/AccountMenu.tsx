import { useContext, useEffect, useRef, useState } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useCustomerPortalLogout, useCustomerPortalSession } from '../../customer-portal/hooks/useCustomerPortal'

const ACCOUNT_ICON = 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M4 21v-2a8 8 0 0 1 16 0v2z'

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

const ITEM =
  `flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-storefront-ink transition hover:bg-surface-100 hover:text-security-600 ${FOCUS}`

interface AccountMenuViewProps {
  signedIn: boolean
  onSignOut?: () => Promise<void>
}

/**
 * Account entry shared by the home and the inner pages: always "Mi cuenta" with
 * a small menu. When a QueryClient is mounted it reads the customer portal
 * session and offers "Mi portal" / "Salir"; without a QueryClient (or while the
 * session loads, or when there is none) it offers the visitor options. The
 * session hooks live in an inner component so they only run under a provider.
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
    navigate('/')
  }
  return <AccountMenuView signedIn={signedIn} onSignOut={onSignOut} />
}

function AccountMenuView({ signedIn, onSignOut }: AccountMenuViewProps) {
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
    <div ref={rootRef} className="relative ml-auto shrink-0">
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
        Mi cuenta
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
            <button
              type="button"
              className={`${ITEM} w-full text-left`}
              onClick={() => {
                setOpen(false)
                // A failed logout leaves the menu as is; the next session check decides what to show.
                onSignOut?.().catch(() => undefined)
              }}
            >
              Salir
            </button>
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
  )
}
