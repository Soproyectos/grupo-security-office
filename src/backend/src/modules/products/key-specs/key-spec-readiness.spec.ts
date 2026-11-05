/**
 * F6/P3 — only APPROVED, required template rows can block; a long name only warns.
 */
import { DEFINITIONS, PRODUCT, TEMPLATES, VALUES } from './__fixtures__/key-spec.fixtures'
import { NAME_LENGTH_LIMIT, missingRequiredKeySpecs, nameLengthWarning } from './key-spec-readiness'
import type { KeySpecStage, ProductKeySpecValue, SubcategorySpec } from './key-spec.types'

type FixtureProduct = (typeof PRODUCT)[keyof typeof PRODUCT]

const missing = (
  product: FixtureProduct,
  stage: KeySpecStage,
  over: Partial<{ templates: SubcategorySpec[]; values: ProductKeySpecValue[]; subcategoryId: string | null }> = {},
) =>
  missingRequiredKeySpecs({
    subcategoryId: over.subcategoryId === undefined ? product.subcategoryId : over.subcategoryId,
    definitions: DEFINITIONS,
    templates: over.templates ?? TEMPLATES,
    values: over.values ?? VALUES.filter((v) => v.productId === product.id),
    stage,
  })

const without = (product: FixtureProduct, key: string, stage: KeySpecStage) =>
  VALUES.filter((v) => v.productId === product.id && !(v.specDefinitionId === `def-${key}` && v.stage === stage))

describe('missingRequiredKeySpecs', () => {
  it('complete published data -> nothing missing, for the three fixtures', () => {
    expect(missing(PRODUCT.dvr, 'PUBLISHED')).toEqual([])
    expect(missing(PRODUCT.switch, 'PUBLISHED')).toEqual([])
    expect(missing(PRODUCT.accessory, 'PUBLISHED')).toEqual([])
  })

  it('PROPOSED required rows never block (switch "mounting", accessory "shielding" have no value)', () => {
    const proposedRequired = TEMPLATES.filter((t) => t.status === 'PROPOSED' && t.isRequired)
    expect(proposedRequired.length).toBeGreaterThanOrEqual(2)
    for (const stage of ['WORKING', 'PUBLISHED'] as const) {
      expect(missing(PRODUCT.switch, stage).map((m) => m.specKey)).not.toContain('mounting')
      expect(missing(PRODUCT.accessory, stage).map((m) => m.specKey)).not.toContain('shielding')
    }
  })

  it('RETIRED required rows never block either', () => {
    const retired = TEMPLATES.map((t) => (t.specDefinitionId === 'def-total_ports' ? { ...t, status: 'RETIRED' as const } : t))
    expect(missing(PRODUCT.switch, 'PUBLISHED', { values: without(PRODUCT.switch, 'total_ports', 'PUBLISHED'), templates: retired })).toEqual([])
  })

  it('a required datum without value is reported with its label and a reason', () => {
    const r = missing(PRODUCT.switch, 'PUBLISHED', { values: without(PRODUCT.switch, 'total_ports', 'PUBLISHED') })
    expect(r).toEqual([{ specKey: 'total_ports', label: 'Puertos totales', reason: 'The required datum has no value.' }])
  })

  it('required but not filterable still blocks; filterable but not required never does', () => {
    // "storage" is required and not filterable; "ip_channels" is filterable and not required.
    expect(missing(PRODUCT.dvr, 'PUBLISHED', { values: without(PRODUCT.dvr, 'storage', 'PUBLISHED') }).map((m) => m.specKey)).toEqual(['storage'])
    expect(missing(PRODUCT.dvr, 'PUBLISHED', { values: without(PRODUCT.dvr, 'ip_channels', 'PUBLISHED') })).toEqual([])
  })

  it('an invalid required value counts as missing and explains why', () => {
    const values = VALUES.filter((v) => v.productId === PRODUCT.dvr.id).map((v) =>
      v.specDefinitionId === 'def-device_type' && v.stage === 'PUBLISHED' ? { ...v, optionKeys: ['HYBRID'] } : v,
    )
    const r = missing(PRODUCT.dvr, 'PUBLISHED', { values })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ specKey: 'device_type', label: 'Tipo de equipo' })
    expect(r[0].reason).toContain('HYBRID')
  })

  it('checks the requested stage only', () => {
    // The DVR draft holds just two values: every other required datum is missing there, none at publication.
    expect(missing(PRODUCT.dvr, 'PUBLISHED')).toEqual([])
    expect(missing(PRODUCT.dvr, 'WORKING').map((m) => m.specKey)).toEqual(['device_type', 'max_recording_resolution'])
  })

  it('lists the missing data in template order', () => {
    const r = missing(PRODUCT.dvr, 'PUBLISHED', { values: [] })
    expect(r.map((m) => m.specKey)).toEqual(['device_type', 'analog_channels', 'max_recording_resolution', 'storage'])
  })

  it('a product without subcategory has no template to satisfy', () => {
    expect(missing(PRODUCT.dvr, 'PUBLISHED', { subcategoryId: null, values: [] })).toEqual([])
  })

  it('a required row whose definition no longer exists is reported', () => {
    const orphan: SubcategorySpec = { ...TEMPLATES[0], specDefinitionId: 'def-gone', sortOrder: 99 }
    const r = missing(PRODUCT.dvr, 'PUBLISHED', { templates: [...TEMPLATES, orphan] })
    expect(r).toEqual([{ specKey: 'def-gone', label: 'def-gone', reason: 'The datum is required but its definition does not exist.' }])
  })
})

