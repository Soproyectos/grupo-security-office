import { Link, useNavigate } from 'react-router-dom'
import AccountMenu from './AccountMenu'
import CategoryMenuContainer from './mega-menu/CategoryMenuContainer'
import CoverageSelector from './CoverageSelector'
import StorefrontFooter from './StorefrontFooter'

type StorefrontChromeProps = { children: React.ReactNode }

const SEARCH_ROUTE = '/catalogo/buscar'

export default function StorefrontChrome({ children }: StorefrontChromeProps) {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <div className="hidden bg-[#484748] px-6 py-2 text-xs text-[#FAFAFA] sm:block lg:px-12">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <span>Línea de ventas: (6) 123 4567</span>
          <div className="flex items-center gap-5"><span>Rastrea tu pedido</span><span>Centro de ayuda</span><span>Distribuidor autorizado · marcas líderes en seguridad</span><span>Vende con nosotros</span></div>
        </div>
      </div>
      <header className="relative bg-white px-5 py-3 lg:h-20 lg:px-12 lg:py-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 lg:flex-nowrap lg:gap-6 lg:h-full">
          <Link to="/tienda" className="shrink-0 lg:flex lg:h-full lg:items-center" aria-label="Grupo Security, inicio">
            <picture>
              <source srcSet="/logo-grupo-security.webp" type="image/webp" media="(min-width: 1024px)" />
              <img
                src="/logo-grupo-security.png"
                alt="Grupo Security"
                className="h-12 w-auto object-contain sm:h-16 lg:h-[74px]"
                width={2000}
                height={1414}
              />
            </picture>
          </Link>
          <CategoryMenuContainer />
          <form
            action={SEARCH_ROUTE}
            method="get"
            className="order-3 flex min-w-full flex-1 items-center gap-2 rounded-[10px] border border-slate-300 bg-slate-50 px-4 focus-within:border-[#CE0203] focus-within:bg-white focus-within:ring-2 focus-within:ring-red-200 lg:order-none lg:min-w-0"
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
            <span className="sr-only">Buscar productos</span>
            <input
              name="q"
              className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm outline-none"
              placeholder="¿Qué estás buscando?"
            />
            <button
              type="submit"
              aria-label="Buscar"
              className="text-slate-500 transition hover:text-[#CE0203]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
            </button>
          </form>
          <CoverageSelector />
          <AccountMenu />
        </div>
      </header>
      {children}
      <StorefrontFooter />
      <a
        href="https://wa.me/576011234567"
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