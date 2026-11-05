/**
 * D1 — the sheet's "Datos principales" group and the store facets come from one
 * list of entries built from APPROVED template rows and PUBLISHED values only.
 */
import { DEFINITIONS, PRODUCT, SUBCATEGORY, TEMPLATES, VALUES } from './__fixtures__/key-spec.fixtures'
import { buildPublishedKeySpecProjection, formatKeySpecValue, type KeySpecEntry, type KeySpecProjection } from './key-spec-projection'
import type { KeySpecDataType, ProductKeySpecValue, SpecDefinition, SubcategorySpec } from './key-spec.types'

type FixtureProduct = (typeof PRODUCT)[keyof typeof PRODUCT]

const project = (
  product: FixtureProduct,
  over: Partial<{ definitions: SpecDefinition[]; templates: SubcategorySpec[]; values: ProductKeySpecValue[] }> = {},
): KeySpecProjection =>
  buildPublishedKeySpecProjection({
    subcategoryId: product.subcategoryId,
    definitions: over.definitions ?? DEFINITIONS,
    templates: over.templates ?? TEMPLATES,
    values: over.values ?? VALUES.filter((v) => v.productId === product.id),
  })

describe('buildPublishedKeySpecProjection — synthetic fixtures', () => {
  it('DVR recorder: six data in template order', () => {
    const p = project(PRODUCT.dvr)
    expect(p.sheetGroup).toEqual({
      id: 'datos-principales',
      title: 'Datos principales',
      items: [
        { label: 'Tipo de equipo', value: 'DVR Turbo HD' },
        { label: 'Canales analógicos', value: '4' },
        { label: 'Canales IP', value: '1' },
        { label: 'Resolución máxima de grabación', value: '5 MP Lite' },
        { label: 'Almacenamiento', value: 'eSSD 1 TB' },
        { label: 'Analítica', value: 'AcuSense' },
      ],
    })
    // "storage" is required but not filterable, so it is on the sheet and not a facet.
    expect(p.facets.map((f) => f.specKey)).toEqual(['device_type', 'analog_channels', 'ip_channels', 'max_recording_resolution', 'analytics'])
  })

  it('switch: the proposed "mounting" row is ignored and the unit shows on the budget', () => {
    const p = project(PRODUCT.switch)
    expect(p.sheetGroup?.items).toEqual([
      { label: 'Puertos totales', value: '10' },
      { label: 'Puertos PoE', value: '8' },
      { label: 'Velocidad de puertos', value: 'Gigabit' },
      { label: 'Potencia PoE total', value: '60 W' },
      { label: 'Administración', value: 'Administrable (smart)' },
    ])
    // "management" is neither required nor filterable.
    expect(p.facets.map((f) => f.specKey)).toEqual(['total_ports', 'poe_ports', 'port_speed', 'poe_budget'])
  })

  it('accessory: three data and no value for the proposed "shielding" row', () => {
    const p = project(PRODUCT.accessory)
    expect(p.sheetGroup?.items).toEqual([
      { label: 'Tipo de conector', value: 'RJ45' },
      { label: 'Categoría del cable', value: 'Cat 6' },
      { label: 'Color', value: 'Rojo' },
    ])
    expect(p.facets.map((f) => f.specKey)).toEqual(['connector_type', 'cable_category', 'color'])
  })

  it.each(Object.values(PRODUCT))('$sku: nothing is skipped when every published value is valid', (product) => {
    expect(project(product).skipped).toEqual([])
  })
})

