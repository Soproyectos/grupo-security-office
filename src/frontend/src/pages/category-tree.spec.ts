import { describe, expect, it } from 'vitest'
import { categoryRows } from './category-tree'

const categories = [
  { id: 'root-b', name: 'Bebidas', parentId: null },
  { id: 'child-b', name: 'Café', parentId: 'root-b' },
  { id: 'root-a', name: 'Accesorios', parentId: null },
  { id: 'orphan', name: 'Legado', parentId: 'missing-parent' },
]

describe('categoryRows', () => {
  it('ordena cada subcategoría bajo su categoría y conserva registros con padre ausente', () => {
    expect(categoryRows(categories).map(({ id }) => id)).toEqual(['root-b', 'child-b', 'root-a', 'orphan'])
  })

  it('mantiene el contexto de la categoría principal al buscar una subcategoría', () => {
    expect(categoryRows(categories, 'café').map(({ id }) => id)).toEqual(['root-b', 'child-b'])
  })

  it('mantiene visibles los registros más profundos que los dos niveles permitidos', () => {
    const nested = [...categories, { id: 'third', name: 'Legado profundo', parentId: 'child-b' }]
    expect(categoryRows(nested).map(({ id }) => id)).toContain('third')
  })
})
