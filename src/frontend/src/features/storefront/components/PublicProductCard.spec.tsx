import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { PublicProductResult } from '../types/publicProduct'
import PublicProductCard from './PublicProductCard'

const product: PublicProductResult = {
  id: 'prod-1',
  sku: 'DS-2CD2143',
  name: 'Cámara Domo 4K con visión nocturna',
  imageUrl: '/api/files/img-1',
  categoryName: 'Cámaras IP',
  categorySlug: 'camaras-ip',
  brandName: 'Hikvision',
  price: { value: 118258.8, currency: 'COP' },
}

function render(overrides: Partial<PublicProductResult> = {}): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement('ul', null, createElement(PublicProductCard, { product: { ...product, ...overrides } })),
    ),
  )
}

describe('PublicProductCard', () => {
  it('muestra marca, nombre, SKU y el precio en pesos enteros con IVA incluido', () => {
    const markup = render()

    expect(markup).toContain('Hikvision')
    expect(markup).toContain('Cámara Domo 4K con visión nocturna')
    expect(markup).toContain('DS-2CD2143')
    expect(markup).toContain('$ 118.259')
    expect(markup).toContain('IVA incluido')
    expect(markup).not.toContain('Precio a consultar')
  })

  it('pinta la imagen resuelta contra el origen del backend', () => {
    expect(render()).toContain('src="/api/files/img-1"')
  })

  it('usa un marcador neutro cuando el producto no tiene imagen', () => {
    const markup = render({ imageUrl: null })

    expect(markup).not.toContain('<img')
    expect(markup).toContain('<svg')
    expect(markup).toContain('from-surface-50 to-surface-200')
  })

  it('ofrece cotizar cuando no hay precio público', () => {
    const markup = render({ price: null })

    expect(markup).toContain('Precio a consultar')
    expect(markup).toContain('Cotizar')
    expect(markup).not.toContain('IVA incluido')
    expect(markup).not.toContain('$ ')
  })

  it('omite la marca cuando el producto no la tiene', () => {
    expect(render({ brandName: null })).not.toContain('text-security-500">Hikvision')
  })

  it('enlaza la tarjeta con la ficha pública del producto', () => {
    expect(render()).toContain('href="/catalogo/productos/prod-1"')
  })

  it('envuelve toda la tarjeta en un único enlace', () => {
    const markup = render()

    expect(markup.split('<a ').length - 1).toBe(1)
  })
})
