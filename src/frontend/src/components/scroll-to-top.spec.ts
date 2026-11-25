import { describe, expect, it } from 'vitest'
import { shouldScrollToTop } from './scroll-to-top'

const base = { navigationType: 'PUSH', previousPath: '/catalogo/categoria/alarmas', path: '/catalogo/productos/1', hash: '' } as const

describe('shouldScrollToTop', () => {
  it('goes to the top when a new page is opened', () => {
    expect(shouldScrollToTop(base)).toBe(true)
    expect(shouldScrollToTop({ ...base, navigationType: 'REPLACE' })).toBe(true)
  })

  it('keeps the position on first load', () => {
    expect(shouldScrollToTop({ ...base, previousPath: null })).toBe(false)
  })

  it('keeps the browser position on back and forward', () => {
    expect(shouldScrollToTop({ ...base, navigationType: 'POP' })).toBe(false)
  })

  it('keeps the position when only the query or the same page changes', () => {
    expect(shouldScrollToTop({ ...base, previousPath: base.path })).toBe(false)
  })

  it('keeps the jump to an anchor', () => {
    expect(shouldScrollToTop({ ...base, hash: '#especificaciones' })).toBe(false)
  })
})
