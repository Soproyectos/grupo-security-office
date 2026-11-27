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
  isInformational: false,
  price: { value: 118258.8, currency: 'COP' },
}

function render(overrides: Partial<PublicProductResult> = {}, assignedPrice: { value: number; currency: string } | null = null): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement('ul', null, createElement(PublicProductCard, { product: { ...product, ...overrides }, assignedPrice })),
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

    expect(markup).toContain('aspect-[var(--product-card-media-ratio,4/3)]')
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

    expect(markup).not.toContain('Precio a consultar')
    expect(markup).toContain('Cotizar')
    expect(markup).not.toContain('IVA incluido')
    expect(markup).not.toContain('$ ')
  })

  it('muestra una ficha informativa sin ofrecer una cotización prematura', () => {
    const markup = render({ price: null, isInformational: true })

    expect(markup).toContain('Ficha informativa')
    expect(markup).toContain('Datos en preparación')
    expect(markup).not.toContain('Cotizar')
    expect(markup).not.toContain('Precio a consultar')
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

  it('con tarifa del cliente muestra ese valor y «Tu tarifa» en vez del precio público', () => {
    const markup = render({}, { value: 98000, currency: 'COP' })

    expect(markup).toContain('$ 98.000')
    expect(markup).toContain('Tu tarifa')
    expect(markup).not.toContain('$ 118.259')
    expect(markup).not.toContain('IVA incluido')
  })

  it('con tarifa del cliente muestra su valor aunque el público no tenga precio, sin pedir cotizar', () => {
    const markup = render({ price: null }, { value: 98000, currency: 'COP' })

    expect(markup).toContain('$ 98.000')
    expect(markup).not.toContain('Cotizar')
  })

  it('sin tarifa del cliente conserva el precio público', () => {
    expect(render()).toContain('IVA incluido')
  })
})

describe('PublicProductCard con cotización del cliente', () => {
  const quoteAction = { inList: 0, add: () => true }
  const renderWith = (overrides: Partial<PublicProductResult> = {}, props: Record<string, unknown> = {}): string =>
    renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement('ul', null, createElement(PublicProductCard, { product: { ...product, ...overrides }, ...props }))),
    )

  it('un cliente activo ve «Agregar a mi cotización» fuera del enlace de la tarjeta y sin «Cotizar»', () => {
    const markup = renderWith({ price: null }, { quoteAction })
    expect(markup).toContain('Agregar a mi cotización')
    expect(markup).toContain('Precio por confirmar')
    expect(markup).not.toContain('>Cotizar<')
    expect(markup.indexOf('</a>')).toBeLessThan(markup.indexOf('Agregar a mi cotización'))
  })

  it('muestra cuántas unidades lleva ya en su cotización', () => {
    expect(renderWith({}, { quoteAction: { inList: 3, add: () => true } })).toContain('En tu cotización: 3 unidades')
  })

  it('sin sesión activa conserva «Cotizar» y no ofrece la lista', () => {
    const markup = renderWith({ price: null })
    expect(markup).toContain('Cotizar')
    expect(markup).not.toContain('Agregar a mi cotización')
  })

  it('una ficha informativa no se agrega a la cotización', () => {
    expect(renderWith({ isInformational: true, price: null }, { quoteAction })).not.toContain('Agregar a mi cotización')
  })
})
