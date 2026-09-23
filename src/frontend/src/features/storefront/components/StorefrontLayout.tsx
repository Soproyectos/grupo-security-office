import { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface StorefrontLayoutProps {
  children: ReactNode
  showHeader?: boolean
  showFooter?: boolean
}

export default function StorefrontLayout({
  children,
  showHeader = true,
  showFooter = true,
}: StorefrontLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {showHeader && (
        <>
          {/* Utility bar */}
          <div
            className="w-full flex justify-between px-12 text-xs h-[29px] items-center"
            style={{ backgroundColor: '#484748', borderRadius: '3px' }}
          >
            <div className="flex gap-[22px]">
              <span style={{ color: '#FAFAFA' }}>Línea de ventas: (6) 123 4567</span>
              <span style={{ color: '#FAFAFA' }}>Rastrea tu pedido</span>
              <span style={{ color: '#FAFAFA' }}>Centro de ayuda</span>
            </div>
            <div className="flex gap-[22px]">
              <span style={{ color: '#FAFAFA' }}>
                Distribuidor autorizado · marcas líderes en seguridad
              </span>
              <a href="#" style={{ color: '#FAFAFA', fontWeight: 600 }}>
                Vende con nosotros
              </a>
            </div>
          </div>

          {/* Header */}
          <div className="w-full bg-white px-12 py-5 flex items-center gap-8">
            {/* Logo */}
            <div className="flex-shrink-0">
              <img
                src="/logo-grupo-security.png"
                alt="Grupo Security"
                style={{
                  height: '165px',
                  width: '181px',
                  objectFit: 'fill',
                  opacity: 0.75,
                  borderRadius: '11px',
                  margin: '-22px 2px 10px -34px',
                }}
              />
            </div>

            {/* Search bar */}
            <div className="flex-1 flex items-center gap-2.5 bg-surface-100 border-2 border-[#1A1A1A] rounded-[10px] px-4 py-1.5">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#64748B"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M21 21l-4.35-4.35M18 10.5a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z"
                />
              </svg>
              <span className="flex-1 text-sm text-ink-400">
                Buscar por producto, marca o SKU…
              </span>
              <button
                className="bg-security-500 text-white rounded-[7px] px-5 py-2.5 text-sm font-bold hover:bg-security-600"
                style={{ backgroundColor: '#CE0203' }}
              >
                Buscar
              </button>
            </div>

            {/* Login */}
            <Link
              to="/tienda/login"
              className="flex items-center gap-2 cursor-pointer hover:opacity-80"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#334155"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <div>
                <p className="text-[11px] text-ink-400">Hola, bienvenido</p>
                <p className="text-sm font-bold text-[#1A1A1A]">Inicia sesión</p>
              </div>
            </Link>

            {/* Create account button */}
            <Link
              to="/tienda/solicitar-acceso"
              className="px-[18px] py-3 font-bold text-sm text-white rounded-[10px] hover:opacity-90"
              style={{ backgroundColor: '#484748' }}
            >
              Crear cuenta
            </Link>
          </div>

          {/* Mega navigation */}
          <div
            className="w-full px-12 py-3 flex items-center gap-[30px]"
            style={{ backgroundColor: '#CE0203', height: '50px' }}
          >
            <span className="text-white text-sm font-bold">Todas las categorías</span>
            {[
              'Videovigilancia',
              'Control de Acceso',
              'Alarmas y Smart Home',
              'Marcas',
            ].map((cat) => (
              <button
                key={cat}
                className="text-white text-sm font-semibold hover:opacity-80"
              >
                {cat}
              </button>
            ))}
            <button
              className="ml-auto bg-white text-security-500 text-xs font-bold px-3 py-1 rounded-full hover:opacity-90"
              style={{ backgroundColor: '#fff', color: '#CE0203' }}
            >
              Promociones
            </button>
          </div>
        </>
      )}

      {/* Main content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      {showFooter && (
        <footer
          className="w-full py-6 text-center text-[11.5px]"
          style={{ backgroundColor: '#1A1A1A', color: '#CBD5E1' }}
        >
          <p className="m-0">
            © {new Date().getFullYear()} Grupo Security S.A.S. Todos los derechos
            reservados.
          </p>
        </footer>
      )}
    </div>
  )
}
