import { useMutation } from '@tanstack/react-query'
import { requestPortalPasswordReset } from '../../../services/portal-auth.service'

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: ({ email, captchaToken }: { email: string; captchaToken?: string }) => requestPortalPasswordReset(email, captchaToken),
  })
}
