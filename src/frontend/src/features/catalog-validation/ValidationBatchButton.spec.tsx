import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BATCH_PAGE_LIMIT, ValidationBatchButton } from './ValidationBatchButton'

const render = (ids: string[]) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(ValidationBatchButton, { productIds: ids }),
    ),
  )

describe('ValidationBatchButton (CAT-05 frontend)', () => {
  it('habilita la validación del alcance mostrado', () => {
    const html = render(['a', 'b'])
    expect(html).toContain('Validar lo mostrado')
    expect(html).not.toMatch(/disabled=""/)
  })

  it('nada que validar → botón deshabilitado (sin batch vacío)', () => {
    expect(render([])).toMatch(/disabled=""/)
  })

  it('sobre el tope avisa del límite y deshabilita (el trabajo completo es CAT-07)', () => {
    const many = Array.from({ length: BATCH_PAGE_LIMIT + 1 }, (_, i) => `p${i}`)
    const html = render(many)
    expect(html).toContain(`hasta ${BATCH_PAGE_LIMIT} productos`)
    expect(html).toMatch(/disabled=""/)
  })
})
