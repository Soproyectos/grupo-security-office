import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { isCatalogPath, NO_PANELS_MESSAGE, usePanelAccess } from '../../features/users/access'

/**
 * Navegación de Comercial filtrada por concesiones individuales (COM-01 §4).
 *
 * Antes: `VISIBLE_TABS = COMMERCIAL_TABS` sin gating (OBS del contrato §2.3).
 * Ahora: las pestañas salen de `useCommercialAccess()` — identidad + grants de
 * `GET /users/:id/access`, la MISMA caché que usa el panel de concesiones
 * (`features/users/access.ts`, patrón `agenda-access.ts`). Sin ningún panel
 * concedido no se monta `<Outlet/>`: la vista queda «Sin paneles asignados»
 * y las páginas de las pestañas ni siquiera se montan, de modo que sus
 * queries no se emiten (aceptación 2: sin datos internos por URL/API en el
 * cliente). El servidor sigue siendo autoridad por petición.
 *
 * Mi resumen y Agenda NO se duplican aquí (ficha regla 2): viven en los
 * espacios personales (/sales, /supervisor) y el estado vacío no las inventa.
 */
export default function CommercialLayout() {
  const { pathname } = useLocation()
  const panel = isCatalogPath(pathname) ? 'catalog' : 'commercial'
  const access = usePanelAccess(panel)

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="w-full px-4">
        <h1 className="py-3 text-xl font-semibold">{panel === 'catalog' ? 'Catálogo y precios' : 'Comercial'}</h1>
        <div className="border-b border-[var(--color-border)]">
          <div className="flex items-center overflow-x-auto scrollbar-thin">
            {access.tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `px-3 py-2.5 text-sm font-condensed font-semibold whitespace-nowrap transition-all tracking-wider border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)] ${
                    isActive
                      ? 'text-[var(--color-primary)] border-[var(--color-primary)]'
                      : 'text-[var(--color-text-secondary)] border-transparent hover:text-[var(--color-primary)]'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </div>

        <main className="py-6">
          {access.hasAnyPanel ? (
            <Outlet />
          ) : (
            <div
              aria-label={NO_PANELS_MESSAGE}
              className="max-w-md mx-auto text-center py-12 space-y-2"
            >
              <p className="text-base font-condensed font-semibold text-[var(--color-text-primary)]">
                {NO_PANELS_MESSAGE}
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Tu cuenta no tiene acciones de este panel concedidas. Tus herramientas personales
                siguen disponibles fuera de este panel.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
