import { Link, Outlet, useLocation } from 'react-router-dom'
import { MARKETING_PAGES, MARKETING_PANEL_LABEL, MARKETING_PATH, useMarketingPermissions } from './marketing-access'

/**
 * Shell of the panel «Marketing y mercadeo». Without `marketing:read` nothing
 * inside is mounted, so no request is sent. The server remains the authority
 * on every call. Inside a page, a breadcrumb leads back to the panel index.
 */
export default function MarketingLayout() {
  const { permissions, status } = useMarketingPermissions()
  const { pathname } = useLocation()
  const allowed = permissions.read
  const page = MARKETING_PAGES.find((candidate) => pathname === candidate.to || pathname.startsWith(`${candidate.to}/`))

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{MARKETING_PANEL_LABEL}</h1>
      {status === 'loading' ? (
        <p role="status">Cargando tus accesos…</p>
      ) : !allowed ? (
        <div role="status" className="space-y-1 py-8 text-center">
          <p className="font-semibold">Sin acceso a este panel</p>
          <p className="text-sm text-[var(--color-text-secondary)]">El administrador puede asignarte las herramientas que necesitas.</p>
        </div>
      ) : (
        <>
          {page && (
            <nav aria-label="Ruta de navegación" className="text-sm text-[var(--color-text-secondary)]">
              <Link to={MARKETING_PATH} className="min-h-[44px] inline-flex items-center text-[var(--color-primary)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]">
                {MARKETING_PANEL_LABEL}
              </Link>
              <span aria-hidden="true" className="mx-2">/</span>
              <span aria-current="page">{page.label}</span>
            </nav>
          )}
          <Outlet />
        </>
      )}
    </div>
  )
}