describe('buildPublishedKeySpecProjection — what is read', () => {
  it('reads PUBLISHED values, never the WORKING draft', () => {
    const dvr = project(PRODUCT.dvr).entries
    expect(dvr.find((e) => e.specKey === 'analog_channels')?.value.valueNumber).toBe(4) // WORKING says 8
    expect(dvr.find((e) => e.specKey === 'storage')?.value.valueText).toBe('eSSD 1 TB') // WORKING says 2 TB
    const accessory = project(PRODUCT.accessory).entries
    expect(accessory.find((e) => e.specKey === 'color')?.selectedOptions.map((o) => o.key)).toEqual(['RED']) // WORKING says BLUE
  })

  it('a datum with only a WORKING value is absent', () => {
    const values = VALUES.filter((v) => v.productId === PRODUCT.dvr.id && !(v.specDefinitionId === 'def-ip_channels' && v.stage === 'PUBLISHED'))
    const withWorkingOnly = [
      ...values,
      { ...VALUES.find((v) => v.specDefinitionId === 'def-ip_channels')!, stage: 'WORKING' as const },
    ]
    expect(project(PRODUCT.dvr, { values: withWorkingOnly }).entries.map((e) => e.specKey)).not.toContain('ip_channels')
  })

  it('uses only APPROVED template rows, even when a PUBLISHED value exists for a PROPOSED or RETIRED one', () => {
    const mountingValue: ProductKeySpecValue = {
      productId: PRODUCT.switch.id,
      specDefinitionId: 'def-mounting',
      stage: 'PUBLISHED',
      valueText: null,
      valueNumber: null,
      valueBoolean: null,
      optionKeys: ['RACK'],
    }
    const values = [...VALUES.filter((v) => v.productId === PRODUCT.switch.id), mountingValue]
    expect(project(PRODUCT.switch, { values }).entries.map((e) => e.specKey)).not.toContain('mounting')

    const retired = TEMPLATES.map((t) => (t.specDefinitionId === 'def-poe_ports' ? { ...t, status: 'RETIRED' as const } : t))
    expect(project(PRODUCT.switch, { templates: retired }).entries.map((e) => e.specKey)).not.toContain('poe_ports')
  })

  it('ignores templates of other subcategories', () => {
    // Same values, but the product is filed under connectors: none of the switch data apply.
    const p = buildPublishedKeySpecProjection({
      subcategoryId: SUBCATEGORY.connectors,
      definitions: DEFINITIONS,
      templates: TEMPLATES,
      values: VALUES.filter((v) => v.productId === PRODUCT.switch.id),
    })
    expect(p.entries).toEqual([])
    expect(p.sheetGroup).toBeNull()
    expect(p.facets).toEqual([])
  })

  it('a product without subcategory projects nothing', () => {
    const p = buildPublishedKeySpecProjection({ subcategoryId: null, definitions: DEFINITIONS, templates: TEMPLATES, values: VALUES })
    expect(p).toEqual({ entries: [], sheetGroup: null, facets: [], skipped: [] })
  })

  it('skips inactive definitions and values that no longer validate', () => {
    const inactive = DEFINITIONS.map((d) => (d.key === 'storage' ? { ...d, isActive: false } : d))
    expect(project(PRODUCT.dvr, { definitions: inactive }).entries.map((e) => e.specKey)).not.toContain('storage')

    const retiredOption = DEFINITIONS.map((d) =>
      d.key === 'device_type' ? { ...d, options: d.options.map((o) => (o.key === 'DVR' ? { ...o, isActive: false } : o)) } : d,
    )
    expect(project(PRODUCT.dvr, { definitions: retiredOption }).entries.map((e) => e.specKey)).not.toContain('device_type')

    const unknownOption = VALUES.filter((v) => v.productId === PRODUCT.dvr.id).map((v) =>
      v.specDefinitionId === 'def-max_recording_resolution' && v.stage === 'PUBLISHED' ? { ...v, optionKeys: ['8K'] } : v,
    )
    expect(project(PRODUCT.dvr, { values: unknownOption }).entries.map((e) => e.specKey)).not.toContain('max_recording_resolution')
  })

  it('sorts by template order, then by label', () => {
    const tied = TEMPLATES.map((t) => (t.subcategoryId === SUBCATEGORY.connectors ? { ...t, sortOrder: 1 } : t))
    expect(project(PRODUCT.accessory, { templates: tied }).entries.map((e) => e.label)).toEqual([
      'Categoría del cable',
      'Color',
      'Tipo de conector',
    ])
  })
})

