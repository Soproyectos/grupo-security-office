import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CustomerDuplicateNotice from './CustomerDuplicateNotice'

describe('CustomerDuplicateNotice', () => {
  it('with the existing customer it offers «Abrir {nombre}»', () => {
    const html = renderToStaticMarkup(
      <CustomerDuplicateNotice
        duplicate={{ field: 'email', message: 'm', existing: { id: 'c-9', name: 'Andina S.A.S.' } }}
        onOpenExisting={vi.fn()}
      />,
    )
    expect(html).toContain('Abrir Andina S.A.S.')
    expect(html).toContain('type="button"')
  })

  it('without the existing customer it renders nothing', () => {
    const html = renderToStaticMarkup(
      <CustomerDuplicateNotice duplicate={{ field: 'email', message: 'm' }} onOpenExisting={vi.fn()} />,
    )
    expect(html).toBe('')
  })
})
