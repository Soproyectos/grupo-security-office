import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth.store'
import AdminLayout from './components/layout/AdminLayout'
import CommercialLayout from './components/layout/CommercialLayout'
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
import AuditPage from './pages/AuditPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

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
        <Route path="audit" element={<AuditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
