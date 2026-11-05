/**
 * F5/F6 — value validation against the dictionary and the template, and the
 * checks that mirror the future SQL constraints of `subcategory_specs`.
 */
import type { SpecDefinition, SpecOption, SubcategorySpec } from './key-spec.types'
import {
  TEXT_MAX_LENGTH,
  validateKeySpecValue,
  validateSubcategorySpec,
  type KeySpecValueContext,
  type KeySpecValueResult,
} from './key-spec-value.validation'

const SUB = 'sub-1'

const option = (key: string, sortOrder: number, isActive = true): SpecOption => ({
  key,
  label: key.toLowerCase(),
  sortOrder,
  isActive,
})

const definition = (over: Partial<SpecDefinition> = {}): SpecDefinition => ({
  id: 'def-1',
  key: 'sample',
  label: 'Sample',
  dataType: 'TEXT',
  unit: null,
  options: [],
  isActive: true,
  ...over,
})

const template = (over: Partial<SubcategorySpec> = {}): SubcategorySpec => ({
  subcategoryId: SUB,
  specDefinitionId: 'def-1',
  status: 'APPROVED',
  isRequired: false,
  isFilterable: false,
  requiredReason: null,
  sortOrder: 1,
  approvedById: 'user-1',
  approvedAt: new Date('2026-10-29T12:00:00Z'),
  ...over,
})

const ctx = (over: Partial<KeySpecValueContext> = {}): KeySpecValueContext => ({
  subcategoryId: SUB,
  templates: [template()],
  ...over,
})

const codesOf = (r: KeySpecValueResult): string[] => (r.ok === false ? r.issues.map((i) => i.code) : [])

describe('validateKeySpecValue — structure', () => {
  it('inactive definition -> definition_inactive', () => {
    const r = validateKeySpecValue(definition({ isActive: false }), { valueText: 'x' }, ctx())
    expect(codesOf(r)).toEqual(['definition_inactive'])
  })

  it('datum outside the template of the subcategory -> not_in_template', () => {
    expect(codesOf(validateKeySpecValue(definition(), { valueText: 'x' }, ctx({ templates: [] })))).toEqual(['not_in_template'])
    expect(
      codesOf(validateKeySpecValue(definition(), { valueText: 'x' }, ctx({ templates: [template({ subcategoryId: 'other' })] }))),
    ).toEqual(['not_in_template'])
    expect(
      codesOf(validateKeySpecValue(definition(), { valueText: 'x' }, ctx({ templates: [template({ specDefinitionId: 'def-2' })] }))),
    ).toEqual(['not_in_template'])
  })

  it('a RETIRED row does not hold values, a PROPOSED one still does', () => {
    expect(codesOf(validateKeySpecValue(definition(), { valueText: 'x' }, ctx({ templates: [template({ status: 'RETIRED' })] })))).toEqual([
      'not_in_template',
    ])
    expect(validateKeySpecValue(definition(), { valueText: 'x' }, ctx({ templates: [template({ status: 'PROPOSED' })] })).ok).toBe(true)
  })

  it('a product without subcategory cannot hold values', () => {
    expect(codesOf(validateKeySpecValue(definition(), { valueText: 'x' }, ctx({ subcategoryId: null })))).toEqual(['not_in_template'])
  })

  it('reports both structural problems together', () => {
    const r = validateKeySpecValue(definition({ isActive: false }), { valueText: 'x' }, ctx({ templates: [] }))
    expect(codesOf(r)).toEqual(['definition_inactive', 'not_in_template'])
  })
})

describe('validateKeySpecValue — explicit state', () => {
  const empty = { valueText: null, valueNumber: null, valueBoolean: null, optionKeys: [] }
  it('a non-KNOWN state without value is ok and empty; with a value it is state_with_value', () => {
    expect(validateKeySpecValue(definition(), { state: 'UNKNOWN' }, ctx())).toEqual({ ok: true, value: empty })
    expect(validateKeySpecValue(definition(), { state: 'NOT_APPLICABLE' }, ctx())).toEqual({ ok: true, value: empty })
    expect(codesOf(validateKeySpecValue(definition(), { state: 'UNKNOWN', valueText: 'x' }, ctx()))).toEqual(['state_with_value'])
  })
  it('KNOWN or absent state validates as before; structure is still checked first', () => {
    expect(validateKeySpecValue(definition(), { state: 'KNOWN', valueText: 'a' }, ctx()).ok).toBe(true)
    expect(codesOf(validateKeySpecValue(definition(), { state: 'KNOWN' }, ctx()))).toEqual(['empty_value'])
    expect(codesOf(validateKeySpecValue(definition({ isActive: false }), { state: 'UNKNOWN' }, ctx()))).toEqual(['definition_inactive'])
  })
})

