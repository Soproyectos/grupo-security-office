import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useCustomerPortalSession } from '../hooks/useCustomerPortal'
import { useCustomerPortalAuthStore } from '../../../stores/customer-portal-auth.store'

export default function ClientProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const session = useCustomerPortalSession()
  const setAccount = useCustomerPortalAuthStore((state) => state.setAccount)
  const setHydrated = useCustomerPortalAuthStore((state) => state.setHydrated)
  useEffect(() => { if (!session.isLoading) { setAccount(session.data ?? null); setHydrated() } }, [session.data, session.isLoading, setAccount, setHydrated])

  if (session.isLoading) return <main className="min-h-screen p-8 text-center text-slate-600">Verificando tu sesión…</main>
  if (!session.data) return <Navigate to={`/clientes/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <>{children}</>
}
