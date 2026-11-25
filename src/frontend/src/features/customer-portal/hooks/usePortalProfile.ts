import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPortalPassword, deletePortalAccount, updatePortalProfile } from '../../../services/customer-portal.service'
import { changePortalEmail, changePortalPassword } from '../../../services/portal-auth.service'
import { useCustomerPortalAuthStore } from '../../../stores/customer-portal-auth.store'
import type { PortalProfileInput } from '../types/customer-portal.types'

const SESSION_KEY = ['customer-portal', 'session']

export function useUpdatePortalProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PortalProfileInput) => updatePortalProfile(input),
    // Waits for the refreshed session so the portal does not bounce back to "complete your data".
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
  })
}

export function useDeletePortalAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deletePortalAccount,
    onSuccess: () => {
      useCustomerPortalAuthStore.getState().setAccount(null)
      queryClient.removeQueries({ queryKey: ['customer-portal'] })
    },
  })
}

export function useChangePortalPassword() {
  return useMutation({ mutationFn: changePortalPassword })
}

export function useChangePortalEmail() {
  return useMutation({ mutationFn: changePortalEmail })
}

/** Returns a function that reloads the portal session (used after the email change link is opened). */
export function useRefreshPortalSession() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: SESSION_KEY })
}

/** First password of an account that entered with Google. Does not refresh the session: the caller decides when. */
export function useCreatePortalPassword() {
  return useMutation({ mutationFn: createPortalPassword })
}