describe('nameLengthWarning', () => {
  it('returns null below the limit and warns from it (P3: from 70 by default)', () => {
    expect(NAME_LENGTH_LIMIT).toBe(70)
    expect(nameLengthWarning('a'.repeat(69))).toBeNull()
    expect(nameLengthWarning('a'.repeat(70))).toMatchObject({ code: 'name_long', length: 70, limit: 70 })
  })

  it('measures the trimmed name', () => {
    expect(nameLengthWarning(`  ${'a'.repeat(69)}  `)).toBeNull()
  })

  it('accepts another limit', () => {
    expect(nameLengthWarning('a'.repeat(30), 20)).toMatchObject({ length: 30, limit: 20 })
    expect(nameLengthWarning('a'.repeat(19), 20)).toBeNull()
  })

  it('never truncates: the warning reports the full length and carries no shortened name', () => {
    const name = 'DVR 4CH 1080P eSSD 960GB AcuSense con entradas de alarma y salida HDMI para monitor local'
    const warning = nameLengthWarning(name)
    expect(warning).not.toBeNull()
    expect(warning!.length).toBe(name.length)
    expect(Object.keys(warning!).sort()).toEqual(['code', 'length', 'limit', 'message'])
    expect(warning!.message).not.toContain(name)
  })
})

describe('missingRequiredKeySpecs — explicit answers (unknown / not applicable)', () => {
  const answer = (key: string, stage: KeySpecStage, state: 'KNOWN' | 'NOT_APPLICABLE' | 'UNKNOWN'): ProductKeySpecValue => ({
    productId: PRODUCT.switch.id,
    specDefinitionId: `def-${key}`,
    stage,
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    optionKeys: [],
    state,
  })
  const withAnswer = (key: string, stage: KeySpecStage, state: 'NOT_APPLICABLE' | 'UNKNOWN') => [
    ...without(PRODUCT.switch, key, stage),
    answer(key, stage, state),
  ]

  it('an explicit UNKNOWN on a required datum is still missing and flagged explicit_unknown', () => {
    const r = missing(PRODUCT.switch, 'PUBLISHED', { values: withAnswer('total_ports', 'PUBLISHED', 'UNKNOWN') })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ specKey: 'total_ports', flag: 'explicit_unknown' })
  })

  it('NOT_APPLICABLE on a required datum is not complete: flagged required_marked_not_applicable', () => {
    const r = missing(PRODUCT.switch, 'PUBLISHED', { values: withAnswer('total_ports', 'PUBLISHED', 'NOT_APPLICABLE') })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ specKey: 'total_ports', flag: 'required_marked_not_applicable' })
  })

  it('NOT_APPLICABLE or UNKNOWN on a non-required datum adds no missing item', () => {
    expect(missing(PRODUCT.switch, 'PUBLISHED', { values: withAnswer('management', 'PUBLISHED', 'NOT_APPLICABLE') })).toEqual([])
    expect(missing(PRODUCT.switch, 'PUBLISHED', { values: withAnswer('management', 'PUBLISHED', 'UNKNOWN') })).toEqual([])
  })

  it('only the requested stage is read: a WORKING answer does not change the PUBLISHED check', () => {
    const values = [...VALUES.filter((v) => v.productId === PRODUCT.switch.id), answer('total_ports', 'WORKING', 'UNKNOWN')]
    expect(missing(PRODUCT.switch, 'PUBLISHED', { values })).toEqual([])
    expect(missing(PRODUCT.switch, 'WORKING', { values }).map((m) => m.flag)).toEqual(['explicit_unknown'])
  })

  it('a KNOWN zero still completes a required datum (zero is a value, not an absence)', () => {
    const values = [
      ...without(PRODUCT.switch, 'total_ports', 'PUBLISHED'),
      { ...answer('total_ports', 'PUBLISHED', 'KNOWN'), valueNumber: 0 },
    ]
    expect(missing(PRODUCT.switch, 'PUBLISHED', { values })).toEqual([])
  })

  it('plain missing items carry no flag key at all (backward compatible shape)', () => {
    const r = missing(PRODUCT.switch, 'PUBLISHED', { values: without(PRODUCT.switch, 'total_ports', 'PUBLISHED') })
    expect(Object.keys(r[0]).sort()).toEqual(['label', 'reason', 'specKey'])
  })
})
