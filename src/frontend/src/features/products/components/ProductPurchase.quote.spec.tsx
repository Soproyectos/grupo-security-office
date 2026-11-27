import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ProductCtas, ProductMobileBar } from './ProductPurchase'
import type { ProductDetail } from '../types'

const product = { id: 'p1', model: 'DS-1', name: 'Cámara Domo', price: null, isInformational: false, status: 'active' } as unknown as ProductDetail
const quoteAction = { inList: 0, add: () => true }
const render = (element: React.ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, element))

describe('CTAs de la ficha', () => {
  it('cliente activo: el botón principal es «Agregar a mi cotización», con cantidad, y WhatsApp queda como enlace secundario', () => {
    const markup = render(createElement(ProductCtas, { product, quoteAction }))
    expect(markup).toContain('Agregar a mi cotización')
    expect(markup).toContain('Cantidad de Cámara Domo')
    expect(markup).toContain('wa.me')
    expect(markup).not.toContain('>Cotizar<')
  })

  it('sin sesión activa: «Cotizar» por WhatsApp como hoy', () => {
    const markup = render(createElement(ProductCtas, { product }))
    expect(markup).toContain('Cotizar')
    expect(markup).not.toContain('Agregar a mi cotización')
  })

  it('barra móvil: mismo cambio de botón', () => {
    expect(render(createElement(ProductMobileBar, { product, quoteAction }))).toContain('Agregar a mi cotización')
    const plain = render(createElement(ProductMobileBar, { product }))
    expect(plain).toContain('Cotizar')
    expect(plain).not.toContain('Agregar a mi cotización')
  })

  it('producto descontinuado conserva la consulta de equivalente', () => {
    const markup = render(createElement(ProductCtas, { product: { ...product, status: 'discontinued' } as ProductDetail, quoteAction }))
    expect(markup).toContain('Preguntar por un equivalente')
  })
})
