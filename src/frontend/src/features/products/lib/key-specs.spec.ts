import { describe, expect, it } from 'vitest'
import {
  applySaveResults,
  baselineDraft,
  buildEntries,
  buildLayout,
  describeChangePreview,
  describeStoredValue,
  draftKeySpecItems,
  emptyDraft,
  missingMessage,
  parseNumberInput,
  rejectionMessage,
  summarizeChangePreview,
  summarizeResults,
  type KeySpecDraft,
} from './key-specs'
import type { KeySpecDataType, KeySpecItem, KeySpecStageValue } from '../types/key-specs.types'

const stage = (patch: Partial<KeySpecStageValue> = {}): KeySpecStageValue => ({
  valueText: null,
  valueNumber: null,
  valueBoolean: null,
  optionKeys: [],
  ...patch,
})

const item = (specKey: string, dataType: KeySpecDataType, patch: Partial<KeySpecItem> = {}): KeySpecItem => ({
  specKey,
  label: specKey,
  dataType,
  unit: null,
  options: [],
  template: { status: 'APPROVED', isRequired: false, sortOrder: 1 },
  outsideTemplate: false,
  working: null,
  published: null,
  ...patch,
})

const value = (patch: Partial<KeySpecDraft>): KeySpecDraft => ({ ...emptyDraft(), ...patch })

describe('parseNumberInput', () => {
  it('keeps zero as a number and accepts a decimal comma', () => {
    expect(parseNumberInput('0')).toBe(0)
    expect(parseNumberInput('3,5')).toBe(3.5)
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('abc')).toBeUndefined()
  })
})

describe('baselineDraft', () => {
  it('reads zero and false as stored values, not as empty', () => {
    const zero = baselineDraft(item('n', 'NUMBER', { working: stage({ valueNumber: 0 }) }))
    expect(zero.number).toBe('0')
    const no = baselineDraft(item('b', 'BOOLEAN', { working: stage({ valueBoolean: false }) }))
    expect(no.boolean).toBe(false)
  })

  it('prefers the working value over the published one', () => {
    const draft = baselineDraft(item('t', 'TEXT', { working: stage({ valueText: 'a' }), published: stage({ valueText: 'b' }) }))
    expect(draft.text).toBe('a')
  })

  it('reads explicit not-applicable and unknown states', () => {
    expect(baselineDraft(item('t', 'TEXT', { working: stage({ state: 'not_applicable', storedState: 'NOT_APPLICABLE' }) })).mode).toBe('not_applicable')
    expect(baselineDraft(item('t', 'TEXT', { working: stage({ state: 'unknown', storedState: 'UNKNOWN' }) })).mode).toBe('unknown')
    expect(baselineDraft(item('t', 'TEXT', { working: stage({ state: 'set', storedState: 'KNOWN', valueText: 'x' }) })).mode).toBe('value')
  })
})

describe('buildEntries', () => {
  it('sends exactly the changed data with the right value column', () => {
    const items = [
      item('watts', 'NUMBER', { unit: 'W' }),
      item('poe', 'BOOLEAN'),
      item('model', 'TEXT'),
      item('color', 'OPTION', { options: [{ key: 'negro', label: 'Negro' }] }),
      item('ports', 'MULTI_OPTION'),
    ]
    const { entries, errors } = buildEntries(items, {
      watts: value({ number: '12,5' }),
      poe: value({ boolean: true }),
      model: value({ text: '  DS-2CD  ' }),
      color: value({ optionKeys: ['negro'] }),
      ports: value({ optionKeys: ['rj45', 'sfp'] }),
    })
    expect(errors).toEqual({})
    expect(entries).toEqual([
      { specKey: 'watts', valueNumber: 12.5, unit: 'W' },
      { specKey: 'poe', valueBoolean: true },
      { specKey: 'model', valueText: 'DS-2CD' },
      { specKey: 'color', optionKeys: ['negro'] },
      { specKey: 'ports', optionKeys: ['rj45', 'sfp'] },
    ])
  })

  it('sends zero and "No" as real values', () => {
    const items = [item('n', 'NUMBER'), item('b', 'BOOLEAN')]
    const { entries } = buildEntries(items, { n: value({ number: '0' }), b: value({ boolean: false }) })
    expect(entries).toEqual([
      { specKey: 'n', valueNumber: 0 },
      { specKey: 'b', valueBoolean: false },
    ])
  })

  it('sends not-applicable and unknown as explicit states', () => {
    const items = [item('a', 'TEXT'), item('b', 'NUMBER')]
    const { entries } = buildEntries(items, { a: value({ mode: 'not_applicable' }), b: value({ mode: 'unknown' }) })
    expect(entries).toEqual([
      { specKey: 'a', state: 'NOT_APPLICABLE' },
      { specKey: 'b', state: 'UNKNOWN' },
    ])
  })

  it('marks KNOWN when a value replaces an explicit state', () => {
    const items = [item('a', 'TEXT', { working: stage({ state: 'not_applicable', storedState: 'NOT_APPLICABLE' }) })]
    const { entries } = buildEntries(items, { a: value({ text: 'x' }) })
    expect(entries).toEqual([{ specKey: 'a', valueText: 'x', state: 'KNOWN' }])
  })

  it('clears a stored value only when the person emptied it', () => {
    const items = [item('a', 'TEXT', { working: stage({ valueText: 'x' }) }), item('b', 'TEXT')]
    const { entries } = buildEntries(items, { a: value({ text: '' }), b: value({ text: '' }) })
    expect(entries).toEqual([{ specKey: 'a', clear: true }])
  })

  it('skips unchanged data and reports an invalid number without sending it', () => {
    const items = [item('a', 'NUMBER', { working: stage({ valueNumber: 5 }) }), item('b', 'NUMBER')]
    const { entries, errors } = buildEntries(items, { a: value({ number: '5.0' }), b: value({ number: 'doce' }) })
    expect(entries).toEqual([])
    expect(errors.b).toContain('número')
  })
})

