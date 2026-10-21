import { describe, expect, it } from 'vitest'
import { applyRequirements, canApply } from './flow.utils'

const summary = { rows: 5, validRows: 3, errorRows: 2, prices: 6, newPrices: 0, changedPrices: 6, unchangedPrices: 0, roundedPrices: 0 }

describe('price import flow rules', () => {
  it('requires acknowledging rejected rows and large changes before applying', () => {
    const req = applyRequirements({ ...summary, rejectedRows: 2, largeChangePrices: 1 })
    expect(canApply(req, false, false)).toBe(false)
    expect(canApply(req, true, false)).toBe(false)
    expect(canApply(req, false, true)).toBe(false)
    expect(canApply(req, true, true)).toBe(true)
  })

  it('falls back to errorRows and never applies an empty set', () => {
    expect(applyRequirements(summary).rejectedRows).toBe(2)
    expect(canApply(applyRequirements({ ...summary, validRows: 0 }), true, true)).toBe(false)
    expect(canApply(applyRequirements({ ...summary, errorRows: 0 }), false, false)).toBe(true)
  })
})
