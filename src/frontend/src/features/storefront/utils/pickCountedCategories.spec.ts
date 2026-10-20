import { describe, expect, it } from 'vitest'
import type { MenuCategory } from '../types/categoryMenu'
import { pickCountedCategories } from './pickCountedCategories'

function category(slug: string, productCount: number): MenuCategory {
  return { id: slug, name: slug, slug, imageUrl: null, iconUrl: null, isFeatured: false, sortOrder: 0, productCount, children: [] }
}

describe('pickCountedCategories', () => {
  it('descarta las categorías sin productos', () => {
    const menu = [category('a', 0), category('b', 5)]

    expect(pickCountedCategories(menu, 8).map((entry) => entry.category.slug)).toEqual(['b'])
  })

  it('ordena por cantidad descendente y conserva el orden del menú en empates', () => {
    const menu = [category('a', 3), category('b', 10), category('c', 3), category('d', 7)]

    expect(pickCountedCategories(menu, 8).map((entry) => [entry.category.slug, entry.count])).toEqual([
      ['b', 10],
      ['d', 7],
      ['a', 3],
      ['c', 3],
    ])
  })

  it('limita el resultado al tope', () => {
    const menu = ['a', 'b', 'c', 'd', 'e'].map((slug, index) => category(slug, index + 1))

    expect(pickCountedCategories(menu, 2).map((entry) => entry.category.slug)).toEqual(['e', 'd'])
  })

  it('devuelve una lista vacía cuando el menú está vacío', () => {
    expect(pickCountedCategories([], 8)).toEqual([])
  })
})
