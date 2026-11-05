import { describe, expect, it } from 'vitest'
import { productsListPath, sheetEditorPath, sheetEditorReturnPath, sheetEditorState } from './library-nav'

describe('library navigation helpers', () => {
  it('builds the Productos URL keeping the query string', () => {
    expect(productsListPath()).toBe('/commercial/products')
    expect(productsListPath('?search=dvr&page=2')).toBe('/commercial/products?search=dvr&page=2')
    expect(productsListPath('search=dvr')).toBe('/commercial/products?search=dvr')
  })

  it('builds the editor URL and remembers where the user came from', () => {
    expect(sheetEditorPath('p 1')).toBe('/commercial/library/update/products/p%201')
    expect(sheetEditorState({ pathname: '/commercial/products', search: '?page=3' })).toEqual({
      from: '/commercial/products?page=3',
    })
  })

  it('returns to `from` when it is an in-app path and to Productos otherwise', () => {
    expect(sheetEditorReturnPath({ from: '/commercial/products?page=3' })).toBe('/commercial/products?page=3')
    expect(sheetEditorReturnPath(null)).toBe('/commercial/products')
    expect(sheetEditorReturnPath(undefined)).toBe('/commercial/products')
    expect(sheetEditorReturnPath({})).toBe('/commercial/products')
    expect(sheetEditorReturnPath({ from: 'https://evil.example' })).toBe('/commercial/products')
    expect(sheetEditorReturnPath({ from: '//evil.example' })).toBe('/commercial/products')
    expect(sheetEditorReturnPath(null, '/commercial/library/update/products')).toBe('/commercial/library/update/products')
  })
})