describe('applySaveResults', () => {
  it('drops saved drafts and keeps rejected ones', () => {
    const overrides = { a: value({ text: '1' }), b: value({ text: '2' }), c: value({ text: '3' }) }
    const next = applySaveResults(overrides, [
      { specKey: 'a', outcome: 'saved' },
      { specKey: 'b', outcome: 'rejected', code: 'type_mismatch' },
      { specKey: 'c', outcome: 'unchanged' },
    ])
    expect(Object.keys(next)).toEqual(['b'])
  })

  it('counts outcomes', () => {
    expect(
      summarizeResults([
        { specKey: 'a', outcome: 'saved' },
        { specKey: 'b', outcome: 'rejected' },
        { specKey: 'c', outcome: 'saved' },
      ]),
    ).toEqual({ saved: 2, unchanged: 0, rejected: 1 })
  })
})

describe('messages', () => {
  it('rejection messages are Spanish and never show the code', () => {
    expect(rejectionMessage({ code: 'not_in_template' })).not.toContain('not_in_template')
    expect(rejectionMessage({ code: 'whatever' })).toBe('No se pudo guardar este dato. Revisa el valor.')
    expect(rejectionMessage({})).toBe('No se pudo guardar este dato. Revisa el valor.')
  })

  it('missing messages map the codes and never leak English reasons', () => {
    expect(missingMessage({ specKey: 'a', label: 'A', flag: 'explicit_unknown' })).toContain('Desconocido')
    expect(missingMessage({ specKey: 'a', label: 'A', code: 'required_marked_not_applicable' })).toContain('No aplica')
    expect(missingMessage({ specKey: 'a', label: 'A', reason: 'The required datum has no value.' })).toBe('Falta completar este dato.')
  })
})

describe('buildLayout', () => {
  it('orders by template, separates outside-template values and flags required and proposed', () => {
    const items = [
      item('b', 'TEXT', { template: { status: 'APPROVED', isRequired: true, sortOrder: 2 } }),
      item('a', 'TEXT', { template: { status: 'PROPOSED', isRequired: true, sortOrder: 1 } }),
      item('x', 'TEXT', { template: null, outsideTemplate: true, working: stage({ valueText: 'v' }) }),
    ]
    const layout = buildLayout(items, {
      subcategoryId: 's',
      entries: [{ specKey: 'b', label: 'b', dataType: 'TEXT', unit: null, status: 'APPROVED', isRequired: true, requiredReason: 'Lo piden las licitaciones', sortOrder: 2 }],
    })
    expect(layout.rows.map((r) => r.item.specKey)).toEqual(['a', 'b'])
    expect(layout.rows[0]).toMatchObject({ proposed: true, requiredCounts: false })
    expect(layout.rows[1]).toMatchObject({ proposed: false, requiredCounts: true, requiredReason: 'Lo piden las licitaciones' })
    expect(layout.review.map((r) => r.item.specKey)).toEqual(['x'])
    expect(describeStoredValue(layout.review[0]!.item)).toBe('v')
  })

  it('describes zero, "No" and options', () => {
    expect(describeStoredValue(item('n', 'NUMBER', { unit: 'W', working: stage({ valueNumber: 0 }) }))).toBe('0 W')
    expect(describeStoredValue(item('b', 'BOOLEAN', { working: stage({ valueBoolean: false }) }))).toBe('No')
    expect(describeStoredValue(item('o', 'OPTION', { options: [{ key: 'k', label: 'Etiqueta' }], working: stage({ optionKeys: ['k'] }) }))).toBe('Etiqueta')
  })
})

describe('subcategory change preview summary', () => {
  const preview = {
    kept: [{ specKey: 'a', label: 'A' }],
    needsReview: [
      { specKey: 'b', label: 'B' },
      { specKey: 'c', label: 'C' },
    ],
    newlyMissing: [
      { specKey: 'd', label: 'D', isRequired: true, status: 'APPROVED' as const },
      { specKey: 'e', label: 'E', isRequired: true, status: 'PROPOSED' as const },
    ],
  }

  it('counts each group and the required ones that count', () => {
    expect(summarizeChangePreview(preview)).toEqual({ kept: 1, needsReview: 2, newlyMissing: 2, newlyRequired: 1, hasImpact: true })
  })

  it('has no impact when nothing is stored and nothing is new', () => {
    expect(summarizeChangePreview({ kept: [], needsReview: [], newlyMissing: [] }).hasImpact).toBe(false)
  })

  it('writes singular and plural lines', () => {
    const lines = describeChangePreview(summarizeChangePreview(preview))
    expect(lines[0]).toBe('1 dato se conserva.')
    expect(lines[1]).toBe('2 datos quedan por revisar (no se borran).')
    expect(lines[2]).toBe('2 datos nuevos por completar.')
  })
})

describe('draftKeySpecItems', () => {
  it('reads the draft side only and drops blank items', () => {
    const items = draftKeySpecItems({
      published: { sheetGroup: { items: [{ label: 'Publicado', value: '1' }] } },
      draft: { sheetGroup: { items: [{ label: 'Borrador', value: '2' }, { label: '', value: 'x' }] } },
    })
    expect(items).toEqual([{ label: 'Borrador', value: '2' }])
    expect(draftKeySpecItems(undefined)).toEqual([])
  })
})
