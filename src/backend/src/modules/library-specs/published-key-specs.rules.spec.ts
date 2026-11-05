import { buildPublishedKeySpecProjection } from '../products/key-specs/key-spec-projection'
import { DEFINITIONS, PRODUCT, SUBCATEGORY, TEMPLATES, VALUES } from '../products/key-specs/__fixtures__/key-spec.fixtures'
import type { ProductKeySpecValue } from '../products/key-specs/key-spec.types'
import {
  overlayDraftValues,
  parseKeySpecFilter,
  planKeySpecPublication,
  projectionMatchesFilters,
  toPublicKeySpecItems,
} from './published-key-specs.rules'

const project = (productId: string, subcategoryId: string, values: ProductKeySpecValue[] = VALUES) =>
  buildPublishedKeySpecProjection({
    subcategoryId,
    definitions: DEFINITIONS,
    templates: TEMPLATES,
    values: values.filter((v) => v.productId === productId),
  })

const val = (specKey: string, stage: 'WORKING' | 'PUBLISHED', fill: Partial<ProductKeySpecValue>): ProductKeySpecValue => ({
  productId: PRODUCT.switch.id,
  specDefinitionId: `def-${specKey}`,
  stage,
  valueText: null,
  valueNumber: null,
  valueBoolean: null,
  optionKeys: [],
  ...fill,
})

describe('toPublicKeySpecItems', () => {
  it('lists published values only, with unit and order', () => {
    const items = toPublicKeySpecItems(project(PRODUCT.switch.id, SUBCATEGORY.switch))
    expect(items.find((i) => i.key === 'poe_budget')).toEqual({ key: 'poe_budget', label: 'Potencia PoE total', value: '60 W', unit: 'W', order: 40 })
    expect(items.find((i) => i.key === 'total_ports')).toEqual({ key: 'total_ports', label: 'Puertos totales', value: '10', order: 10 })
  })

  it('shows a real zero with its unit and never turns a missing number into 0', () => {
    const zero = [val('poe_budget', 'PUBLISHED', { valueNumber: 0 })]
    const shown = toPublicKeySpecItems(project(PRODUCT.switch.id, SUBCATEGORY.switch, zero))
    expect(shown).toEqual([{ key: 'poe_budget', label: 'Potencia PoE total', value: '0 W', unit: 'W', order: 40 }])
    const missing = [val('poe_budget', 'PUBLISHED', { valueNumber: null })]
    expect(toPublicKeySpecItems(project(PRODUCT.switch.id, SUBCATEGORY.switch, missing))).toEqual([])
  })

  it('skips NOT_APPLICABLE and UNKNOWN answers', () => {
    const rows = [val('poe_budget', 'PUBLISHED', { state: 'NOT_APPLICABLE' }), val('poe_ports', 'PUBLISHED', { state: 'UNKNOWN' })]
    expect(toPublicKeySpecItems(project(PRODUCT.switch.id, SUBCATEGORY.switch, rows))).toEqual([])
  })
})

describe('overlayDraftValues', () => {
  it('lets WORKING win over PUBLISHED per datum and keeps published-only data', () => {
    const merged = overlayDraftValues(VALUES.filter((v) => v.productId === PRODUCT.switch.id))
    const poe = merged.find((v) => v.specDefinitionId === 'def-poe_budget')!
    expect(poe.valueNumber).toBe(120)
    expect(merged.find((v) => v.specDefinitionId === 'def-total_ports')?.valueNumber).toBe(10)
    expect(merged.every((v) => v.stage === 'PUBLISHED')).toBe(true)
  })
})

describe('planKeySpecPublication', () => {
  const w = (n: number) => val('poe_budget', 'WORKING', { valueNumber: n })
  const p = (n: number) => val('poe_budget', 'PUBLISHED', { valueNumber: n })

  it('copies new and different rows, counts equal ones, removes what the draft dropped', () => {
    const plan = planKeySpecPublication(
      [w(5), val('total_ports', 'WORKING', { valueNumber: 10 })],
      [p(3), val('total_ports', 'PUBLISHED', { valueNumber: 10 }), val('poe_ports', 'PUBLISHED', { valueNumber: 8 })],
    )
    expect(plan.upsert.map((v) => v.specDefinitionId)).toEqual(['def-poe_budget'])
    expect(plan.unchanged).toBe(1)
    expect(plan.remove).toEqual(['def-poe_ports'])
  })

  it('is a no-op when both stages hold the same answers (idempotent)', () => {
    const plan = planKeySpecPublication([w(5)], [p(5)])
    expect(plan).toEqual({ upsert: [], remove: [], unchanged: 1 })
  })

  it('treats a changed stored state as a change', () => {
    const plan = planKeySpecPublication([val('poe_budget', 'WORKING', { state: 'UNKNOWN' })], [p(5)])
    expect(plan.upsert).toHaveLength(1)
  })
})

describe('parseKeySpecFilter', () => {
  it('splits at the first colon', () => {
    expect(parseKeySpecFilter('total_ports:10')).toEqual({ specKey: 'total_ports', value: '10' })
    expect(parseKeySpecFilter('storage:a:b')).toEqual({ specKey: 'storage', value: 'a:b' })
  })
  it.each(['', 'nocolon', ':v', 'k:', 'k:  '])('rejects %p', (raw) => {
    expect(parseKeySpecFilter(raw)).toBeNull()
  })
})

describe('projectionMatchesFilters (shared with the sheet)', () => {
  const sw = project(PRODUCT.switch.id, SUBCATEGORY.switch)

  it('matches numbers exactly, options by key and boolean by text', () => {
    expect(projectionMatchesFilters(sw, [{ specKey: 'total_ports', value: '10' }])).toBe(true)
    expect(projectionMatchesFilters(sw, [{ specKey: 'total_ports', value: '10.0' }])).toBe(true)
    expect(projectionMatchesFilters(sw, [{ specKey: 'total_ports', value: '8' }])).toBe(false)
    expect(projectionMatchesFilters(sw, [{ specKey: 'port_speed', value: 'gigabit' }])).toBe(true)
    expect(projectionMatchesFilters(sw, [{ specKey: 'port_speed', value: 'FAST' }])).toBe(false)
  })

  it('requires every filter and ignores non-filterable or unknown data', () => {
    expect(projectionMatchesFilters(sw, [{ specKey: 'total_ports', value: '10' }, { specKey: 'port_speed', value: 'FAST' }])).toBe(false)
    expect(projectionMatchesFilters(sw, [{ specKey: 'management', value: 'SMART' }])).toBe(false) // not filterable
    expect(projectionMatchesFilters(sw, [{ specKey: 'nope', value: '1' }])).toBe(false)
    expect(projectionMatchesFilters(sw, [{ specKey: 'total_ports', value: 'abc' }])).toBe(false)
  })

  it('matches a real zero and false, and never a missing value', () => {
    const rows = [val('poe_ports', 'PUBLISHED', { valueNumber: 0 }), val('poe_budget', 'PUBLISHED', { valueNumber: null })]
    const p = project(PRODUCT.switch.id, SUBCATEGORY.switch, rows)
    expect(projectionMatchesFilters(p, [{ specKey: 'poe_ports', value: '0' }])).toBe(true)
    expect(projectionMatchesFilters(p, [{ specKey: 'poe_budget', value: '0' }])).toBe(false)
  })
})
