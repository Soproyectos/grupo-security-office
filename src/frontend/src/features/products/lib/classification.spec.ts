import { describe, expect, it } from 'vitest'
import {
  CLASSIFICATION_ERROR_MESSAGES,
  classificationErrorMessage,
  classificationMissingParts,
  findSubcategory,
  isClassificationIncomplete,
} from './classification'
import type { ClassificationRoot } from '../types/key-specs.types'

const tree: ClassificationRoot[] = [
  { id: 'r1', name: 'Video', slug: 'video', subcategories: [{ id: 's1', name: 'Cámaras IP', slug: 'camaras-ip' }] },
  { id: 'r2', name: 'Acceso', slug: 'acceso', subcategories: [{ id: 's2', name: 'Lectores', slug: 'lectores' }] },
]

const apiError = (code: string) => ({ response: { data: { code } } })

describe('classificationErrorMessage', () => {
  it('maps every known code to Spanish without leaking the raw code', () => {
    for (const code of Object.keys(CLASSIFICATION_ERROR_MESSAGES)) {
      const message = classificationErrorMessage(apiError(code))
      expect(message).toBeTruthy()
      expect(message).not.toContain(code)
    }
  })

  it('returns null for unknown codes and non-API errors', () => {
    expect(classificationErrorMessage(apiError('SOMETHING_ELSE'))).toBeNull()
    expect(classificationErrorMessage(new Error('boom'))).toBeNull()
    expect(classificationErrorMessage(null)).toBeNull()
  })
})

describe('findSubcategory', () => {
  it('returns the subcategory with its root', () => {
    const found = findSubcategory(tree, 's2')
    expect(found?.root.name).toBe('Acceso')
    expect(found?.subcategory.name).toBe('Lectores')
  })

  it('returns null for empty or unknown ids', () => {
    expect(findSubcategory(tree, null)).toBeNull()
    expect(findSubcategory(tree, 'nope')).toBeNull()
  })
})

describe('classification state', () => {
  it('is incomplete without subcategory or brand', () => {
    expect(isClassificationIncomplete({ subcategoryId: null, brandId: 'b1' })).toBe(true)
    expect(isClassificationIncomplete({ subcategoryId: 's1', brandId: '' })).toBe(true)
    expect(isClassificationIncomplete({ subcategoryId: 's1', brandId: 'b1' })).toBe(false)
  })

  it('names what is missing', () => {
    expect(classificationMissingParts({ subcategoryId: null, brandId: '' })).toEqual(['subcategoría', 'marca'])
    expect(classificationMissingParts({ subcategoryId: 's1', brandId: '' })).toEqual(['marca'])
  })
})
