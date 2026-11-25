import { useMutation } from '@tanstack/react-query'
import { resetPortalPassword } from '../../../services/portal-auth.service'

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) => resetPortalPassword(token, password),
  })
}
