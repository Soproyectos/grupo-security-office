import { describe, expect, it } from 'vitest'
import { buildProductsListParams, parseProductsListParams, type ProductsListUrlState } from './products-list-url'

const options = { pageSizes: [10, 20, 50, 100], defaultPageSize: 20, lifecycleStatuses: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] }

describe('products list URL state', () => {
  it('uses defaults for an empty URL and keeps the URL clean for default state', () => {
    const state = parseProductsListParams(new URLSearchParams(), options)
    expect(state).toEqual({
      search: '',
      page: 1,
      pageSize: 20,
      viewMode: 'grid',
      categoryIds: [],
      brandIds: [],
      lifecycleStatuses: [],
    })
    expect(buildProductsListParams(state, 20).toString()).toBe('')
  })

  it('round-trips filters, page, page size and view', () => {
    const state: ProductsListUrlState = {
      search: 'cámara 4K',
      page: 3,
      pageSize: 50,
      viewMode: 'list',
      categoryIds: ['c1', 'c2'],
      brandIds: ['b1'],
      lifecycleStatuses: ['DRAFT'],
    }
    const params = buildProductsListParams(state, 20)
    expect(parseProductsListParams(new URLSearchParams(params.toString()), options)).toEqual(state)
  })

  it('reads the ?search= link sent by the header', () => {
    expect(parseProductsListParams(new URLSearchParams('search=dvr'), options).search).toBe('dvr')
  })

  it('ignores invalid values instead of breaking the list', () => {
    const state = parseProductsListParams(
      new URLSearchParams('page=-2&pageSize=7&view=cards&status=DRAFT,HIDDEN&categories=,'),
      options,
    )
    expect(state.page).toBe(1)
    expect(state.pageSize).toBe(20)
    expect(state.viewMode).toBe('grid')
    expect(state.lifecycleStatuses).toEqual(['DRAFT'])
    expect(state.categoryIds).toEqual([])
  })
})
