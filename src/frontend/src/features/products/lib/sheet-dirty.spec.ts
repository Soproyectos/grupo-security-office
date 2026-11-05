import { describe, expect, it } from 'vitest'
import {
  buildUpdatePayload,
  changedFields,
  unsavedChangesLabel,
  validateEditorValues,
  valuesOfProduct,
  type EditorValues,
} from './sheet-dirty'

const product = {
  name: 'Cámara domo 4K',
  description: null,
  brandId: 'b1',
  categoryId: 'c1',
  technicalSpecs: { resolucion: '8 MP', ir: { value: '30', unit: 'm' } },
  extraAttributes: null,
}

const baseline = (): EditorValues => valuesOfProduct(product)

describe('valuesOfProduct', () => {
  it('normalizes a missing description and reads the typed specs', () => {
    const values = baseline()
    expect(values.description).toBe('')
    expect(values.technicalSpecs.map((field) => field.key)).toEqual(['resolucion', 'ir'])
    expect(values.extraAttributes).toEqual([])
  })
})

describe('changedFields', () => {
  it('reports nothing for an untouched form', () => {
    expect(changedFields(baseline(), baseline())).toEqual([])
  })

  it('counts each edited scalar field once', () => {
    const current = { ...baseline(), name: 'Cámara domo 8K', brandId: 'b2' }
    expect(changedFields(baseline(), current)).toEqual(['name', 'brandId'])
  })

  it('counts a whole spec block as one field however many rows changed', () => {
    const current = baseline()
    current.technicalSpecs = [
      ...current.technicalSpecs,
      { key: 'lente', type: 'TEXT', value: '2.8 mm' },
      { key: 'poe', type: 'BOOLEAN', value: true },
    ]
    expect(changedFields(baseline(), current)).toEqual(['technicalSpecs'])
  })

  it('ignores a freshly added spec row that has no key yet', () => {
    const current = baseline()
    current.extraAttributes = [{ key: '', type: 'TEXT', value: '' }]
    expect(changedFields(baseline(), current)).toEqual([])
  })

  it('stops counting a field once it is edited back to its saved value', () => {
    const edited = { ...baseline(), description: 'Nueva' }
    expect(changedFields(baseline(), edited)).toEqual(['description'])
    expect(changedFields(baseline(), { ...edited, description: '' })).toEqual([])
  })
})

describe('unsavedChangesLabel', () => {
  it('uses the singular, the plural and the clean state', () => {
    expect(unsavedChangesLabel(0)).toBe('Sin cambios')
    expect(unsavedChangesLabel(1)).toBe('1 cambio sin guardar')
    expect(unsavedChangesLabel(3)).toBe('3 cambios sin guardar')
  })
})

describe('buildUpdatePayload', () => {
  it('sends only the changed fields, with the name trimmed', () => {
    const current = { ...baseline(), name: '  Cámara domo 8K ', description: 'Con visión nocturna' }
    expect(buildUpdatePayload(current, ['name', 'description'])).toEqual({
      name: 'Cámara domo 8K',
      description: 'Con visión nocturna',
    })
  })

  it('serializes spec blocks and sends an empty object when they are emptied', () => {
    const current = { ...baseline(), technicalSpecs: [] }
    expect(buildUpdatePayload(current, ['technicalSpecs'])).toEqual({ technicalSpecs: {} })
    const withRows = { ...baseline(), extraAttributes: [{ key: 'garantia', type: 'TEXT' as const, value: '1 año' }] }
    expect(buildUpdatePayload(withRows, ['extraAttributes'])).toEqual({ extraAttributes: { garantia: '1 año' } })
  })
})

describe('validateEditorValues', () => {
  it('accepts a clean change', () => {
    const current = { ...baseline(), name: 'Cámara domo 8K' }
    expect(validateEditorValues(current, ['name'])).toBeNull()
  })

  it('rejects what the server would reject', () => {
    expect(validateEditorValues({ ...baseline(), name: ' a ' }, ['name'])).toBe('El nombre debe tener al menos 2 caracteres.')
  })

  it('accepts an empty brand or category: a draft may stay "por clasificar"', () => {
    expect(validateEditorValues({ ...baseline(), brandId: '' }, ['brandId'])).toBeNull()
    expect(validateEditorValues({ ...baseline(), categoryId: '' }, ['categoryId'])).toBeNull()
  })

  it('sends null (never a placeholder) when brand, category or subcategory are cleared', () => {
    const current = { ...baseline(), brandId: '', categoryId: '', subcategoryId: '' }
    expect(buildUpdatePayload(current, ['brandId', 'categoryId', 'subcategoryId'])).toEqual({ brandId: null, subcategoryId: null })
    expect(buildUpdatePayload(current, ['brandId', 'categoryId'])).toEqual({ brandId: null, categoryId: null })
  })

  it('checks spec keys only for the blocks that changed', () => {
    const dup = { ...baseline(), extraAttributes: [{ key: 'a', type: 'TEXT' as const, value: '1' }, { key: 'a', type: 'TEXT' as const, value: '2' }] }
    expect(validateEditorValues(dup, ['extraAttributes'])).toBe('Atributos extra: hay claves duplicadas.')
    expect(validateEditorValues(dup, ['name'])).toBeNull()
    const empty = { ...baseline(), technicalSpecs: [{ key: ' ', type: 'TEXT' as const, value: '' }] }
    expect(validateEditorValues(empty, ['technicalSpecs'])).toBe('Especificaciones técnicas: las claves no pueden estar vacías.')
    const select = { ...baseline(), technicalSpecs: [{ key: 'modo', type: 'SELECT' as const, value: [], options: [] }] }
    expect(validateEditorValues(select, ['technicalSpecs'])).toBe('Especificaciones técnicas: las listas de selección necesitan opciones.')
  })
})
