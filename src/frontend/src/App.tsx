import CustomerAccountPage, { CustomerPortalShell } from './features/customer-portal/pages/CustomerAccountPage'
import PortalAccountsAdminPage from './features/customer-portal/pages/PortalAccountsAdminPage'
import ClientLoginPage from './features/storefront/pages/ClientLoginPage'
import AccessRequestPage from './features/storefront/pages/AccessRequestPage'
import ClientCatalogPage from './features/customer-portal/pages/ClientCatalogPage'
import PortalProductDetailPage from './features/customer-portal/pages/PortalProductDetailPage'
import AgendaCalendarPage from './features/agenda/AgendaCalendarPage'
import { baseAgendaGrants } from './features/agenda/agenda-access'
import TeamWorkflowPage from './features/supervisor/TeamWorkflowPage'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth.store'
import AdminLayout from './components/layout/AdminLayout'
import CommercialLayout from './components/layout/CommercialLayout'
import CategoryPage from './features/storefront/pages/CategoryPage'
import SearchResultsPage from './features/storefront/pages/SearchResultsPage'
import StorefrontHome from './features/storefront/pages/StorefrontHome'
import CatalogIndexPage from './features/storefront/pages/CatalogIndexPage'
import ServicesPage from './features/storefront/pages/ServicesPage'
import ProjectsPage from './features/storefront/pages/ProjectsPage'
import CertificationsPage from './features/storefront/pages/CertificationsPage'
import SupportPage from './features/storefront/pages/SupportPage'
import SolutionsPage from './features/storefront/pages/SolutionsPage'
import AboutPage from './features/storefront/pages/AboutPage'
import BranchesPage from './features/storefront/pages/BranchesPage'
import WarrantyPage from './features/storefront/pages/WarrantyPage'
import ConfigureEquipmentPage from './features/storefront/pages/ConfigureEquipmentPage'
import { ProductDetailRoute } from './features/products'
import Login from './pages/Login'
import ProductsPage from './pages/ProductsPage'
import ProductDetailPage from './pages/LibraryProductConsultationPage'
import LibraryUpdatePage from './pages/LibraryUpdatePage'
import LibraryUpdateLayout from './pages/LibraryUpdateLayout'
import LibraryProductQueuePage from './pages/LibraryProductQueuePage'
import LibraryProductEditorPage from './pages/LibraryProductEditorPage'
import LibraryProductWizardPage from './pages/LibraryProductWizardPage'
import LibraryCatalogImportPage from './pages/LibraryCatalogImportPage'
import LibraryMastersPage from './pages/LibraryMastersPage'
import CommercialSettingsPage from './pages/CommercialSettingsPage'
import CustomersPage from './pages/CustomersPage'
import QuotesPage from './pages/QuotesPage'
import QuoteDetailPage from './pages/QuoteDetailPage'
import UsersPage from './pages/UsersPage'
import UserAccessAssignments from './features/users/components/UserAccessAssignments'
import AssignedTargetsPage from './pages/AssignedTargetsPage'
import AssignedHome from './pages/AssignedHome'
import AssignedReportsPage from './pages/AssignedReportsPage'
import AuditPage from './pages/AuditPage'
import PromotionManagerPage from './features/promotions/PromotionManagerPage'
import SalesPromotionsPanel from './features/promotions/SalesPromotionsPanel'
import MarketingLayout from './features/marketing/MarketingLayout'
import BannersTab from './features/marketing/BannersTab'
import MarketingIndex from './features/marketing/MarketingIndex'
import { hasMarketingAction } from './features/marketing/marketing-access'
import { canAdministerAccess, firstAssignedLibraryPath, hasAssignedAction, hasAssignedLibraryPanel, NO_PANELS_MESSAGE, useOwnUserAccess, type LibraryPanelId } from './features/users/access'

function ProtectedRoute({
  children,
}: {
  children: React.ReactNode
}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  return !isAuthenticated || !user ? <Navigate to="/login" replace /> : <>{children}</>
}

