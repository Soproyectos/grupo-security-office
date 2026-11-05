import { Link, useLocation, useNavigate } from 'react-router-dom'
import AccountMenu from './AccountMenu'
import CategoryMenuContainer from './mega-menu/CategoryMenuContainer'
import StorefrontFooter from './StorefrontFooter'
import { whatsappUrl } from '../constants/contact'

type StorefrontChromeProps = {
  children: React.ReactNode
  home?: boolean
  /** Header search field; defaults to on for inner pages and off for the home. */
  search?: boolean
}

const SEARCH_ROUTE = '/catalogo/buscar'

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-security-500'

/**
 * One item of the main navigation. The active item is marked with the darker
 * red and a 3px underline; the colour carries `!` because the global `a` rules
 * of index.css would otherwise win over the utility on the links.
 */
const NAV_ITEM =
  `inline-flex min-h-12 items-center gap-1.5 border-b-[3px] text-base lg:gap-2 ${FOCUS}`
const NAV_ITEM_ACTIVE = `${NAV_ITEM} border-security-600 font-bold !text-security-600`
const NAV_ITEM_IDLE = `${NAV_ITEM} border-transparent font-medium !text-storefront-ink hover:!text-security-600 focus:!text-security-600`

const navigationIcons = {
  catalog: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  solutions: 'm12 3 9 5-9 5-9-5 9-5z M3 12l9 5 9-5 M3 16l9 5 9-5',
  support: 'M3 13v-2a9 9 0 0 1 18 0v2 M3 13h4v6H5a2 2 0 0 1-2-2z M21 13h-4v6h2a2 2 0 0 0 2-2z M19 19c0 2-3 3-7 3',
}

function NavigationIcon({ name }: { name: keyof typeof navigationIcons }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="hidden h-5 w-5 shrink-0 lg:block">
      <path d={navigationIcons[name]} />
    </svg>
  )
}

export default function StorefrontChrome({ children, home = false, search }: StorefrontChromeProps) {
  const showSearch = search ?? !home
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const catalogActive = home || pathname.startsWith('/catalogo')
  return (
    <div className="min-h-screen bg-surface-50 text-ink-900">
      <header className="relative border-b border-surface-200 bg-white px-4 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 py-1.5 lg:min-h-[84px] lg:flex-nowrap lg:gap-x-7 lg:py-0">
          <Link
            to="/tienda"
            className={`order-1 shrink-0 rounded-control ${FOCUS}`}
            aria-label="Grupo Security, inicio"
          >
            <picture className="grid h-14 w-[150px] place-content-center overflow-hidden lg:h-[72px] lg:w-[190px]">
              <source srcSet="/logo-grupo-security.webp" type="image/webp" media="(min-width: 1024px)" />
              <img
                src="/logo-grupo-security.png"
                alt="Grupo Security"
                className="h-auto w-[150px] max-w-none lg:w-[190px]"
                width={2000}
                height={1414}
              />
            </picture>
          </Link>
          <span aria-hidden="true" className="hidden w-px self-stretch bg-surface-300 lg:order-2 lg:my-[18px] lg:block" />
          <nav
            aria-label="Tienda"
            className="order-4 flex w-full items-center justify-between border-t border-surface-200 lg:order-3 lg:w-auto lg:justify-start lg:gap-7 lg:border-t-0"
          >
            <CategoryMenuContainer
              triggerClassName={catalogActive ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE}
              triggerContent={
                <>
                  <NavigationIcon name="catalog" />
                  Catálogo
                  <span aria-hidden="true" className="text-[11px]">▾</span>
                </>
              }
            />
            <Link className={NAV_ITEM_IDLE} to="/soluciones">
              <NavigationIcon name="solutions" />
              Soluciones
            </Link>
            <Link className={NAV_ITEM_IDLE} to="/servicios/soporte">
              <NavigationIcon name="support" />
              Soporte
            </Link>
          </nav>
          {!showSearch ? (
            // Without search (home, sign-in pages) a flexible spacer pushes "Mi cuenta" right.
            <span aria-hidden="true" className="hidden lg:order-4 lg:block lg:flex-1" />
          ) : (
            <form
              action={SEARCH_ROUTE}
              method="get"
              className="order-3 mb-2.5 mt-0.5 flex min-h-12 w-full items-center gap-2.5 rounded-control border border-ink-500 bg-white px-4 focus-within:border-security-500 lg:order-4 lg:m-0 lg:min-w-0 lg:flex-1"
              onSubmit={(event) => {
                // The SPA navigation wins over the native action: same
                // destination, no full page reload. The `action`/`method` stay
                // so a submit without JavaScript still reaches the route.
                event.preventDefault()
                const value = new FormData(event.currentTarget).get('q')
                if (typeof value === 'string' && value.trim() !== '') {
                  navigate(`${SEARCH_ROUTE}?q=${encodeURIComponent(value.trim())}`)
                }
              }}
            >
              <button
                type="submit"
                aria-label="Buscar"
                className={`inline-flex h-11 w-6 shrink-0 items-center justify-center rounded-control text-ink-600 transition hover:text-security-600 ${FOCUS}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                </svg>
              </button>
              <input
                name="q"
                type="search"
                aria-label="Buscar productos"
                className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-base text-storefront-ink outline-none placeholder:text-ink-600"
                placeholder="¿Qué estás buscando?"
              />
            </form>
          )}
          <div className="order-2 ml-auto lg:order-5 lg:ml-0">
            <AccountMenu />
          </div>
        </div>
      </header>
      {children}
      <StorefrontFooter />
      <a
        href={whatsappUrl()}
        target="_blank"
        rel="noreferrer noopener"
        aria-label="Escríbenos por WhatsApp"
        title="Escríbenos por WhatsApp"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:brightness-95"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
          <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3zm0 16.3a7.3 7.3 0 0 1-3.7-2l-.3-.3-2.7.7.7-2.6-.2-.3A7.3 7.3 0 1 1 12 19.3zm4.1-5.4c-.2-.1-1.3-.6-1.5-.7-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.4.3-.6.1a6 6 0 0 1-3-2.6c-.2-.3 0-.4.1-.6l.5-.6c.1-.2.1-.3 0-.5l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.5.1-.7.3-.9.9-.9 2.1.1 3.7a9.7 9.7 0 0 0 3.9 3.5c1.5.7 2.3.7 3 .6.5-.1 1.3-.6 1.5-1.1.2-.5.2-1 .1-1.1l-.5-.3z" />
        </svg>
      </a>
    </div>
  )
}