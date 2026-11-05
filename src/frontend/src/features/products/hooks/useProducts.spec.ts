import { describe, expect, it } from 'vitest'
import { buildProductsQueryParams } from './useProducts'

describe('buildProductsQueryParams', () => {
  it('envía todas las categorías seleccionadas una sola vez antes de paginar', () => {
    const params = buildProductsQueryParams({
      search: 'lector',
      categoryIds: ['root-a', 'root-b', 'root-a'],
      brandIds: ['brand-a'],
      isVisible: true,
      activeListaOnly: true,
    }, 40, 20)

    expect(params.get('categoryIds')).toBe('root-a,root-b')
    expect(params.get('categoryId')).toBeNull()
    expect(params.get('skip')).toBe('40')
    expect(params.get('take')).toBe('20')
    expect(params.get('search')).toBe('lector')
    expect(params.get('brandId')).toBe('brand-a')
    expect(params.get('isVisible')).toBe('true')
    expect(params.get('activeListaOnly')).toBe('true')
  })
})
