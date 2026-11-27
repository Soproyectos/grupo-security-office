import { isAxiosError } from 'axios'

export const PRIVACY_POLICY_PATH = '/politica-de-privacidad'
export const CAPTCHA_FAILED_MESSAGE = 'No pudimos comprobar que no eres un robot. Inténtalo de nuevo.'
export const CAPTCHA_PENDING_MESSAGE = 'Espera a que termine la verificación de seguridad e inténtalo de nuevo.'
export const PWNED_MESSAGE = 'Esa contraseña apareció en filtraciones de datos. Elige otra.'
export const PRIVACY_REQUIRED_MESSAGE = 'Marca la casilla de la política de tratamiento de datos para continuar.'

export const EMAIL_ALREADY_REGISTERED_CODE = 'EMAIL_ALREADY_REGISTERED'
export const EMAIL_ALREADY_REGISTERED_MESSAGE = 'Este correo ya está registrado.'

export function readAuthError(error: unknown): { status?: number; code: string; message: string } {
  if (!isAxiosError(error)) return { code: '', message: '' }
  const data = (error.response?.data ?? {}) as { code?: unknown; message?: unknown }
  return {
    status: error.response?.status,
    code: typeof data.code === 'string' ? data.code.toUpperCase() : '',
    message: typeof data.message === 'string' ? data.message : '',
  }
}

const isPwned = (code: string) => code.includes('PWNED') || code.includes('COMPROMISED')
export const INVALID_CITY_CODE = 'INVALID_CITY'
export const INVALID_CITY_MESSAGE = 'Elige tu ciudad de la lista'
const KNOWN_SIGNUP_CODES = ['PRIVACY_NOT_ACCEPTED', 'WEAK_PASSWORD', EMAIL_ALREADY_REGISTERED_CODE, INVALID_CITY_CODE]

/** Captcha failed: explicit CAPTCHA code, or a bare 403 with no other code. */
export function isCaptchaError(error: unknown): boolean {
  const { status, code } = readAuthError(error)
  return code.includes('CAPTCHA') || (status === 403 && !code)
}

export function loginErrorMessage(error: unknown): string {
  const { status, code } = readAuthError(error)
  if (status !== undefined && status >= 500) return 'El servicio de acceso no está disponible en este momento. Inténtalo de nuevo en unos minutos.'
  if (isAxiosError(error) && !error.response) return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.'
  if (code === 'EMAIL_NOT_VERIFIED') return 'Confirma tu correo para entrar. Te enviamos un nuevo enlace. Revisa también spam.'
  if (isCaptchaError(error)) return CAPTCHA_FAILED_MESSAGE
  if (status === 429) return TOO_MANY_ATTEMPTS_MESSAGE
  return 'No pudimos iniciar sesión. Verifica tus credenciales y vuelve a intentarlo.'
}

export function signupErrorMessage(error: unknown): string {
  const { status, code, message } = readAuthError(error)
  if (code === EMAIL_ALREADY_REGISTERED_CODE) return EMAIL_ALREADY_REGISTERED_MESSAGE
  if (code === 'PRIVACY_NOT_ACCEPTED') return PRIVACY_REQUIRED_MESSAGE
  if (code === INVALID_CITY_CODE) return INVALID_CITY_MESSAGE
  if (code === 'WEAK_PASSWORD') return message || 'Tu contraseña no cumple los requisitos. Revisa la lista.'
  if (isPwned(code)) return PWNED_MESSAGE
  if (code.includes('CAPTCHA') || (status === 403 && !KNOWN_SIGNUP_CODES.includes(code))) return CAPTCHA_FAILED_MESSAGE
  return 'No se pudo crear la cuenta. Revisa los datos; si ya tienes una cuenta, inicia sesión.'
}

export function turnstileSiteKey(): string {
  return String(import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim()
}

export const WRONG_CURRENT_PASSWORD_MESSAGE = 'La contraseña actual no es correcta.'
export const TOO_MANY_ATTEMPTS_MESSAGE = 'Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
const CHANGE_FALLBACK = 'No pudimos completar el cambio. Inténtalo de nuevo en unos minutos.'

export function changePasswordErrorMessage(error: unknown): string {
  const { status, code, message } = readAuthError(error)
  if (isAxiosError(error) && !error.response) return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.'
  if (status !== undefined && status >= 500) return 'No pudimos completar el cambio por un problema del servicio. Inténtalo de nuevo en unos minutos.'
  if (code === 'INVALID_PASSWORD' || code === 'CURRENT_PASSWORD_INVALID') return WRONG_CURRENT_PASSWORD_MESSAGE
  if (code === 'WEAK_PASSWORD') return message || 'Tu contraseña nueva no cumple los requisitos. Revisa la lista.'
  if (isPwned(code)) return PWNED_MESSAGE
  if (status === 429) return TOO_MANY_ATTEMPTS_MESSAGE
  return CHANGE_FALLBACK
}

export function changeEmailErrorMessage(error: unknown): string {
  const { status, code, message } = readAuthError(error)
  if (code === 'CURRENT_PASSWORD_INVALID' || code === 'INVALID_PASSWORD') return WRONG_CURRENT_PASSWORD_MESSAGE
  if (code === 'EMAIL_MANAGED_BY_GOOGLE') return message || 'Tu correo lo administra tu cuenta de Google.'
  if (code === 'EMAIL_CHANGE_FAILED') return message || CHANGE_FALLBACK
  if (status === 429) return TOO_MANY_ATTEMPTS_MESSAGE
  return CHANGE_FALLBACK
}

export const PASSWORD_ALREADY_SET_MESSAGE = 'Tu cuenta ya tiene contraseña. Puedes cambiarla en Mis datos.'

/** Errors of «Crear contraseña (opcional)» (first password after entering with Google). */
export function createPasswordErrorMessage(error: unknown): string {
  const { status, code, message } = readAuthError(error)
  if (code === 'WEAK_PASSWORD') return message || 'Tu contraseña no cumple los requisitos. Revisa la lista.'
  if (code === 'PASSWORD_COMPROMISED' || isPwned(code)) return PWNED_MESSAGE
  if (code === 'PASSWORD_ALREADY_SET') return message || PASSWORD_ALREADY_SET_MESSAGE
  if (code === 'PASSWORD_NOT_AVAILABLE') return 'Esta cuenta no puede crear contraseña aquí.'
  if (status === 429) return TOO_MANY_ATTEMPTS_MESSAGE
  return 'No pudimos crear tu contraseña. Inténtalo de nuevo en unos minutos.'
}