/** No montar la página impide sus consultas mientras se comprueba el acceso. */
export function AccessBoundary({ children, actions = [], libraryPanel, marketingPanel = false, adminOnly = false }: {
  children: React.ReactNode
  actions?: readonly string[]
  libraryPanel?: LibraryPanelId
  /** Exige el panel «Marketing y mercadeo» asignado por paquete, no solo la acción suelta. */
  marketingPanel?: boolean
  adminOnly?: boolean
}) {
  const roles = useAuthStore((state) => state.user?.roles)
  const { access, status, refetch } = useOwnUserAccess()
  if (canAdministerAccess(roles)) return <>{children}</>
  if (status === 'loading') return <p role="status">Cargando tus accesos…</p>
  if (status === 'unavailable') return <div role="alert"><p>No pudimos comprobar tus accesos.</p><button type="button" onClick={() => void refetch()}>Reintentar</button></div>
  const input = { roles, grants: access?.grants ?? [], packages: access?.packages ?? [], sources: access?.sources ?? [], status }
  // Nivel 0 por rol: la agenda propia cuenta como acceso, sin contar como panel asignado.
  const withBase = { ...input, grants: [...input.grants, ...baseAgendaGrants(roles)] }
  const allowed = !adminOnly && (libraryPanel
    ? hasAssignedLibraryPanel(input, libraryPanel) && (!actions.length || hasAssignedAction(input, actions))
    : marketingPanel
      ? hasMarketingAction(input, 'read')
    : actions.length
      ? hasAssignedAction(withBase, actions)
      : input.grants.length > 0)
  // Pestaña de Biblioteca sin asignar: llevar a una que sí tenga, en vez de un aviso.
  const libraryFallback = !allowed && libraryPanel ? firstAssignedLibraryPath(input) : null
  if (libraryFallback) return <Navigate to={libraryFallback} replace />
  if (!allowed) return <div role="status"><p>{input.grants.length ? 'No tienes acceso a este apartado.' : NO_PANELS_MESSAGE}</p><p>El administrador puede asignarte las herramientas que necesitas.</p></div>
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AccessBoundary><AssignedHome /></AccessBoundary>} />
         <Route path="commercial" element={<CommercialLayout />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="products" element={<AccessBoundary libraryPanel="biblioteca-consulta" actions={['products:read']}><ProductsPage /></AccessBoundary>} />
          <Route path="products/:productId" element={<AccessBoundary libraryPanel="biblioteca-consulta" actions={['products:read']}><ProductDetailPage /></AccessBoundary>} />
          {/* Tres pestañas independientes: Fichas (products:write), Precios (prices:preview)
              y Productos (products:read). Cada ruta lleva su propio acceso. */}
          <Route path="library/update" element={<LibraryUpdateLayout />}>
            <Route index element={<AccessBoundary libraryPanel="biblioteca-precios" actions={['prices:preview']}><LibraryUpdatePage /></AccessBoundary>} />
            <Route path="products" element={<AccessBoundary libraryPanel="biblioteca-fichas" actions={['products:write']}><LibraryProductQueuePage /></AccessBoundary>} />
            <Route path="import" element={<AccessBoundary libraryPanel="biblioteca-importaciones" actions={['imports:read']}><LibraryCatalogImportPage /></AccessBoundary>} />
          </Route>
          {/* Catálogos maestros: pestaña propia (masters:read); editar exige masters:write. */}
          <Route path="library/masters" element={<AccessBoundary libraryPanel="biblioteca-maestros" actions={['masters:read']}><LibraryMastersPage /></AccessBoundary>} />
          <Route path="library/masters/:section" element={<AccessBoundary libraryPanel="biblioteca-maestros" actions={['masters:read']}><LibraryMastersPage /></AccessBoundary>} />
          {/* Sheet editor: a flat sibling of the layout route above, so it renders full width
              without the sub-navigation. */}
          <Route path="library/update/products/new" element={<AccessBoundary libraryPanel="biblioteca-fichas" actions={['products:write']}><LibraryProductWizardPage /></AccessBoundary>} />
          <Route path="library/update/products/new/:productId" element={<AccessBoundary libraryPanel="biblioteca-fichas" actions={['products:write']}><LibraryProductWizardPage /></AccessBoundary>} />
          <Route path="library/update/products/:productId" element={<AccessBoundary libraryPanel="biblioteca-fichas" actions={['products:write']}><LibraryProductEditorPage /></AccessBoundary>} />
          <Route path="lists" element={<Navigate to="/commercial/products" replace />} />
          <Route path="lists/:id" element={<Navigate to="/commercial/products" replace />} />
          <Route path="customers" element={<AccessBoundary actions={['customers:read']}><CustomersPage /></AccessBoundary>} />
          <Route path="quotes" element={<AccessBoundary actions={['quotes:read']}><QuotesPage /></AccessBoundary>} />
          <Route path="quotes/:id" element={<AccessBoundary actions={['quotes:read']}><QuoteDetailPage /></AccessBoundary>} />
          <Route path="lists/:listaId/products/:productId" element={<Navigate to="/commercial/products" replace />} />
          <Route path="assignments" element={<Navigate to="/commercial/products" replace />} />
          <Route path="settings" element={<AccessBoundary actions={['commercialSettings:read']}><CommercialSettingsPage /></AccessBoundary>} />
        </Route>
        <Route path="catalog-management" element={<CommercialLayout />}>
          <Route path="publication" element={<Navigate to="/commercial/library/update/products" replace />} />
          <Route path="publication/products/:productId" element={<Navigate to="/commercial/library/update/products" replace />} />
        </Route>
        <Route path="products" element={<Navigate to="/commercial/products" replace />} />
        <Route path="users" element={<AccessBoundary actions={['users:read']}><UsersPage /></AccessBoundary>} />
        {/* COM-01 frontend: panel de paquetes de acceso fuera de UsersPage
            (writePath propio; la página de Usuarios no se toca). */}
        <Route path="users/access" element={<AccessBoundary adminOnly><UserAccessAssignments /></AccessBoundary>} />
        {/* COM-04 frontend: metas por integrante/periodo. Fuera del bloque
            Comercial (writePath propio, patrón /users/access de COM-01): el
            servidor autoriza por petición (roles + targets:edit/alcance). */}
        <Route path="targets" element={<AccessBoundary actions={['targets:read']}><AssignedTargetsPage /></AccessBoundary>} />
        <Route path="home" element={<AccessBoundary><AssignedHome /></AccessBoundary>} />
        <Route path="agenda" element={<AccessBoundary actions={['activities:read']}><AgendaCalendarPage /></AccessBoundary>} />
        <Route path="reports" element={<AccessBoundary actions={['teamInsights:read']}><AssignedReportsPage /></AccessBoundary>} />
        <Route path="customer-accounts" element={<AccessBoundary adminOnly><PortalAccountsAdminPage /></AccessBoundary>} />
        <Route path="team-requests" element={<AccessBoundary adminOnly><TeamWorkflowPage kind="requests" key="admin-requests" /></AccessBoundary>} />
        <Route path="audit" element={<AccessBoundary actions={['audit:read']}><AuditPage /></AccessBoundary>} />
        <Route path="promotions" element={<AccessBoundary actions={['commercialPromotions:create', 'commercialPromotions:edit', 'commercialPromotions:publish', 'commercialPromotions:withdraw']}><PromotionManagerPage /></AccessBoundary>} />
        {/* Panel «Marketing y mercadeo»: índice de páginas; hoy solo Banners. «Campañas» se añadirá después. */}
        <Route path="marketing" element={<AccessBoundary marketingPanel actions={['marketing:read']}><MarketingLayout /></AccessBoundary>}>
          <Route index element={<MarketingIndex />} />
          <Route path="banners" element={<BannersTab />} />
        </Route>

      </Route>
      <Route
        path="/sales"
        element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}
      >
        <Route index element={<AccessBoundary><AssignedHome /></AccessBoundary>} />
        <Route path="customers" element={<AccessBoundary actions={['customers:read']}><CustomersPage personal /></AccessBoundary>} />
        <Route path="agenda" element={<AccessBoundary actions={['activities:read']}><AgendaCalendarPage /></AccessBoundary>} />
        <Route path="promotions" element={<AccessBoundary actions={['commercialPromotions:read']}><SalesPromotionsPanel showPanel /></AccessBoundary>} />
        <Route path="quotes" element={<AccessBoundary actions={['quotes:read']}><QuotesPage personal quotesPath="/sales/quotes" /></AccessBoundary>} />
        <Route path="quotes/:id" element={<AccessBoundary actions={['quotes:read']}><QuoteDetailPage personal quotesPath="/sales/quotes" /></AccessBoundary>} />
        <Route path="*" element={<Navigate to="/sales" replace />} />
      </Route>
      <Route path="/supervisor" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AccessBoundary actions={['teamInsights:read']}><AssignedReportsPage /></AccessBoundary>} />
        <Route path="agenda" element={<AccessBoundary actions={['activities:read']}><AgendaCalendarPage /></AccessBoundary>} />
        {/* No existe aún una acción asignable para peticiones; el servidor y la ruta las reservan a Super Admin. */}
        <Route path="requests" element={<AccessBoundary adminOnly><TeamWorkflowPage kind="requests" key="requests" /></AccessBoundary>} />
        <Route path="*" element={<Navigate to="/supervisor" replace />} />
      </Route>
      <Route path="/clientes/login" element={<ClientLoginPage />} />
      <Route path="/clientes/registro" element={<AccessRequestPage />} />
      <Route path="/clientes/solicitar-acceso" element={<Navigate to="/clientes/registro" replace />} />
      <Route path="/clientes" element={<CustomerPortalShell />}><Route index element={<CustomerAccountPage />} /><Route path="perfil" element={<CustomerAccountPage profile />} /><Route path="productos" element={<ClientCatalogPage />} /><Route path="productos/:productId" element={<PortalProductDetailPage privateCatalog />} /></Route>
      <Route path="/tienda" element={<StorefrontHome />} />
      <Route path="/soluciones" element={<SolutionsPage />} />
      <Route path="/nosotros" element={<AboutPage />} />
      <Route path="/sedes" element={<BranchesPage />} />
      <Route path="/garantias" element={<WarrantyPage />} />
      <Route path="/servicios" element={<ServicesPage />} />
      <Route path="/servicios/proyectos" element={<ProjectsPage />} />
      <Route path="/servicios/soporte" element={<SupportPage />} />
      <Route path="/servicios/soporte/configurar" element={<ConfigureEquipmentPage />} />
      <Route path="/servicios/certificaciones" element={<CertificationsPage />} />
      <Route path="/catalogo" element={<CatalogIndexPage />} />
      <Route path="/catalogo/categoria/:slug" element={<CategoryPage />} />
      <Route path="/catalogo/buscar" element={<SearchResultsPage />} />
      <Route path="/catalogo/productos/:id" element={<ProductDetailRoute />} />
      {/* Same sheet by published catalog slug */}
      <Route path="/productos/:slug" element={<ProductDetailRoute />} />
      {/* The storefront owns every unknown route: a visitor never lands on the
          internal app (/, /commercial/*, ...) from a dead or future link. */}
      <Route path="*" element={<Navigate to="/tienda" replace />} />
    </Routes>
  )
}

export default App
