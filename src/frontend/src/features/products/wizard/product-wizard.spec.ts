import { describe, expect, it } from 'vitest'
import {
  LONG_NAME_WARNING_FROM,
  WIZARD_STEPS,
  buildCreatePayload,
  checkIdentity,
  duplicateReferenceOf,
  isNamePending,
  isStepAvailable,
  nameForField,
  normalizeReference,
  parseWizardStep,
  pendingItems,
  sheetSaveBlocker,
} from './product-wizard'

const saved = {
  name: 'Cámara domo',
  sku: 'DS-2CD',
  brandId: 'b1',
  subcategoryId: 's1',
  description: 'Texto',
  images: [{ id: 'i1', url: '/api/files/i1', isPrimary: true }],
}

describe('product wizard model', () => {
  it('has five steps in order and opens the first one for anything unknown', () => {
    expect(WIZARD_STEPS.map((step) => step.id)).toEqual([1, 2, 3, 4, 5])
    expect(parseWizardStep('3')).toBe(3)
    expect(parseWizardStep('9')).toBe(1)
    expect(parseWizardStep(null)).toBe(1)
  })

  it('only the first step is open before the draft exists', () => {
    expect([1, 2, 3, 4, 5].map((step) => isStepAvailable(step as 1, false))).toEqual([true, false, false, false, false])
    expect([1, 2, 3, 4, 5].every((step) => isStepAvailable(step as 1, true))).toBe(true)
  })

  it('normalizes the reference like the server (trim, no spaces, upper-case)', () => {
    expect(normalizeReference('  ids-e04hqhi- d ')).toBe('IDS-E04HQHI-D')
  })

  it('requires the reference and only warns about a long name', () => {
    expect(checkIdentity({ reference: ' ', name: '' }).referenceError).toMatch(/referencia/)
    expect(checkIdentity({ reference: 'A', name: '' }).referenceError).not.toBeNull()
    expect(checkIdentity({ reference: 'AB-1', name: '' })).toEqual({ referenceError: null, nameWarning: null })
    const long = 'x'.repeat(LONG_NAME_WARNING_FROM)
    expect(checkIdentity({ reference: 'AB-1', name: long.slice(1) }).nameWarning).toBeNull()
    const check = checkIdentity({ reference: 'AB-1', name: long })
    expect(check.referenceError).toBeNull()
    expect(check.nameWarning).toMatch(/70/)
  })

  it('creates from the reference alone and never cuts a long name', () => {
    expect(buildCreatePayload({ reference: ' ab 1 ', name: '   ' })).toEqual({ sku: 'AB1' })
    const long = 'N'.repeat(120)
    expect(buildCreatePayload({ reference: 'ab-1', name: long })).toEqual({ sku: 'AB-1', name: long })
  })

  it('treats a name equal to the reference as pending and shows it empty', () => {
    expect(isNamePending({ name: 'DS-2CD', sku: 'ds-2cd' })).toBe(true)
    expect(nameForField({ name: 'DS-2CD', sku: 'DS-2CD' })).toBe('')
    expect(nameForField(saved)).toBe('Cámara domo')
  })

  it('reads the duplicate reference answer, with and without the existing product', () => {
    const conflict = (data: object) => ({ response: { status: 409, data } })
    expect(duplicateReferenceOf(conflict({ code: 'SKU_EXISTS', existingProductId: 'p9' }))).toMatchObject({ existingProductId: 'p9' })
    expect(duplicateReferenceOf(conflict({ code: 'SKU_EXISTS' }))?.existingProductId).toBeNull()
    expect(duplicateReferenceOf(conflict({ code: 'OTHER' }))).toBeNull()
    expect(duplicateReferenceOf({ response: { status: 400, data: { code: 'SKU_EXISTS' } } })).toBeNull()
    expect(duplicateReferenceOf(new Error('x'))).toBeNull()
  })

  it('lists what a draft lacks, in wizard order, with the step that fixes it', () => {
    expect(pendingItems(saved, true)).toEqual([])
    const bare = { name: 'REF-1', sku: 'REF-1', brandId: null, subcategoryId: null, description: null, images: [] }
    expect(pendingItems(bare, false).map((item) => [item.id, item.step])).toEqual([
      ['name', 1], ['brand', 2], ['subcategory', 2], ['description', 3], ['highlights', 3], ['images', 4],
    ])
  })
})

describe('sheetSaveBlocker (a save must never fail in silence)', () => {
  it('explains a sheet that has not loaded yet', () => {
    expect(sheetSaveBlocker({ hasDraft: false, conflict: false, errorCount: 0 })?.message).toContain('se está cargando')
  })

  it('explains a version conflict', () => {
    expect(sheetSaveBlocker({ hasDraft: true, conflict: true, errorCount: 0 })?.message).toContain('cambió')
  })

  it('points to step 3 when the sheet has fields to fix', () => {
    const one = sheetSaveBlocker({ hasDraft: true, conflict: false, errorCount: 1 })
    expect(one).toMatchObject({ step: 3 })
    expect(one?.message).toContain('1 dato')
    expect(sheetSaveBlocker({ hasDraft: true, conflict: false, errorCount: 4 })?.message).toContain('4 datos')
  })

  it('says nothing when the sheet shows its own server error', () => {
    expect(sheetSaveBlocker({ hasDraft: true, conflict: false, errorCount: 0 })).toBeNull()
  })
})
