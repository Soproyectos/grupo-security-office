import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'
import { createPasswordErrorMessage, changeEmailErrorMessage, changePasswordErrorMessage, loginErrorMessage, readAuthError, signupErrorMessage } from './auth-errors'

function serverError(status: number, data: unknown): AxiosError {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, { status, data, statusText: '', headers: {}, config: {} as never })
}

describe('signupErrorMessage', () => {
  it.each([409, 422])('reconoce EMAIL_ALREADY_REGISTERED con estado %s', (status) => {
    const error = serverError(status, { code: 'EMAIL_ALREADY_REGISTERED', message: 'Este correo ya está registrado. Inicia sesión o recupera tu contraseña.' })
    expect(readAuthError(error).code).toBe('EMAIL_ALREADY_REGISTERED')
    expect(signupErrorMessage(error)).toBe('Este correo ya está registrado.')
  })

  it('mantiene el mensaje genérico para otros fallos', () => {
    expect(signupErrorMessage(serverError(500, {}))).toContain('No se pudo crear la cuenta')
  })
})

describe('cambio de contraseña y de correo', () => {
  it('INVALID_PASSWORD se muestra en español', () => {
    expect(changePasswordErrorMessage(serverError(400, { code: 'INVALID_PASSWORD', message: 'Invalid password' }))).toBe('La contraseña actual no es correcta.')
  })
  it('WEAK_PASSWORD usa el mensaje del servidor; COMPROMISED y 429 tienen texto propio', () => {
    expect(changePasswordErrorMessage(serverError(400, { code: 'WEAK_PASSWORD', message: 'Falta un símbolo.' }))).toBe('Falta un símbolo.')
    expect(changePasswordErrorMessage(serverError(400, { code: 'PASSWORD_COMPROMISED' }))).toContain('filtraciones')
    expect(changePasswordErrorMessage(serverError(429, {}))).toContain('demasiados intentos')
    expect(changePasswordErrorMessage(serverError(500, {}))).toContain('problema del servicio')
  })

  it('distingue una falla del servicio de un error de credenciales', () => {
    expect(loginErrorMessage(serverError(503, {}))).toContain('servicio de acceso')
    expect(loginErrorMessage(serverError(401, {}))).toContain('credenciales')
  })
  it('correo: mapea los códigos del servidor sin mostrar inglés', () => {
    expect(changeEmailErrorMessage(serverError(400, { code: 'CURRENT_PASSWORD_INVALID', message: 'La contraseña actual no es correcta' }))).toBe('La contraseña actual no es correcta.')
    expect(changeEmailErrorMessage(serverError(400, { code: 'EMAIL_MANAGED_BY_GOOGLE', message: 'Tu correo lo administra Google.' }))).toBe('Tu correo lo administra Google.')
    expect(changeEmailErrorMessage(serverError(400, { code: 'EMAIL_CHANGE_FAILED', message: 'No pudimos enviar el enlace.' }))).toBe('No pudimos enviar el enlace.')
    expect(changeEmailErrorMessage(serverError(429, {}))).toContain('demasiados intentos')
  })
})

describe('createPasswordErrorMessage', () => {
  it('mapea los códigos del contrato', () => {
    expect(createPasswordErrorMessage(serverError(400, { code: 'WEAK_PASSWORD', message: 'Falta un símbolo.' }))).toBe('Falta un símbolo.')
    expect(createPasswordErrorMessage(serverError(400, { code: 'PASSWORD_COMPROMISED' }))).toContain('filtraciones')
    expect(createPasswordErrorMessage(serverError(400, { code: 'PASSWORD_ALREADY_SET', message: 'Tu cuenta ya tiene contraseña. Puedes cambiarla en Mis datos.' }))).toBe('Tu cuenta ya tiene contraseña. Puedes cambiarla en Mis datos.')
    expect(createPasswordErrorMessage(serverError(400, { code: 'PASSWORD_ALREADY_SET' }))).toContain('Puedes cambiarla en Mis datos')
    expect(createPasswordErrorMessage(serverError(400, { code: 'PASSWORD_NOT_AVAILABLE' }))).toContain('no puede crear contraseña aquí')
    expect(createPasswordErrorMessage(serverError(429, {}))).toContain('demasiados intentos')
    expect(createPasswordErrorMessage(serverError(500, {}))).toContain('No pudimos crear')
  })
})
