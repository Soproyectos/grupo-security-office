import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPortalSession } from '../../../services/customer-portal.service'
import { signInPortal, signOutPortal, signUpPortal, startGoogleSignIn, type PortalSignUp } from '../../../services/portal-auth.service'
import { useCustomerPortalAuthStore } from '../../../stores/customer-portal-auth.store'
import { usePortalQuoteListStore } from '../../../stores/portal-quote-list.store'

export function useCustomerPortalSession() {
  return useQuery({
    queryKey: ['customer-portal', 'session'],
    queryFn: getPortalSession,
    retry: false,
    staleTime: 0,
    refetchInterval: 30_000,
  })
}

export function useCustomerPortalLogin() {
  const queryClient = useQueryClient()
  const setAccount = useCustomerPortalAuthStore((state) => state.setAccount)
  return useMutation({
    mutationFn: ({ email, password, captchaToken }: { email: string; password: string; captchaToken?: string }) => signInPortal(email, password, captchaToken),
    onSuccess: (account) => { queryClient.removeQueries({ queryKey: ['customer-portal'] }); setAccount(account) },
  })
}

export function useCustomerPortalSignup() {
  return useMutation({ mutationFn: ({ payload, captchaToken }: { payload: PortalSignUp; captchaToken?: string }) => signUpPortal(payload, captchaToken) })
}

export function useCustomerPortalGoogle() {
  return useMutation({ mutationFn: startGoogleSignIn })
}

export function useCustomerPortalLogout() {
  const queryClient = useQueryClient()
  const setAccount = useCustomerPortalAuthStore((state) => state.setAccount)
  return useMutation({ mutationFn: signOutPortal, onSuccess: () => { setAccount(null); usePortalQuoteListStore.getState().clearAll(); queryClient.removeQueries({ queryKey: ['customer-portal'] }) } })
}
