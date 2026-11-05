/**
 * Provenance ("Origen"): validation, identity and duplicate handling. The same
 * reference in a different file is another appearance, never a duplicate.
 */
import { dedupeSources, sourceIdentityKey, validateProductSource, type ProductSource } from './product-source'

const source = (over: Partial<ProductSource> = {}): ProductSource => ({
  productId: 'prod-syn-dvr-0401',
  sourceFile: 'SYNTHETIC_LIST_A.xlsx',
  sourceSheet: 'Brand A',
  sourceRow: 12,
  cutoffDate: '2026-10-28',
  originalReference: 'SYN-DVR-0401',
  originalDescription: 'Synthetic 4-channel recorder',
  originalSection: 'Recorders',
  originalBrandLabel: 'Brand A',
  classificationCriterion: null,
  extra: { tier: 'installer' },
  ...over,
})

const codesOf = (s: ProductSource): string[] => validateProductSource(s).map((i) => i.code)

describe('validateProductSource', () => {
  it('a complete source has no issues; optional fields may be null', () => {
    expect(validateProductSource(source())).toEqual([])
    expect(
      validateProductSource(
        source({ originalDescription: null, originalSection: null, originalBrandLabel: null, classificationCriterion: null, extra: {} }),
      ),
    ).toEqual([])
  })

  it.each([
    ['sourceFile', 'source_file_required'],
    ['sourceSheet', 'source_sheet_required'],
    ['originalReference', 'original_reference_required'],
  ] as const)('%s must not be empty or blank', (field, code) => {
    expect(codesOf(source({ [field]: '' }))).toEqual([code])
    expect(codesOf(source({ [field]: '   ' }))).toEqual([code])
  })

  it('sourceRow must be an integer of at least 1', () => {
    for (const row of [0, -3, 1.5, Number.NaN]) expect(codesOf(source({ sourceRow: row }))).toEqual(['source_row_invalid'])
    expect(codesOf(source({ sourceRow: 1 }))).toEqual([])
  })

  it('cutoffDate must be a real calendar date in YYYY-MM-DD', () => {
    for (const date of ['2026-02-30', '2026-13-01', '2026-00-10', '29/10/2026', '2026-10-29T00:00:00Z', '2026-1-5', '']) {
      expect(codesOf(source({ cutoffDate: date }))).toEqual(['cutoff_date_invalid'])
    }
    expect(codesOf(source({ cutoffDate: '2028-02-29' }))).toEqual([]) // leap year
    expect(codesOf(source({ cutoffDate: '2027-02-29' }))).toEqual(['cutoff_date_invalid'])
  })

  it('reports every problem of a row, naming the field', () => {
    const issues = validateProductSource(source({ sourceFile: '', sourceRow: 0, cutoffDate: 'soon' }))
    expect(issues.map((i) => i.field)).toEqual(['sourceFile', 'sourceRow', 'cutoffDate'])
  })
})

describe('sourceIdentityKey', () => {
  it('is stable for equal file, sheet, row and cutoff date', () => {
    expect(sourceIdentityKey(source())).toBe(sourceIdentityKey(source({ originalDescription: 'changed text', extra: {} })))
  })

  it('changes with any of the four parts', () => {
    const base = sourceIdentityKey(source())
    for (const over of [{ sourceFile: 'OTHER.xlsx' }, { sourceSheet: 'Brand B' }, { sourceRow: 13 }, { cutoffDate: '2026-10-29' }]) {
      expect(sourceIdentityKey(source(over))).not.toBe(base)
    }
  })

  it('does not blur the parts together', () => {
    expect(sourceIdentityKey(source({ sourceFile: 'a|b', sourceSheet: 'c' }))).not.toBe(sourceIdentityKey(source({ sourceFile: 'a', sourceSheet: 'b|c' })))
  })

  it('does not depend on the reference: the same reference in another file is another appearance', () => {
    const a = source()
    const b = source({ sourceFile: 'SYNTHETIC_LIST_B.xlsx' })
    expect(a.originalReference).toBe(b.originalReference)
    expect(sourceIdentityKey(a)).not.toBe(sourceIdentityKey(b))
  })
})

describe('dedupeSources', () => {
  it('drops exact identity duplicates, keeps the first and reports the dropped ones', () => {
    const first = source({ originalDescription: 'first' })
    const repeat = source({ originalDescription: 'second' })
    const other = source({ sourceRow: 13 })
    const { kept, dropped } = dedupeSources([first, other, repeat])
    expect(kept).toEqual([first, other])
    expect(dropped).toEqual([repeat])
    expect(kept[0]).toBe(first)
  })

  it('never merges different identities, even for the same product and reference', () => {
    const list = [
      source(),
      source({ sourceFile: 'SYNTHETIC_LIST_B.xlsx' }),
      source({ sourceSheet: 'Brand B' }),
      source({ sourceRow: 99 }),
      source({ cutoffDate: '2026-11-01' }),
    ]
    const { kept, dropped } = dedupeSources(list)
    expect(kept).toEqual(list)
    expect(dropped).toEqual([])
  })

  it('does not mutate the input and handles an empty list', () => {
    const list = [source(), source()]
    dedupeSources(list)
    expect(list).toHaveLength(2)
    expect(dedupeSources([])).toEqual({ kept: [], dropped: [] })
  })
})
