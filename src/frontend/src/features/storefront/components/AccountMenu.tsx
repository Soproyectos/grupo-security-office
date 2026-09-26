import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

export const ACCOUNT_MENU_LINKS = [
  { label: 'Ingresar', href: '/login', internal: true },
  { label: 'Crear cuenta', href: '/crear-cuenta', internal: false },
  { label: 'Rastrea tu pedido', href: '/rastrea-tu-pedido', internal: false },
] as const

/**
 * Header dropdown "Mi Cuenta" (frontend only, sin auth): the trigger shows the
 * user icon and the account label, and the menu is a static list of links to
 * the login, sign-up and order-tracking destinations. As the siblings of the
 * mega menu did (CoverageSelector), Escape and a click outside close the
 * dropdown; the menu stays in the DOM hidden while closed so the options are
 * always declared.
 */
export default function AccountMenu() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
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
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 text-slate-500 transition hover:text-[#CE0203]"
        title="Mi cuenta"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" height="34" width="34" aria-hidden="true">
          <path
            fill="currentColor"
            d="M35.8 26c2.3-1.8 3.8-4.6 3.8-7.7 0-5.4-4.4-9.7-9.7-9.7-5.4 0-9.7 4.4-9.7 9.7 0 3.1 1.5 5.9 3.7 7.7-5.5 1.4-9.4 4.6-9.4 8.3V53.1H45V34.3c0-3.8-3.8-7-9.2-8.3zm-13-7.7c0-3.8 3.1-7 7-7 3.8 0 7 3.1 7 7s-3.1 7-7 7c-3.9-.1-7-3.2-7-7zm19.5 32H17.2v-16c0-1.4 1.1-2.8 3.1-4 2.4-1.4 5.9-2.3 9.4-2.3s7 .8 9.4 2.3c2 1.2 3.1 2.6 3.1 4v16z"
          />
        </svg>
        <span className="text-xs font-bold text-slate-800">Mi Cuenta</span>
      </button>
      <ul
        role="menu"
        aria-label="Mi Cuenta"
        className={
          open
            ? 'absolute right-0 z-40 mt-2 w-52 rounded-[10px] border border-slate-200 bg-white py-2 shadow-lg'
            : 'hidden'
        }
      >
        {ACCOUNT_MENU_LINKS.map((link) => (
          <li key={link.href} role="none">
            {link.internal ? (
              <Link
                role="menuitem"
                to={link.href}
                onClick={() => setOpen(false)}
                className="flex w-full items-center px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                {link.label}
              </Link>
            ) : (
              <a
                role="menuitem"
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex w-full items-center px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                {link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
