import { beforeEach, describe, expect, it, vi } from 'vitest'

const portal = vi.hoisted(() => ({ patch: vi.fn(), post: vi.fn() }))
const staff = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('axios', () => ({ default: { create: () => portal } }))
vi.mock('./api', () => ({ default: staff }))

import { createPortalPassword, reactivatePortalAccount, deletePortalAccount, suspendPortalAccount, updatePortalProfile } from './customer-portal.service'

describe('customer-portal.service: perfil y panel', () => {
  beforeEach(() => { portal.patch.mockReset(); portal.post.mockReset(); staff.post.mockReset() })

  it('guarda el perfil y devuelve la cuenta', async () => {
    portal.patch.mockResolvedValue({ data: { account: { id: 'a1', profileComplete: true } } })
    const account = await updatePortalProfile({ companyName: 'ACME', phone: '3001234567', acceptPrivacy: true })
    expect(portal.patch).toHaveBeenCalledWith('/customer-portal/auth/me/profile', { companyName: 'ACME', phone: '3001234567', acceptPrivacy: true })
    expect(account).toEqual({ id: 'a1', profileComplete: true })
  })

  it('elimina la cuenta con la contraseña', async () => {
    portal.post.mockResolvedValue({ data: { deleted: true } })
    expect(await deletePortalAccount({ password: 'Clave-segura-123' })).toEqual({ deleted: true })
    expect(portal.post).toHaveBeenCalledWith('/customer-portal/auth/me/delete', { password: 'Clave-segura-123' })
  })

  it('elimina la cuenta confirmando el correo', async () => {
    portal.post.mockResolvedValue({ data: { deleted: true } })
    await deletePortalAccount({ confirmEmail: 'a@b.co' })
    expect(portal.post).toHaveBeenCalledWith('/customer-portal/auth/me/delete', { confirmEmail: 'a@b.co' })
  })

  it('suspende y reactiva con la sesión del panel', async () => {
    staff.post.mockResolvedValue({ data: { ok: true } })
    await suspendPortalAccount('c1', 'Pagos vencidos')
    await reactivatePortalAccount('c1')
    expect(staff.post).toHaveBeenCalledWith('/customer-portal/admin/accounts/c1/suspend', { reason: 'Pagos vencidos' })
    expect(staff.post).toHaveBeenCalledWith('/customer-portal/admin/accounts/c1/reactivate')
  })

  it('crea la contraseña de una cuenta de Google', async () => {
    portal.post.mockResolvedValue({ data: { data: { hasPassword: true } } })
    expect(await createPortalPassword({ newPassword: 'Clave-segura-123' })).toEqual({ hasPassword: true })
    expect(portal.post).toHaveBeenCalledWith('/customer-portal/auth/me/password', { newPassword: 'Clave-segura-123' })
  })
})
