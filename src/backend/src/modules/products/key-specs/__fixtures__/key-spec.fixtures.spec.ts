/**
 * Guards the synthetic fixtures themselves: the other specs rely on these
 * properties, so a careless edit here must fail loudly.
 */
import { DEFINITIONS, PRODUCT, TEMPLATES, VALUES } from './key-spec.fixtures'
import { validateKeySpecValue, validateSubcategorySpec } from '../key-spec-value.validation'

describe('key-spec fixtures', () => {
  it('use synthetic references only', () => {
    for (const p of Object.values(PRODUCT)) expect(p.sku).toMatch(/^SYN-/)
  })

  it('every template row points to a known definition and passes the SQL-mirror checks', () => {
    const ids = new Set(DEFINITIONS.map((d) => d.id))
    expect(ids.size).toBe(DEFINITIONS.length)
    for (const t of TEMPLATES) {
      expect(ids.has(t.specDefinitionId)).toBe(true)
      expect(validateSubcategorySpec(t)).toEqual([])
    }
  })

  it('cover required-not-filterable and filterable-not-required among APPROVED rows', () => {
    const approved = TEMPLATES.filter((t) => t.status === 'APPROVED')
    expect(approved.some((t) => t.isRequired && !t.isFilterable)).toBe(true)
    expect(approved.some((t) => !t.isRequired && t.isFilterable)).toBe(true)
  })

  it('include PROPOSED required rows that hold no value', () => {
    const proposed = TEMPLATES.filter((t) => t.status === 'PROPOSED' && t.isRequired)
    expect(proposed.length).toBeGreaterThanOrEqual(2)
    for (const t of proposed) expect(VALUES.some((v) => v.specDefinitionId === t.specDefinitionId)).toBe(false)
  })

  it('every stored value is valid for its product, at both stages', () => {
    for (const product of Object.values(PRODUCT)) {
      for (const v of VALUES.filter((row) => row.productId === product.id)) {
        const definition = DEFINITIONS.find((d) => d.id === v.specDefinitionId)!
        const result = validateKeySpecValue(definition, v, { subcategoryId: product.subcategoryId, templates: TEMPLATES })
        expect(result).toMatchObject({ ok: true })
      }
    }
  })

  it('hold a PUBLISHED and a different WORKING value for the same datum', () => {
    const dvr = VALUES.filter((v) => v.productId === PRODUCT.dvr.id && v.specDefinitionId === 'def-analog_channels')
    expect(dvr.map((v) => v.stage).sort()).toEqual(['PUBLISHED', 'WORKING'])
    expect(new Set(dvr.map((v) => v.valueNumber)).size).toBe(2)
  })
})
