import { isPriceCurrentlyValid, priceValidityWhere } from './price-validity'

describe('price validity predicate', () => {
  const now = new Date('2026-10-26T12:00:00.000Z')

  it.each([
    [null, null, true],
    [new Date('2026-10-26T12:00:00.000Z'), null, true],
    [new Date('2026-10-26T12:00:00.001Z'), null, false],
    [null, new Date('2026-10-26T12:00:00.001Z'), true],
    [null, new Date('2026-10-26T12:00:00.000Z'), false],
    [null, new Date('2026-10-26T11:59:59.999Z'), false],
  ])('validFrom=%s validUntil=%s => %s', (validFrom, validUntil, expected) => {
    expect(isPriceCurrentlyValid(validFrom, validUntil, now)).toBe(expected)
  })

  it('arma el mismo rango abierto inclusivo/exclusivo para cada lectura de precios', () => {
    expect(priceValidityWhere(now)).toEqual({
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
      ],
    })
  })
})