describe('validateKeySpecValue — types', () => {
  it('TEXT: trims and fills only valueText', () => {
    const r = validateKeySpecValue(definition(), { valueText: '  eSSD 1 TB  ' }, ctx())
    expect(r).toEqual({ ok: true, value: { valueText: 'eSSD 1 TB', valueNumber: null, valueBoolean: null, optionKeys: [] } })
  })

  it('TEXT: blank -> empty_value; over the limit -> text_too_long; the limit itself is accepted', () => {
    expect(codesOf(validateKeySpecValue(definition(), { valueText: '   ' }, ctx()))).toEqual(['empty_value'])
    expect(codesOf(validateKeySpecValue(definition(), { valueText: 'a'.repeat(TEXT_MAX_LENGTH + 1) }, ctx()))).toEqual(['text_too_long'])
    expect(validateKeySpecValue(definition(), { valueText: 'a'.repeat(TEXT_MAX_LENGTH) }, ctx()).ok).toBe(true)
  })

  it('NUMBER: finite numbers only, filling only valueNumber (zero included)', () => {
    const def = definition({ dataType: 'NUMBER' })
    expect(validateKeySpecValue(def, { valueNumber: 0 }, ctx())).toEqual({
      ok: true,
      value: { valueText: null, valueNumber: 0, valueBoolean: null, optionKeys: [] },
    })
    expect(codesOf(validateKeySpecValue(def, { valueNumber: Number.NaN }, ctx()))).toEqual(['invalid_number'])
    expect(codesOf(validateKeySpecValue(def, { valueNumber: Number.POSITIVE_INFINITY }, ctx()))).toEqual(['invalid_number'])
  })

  it('NUMBER: strings are rejected, both in the number field and in the text field', () => {
    const def = definition({ dataType: 'NUMBER' })
    expect(codesOf(validateKeySpecValue(def, { valueNumber: '60' as unknown as number }, ctx()))).toEqual(['type_mismatch'])
    expect(codesOf(validateKeySpecValue(def, { valueText: '60' }, ctx()))).toEqual(['type_mismatch'])
  })

  it('NUMBER: a given unit must equal the dictionary unit', () => {
    const watts = definition({ dataType: 'NUMBER', unit: 'W' })
    expect(validateKeySpecValue(watts, { valueNumber: 60, unit: 'W' }, ctx()).ok).toBe(true)
    expect(validateKeySpecValue(watts, { valueNumber: 60 }, ctx()).ok).toBe(true)
    expect(codesOf(validateKeySpecValue(watts, { valueNumber: 60, unit: 'kW' }, ctx()))).toEqual(['unit_mismatch'])
    // A unitless datum does not accept a unit either.
    expect(codesOf(validateKeySpecValue(definition({ dataType: 'NUMBER' }), { valueNumber: 4, unit: 'W' }, ctx()))).toEqual(['unit_mismatch'])
  })

  it('BOOLEAN: false is a value, not an empty one; other types are type_mismatch', () => {
    const def = definition({ dataType: 'BOOLEAN' })
    expect(validateKeySpecValue(def, { valueBoolean: false }, ctx())).toEqual({
      ok: true,
      value: { valueText: null, valueNumber: null, valueBoolean: false, optionKeys: [] },
    })
    expect(codesOf(validateKeySpecValue(def, { valueBoolean: 'true' as unknown as boolean }, ctx()))).toEqual(['type_mismatch'])
    expect(codesOf(validateKeySpecValue(def, { valueText: 'yes' }, ctx()))).toEqual(['type_mismatch'])
  })

  it('a field of another type -> type_mismatch', () => {
    expect(codesOf(validateKeySpecValue(definition(), { valueNumber: 3 }, ctx()))).toEqual(['type_mismatch'])
    expect(codesOf(validateKeySpecValue(definition(), { valueText: 'x', valueBoolean: true }, ctx()))).toEqual(['type_mismatch'])
    expect(codesOf(validateKeySpecValue(definition({ dataType: 'OPTION', options: [option('A', 1)] }), { valueText: 'A' }, ctx()))).toEqual([
      'type_mismatch',
    ])
  })

  it('nothing provided -> empty_value (null, undefined and an empty option list alike)', () => {
    expect(codesOf(validateKeySpecValue(definition(), {}, ctx()))).toEqual(['empty_value'])
    expect(codesOf(validateKeySpecValue(definition({ dataType: 'NUMBER' }), { valueNumber: null }, ctx()))).toEqual(['empty_value'])
    expect(codesOf(validateKeySpecValue(definition({ dataType: 'OPTION', options: [option('A', 1)] }), { optionKeys: [] }, ctx()))).toEqual([
      'empty_value',
    ])
  })
})

