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

  it('muestra la etiqueta técnica con las specs del nombre cuando no hay imagen', () => {
    const markup = render({
      imageUrl: null,
      name: 'Camara Bala 8MP EXIR IR30m 2.8mm Plástica',
      sku: 'DS-2CE16U1T-ITPF(2.8mm)',
      categorySlug: 'camaras-turbo',
    })

    expect(markup).not.toContain('<img')
    expect(markup).toContain('data-testid="spec-label"')
    expect(markup).toContain('<svg')
    expect(markup).toContain('from-surface-50 to-surface-200')
    expect(markup).toContain('>8 MP</span>')
    expect(markup).toContain('>IR 30 m</span>')
    expect(markup).toContain('>2.8 mm</span>')
  })

  it('deja solo el icono cuando el nombre no trae specs reconocibles', () => {
    const markup = render({ imageUrl: null, name: 'Sistema Anticaída Puertas Levadizas', sku: 'AUACCRAB03' })

    expect(markup).toContain('data-testid="spec-label"')
    expect(markup).not.toContain('font-condensed font-bold leading-none')
  })

  it('reserva un medio 4:3 y no usa cuadrado', () => {
    const markup = render()

    expect(markup).toContain('aspect-[4/3]')
    expect(markup).not.toContain('aspect-square')
  })

  it('pinta el precio en tinta con cifras tabulares, no en rojo', () => {
    const markup = render()

    expect(markup).toMatch(/font-condensed[^"]*tabular-nums[^"]*text-storefront-ink">\$ 118\.259/)
    expect(markup).not.toMatch(/text-security-500">\$ /)
  })

  it('cambia solo el color del borde al pasar el cursor, sin elevar la tarjeta', () => {
    const markup = render()

    expect(markup).toContain('hover:border-storefront-ink')
    expect(markup).not.toContain('hover:-translate-y')
    expect(markup).not.toContain('hover:shadow')
    expect(markup).toContain('focus-visible:outline')
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
