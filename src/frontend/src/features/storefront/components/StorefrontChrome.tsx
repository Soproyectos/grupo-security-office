import { Link } from 'react-router-dom'
import CategoryMenuContainer from './mega-menu/CategoryMenuContainer'

type StorefrontChromeProps = { children: React.ReactNode }

export default function StorefrontChrome({ children }: StorefrontChromeProps) {
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
          <Link to="/" className="shrink-0 lg:flex lg:h-full lg:items-center" aria-label="Grupo Security, inicio">
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
          <label className="order-3 flex min-w-full flex-1 items-center gap-2 rounded-[10px] border border-slate-300 bg-slate-50 px-4 focus-within:border-[#CE0203] focus-within:bg-white focus-within:ring-2 focus-within:ring-red-200 lg:order-none lg:min-w-0">
            <span className="sr-only">Buscar productos</span>
            <input
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
          </label>
          <Link to="/clientes/login" className="ml-auto flex shrink-0 items-center gap-2 text-slate-500 transition hover:text-[#CE0203]" title="Mi cuenta"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" height="34" width="34" aria-hidden="true"><path fill="currentColor" d="M35.8 26c2.3-1.8 3.8-4.6 3.8-7.7 0-5.4-4.4-9.7-9.7-9.7-5.4 0-9.7 4.4-9.7 9.7 0 3.1 1.5 5.9 3.7 7.7-5.5 1.4-9.4 4.6-9.4 8.3V53.1H45V34.3c0-3.8-3.8-7-9.2-8.3zm-13-7.7c0-3.8 3.1-7 7-7 3.8 0 7 3.1 7 7s-3.1 7-7 7c-3.9-.1-7-3.2-7-7zm19.5 32H17.2v-16c0-1.4 1.1-2.8 3.1-4 2.4-1.4 5.9-2.3 9.4-2.3s7 .8 9.4 2.3c2 1.2 3.1 2.6 3.1 4v16z" /></svg><span className="text-xs font-bold text-slate-800">Mi Cuenta</span></Link>
          <Link to="/clientes/solicitar-acceso" className="shrink-0 rounded-[10px] bg-[#CE0203] px-4 py-3 text-xs font-bold text-white transition hover:bg-[#AD0102]">Crear cuenta</Link>
        </div>
      </header>
      {children}
      <footer className="bg-[#1A1A1A] px-5 py-8 text-center text-xs text-slate-300">© {new Date().getFullYear()} Grupo Security S.A.S. Todos los derechos reservados.</footer>
    </div>
  )
}