describe('buildPublishedKeySpecProjection — skipped published values (R3-003)', () => {
  const dvrValues = VALUES.filter((v) => v.productId === PRODUCT.dvr.id)
  const withPublished = (specDefinitionId: string, patch: Partial<ProductKeySpecValue>): ProductKeySpecValue[] =>
    dvrValues.map((v) => (v.specDefinitionId === specDefinitionId && v.stage === 'PUBLISHED' ? { ...v, ...patch } : v))

  it('an invalid published value stays out of entries, sheet and facets and is reported with its issues', () => {
    const p = project(PRODUCT.dvr, { values: withPublished('def-max_recording_resolution', { optionKeys: ['8K'] }) })
    expect(p.entries.map((e) => e.specKey)).not.toContain('max_recording_resolution')
    expect(p.sheetGroup?.items.map((i) => i.label)).not.toContain('Resolución máxima de grabación')
    expect(p.facets.map((f) => f.specKey)).not.toContain('max_recording_resolution')
    expect(p.skipped).toEqual([
      {
        specDefinitionId: 'def-max_recording_resolution',
        specKey: 'max_recording_resolution',
        issues: [expect.objectContaining({ code: 'option_not_allowed', specKey: 'max_recording_resolution' })],
      },
    ])
  })

  it('reports a value of the wrong shape and a deactivated definition', () => {
    const wrongShape = project(PRODUCT.dvr, { values: withPublished('def-analog_channels', { valueNumber: null, valueText: '4' }) })
    expect(wrongShape.skipped.map((s) => [s.specKey, s.issues.map((i) => i.code)])).toEqual([['analog_channels', ['type_mismatch']]])

    const inactive = DEFINITIONS.map((d) => (d.key === 'storage' ? { ...d, isActive: false } : d))
    expect(project(PRODUCT.dvr, { definitions: inactive }).skipped.map((s) => [s.specKey, s.issues.map((i) => i.code)])).toEqual([
      ['storage', ['definition_inactive']],
    ])
  })

  it('reports a published value whose definition is unknown, keyed by the definition id', () => {
    const p = project(PRODUCT.dvr, { definitions: DEFINITIONS.filter((d) => d.key !== 'storage') })
    expect(p.skipped).toEqual([
      { specDefinitionId: 'def-storage', specKey: 'def-storage', issues: [expect.objectContaining({ code: 'definition_missing' })] },
    ])
    expect(p.entries.map((e) => e.specKey)).not.toContain('storage')
  })

  it('does not report what is not an error: no published value, WORKING only, or a row that is not APPROVED', () => {
    const noPublished = dvrValues.filter((v) => !(v.specDefinitionId === 'def-ip_channels' && v.stage === 'PUBLISHED'))
    expect(project(PRODUCT.dvr, { values: noPublished }).skipped).toEqual([])

    const proposed = TEMPLATES.map((t) => (t.specDefinitionId === 'def-storage' ? { ...t, status: 'PROPOSED' as const } : t))
    expect(project(PRODUCT.dvr, { templates: proposed }).skipped).toEqual([])
  })

  it('a valid value with no text to show is reported as no_display_value and leaves entries, sheet and facets together', () => {
    const blankLabel = DEFINITIONS.map((d) =>
      d.key === 'device_type' ? { ...d, options: d.options.map((o) => (o.key === 'DVR' ? { ...o, label: ' ' } : o)) } : d,
    )
    const p = project(PRODUCT.dvr, { definitions: blankLabel })
    expect(p.skipped).toEqual([
      { specDefinitionId: 'def-device_type', specKey: 'device_type', issues: [expect.objectContaining({ code: 'no_display_value' })] },
    ])
    expect(p.entries.map((e) => e.specKey)).not.toContain('device_type')
    expect(p.sheetGroup?.items.map((i) => i.label)).not.toContain('Tipo de equipo')
    expect(p.facets.map((f) => f.specKey)).not.toContain('device_type')
  })

  it('skipped values are ordered by key and the valid rest of the sheet is untouched', () => {
    const values = withPublished('def-storage', { valueText: '' }).map((v) =>
      v.specDefinitionId === 'def-analog_channels' && v.stage === 'PUBLISHED' ? { ...v, valueNumber: Number.NaN } : v,
    )
    const p = project(PRODUCT.dvr, { values })
    expect(p.skipped.map((s) => s.specKey)).toEqual(['analog_channels', 'storage'])
    expect(p.entries.map((e) => e.specKey)).toEqual(['device_type', 'ip_channels', 'max_recording_resolution', 'analytics'])
  })
})

