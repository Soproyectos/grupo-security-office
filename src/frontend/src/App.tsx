import CustomerAccountPage, { CustomerPortalShell } from './features/customer-portal/pages/CustomerAccountPage'
import CompleteProfilePage from './features/customer-portal/pages/CompleteProfilePage'
import PortalQuoteDraftPage from './features/customer-portal/pages/PortalQuoteDraftPage'
import { PortalMyQuotesPage, PortalQuoteDetailPage } from './features/customer-portal/pages/PortalMyQuotesPage'
import PortalAccountsSection from './features/customer-portal/components/PortalAccountsSection'
import ZonesAdminSection from './features/customer-portal/components/ZonesAdminSection'
import ClientLoginPage from './features/storefront/pages/ClientLoginPage'
import PrivacyPolicyPage from './features/storefront/pages/PrivacyPolicyPage'
import AccessRequestPage from './features/storefront/pages/AccessRequestPage'
import ClientForgotPasswordPage from './features/storefront/pages/ClientForgotPasswordPage'
import ClientResetPasswordPage from './features/storefront/pages/ClientResetPasswordPage'
import PasswordResetSuccessPage from './features/storefront/pages/PasswordResetSuccessPage'
import AgendaCalendarPage from './features/agenda/AgendaCalendarPage'
import { baseAgendaGrants } from './features/agenda/agenda-access'
import TeamWorkflowPage from './features/supervisor/TeamWorkflowPage'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth.store'
import AdminLayout from './components/layout/AdminLayout'
import ScrollToTop from './components/ScrollToTop'
import CommercialLayout from './components/layout/CommercialLayout'
import CategoryPage from './features/storefront/pages/CategoryPage'
import SearchResultsPage from './features/storefront/pages/SearchResultsPage'
import StorefrontHome from './features/storefront/pages/StorefrontHome'
import StorefrontNotFoundPage from './features/storefront/pages/StorefrontNotFoundPage'
import CatalogIndexPage from './features/storefront/pages/CatalogIndexPage'
import ServicesPage from './features/storefront/pages/ServicesPage'
import ProjectsPage from './features/storefront/pages/ProjectsPage'
import CertificationsPage from './features/storefront/pages/CertificationsPage'
import TrainingCalendarPage from './features/storefront/pages/TrainingCalendarPage'
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
import UsersLayout from './features/users/components/UsersLayout'
import AssignedTargetsPage from './pages/AssignedTargetsPage'
import AssignedHome from './pages/AssignedHome'
import AssignedReportsPage from './pages/AssignedReportsPage'
import AuditPage from './pages/AuditPage'
import PromotionManagerPage from './features/promotions/PromotionManagerPage'
import SalesPromotionsPanel from './features/promotions/SalesPromotionsPanel'
import MarketingLayout from './features/marketing/MarketingLayout'
import BannersTab from './features/marketing/BannersTab'
import MarketingIndex from './features/marketing/MarketingIndex'
import { hasMarketingAction, MARKETING_NOTICES_PATH, MARKETING_PROMOTIONS_PATH } from './features/marketing/marketing-access'
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
  /** Exige la acción de marketing asignada (ver banners y ventanas emergentes). */
  marketingPanel?: boolean
  adminOnly?: boolean
}) {
  const roles = useAuthStore((state) => state.user?.roles)
  const { access, status, refetch } = useOwnUserAccess()
  if (canAdministerAccess(roles)) return <>{children}</>
  if (status === 'loading') return <p role="status">Cargando tus accesos…</p>
  if (status === 'unavailable') return <div role="alert"><p>No pudimos comprobar tus accesos.</p><button type="button" onClick={() => void refetch()}>Reintentar</button></div>
  const input = { roles, grants: access?.grants ?? [], status }
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
    <>
    <ScrollToTop />
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
          {/* Portal tabs of Comercial: same actions as the tabs in COMMERCIAL_TABS; the server checks them again. */}
          <Route path="portal" element={<AccessBoundary actions={['portalAccounts:read']}><PortalAccountsSection /></AccessBoundary>} />
          <Route path="zones" element={<AccessBoundary actions={['portalZones:manage']}><ZonesAdminSection /></AccessBoundary>} />
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
        {/* Panel «Usuarios»: barra de pestañas por ruta (UsersLayout); cada ruta conserva su propio guarda. */}
        <Route path="users" element={<UsersLayout />}>
          <Route index element={<AccessBoundary actions={['users:read']}><UsersPage /></AccessBoundary>} />
          <Route path="access" element={<AccessBoundary adminOnly><UserAccessAssignments /></AccessBoundary>} />
        </Route>
        {/* COM-04 frontend: metas por integrante/periodo. Fuera del bloque
            Comercial (writePath propio, patrón /users/access de COM-01): el
            servidor autoriza por petición (roles + targets:edit/alcance). */}
        <Route path="targets" element={<AccessBoundary actions={['targets:read']}><AssignedTargetsPage /></AccessBoundary>} />
        <Route path="home" element={<AccessBoundary><AssignedHome /></AccessBoundary>} />
        <Route path="agenda" element={<AccessBoundary actions={['activities:read']}><AgendaCalendarPage /></AccessBoundary>} />
        <Route path="reports" element={<AccessBoundary actions={['teamInsights:read']}><AssignedReportsPage /></AccessBoundary>} />
        {/* Former «Clientes del portal» panel: now the «Solicitudes» tab of Comercial. Kept for saved links. */}
        <Route path="customer-accounts" element={<Navigate to="/commercial/portal" replace />} />
        <Route path="team-requests" element={<AccessBoundary adminOnly><TeamWorkflowPage kind="requests" key="admin-requests" /></AccessBoundary>} />
        <Route path="audit" element={<AccessBoundary actions={['audit:read']}><AuditPage /></AccessBoundary>} />
        {/* Former Comercial tab «Gestionar avisos»; kept for saved links. */}
        <Route path="promotions" element={<Navigate to={MARKETING_NOTICES_PATH} replace />} />
        {/* Panel «Marketing y mercadeo»: barra de pestañas por ruta (MarketingLayout). El layout muestra solo las
            pestañas permitidas y cada ruta conserva su propio guarda con la acción que ya exigía. «Campañas» se añadirá después. */}
        <Route path="marketing" element={<MarketingLayout />}>
          <Route index element={<MarketingIndex />} />
          <Route path="banners" element={<AccessBoundary marketingPanel actions={['marketing:read']}><BannersTab /></AccessBoundary>} />
          <Route path="promotions" element={<AccessBoundary actions={['commercialPromotions:read']}><SalesPromotionsPanel showPanel /></AccessBoundary>} />
          <Route path="notices" element={<AccessBoundary actions={['commercialPromotions:create', 'commercialPromotions:edit', 'commercialPromotions:publish', 'commercialPromotions:withdraw']}><PromotionManagerPage /></AccessBoundary>} />
        </Route>

      </Route>
      <Route
        path="/sales"
        element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}
      >
        <Route index element={<AccessBoundary><AssignedHome /></AccessBoundary>} />
        <Route path="customers" element={<AccessBoundary actions={['customers:read']}><CustomersPage personal /></AccessBoundary>} />
        <Route path="agenda" element={<AccessBoundary actions={['activities:read']}><AgendaCalendarPage /></AccessBoundary>} />
        {/* Former «Promociones internas» page of Comercial; kept for saved links. */}
        <Route path="promotions" element={<Navigate to={MARKETING_PROMOTIONS_PATH} replace />} />
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
      <Route path="/politica-de-privacidad" element={<PrivacyPolicyPage />} />
      <Route path="/clientes/registro" element={<AccessRequestPage />} />
      <Route path="/clientes/solicitar-acceso" element={<Navigate to="/clientes/registro" replace />} />
      <Route path="/clientes/recuperar" element={<ClientForgotPasswordPage />} />
      <Route path="/clientes/recuperar/exitoso" element={<PasswordResetSuccessPage stage="requested" />} />
      <Route path="/clientes/recuperar/satisfecho" element={<PasswordResetSuccessPage />} />
      <Route path="/clientes/restablecer" element={<ClientResetPasswordPage />} />
      <Route path="/recuperar-contrasena" element={<Navigate to="/login" replace />} />
      <Route path="/clientes" element={<CustomerPortalShell />}><Route index element={<CustomerAccountPage />} /><Route path="perfil" element={<CustomerAccountPage profile />} /><Route path="completar-perfil" element={<CompleteProfilePage />} /><Route path="cotizacion" element={<PortalQuoteDraftPage />} /><Route path="cotizaciones" element={<PortalMyQuotesPage />} /><Route path="cotizaciones/:id" element={<PortalQuoteDetailPage />} /><Route path="productos/*" element={<Navigate to="/catalogo" replace />} /></Route>
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
      <Route path="/capacitate" element={<TrainingCalendarPage />} />
      <Route path="/catalogo" element={<CatalogIndexPage />} />
      <Route path="/catalogo/categoria/:slug" element={<CategoryPage />} />
      <Route path="/catalogo/buscar" element={<SearchResultsPage />} />
      <Route path="/catalogo/productos/:id" element={<ProductDetailRoute />} />
      {/* Same sheet by published catalog slug */}
      <Route path="/productos/:slug" element={<ProductDetailRoute />} />
      {/* The storefront owns every unknown route: a visitor never lands on the
          internal app (/, /commercial/*, ...) from a dead or future link. */}
      <Route path="*" element={<StorefrontNotFoundPage />} />
    </Routes>
    </>
  )
}

export default App
