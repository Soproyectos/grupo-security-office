import CustomerAccountPage, { CustomerPortalShell } from './features/customer-portal/pages/CustomerAccountPage'
import PortalAccountsAdminPage from './features/customer-portal/pages/PortalAccountsAdminPage'
import ClientLoginPage from './features/storefront/pages/ClientLoginPage'
import AccessRequestPage from './features/storefront/pages/AccessRequestPage'
import ClientCatalogPage from './features/customer-portal/pages/ClientCatalogPage'
import PortalProductDetailPage from './features/customer-portal/pages/PortalProductDetailPage'
import AgendaCalendarPage from './features/agenda/AgendaCalendarPage'
import TeamWorkflowPage from './features/supervisor/TeamWorkflowPage'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth.store'
import AdminLayout from './components/layout/AdminLayout'
import CommercialLayout from './components/layout/CommercialLayout'
import CategoryPage from './features/storefront/pages/CategoryPage'
import SearchResultsPage from './features/storefront/pages/SearchResultsPage'
import StorefrontHome from './features/storefront/pages/StorefrontHome'
import CatalogIndexPage from './features/storefront/pages/CatalogIndexPage'
import { ProductDetailRoute } from './features/products'
import Login from './pages/Login'
import ProductsPage from './pages/ProductsPage'
import ProductDetailPage from './pages/ProductDetailPage'
import ListasPage from './pages/ListasPage'
import ListaDetailPage from './pages/ListaDetailPage'
import AssignmentsPage from './pages/AssignmentsPage'
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
import { PublicationBoardSection } from './features/catalog-publication/PublicationBoardPanel'
import { canAdministerAccess, hasAssignedAction, NO_PANELS_MESSAGE, useOwnUserAccess } from './features/users/access'

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
export function AccessBoundary({ children, actions = [], adminOnly = false }: {
  children: React.ReactNode
  actions?: readonly string[]
  adminOnly?: boolean
}) {
  const roles = useAuthStore((state) => state.user?.roles)
  const { access, status, refetch } = useOwnUserAccess()
  if (canAdministerAccess(roles)) return <>{children}</>
  if (status === 'loading') return <p role="status">Cargando tus accesos…</p>
  if (status === 'unavailable') return <div role="alert"><p>No pudimos comprobar tus accesos.</p><button type="button" onClick={() => void refetch()}>Reintentar</button></div>
  const grants = access?.grants ?? []
  const allowed = !adminOnly && (actions.length
    ? hasAssignedAction({ roles, grants, status }, actions)
    : grants.length > 0)
  if (!allowed) return <div role="status"><p>{grants.length ? 'No tienes acceso a este apartado.' : NO_PANELS_MESSAGE}</p><p>El administrador puede asignarte las herramientas que necesitas.</p></div>
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
          <Route path="products" element={<AccessBoundary actions={['products:read']}><ProductsPage /></AccessBoundary>} />
          <Route path="products/:productId" element={<AccessBoundary actions={['products:read']}><ProductDetailPage /></AccessBoundary>} />
          <Route path="lists" element={<AccessBoundary actions={['listas:read']}><ListasPage /></AccessBoundary>} />
          <Route path="lists/:id" element={<AccessBoundary actions={['listas:read']}><ListaDetailPage /></AccessBoundary>} />
          <Route path="customers" element={<AccessBoundary actions={['customers:read']}><CustomersPage /></AccessBoundary>} />
          <Route path="quotes" element={<AccessBoundary actions={['quotes:read']}><QuotesPage /></AccessBoundary>} />
          <Route path="quotes/:id" element={<AccessBoundary actions={['quotes:read']}><QuoteDetailPage /></AccessBoundary>} />
          <Route
            path="lists/:listaId/products/:productId"
            element={<AccessBoundary actions={['products:read']}><ProductDetailPage /></AccessBoundary>}
          />
          <Route path="assignments" element={<AccessBoundary actions={['assignments:manage']}><AssignmentsPage /></AccessBoundary>} />
          <Route path="settings" element={<AccessBoundary actions={['commercialSettings:read']}><CommercialSettingsPage /></AccessBoundary>} />
        </Route>
        <Route path="catalog-management" element={<CommercialLayout />}>
          <Route path="publication" element={<AccessBoundary actions={['products:publish']}><PublicationBoardSection /></AccessBoundary>} />
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
