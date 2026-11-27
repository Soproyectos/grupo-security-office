import { Outlet } from 'react-router-dom'
import WorkspaceTabs, { type WorkspaceRouteTab } from '../../components/layout/WorkspaceTabs'
import { MARKETING_PANEL_LABEL, useMarketingPages } from './marketing-access'

/**
 * Shell of the panel «Marketing y mercadeo»: the shared tab bar by route
 * (docs/PATRON-PANELES-CON-PESTANAS.md) with Banners, Promociones internas and
 * Gestionar avisos. A tab only shows when the person has its own action; each
 * child route keeps its own AccessBoundary in App.tsx and the server checks every
 * call, so hiding a tab is not authorization. With no visible tab nothing inside
 * is mounted, so no request is sent.
 */
export default function MarketingLayout() {
  const { pages, status, refetch } = useMarketingPages()
  const tabs: WorkspaceRouteTab[] = pages.map((page) => ({ id: page.to, to: page.to, label: page.label, icon: page.icon, hint: page.hint }))

  return (
    <div className="space-y-4">
      {tabs.length > 0
        ? <WorkspaceTabs mode="route" variant="standalone" title={MARKETING_PANEL_LABEL} navLabel="Navegación de Marketing" tabs={tabs} />
        : <h1 className="sr-only">{MARKETING_PANEL_LABEL}</h1>}
      {status === 'loading' ? (
        <p role="status">Cargando tus accesos…</p>
      ) : tabs.length === 0 && status === 'unavailable' ? (
        <div role="alert" className="space-y-2 py-8 text-center">
          <p className="font-semibold">No pudimos comprobar tus accesos.</p>
          <button type="button" onClick={() => void refetch()} className="min-h-[44px] rounded-lg border border-[var(--color-border)] px-4 text-sm font-semibold hover:bg-[var(--color-bg-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-focus-ring)]">
            Reintentar
          </button>
        </div>
      ) : tabs.length === 0 ? (
        <div role="status" className="space-y-1 py-8 text-center">
          <p className="font-semibold">Sin acceso a este panel</p>
          <p className="text-sm text-[var(--color-text-secondary)]">El administrador puede asignarte las herramientas que necesitas.</p>
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  )
}
