import { describe, expect, it } from 'vitest'
import { readPublicProductPage } from './usePublicProductPage'

describe('readPublicProductPage', () => {
  it('uses the defaults when parameters are absent or not strict positive integers', () => {
    expect(readPublicProductPage(new URLSearchParams())).toEqual({ page: 1, pageSize: 20 })
    expect(readPublicProductPage(new URLSearchParams('page=2.5&limit=0'))).toEqual({ page: 1, pageSize: 20 })
    expect(readPublicProductPage(new URLSearchParams('page=2x&limit=-20'))).toEqual({ page: 1, pageSize: 20 })
  })

  it('reads page and limit and caps the resulting offset at the API maximum', () => {
    expect(readPublicProductPage(new URLSearchParams('page=3&limit=40'))).toEqual({ page: 3, pageSize: 40 })
    expect(readPublicProductPage(new URLSearchParams('page=999999&limit=40'))).toEqual({ page: 2501, pageSize: 40 })
  })
})
