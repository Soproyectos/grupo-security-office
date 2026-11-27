import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  COMMERCIAL_PORTAL_PATH,
  COMMERCIAL_ZONES_PATH,
  isCatalogPath,
  LIBRARY_IMPORTS_PATH,
  LIBRARY_MASTERS_PATH,
  LIBRARY_PRICES_PATH,
  LIBRARY_PRODUCTS_PATH,
  LIBRARY_SHEETS_PATH,
  NO_PANELS_MESSAGE,
  usePanelAccess,
} from '../../features/users/access'
import WorkspaceTabs, { type WorkspaceRouteTab } from './WorkspaceTabs'
import './library-workspace.css'

/** Cada pestaña de Biblioteca se muestra solo si la persona la tiene asignada. */
const libraryIcons: Readonly<Record<string, string>> = {
  [LIBRARY_PRODUCTS_PATH]: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  [LIBRARY_SHEETS_PATH]: 'M14 5l5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14v6z',
  [LIBRARY_PRICES_PATH]: 'M12 15V3m-4 4 4-4 4 4M4 14v6h16v-6',
  [LIBRARY_IMPORTS_PATH]: 'M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3',
  [LIBRARY_MASTERS_PATH]: 'M4 6h16M4 12h16M4 18h10',
}

/** Icon and help text of each Comercial tab, by route. Tabs without an entry still render (without icon path or help). */
const commercialMeta: Readonly<Record<string, { icon: string; hint: string }>> = {
  '/commercial/customers': { icon: 'M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 20v-2a4 4 0 0 0-3-3.9', hint: 'Los clientes que puedes consultar.' },
  [COMMERCIAL_PORTAL_PATH]: { icon: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z', hint: 'Cuentas creadas en la tienda: aprobar, asesor, cliente vinculado y tarifa.' },
  [COMMERCIAL_ZONES_PATH]: { icon: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', hint: 'Ciudades que reparten los registros nuevos entre asesores.' },
  '/commercial/quotes': { icon: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9 13h6M9 17h6', hint: 'Las cotizaciones que puedes consultar y su estado.' },
  '/targets': { icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01', hint: 'Metas por integrante y periodo.' },
  '/reports': { icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2', hint: 'Resumen de ventas y actividad del equipo.' },
}

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

  if (panel === 'catalog') {
    const destinations = access.tabs.map((tab) => ({ ...tab, icon: libraryIcons[tab.to] ?? libraryIcons[LIBRARY_PRODUCTS_PATH] }))
    const hasSheets = access.tabs.some((tab) => tab.to === LIBRARY_SHEETS_PATH)
    return (
      <div className="biblioteca-workspace">
        <div className="biblioteca-workspace__bar">
          <h1 className="biblioteca-workspace__label">Biblioteca</h1>
          {destinations.length > 0 && (
            <>
              <span className="biblioteca-workspace__separator" aria-hidden="true" />
              <nav aria-label="Navegación de Biblioteca" className="biblioteca-workspace__nav">
                {destinations.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `biblioteca-workspace__destination${isActive ? ' is-active' : ''}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.icon} /></svg>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              {pathname.startsWith('/commercial/products') && (
                <p className="biblioteca-workspace__hint">{hasSheets ? 'Catálogo global de consulta. Las fichas se editan en la pestaña Fichas.' : 'Catálogo global de consulta.'}</p>
              )}
              {pathname === LIBRARY_SHEETS_PATH && (
                <p className="biblioteca-workspace__hint">Catálogo completo. Busca un producto y abre su ficha para actualizarla.</p>
              )}
              {pathname === LIBRARY_PRICES_PATH && (
                <p className="biblioteca-workspace__hint">Carga de precios desde una plantilla de Excel.</p>
              )}
              {pathname === LIBRARY_IMPORTS_PATH && (
                <p className="biblioteca-workspace__hint">Carga de categorías, marcas y productos desde un archivo.</p>
              )}
              {pathname.startsWith(LIBRARY_MASTERS_PATH) && (
                <p className="biblioteca-workspace__hint">Categorías, marcas, tarifas y diccionario.</p>
              )}
            </>
          )}
        </div>
        <main className="biblioteca-workspace__content">
          {access.hasAnyPanel ? <Outlet /> : (
            <div aria-label={NO_PANELS_MESSAGE} className="biblioteca-workspace__empty"><h2>{NO_PANELS_MESSAGE}</h2><p>Tu cuenta no tiene accesos de Biblioteca asignados.</p></div>
          )}
        </main>
      </div>
    )
  }

  const tabs: WorkspaceRouteTab[] = access.tabs.map((tab) => ({ id: tab.to, to: tab.to, end: tab.end, label: tab.label, icon: commercialMeta[tab.to]?.icon ?? '', hint: commercialMeta[tab.to]?.hint ?? '' }))
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <div className="w-full px-4">
        {tabs.length > 0
          ? <WorkspaceTabs mode="route" variant="standalone" title="Comercial" navLabel="Navegación de Comercial" tabs={tabs} />
          : <h1 className="sr-only">Comercial</h1>}

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
