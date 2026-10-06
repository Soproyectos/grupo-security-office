import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../services/api'
import { useAuthStore } from '../../stores/auth.store'
import { fetchManagedPromotions, publishPromotion, editPromotion, withdrawPromotion, uploadPromotionFlyer, removePromotionFlyer } from './promotions.service'

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
const admin = { id: 'admin-fixture', email: 'admin@example.invalid', name: 'Fixture admin', roles: ['Super Admin'], permissions: [] }
const seller = { ...admin, id: 'seller-fixture', roles: ['Vendedor'] }
const payload = { title: 'Fixture', message: 'Test only', startsAt: '2026-10-05T15:00:00Z', endsAt: '2026-10-10T15:00:00Z' }

describe('promotion publisher session identity', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useAuthStore.getState().login(admin)
    vi.mocked(api.get).mockImplementation(async path => ({ data: path === '/auth/profile' ? admin : [] }))
    vi.mocked(api.post).mockResolvedValue({ data: { ...payload, id: 'notice-fixture' } })
    vi.mocked(api.patch).mockResolvedValue({ data: { ...payload, id: 'notice-fixture' } })
    vi.mocked(api.delete).mockResolvedValue({ data: {} })
  })
  it('permite publicar con Super Admin cuando coincide la sesión del servidor', async () => {
    await publishPromotion(payload)
    expect(api.get).toHaveBeenCalledWith('/auth/profile')
    expect(api.post).toHaveBeenCalledWith('/promotions', payload)
  })
  it('permite gestionar y publicar con Supervisor', async () => {
    const supervisor = { ...admin, id: 'supervisor-fixture', roles: ['Supervisor'] }
    useAuthStore.getState().login(supervisor)
    vi.mocked(api.get).mockImplementation(async path => ({ data: path === '/auth/profile' ? supervisor : [] }))
    await fetchManagedPromotions()
    await publishPromotion(payload)
    expect(api.get).toHaveBeenCalledWith('/promotions/manage')
    expect(api.post).toHaveBeenCalledWith('/promotions', payload)
  })
  it('sincroniza Vendedor y no publica si otra pestaña cambió la cuenta', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: seller })
    await expect(publishPromotion(payload)).rejects.toThrow('La sesión actual no corresponde')
    expect(useAuthStore.getState().user?.roles).toEqual(['Vendedor'])
    expect(api.post).not.toHaveBeenCalled()
  })
  it('no publica silenciosamente con otro Super Admin', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...admin, id: 'other-admin-fixture' } })
    await expect(publishPromotion(payload)).rejects.toThrow('La cuenta o el rol')
    expect(api.post).not.toHaveBeenCalled()
  })
  it('no transforma una publicación global en publicación de equipo por cambio de rol', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...admin, roles: ['Supervisor'] } })
    await expect(publishPromotion(payload)).rejects.toThrow('La cuenta o el rol')
    expect(api.post).not.toHaveBeenCalled()
  })
  it('no solicita la gestión cuando la cookie pertenece al vendedor', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: seller })
    await expect(fetchManagedPromotions()).rejects.toThrow('La sesión actual no corresponde')
    expect(api.get).not.toHaveBeenCalledWith('/promotions/manage')
  })
  it('comprueba sesión antes de editar, retirar y quitar imagen', async () => {
    await editPromotion('notice-fixture', payload)
    await withdrawPromotion('notice-fixture')
    await removePromotionFlyer('notice-fixture')
    expect(api.get).toHaveBeenCalledTimes(3)
    expect(api.patch).toHaveBeenCalledWith('/promotions/notice-fixture', payload)
    expect(api.patch).toHaveBeenCalledWith('/promotions/notice-fixture/withdraw')
    expect(api.delete).toHaveBeenCalledWith('/promotions/notice-fixture/flyer')
  })
  it('no sube una imagen si cambió la sesión a Vendedor', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: seller })
    await expect(uploadPromotionFlyer('notice-fixture', {} as File)).rejects.toThrow('La sesión actual no corresponde')
    expect(api.post).not.toHaveBeenCalled()
  })
})

