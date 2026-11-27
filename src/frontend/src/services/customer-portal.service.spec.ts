import { beforeEach, describe, expect, it, vi } from 'vitest'

const portal = vi.hoisted(() => ({ patch: vi.fn(), post: vi.fn() }))
const staff = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), patch: vi.fn() }))

vi.mock('axios', () => ({ default: { create: () => portal } }))
vi.mock('./api', () => ({ default: staff }))

import { assignAccountTier, fetchAdminPriceLists, fetchAdminTiers, fetchTariffOptions, createPortalPassword, reactivatePortalAccount, deletePortalAccount, suspendPortalAccount, updatePortalProfile } from './customer-portal.service'

describe('customer-portal.service: perfil y panel', () => {
  beforeEach(() => { portal.patch.mockReset(); portal.post.mockReset(); staff.post.mockReset(); staff.get.mockReset(); staff.patch.mockReset() })

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

  it('lee las tarifas aunque el API las devuelva dentro de data (causa de la pantalla en blanco)', async () => {
    staff.get.mockResolvedValue({ data: { data: [{ id: 'l1', name: 'Detalle', isActive: true }] } })
    expect(await fetchAdminPriceLists()).toEqual([{ id: 'l1', name: 'Detalle', isActive: true }])
    expect(staff.get).toHaveBeenCalledWith('/prices/lists')
  })

  it('siempre entrega una lista, aunque la respuesta venga vacía o rara', async () => {
    staff.get.mockResolvedValue({ data: null })
    expect(await fetchAdminPriceLists()).toEqual([])
    staff.get.mockResolvedValue({ data: [{ id: 't1', name: 'Oro', isActive: true }] })
    expect(await fetchAdminTiers()).toEqual([{ id: 't1', name: 'Oro', isActive: true }])
  })

  it('lee las tarifas que se pueden elegir en una cuenta', async () => {
    staff.get.mockResolvedValue({ data: [{ id: 'pl-1', name: 'Instaladores', code: 'INST', currency: 'COP' }] })
    expect(await fetchTariffOptions()).toEqual([{ id: 'pl-1', name: 'Instaladores', code: 'INST', currency: 'COP' }])
    expect(staff.get).toHaveBeenCalledWith('/customer-portal/admin/tariff-options')
    staff.get.mockResolvedValue({ data: null })
    expect(await fetchTariffOptions()).toEqual([])
  })

  it('guarda la tarifa elegida con su id y la general con tierId null, nunca los dos campos', async () => {
    staff.patch.mockResolvedValue({ data: { id: 'a1' } })
    await assignAccountTier('a1', 'pl-1')
    expect(staff.patch).toHaveBeenLastCalledWith('/customer-portal/admin/accounts/a1/tier', { priceListId: 'pl-1' })
    await assignAccountTier('a1', null)
    expect(staff.patch).toHaveBeenLastCalledWith('/customer-portal/admin/accounts/a1/tier', { tierId: null })
  })
})
