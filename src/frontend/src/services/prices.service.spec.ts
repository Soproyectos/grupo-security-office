import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ default: { post: vi.fn(), put: vi.fn(), delete: vi.fn(), get: vi.fn() } }))

import api from './api'
import { createPrice, updatePrice } from './prices.service'

describe('price requests', () => {
  beforeEach(() => vi.clearAllMocks())

  it('envía la tarifa existente seleccionada y las fechas ISO al crear', async () => {
    const payload = {
      productId: 'product-1', priceListId: 'tariff-2', value: 2500, currency: 'COP',
      validFrom: '2026-10-26T14:15:00.000Z', validUntil: '2026-11-01T23:45:00.000Z',
    }
    const expected = { id: 'price-2', ...payload }
    vi.mocked(api.post).mockResolvedValue({ data: expected } as never)

    await expect(createPrice(payload)).resolves.toEqual(expected)
    expect(api.post).toHaveBeenCalledWith('/prices', payload)
  })

  it('actualiza el precio con fechas intactas que conserva el formulario', async () => {
    const payload = { value: 2600, currency: 'COP', validFrom: '2026-10-26T14:15:23.456Z', validUntil: null }
    vi.mocked(api.put).mockResolvedValue({ data: { id: 'price-1', ...payload } } as never)

    await updatePrice('price-1', payload)
    expect(api.put).toHaveBeenCalledWith('/prices/price-1', payload)
  })
})
