import { describe, expect, it } from 'vitest'
import type { Price } from '../../../services/prices.service'
import { fromDatetimeLocal } from '../lib/lifecycle'
import { buildCreatePricePayload, buildUpdatePricePayload, priceDateToInput, validatePriceForm } from './price-form'

const base = { value: '1200', currency: 'COP', priceListId: 'tariff-1', validFrom: '2026-10-26T09:15', validUntil: '2026-11-01T18:45' }

describe('price form values', () => {
  it('construye creación para una tarifa existente con fechas locales convertidas a ISO', () => {
    expect(buildCreatePricePayload('product-1', base)).toEqual({
      productId: 'product-1', priceListId: 'tariff-1', value: 1200, currency: 'COP',
      validFrom: fromDatetimeLocal(base.validFrom), validUntil: fromDatetimeLocal(base.validUntil),
    })
  })

  it('mantiene los timestamps originales si el usuario no cambia las fechas', () => {
    const price = {
      id: 'price-1', productId: 'product-1', priceListId: 'tariff-1', value: 1000, currency: 'COP',
      validFrom: '2026-10-26T14:15:23.456Z', validUntil: '2026-11-01T23:45:59.000Z',
    } as Price
    const values = { ...base, validFrom: priceDateToInput(price.validFrom), validUntil: priceDateToInput(price.validUntil) }
    const payload = buildUpdatePricePayload(price, values)

    expect(payload.validFrom).toBe(price.validFrom)
    expect(payload.validUntil).toBe(price.validUntil)
  })

  it('rechaza vigencia con fin igual o anterior al inicio', () => {
    expect(validatePriceForm({ ...base, validUntil: base.validFrom }, 'create')).toBe('La fecha de fin debe ser posterior a la fecha de inicio.')
    expect(validatePriceForm({ ...base, validUntil: '2026-10-26T09:14' }, 'edit')).toContain('posterior')
  })
})
