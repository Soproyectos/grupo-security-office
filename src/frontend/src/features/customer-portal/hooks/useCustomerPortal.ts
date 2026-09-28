import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPortalSession, loginPortal, logoutPortal } from '../../../services/customer-portal.service'
import { useCustomerPortalAuthStore } from '../../../stores/customer-portal-auth.store'

export function useCustomerPortalSession() {
  return useQuery({
    queryKey: ['customer-portal', 'session'],
    queryFn: getPortalSession,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useCustomerPortalLogin() {
  const setAccount = useCustomerPortalAuthStore((state) => state.setAccount)
  return useMutation({ mutationFn: ({ email, password }: { email: string; password: string }) => loginPortal(email, password), onSuccess: setAccount })
}

export function useCustomerPortalLogout() {
  const queryClient = useQueryClient()
  const setAccount = useCustomerPortalAuthStore((state) => state.setAccount)
  return useMutation({ mutationFn: logoutPortal, onSuccess: () => { setAccount(null); queryClient.removeQueries({ queryKey: ['customer-portal'] }) } })
}
