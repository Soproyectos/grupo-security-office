import CustomerAccountPage, { CustomerPortalShell } from './features/customer-portal/pages/CustomerAccountPage'
import PortalAccountsAdminPage from './features/customer-portal/pages/PortalAccountsAdminPage'
import ClientLoginPage from './features/storefront/pages/ClientLoginPage'
import AccessRequestPage from './features/storefront/pages/AccessRequestPage'
import ClientCatalogPage from './features/customer-portal/pages/ClientCatalogPage'
import PortalProductDetailPage from './features/customer-portal/pages/PortalProductDetailPage'
import AgendaCalendarPage from './features/agenda/AgendaCalendarPage'
import TeamWorkflowPage from './features/supervisor/TeamWorkflowPage'
import SupervisorLayout from './features/supervisor/SupervisorLayout'
import SupervisorWorkspacePage from './features/supervisor/SupervisorWorkspacePage'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth.store'
import AdminLayout from './components/layout/AdminLayout'
import SalesLayout from './features/sales/SalesLayout'
import SalesHomePage from './features/sales/SalesHomePage'
import { workspaceRedirect, type Workspace } from './lib/workspace'
import CommercialLayout from './components/layout/CommercialLayout'
import CategoryPage from './features/storefront/pages/CategoryPage'
import SearchResultsPage from './features/storefront/pages/SearchResultsPage'
import StorefrontHome from './features/storefront/pages/StorefrontHome'
import CatalogIndexPage from './features/storefront/pages/CatalogIndexPage'
import { ProductDetailRoute } from './features/products'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
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

function ProtectedRoute({
  children,
  workspace = 'admin',
}: {
  children: React.ReactNode
  workspace?: Workspace
}) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const redirect = workspaceRedirect(user?.roles, isAuthenticated, workspace)

  return redirect ? <Navigate to={redirect} replace /> : <>{children}</>
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
        <Route index element={<Dashboard />} />
         <Route path="commercial" element={<CommercialLayout />}>
          <Route index element={<Navigate to="/commercial/products" replace />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:productId" element={<ProductDetailPage />} />
          <Route path="lists" element={<ListasPage />} />
          <Route path="lists/:id" element={<ListaDetailPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="quotes" element={<QuotesPage />} />
          <Route path="quotes/:id" element={<QuoteDetailPage />} />
          <Route
            path="lists/:listaId/products/:productId"
            element={<ProductDetailPage />}
          />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="settings" element={<CommercialSettingsPage />} />
        </Route>
        <Route path="products" element={<Navigate to="/commercial/products" replace />} />
        <Route path="users" element={<UsersPage />} />
        {/* COM-01 frontend: panel de paquetes de acceso fuera de UsersPage
            (writePath propio; la página de Usuarios no se toca). */}
        <Route path="users/access" element={<UserAccessAssignments />} />
        {/* COM-04 frontend: metas por integrante/periodo. Fuera del bloque
            Comercial (writePath propio, patrón /users/access de COM-01): el
            servidor autoriza por petición (roles + targets:edit/alcance). */}
        <Route path="targets" element={<AssignedTargetsPage />} />
        <Route path="home" element={<AssignedHome />} />
        <Route path="reports" element={<AssignedReportsPage />} />
        <Route path="customer-accounts" element={<PortalAccountsAdminPage />} />
        <Route path="team-requests" element={<TeamWorkflowPage kind="requests" key="admin-requests" />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="promotions" element={<PromotionManagerPage />} />

      </Route>
      <Route
        path="/sales"
        element={<ProtectedRoute workspace="sales"><SalesLayout /></ProtectedRoute>}
      >
        <Route index element={<SalesHomePage />} />
        <Route path="customers" element={<CustomersPage personal />} />
        <Route path="agenda" element={<AgendaCalendarPage />} />
        <Route path="promotions" element={<></>} />
        <Route path="quotes" element={<QuotesPage personal quotesPath="/sales/quotes" />} />
        <Route path="quotes/:id" element={<QuoteDetailPage personal quotesPath="/sales/quotes" />} />
        <Route path="*" element={<Navigate to="/sales" replace />} />
      </Route>
      <Route path="/supervisor" element={<ProtectedRoute workspace="supervisor"><SupervisorLayout /></ProtectedRoute>}><Route index element={<SupervisorWorkspacePage />} /><Route path="agenda" element={<AgendaCalendarPage />} /><Route path="requests" element={<TeamWorkflowPage kind="requests" key="requests" />} /><Route path="*" element={<Navigate to="/supervisor" replace />} /></Route>
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
