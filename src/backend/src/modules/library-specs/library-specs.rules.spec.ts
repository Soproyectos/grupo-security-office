import { DEFINITIONS, SUBCATEGORY, TEMPLATES } from '../products/key-specs/__fixtures__/key-spec.fixtures'
import {
  buildSubcategoryChangePreview,
  isBlankInput,
  normalizedEquals,
  roundToScale,
  sameAnswer,
  valueState,
} from './library-specs.rules'

const empty = { valueText: null, valueNumber: null, valueBoolean: null, optionKeys: [] as string[] }

describe('valueState', () => {
  it('keeps unknown, zero, false and set apart', () => {
    expect(valueState('NUMBER', null)).toBe('unknown')
    expect(valueState('NUMBER', empty)).toBe('unknown')
    expect(valueState('NUMBER', { ...empty, valueNumber: 0 })).toBe('zero')
    expect(valueState('NUMBER', { ...empty, valueNumber: 4 })).toBe('set')
    expect(valueState('BOOLEAN', empty)).toBe('unknown')
    expect(valueState('BOOLEAN', { ...empty, valueBoolean: false })).toBe('false')
    expect(valueState('BOOLEAN', { ...empty, valueBoolean: true })).toBe('set')
    expect(valueState('TEXT', { ...empty, valueText: '  ' })).toBe('unknown')
    expect(valueState('OPTION', { ...empty, optionKeys: ['A'] })).toBe('set')
  })
})

describe('isBlankInput', () => {
  it('treats nothing, whitespace and empty lists as blank, but not 0 or false', () => {
    expect(isBlankInput({})).toBe(true)
    expect(isBlankInput({ valueText: '  ', optionKeys: [], valueNumber: null })).toBe(true)
    expect(isBlankInput({ valueNumber: 0 })).toBe(false)
    expect(isBlankInput({ valueBoolean: false })).toBe(false)
    expect(isBlankInput({ optionKeys: ['A'] })).toBe(false)
    expect(isBlankInput({ unit: 'W' })).toBe(true)
  })
})

describe('numbers and equality', () => {
  it('rounds to the column scale so a re-run compares equal', () => {
    expect(roundToScale(123.4567891)).toBe(123.456789)
    expect(normalizedEquals({ ...empty, valueNumber: 1 }, { ...empty, valueNumber: 1 })).toBe(true)
    expect(normalizedEquals({ ...empty, optionKeys: ['B', 'A'] }, { ...empty, optionKeys: ['A', 'B'] })).toBe(true)
    expect(normalizedEquals({ ...empty, valueNumber: 0 }, empty)).toBe(false)
    expect(normalizedEquals({ ...empty, valueBoolean: false }, empty)).toBe(false)
  })
})

describe('buildSubcategoryChangePreview', () => {
  const v = (specKey: string, stage: 'WORKING' | 'PUBLISHED' = 'WORKING') => ({
    productId: 'p', specDefinitionId: `def-${specKey}`, stage, valueText: 'x', valueNumber: null, valueBoolean: null, optionKeys: [],
  })

  it('splits stored values into kept and needs-review, and lists what the new template lacks', () => {
    const preview = buildSubcategoryChangePreview({
      fromSubcategoryId: SUBCATEGORY.dvr,
      toSubcategoryId: SUBCATEGORY.switch,
      definitions: DEFINITIONS,
      newTemplates: TEMPLATES,
      values: [v('poe_budget'), v('poe_budget', 'PUBLISHED'), v('storage')],
    })
    expect(preview.kept).toEqual([{ specKey: 'poe_budget', label: 'Potencia PoE total', stages: ['PUBLISHED', 'WORKING'] }])
    expect(preview.needsReview.map((r) => r.specKey)).toEqual(['storage'])
    const missing = preview.newlyMissing.map((m) => m.specKey)
    expect(missing).toEqual(expect.arrayContaining(['total_ports', 'port_speed', 'mounting']))
    expect(missing).not.toContain('poe_budget')
    expect(preview.newlyMissing.find((m) => m.specKey === 'mounting')).toMatchObject({ status: 'PROPOSED', isRequired: true })
  })

  it('ignores retired rows of the new template', () => {
    const retired = TEMPLATES.map((t) => (t.specDefinitionId === 'def-poe_budget' ? { ...t, status: 'RETIRED' as const } : t))
    const preview = buildSubcategoryChangePreview({
      fromSubcategoryId: null,
      toSubcategoryId: SUBCATEGORY.switch,
      definitions: DEFINITIONS,
      newTemplates: retired,
      values: [v('poe_budget')],
    })
    expect(preview.needsReview.map((r) => r.specKey)).toEqual(['poe_budget'])
    expect(preview.kept).toEqual([])
  })
})

describe('valueState with a stored state', () => {
  it('keeps not applicable, explicit unknown, zero and false apart', () => {
    expect(valueState('NUMBER', empty, 'NOT_APPLICABLE')).toBe('not_applicable')
    expect(valueState('NUMBER', empty, 'UNKNOWN')).toBe('unknown')
    expect(valueState('NUMBER', { ...empty, valueNumber: 0 }, 'KNOWN')).toBe('zero')
    expect(valueState('BOOLEAN', { ...empty, valueBoolean: false }, 'KNOWN')).toBe('false')
    expect(valueState('BOOLEAN', empty, 'NOT_APPLICABLE')).toBe('not_applicable')
  })
})

describe('sameAnswer', () => {
  it('a missing state is KNOWN, and the state takes part in the comparison', () => {
    expect(sameAnswer({ value: empty }, { state: 'KNOWN', value: empty })).toBe(true)
    expect(sameAnswer({ state: 'UNKNOWN', value: empty }, { state: 'NOT_APPLICABLE', value: empty })).toBe(false)
    expect(sameAnswer({ state: 'UNKNOWN', value: empty }, { state: 'UNKNOWN', value: empty })).toBe(true)
    expect(sameAnswer({ state: 'KNOWN', value: { ...empty, valueNumber: 0 } }, { state: 'UNKNOWN', value: empty })).toBe(false)
  })
})
