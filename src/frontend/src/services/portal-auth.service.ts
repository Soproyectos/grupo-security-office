import { portalApi, getPortalSession } from './customer-portal.service'
import type { PortalAccount } from '../features/customer-portal/types/customer-portal.types'

export type PortalSignUp = {
  name: string
  email: string
  password: string
  companyName: string
  documentId?: string
  phone?: string
  acceptPrivacy: true
}

/** Header with the Cloudflare Turnstile token; omitted when the widget is not configured (dev mode). */
export function captchaConfig(captchaToken?: string) {
  return captchaToken ? { headers: { 'x-captcha-response': captchaToken } } : undefined
}

function postWithCaptcha(url: string, body: unknown, captchaToken?: string) {
  const config = captchaConfig(captchaToken)
  return config ? portalApi.post(url, body, config) : portalApi.post(url, body)
}

/** Entra con correo y clave (Better Auth) y devuelve la cuenta del portal. */
export async function signInPortal(email: string, password: string, captchaToken?: string): Promise<PortalAccount> {
  await postWithCaptcha('/portal-auth/sign-in/email', { email, password }, captchaToken)
  return getPortalSession()
}

/** Crea la cuenta y envía el correo de confirmación; la sesión empieza al confirmar el correo. */
export async function signUpPortal(payload: PortalSignUp, captchaToken?: string): Promise<void> {
  await postWithCaptcha('/portal-auth/sign-up/email', { ...payload, callbackURL: '/clientes' }, captchaToken)
}

/** Pide la URL de Google y manda al navegador allí. */
export async function startGoogleSignIn(): Promise<void> {
  const response = await portalApi.post<{ url?: string }>('/portal-auth/sign-in/social', {
    provider: 'google',
    callbackURL: '/clientes',
    errorCallbackURL: '/clientes/login?error=google',
  })
  if (!response.data?.url) throw new Error('google-url-missing')
  window.location.assign(response.data.url)
}

export async function signOutPortal(): Promise<void> {
  await portalApi.post('/portal-auth/sign-out', {})
}

export async function requestPortalPasswordReset(email: string, captchaToken?: string): Promise<void> {
  await postWithCaptcha('/portal-auth/request-password-reset', { email, redirectTo: '/clientes/restablecer' }, captchaToken)
}

export async function resetPortalPassword(token: string, newPassword: string): Promise<void> {
  await portalApi.post('/portal-auth/reset-password', { token, newPassword })
}

export const EMAIL_CHANGED_CALLBACK = '/clientes/perfil?email=cambiado'

/** Changes the password and closes the other sessions; the current one stays open. */
export async function changePortalPassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  await portalApi.post('/portal-auth/change-password', { ...input, revokeOtherSessions: true })
}

/** Sends a confirmation link to the NEW email; the current email only changes once it is opened. */
export async function changePortalEmail(input: { newEmail: string; currentPassword: string }): Promise<void> {
  await portalApi.post('/portal-auth/change-email', { ...input, callbackURL: EMAIL_CHANGED_CALLBACK })
}
