import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { ProductSpecs } from './ProductSpecs'

const groups = [
  { id: 'red', title: 'Red', items: [{ label: 'Puertos', value: '4' }] },
  { id: 'video', title: 'Video', items: [{ label: 'Canales', value: '8' }] },
  { id: 'audio', title: 'Audio', items: [{ label: 'Entradas', value: '1' }] },
  { id: 'energia', title: 'Energía', items: [{ label: 'Voltaje', value: '12 V' }] },
]

describe('especificaciones del producto', () => {
  const markup = renderToStaticMarkup(createElement(ProductSpecs, { groups, stickyTotal: 100 }))

  it('muestra todos los grupos abiertos, sin flecha ni desplegable', () => {
    expect(markup).not.toContain('<details')
    expect(markup).not.toContain('<summary')
    for (const group of groups) expect(markup).toContain(`>${group.title}</h3>`)
    // The 4th group is as visible as the first: its rows are in the markup.
    expect(markup).toContain('12 V')
  })

  it('conserva el título enlazado a la sección para el menú lateral', () => {
    expect(markup).toContain('id="spec-d-red-title"')
    expect(markup).toContain('aria-labelledby="spec-d-red-title"')
  })
})