describe('buildPublishedKeySpecProjection — one source for sheet and filters (D1)', () => {
  const products = Object.values(PRODUCT)

  it.each(products)('$sku: every facet carries the raw value of the entry with the same key', (product) => {
    const { entries, facets } = project(product)
    expect(facets.length).toBeGreaterThan(0)
    for (const facet of facets) {
      const entry = entries.find((e) => e.specKey === facet.specKey)!
      expect(entry.isFilterable).toBe(true)
      expect(facet.value).toBe(entry.value)
      expect(facet.label).toBe(entry.label)
      expect(facet.dataType).toBe(entry.dataType)
      expect(facet.unit).toBe(entry.unit)
    }
    expect(facets.map((f) => f.specKey)).toEqual(entries.filter((e) => e.isFilterable).map((e) => e.specKey))
  })

  it.each(products)('$sku: every sheet item is formatKeySpecValue of its entry, in the same order', (product) => {
    const { entries, sheetGroup } = project(product)
    expect(sheetGroup?.items).toEqual(entries.map((e) => ({ label: e.label, value: formatKeySpecValue(e) })))
    expect(sheetGroup?.items.every((i) => i.value !== '')).toBe(true)
  })

  it('a datum that disappears from the entries disappears from the sheet and from the facets alike', () => {
    const values = VALUES.filter((v) => v.productId === PRODUCT.switch.id && v.specDefinitionId !== 'def-poe_budget')
    const p = project(PRODUCT.switch, { values })
    expect(p.sheetGroup?.items.map((i) => i.label)).not.toContain('Potencia PoE total')
    expect(p.facets.map((f) => f.specKey)).not.toContain('poe_budget')
  })
})

describe('formatKeySpecValue', () => {
  const entry = (over: Partial<KeySpecEntry> & { dataType: KeySpecDataType }): KeySpecEntry => ({
    specDefinitionId: 'def-x',
    specKey: 'x',
    label: 'X',
    unit: null,
    sortOrder: 1,
    isFilterable: false,
    value: { valueText: null, valueNumber: null, valueBoolean: null, optionKeys: [] },
    selectedOptions: [],
    ...over,
  })
  const num = (valueNumber: number, unit: string | null = null) =>
    formatKeySpecValue(entry({ dataType: 'NUMBER', unit, value: { valueText: null, valueNumber, valueBoolean: null, optionKeys: [] } }))

  it('numbers use a decimal comma, a thousands dot and the unit', () => {
    expect(num(60, 'W')).toBe('60 W')
    expect(num(5.4, 'W')).toBe('5,4 W')
    expect(num(1000, 'GB')).toBe('1.000 GB')
    expect(num(1234567.891)).toBe('1.234.567,891')
    expect(num(4)).toBe('4')
    expect(num(0)).toBe('0')
    expect(num(-2.5, 'dB')).toBe('-2,5 dB')
  })

  it('booleans read Sí / No', () => {
    const b = (valueBoolean: boolean) =>
      formatKeySpecValue(entry({ dataType: 'BOOLEAN', value: { valueText: null, valueNumber: null, valueBoolean, optionKeys: [] } }))
    expect(b(true)).toBe('Sí')
    expect(b(false)).toBe('No')
  })

  it('a missing value has no display text instead of 0, "No" or an empty string (R3-002)', () => {
    const none = { valueText: null, valueNumber: null, valueBoolean: null, optionKeys: [] }
    expect(formatKeySpecValue(entry({ dataType: 'NUMBER', unit: 'W', value: none }))).toBeNull()
    expect(formatKeySpecValue(entry({ dataType: 'NUMBER', value: { ...none, valueNumber: undefined as unknown as null } }))).toBeNull()
    expect(formatKeySpecValue(entry({ dataType: 'NUMBER', value: { ...none, valueNumber: Number.NaN } }))).toBeNull()
    expect(formatKeySpecValue(entry({ dataType: 'NUMBER', value: { ...none, valueNumber: Number.POSITIVE_INFINITY } }))).toBeNull()
    expect(formatKeySpecValue(entry({ dataType: 'BOOLEAN', value: none }))).toBeNull()
    expect(formatKeySpecValue(entry({ dataType: 'TEXT', value: none }))).toBeNull()
    expect(formatKeySpecValue(entry({ dataType: 'TEXT', value: { ...none, valueText: '  ' } }))).toBeNull()
    expect(formatKeySpecValue(entry({ dataType: 'OPTION' }))).toBeNull()
    expect(formatKeySpecValue(entry({ dataType: 'MULTI_OPTION' }))).toBeNull()
    // A real zero and a real false are values, not missing data.
    expect(num(0, 'W')).toBe('0 W')
  })

  it('options show their labels joined by a comma, text is shown as is', () => {
    const selectedOptions = [
      { key: 'A', label: 'AcuSense', sortOrder: 10, isActive: true },
      { key: 'M', label: 'Detección de movimiento', sortOrder: 20, isActive: true },
    ]
    expect(formatKeySpecValue(entry({ dataType: 'MULTI_OPTION', selectedOptions }))).toBe('AcuSense, Detección de movimiento')
    expect(formatKeySpecValue(entry({ dataType: 'OPTION', selectedOptions: selectedOptions.slice(0, 1) }))).toBe('AcuSense')
    expect(
      formatKeySpecValue(entry({ dataType: 'TEXT', value: { valueText: 'eSSD 1 TB', valueNumber: null, valueBoolean: null, optionKeys: [] } })),
    ).toBe('eSSD 1 TB')
  })
})