describe('validateKeySpecValue — options', () => {
  const single = definition({ dataType: 'OPTION', options: [option('DVR', 10), option('NVR', 20), option('OLD', 30, false)] })
  const multi = definition({
    dataType: 'MULTI_OPTION',
    options: [option('ACUSENSE', 10), option('MOTION', 20), option('LINE_CROSSING', 30), option('OLD', 40, false)],
  })

  it('OPTION: exactly one allowed key', () => {
    expect(validateKeySpecValue(single, { optionKeys: ['DVR'] }, ctx())).toEqual({
      ok: true,
      value: { valueText: null, valueNumber: null, valueBoolean: null, optionKeys: ['DVR'] },
    })
    expect(codesOf(validateKeySpecValue(single, { optionKeys: ['DVR', 'NVR'] }, ctx()))).toEqual(['option_cardinality'])
  })

  it('a key outside the dictionary -> option_not_allowed; an inactive one -> option_inactive', () => {
    expect(codesOf(validateKeySpecValue(single, { optionKeys: ['HYBRID'] }, ctx()))).toEqual(['option_not_allowed'])
    expect(codesOf(validateKeySpecValue(single, { optionKeys: ['OLD'] }, ctx()))).toEqual(['option_inactive'])
  })

  it('MULTI_OPTION: at least one key, stored in dictionary order', () => {
    const r = validateKeySpecValue(multi, { optionKeys: ['LINE_CROSSING', 'ACUSENSE'] }, ctx())
    expect(r.ok && r.value.optionKeys).toEqual(['ACUSENSE', 'LINE_CROSSING'])
    expect(codesOf(validateKeySpecValue(multi, { optionKeys: [] }, ctx()))).toEqual(['empty_value'])
  })

  it('MULTI_OPTION: a repeated key -> duplicate_option, reported once', () => {
    expect(codesOf(validateKeySpecValue(multi, { optionKeys: ['MOTION', 'MOTION', 'MOTION'] }, ctx()))).toEqual(['duplicate_option'])
    expect(codesOf(validateKeySpecValue(multi, { optionKeys: ['MOTION', 'ACUSENSE', 'MOTION'] }, ctx()))).toEqual(['duplicate_option'])
  })

  it('MULTI_OPTION: every key is checked on its own', () => {
    const r = validateKeySpecValue(multi, { optionKeys: ['ACUSENSE', 'UNKNOWN', 'OLD'] }, ctx())
    expect(codesOf(r)).toEqual(['option_not_allowed', 'option_inactive'])
  })

  it('issues carry the datum key', () => {
    const r = validateKeySpecValue(single, { optionKeys: ['HYBRID'] }, ctx())
    expect(r.ok === false && r.issues[0].specKey).toBe('sample')
  })
})

describe('validateSubcategorySpec — mirrors the SQL CHECK constraints', () => {
  it('required without a written reason -> required_without_reason', () => {
    expect(validateSubcategorySpec(template({ isRequired: true, requiredReason: null })).map((i) => i.code)).toEqual(['required_without_reason'])
    expect(validateSubcategorySpec(template({ isRequired: true, requiredReason: '   ' })).map((i) => i.code)).toEqual(['required_without_reason'])
    expect(validateSubcategorySpec(template({ isRequired: true, requiredReason: 'Needed to choose the device.' }))).toEqual([])
  })

  it('a non-required row needs no reason', () => {
    expect(validateSubcategorySpec(template({ isRequired: false, requiredReason: null }))).toEqual([])
  })

  it('APPROVED without approver or date -> approved_without_approver', () => {
    expect(validateSubcategorySpec(template({ approvedById: null })).map((i) => i.code)).toEqual(['approved_without_approver'])
    expect(validateSubcategorySpec(template({ approvedAt: null })).map((i) => i.code)).toEqual(['approved_without_approver'])
    expect(validateSubcategorySpec(template({ status: 'PROPOSED', approvedById: null, approvedAt: null }))).toEqual([])
  })

  it('reports both problems of a row', () => {
    const r = validateSubcategorySpec(template({ isRequired: true, requiredReason: null, approvedById: null }))
    expect(r.map((i) => i.code)).toEqual(['required_without_reason', 'approved_without_approver'])
  })

  it('required and filterable are independent (F6)', () => {
    expect(validateSubcategorySpec(template({ isRequired: true, requiredReason: 'Safety.', isFilterable: false }))).toEqual([])
    expect(validateSubcategorySpec(template({ isRequired: false, isFilterable: true }))).toEqual([])
  })
})
