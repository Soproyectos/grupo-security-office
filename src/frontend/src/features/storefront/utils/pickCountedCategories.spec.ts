import { describe, expect, it } from 'vitest'
import type { MenuCategory } from '../types/categoryMenu'
import { pickCountedCategories } from './pickCountedCategories'

function category(slug: string): MenuCategory {
  return { id: slug, name: slug, slug, imageUrl: null, iconUrl: null, isFeatured: false, sortOrder: 0, children: [] }
}

const menu = ['a', 'b', 'c', 'd', 'e'].map(category)

describe('pickCountedCategories', () => {
  it('descarta las categorías sin productos o sin conteo', () => {
    const counts = new Map([
      ['a', 0],
      ['b', 5],
    ])

    expect(pickCountedCategories(menu, counts, 8).map((entry) => entry.category.slug)).toEqual(['b'])
  })

  it('ordena por cantidad descendente y conserva el orden del menú en empates', () => {
    const counts = new Map([
      ['a', 3],
      ['b', 10],
      ['c', 3],
      ['d', 7],
    ])

    expect(pickCountedCategories(menu, counts, 8).map((entry) => [entry.category.slug, entry.count])).toEqual([
      ['b', 10],
      ['d', 7],
      ['a', 3],
      ['c', 3],
    ])
  })

  it('limita el resultado al tope', () => {
    const counts = new Map(menu.map((item, index) => [item.slug, index + 1]))

    expect(pickCountedCategories(menu, counts, 2).map((entry) => entry.category.slug)).toEqual(['e', 'd'])
  })

  it('devuelve una lista vacía cuando no hay conteos', () => {
    expect(pickCountedCategories(menu, new Map(), 8)).toEqual([])
  })
})
