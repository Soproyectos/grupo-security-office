import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())
const getPortalSession = vi.hoisted(() => vi.fn())
vi.mock('./customer-portal.service', () => ({ portalApi: { post }, getPortalSession }))

import { changePortalEmail, changePortalPassword, requestPortalPasswordReset, resetPortalPassword, signInPortal, signOutPortal, signUpPortal, startGoogleSignIn } from './portal-auth.service'

describe('portal-auth.service', () => {
  beforeEach(() => { post.mockReset(); getPortalSession.mockReset(); post.mockResolvedValue({ data: {} }) })

  it('entra y lee la sesión desde /customer-portal/auth/me', async () => {
    getPortalSession.mockResolvedValue({ id: 'a1' })
    expect(await signInPortal('a@b.co', 'clave-larga-123')).toEqual({ id: 'a1' })
    expect(post).toHaveBeenCalledWith('/portal-auth/sign-in/email', { email: 'a@b.co', password: 'clave-larga-123' })
  })
  it('registra con el cuerpo de Better Auth, sin pedir sesión (primero se confirma el correo)', async () => {
    await signUpPortal({ name: 'Ana', email: 'a@b.co', password: 'clave-larga-123', companyName: 'ACME', acceptPrivacy: true })
    expect(post).toHaveBeenCalledWith('/portal-auth/sign-up/email', expect.objectContaining({ companyName: 'ACME', acceptPrivacy: true, callbackURL: '/clientes' }))
    expect(getPortalSession).not.toHaveBeenCalled()
  })
  it('manda el token del captcha en x-captcha-response al entrar, registrar y pedir enlace', async () => {
    getPortalSession.mockResolvedValue({ id: 'a1' })
    const headers = { headers: { 'x-captcha-response': 'tok-captcha' } }
    await signInPortal('a@b.co', 'clave-larga-123', 'tok-captcha')
    await signUpPortal({ name: 'Ana', email: 'a@b.co', password: 'x', companyName: 'ACME', acceptPrivacy: true }, 'tok-captcha')
    await requestPortalPasswordReset('a@b.co', 'tok-captcha')
    expect(post).toHaveBeenCalledWith('/portal-auth/sign-in/email', { email: 'a@b.co', password: 'clave-larga-123' }, headers)
    expect(post).toHaveBeenCalledWith('/portal-auth/sign-up/email', expect.objectContaining({ acceptPrivacy: true }), headers)
    expect(post).toHaveBeenCalledWith('/portal-auth/request-password-reset', { email: 'a@b.co', redirectTo: '/clientes/restablecer' }, headers)
  })
  it('sin token no manda el header (modo desarrollo)', async () => {
    await requestPortalPasswordReset('a@b.co')
    expect(post.mock.calls[0]).toHaveLength(2)
  })
  it('pide la URL de Google y navega a ella', async () => {
    const assign = vi.fn()
    vi.stubGlobal('window', { location: { assign } })
    post.mockResolvedValue({ data: { url: 'https://accounts.google.com/x' } })
    await startGoogleSignIn()
    expect(post).toHaveBeenCalledWith('/portal-auth/sign-in/social', { provider: 'google', callbackURL: '/clientes', errorCallbackURL: '/clientes/login?error=google' })
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/x')
    vi.unstubAllGlobals()
  })
  it('falla si Google no devuelve URL', async () => {
    post.mockResolvedValue({ data: {} })
    await expect(startGoogleSignIn()).rejects.toThrow()
  })
  it('sale, pide enlace y restablece con token', async () => {
    await signOutPortal()
    await requestPortalPasswordReset('a@b.co')
    await resetPortalPassword('tok', 'nueva-clave-larga-1')
    expect(post).toHaveBeenCalledWith('/portal-auth/sign-out', {})
    expect(post).toHaveBeenCalledWith('/portal-auth/request-password-reset', { email: 'a@b.co', redirectTo: '/clientes/restablecer' })
    expect(post).toHaveBeenCalledWith('/portal-auth/reset-password', { token: 'tok', newPassword: 'nueva-clave-larga-1' })
  })
  it('cambia la contraseña cerrando las otras sesiones', async () => {
    await changePortalPassword({ currentPassword: 'vieja-Clave-1!', newPassword: 'nueva-Clave-2!' })
    expect(post).toHaveBeenCalledWith('/portal-auth/change-password', { currentPassword: 'vieja-Clave-1!', newPassword: 'nueva-Clave-2!', revokeOtherSessions: true })
  })
  it('cambia el correo con el callbackURL de Mis datos', async () => {
    await changePortalEmail({ newEmail: 'nuevo@b.co', currentPassword: 'clave-larga-123' })
    expect(post).toHaveBeenCalledWith('/portal-auth/change-email', { newEmail: 'nuevo@b.co', currentPassword: 'clave-larga-123', callbackURL: '/clientes/perfil?email=cambiado' })
  })
})