describe('buildPublishedKeySpecProjection — explicit answers (unknown / not applicable)', () => {
  const base = VALUES.filter((v) => v.productId === PRODUCT.switch.id)
  const answer = (key: string, stage: 'WORKING' | 'PUBLISHED', state: 'NOT_APPLICABLE' | 'UNKNOWN'): ProductKeySpecValue => ({
    productId: PRODUCT.switch.id,
    specDefinitionId: `def-${key}`,
    stage,
    valueText: null,
    valueNumber: null,
    valueBoolean: null,
    optionKeys: [],
    state,
  })
  const replace = (key: string, next: ProductKeySpecValue) => [
    ...base.filter((v) => !(v.specDefinitionId === `def-${key}` && v.stage === next.stage)),
    next,
  ]

  it.each(['NOT_APPLICABLE', 'UNKNOWN'] as const)('a published %s gives no sheet item, no facet and no skipped noise', (state) => {
    const reference = project(PRODUCT.switch)
    const p = project(PRODUCT.switch, { values: replace('poe_budget', answer('poe_budget', 'PUBLISHED', state)) })
    expect(p.sheetGroup?.items.map((i) => i.label)).not.toContain('Potencia PoE total')
    expect(p.facets.map((f) => f.specKey)).not.toContain('poe_budget')
    expect(p.entries.map((e) => e.specKey)).not.toContain('poe_budget')
    expect(p.skipped).toEqual([])
    // Everything else is exactly as before.
    expect(p.sheetGroup?.items).toEqual(reference.sheetGroup?.items.filter((i) => i.label !== 'Potencia PoE total'))
  })

  it('a WORKING answer is ignored by the published projection', () => {
    const reference = project(PRODUCT.switch)
    const p = project(PRODUCT.switch, { values: replace('poe_budget', answer('poe_budget', 'WORKING', 'NOT_APPLICABLE')) })
    expect(p).toEqual(reference)
  })

  it('a real zero still displays, unlike the two explicit answers', () => {
    const zero: ProductKeySpecValue = { ...answer('poe_budget', 'PUBLISHED', 'UNKNOWN'), state: 'KNOWN', valueNumber: 0 }
    const p = project(PRODUCT.switch, { values: replace('poe_budget', zero) })
    expect(p.sheetGroup?.items).toContainEqual({ label: 'Potencia PoE total', value: '0 W' })
  })
})
