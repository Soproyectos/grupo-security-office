import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { PublicProductDetail } from '../types/publicProduct'
import StorefrontProductPage from './StorefrontProductPage'

/**
 * Same approach as the other storefront page specs: no DOM environment, so the
 * suite asserts the server render of the real page inside a `MemoryRouter`,
 * with the detail hook replaced by a fixed value.
 */

const retryMock = vi.hoisted(() => vi.fn())
const detailMock = vi.hoisted(() => ({
  status: 'ready',
  product: null as PublicProductDetail | null,
  retry: retryMock,
}))

vi.mock('../hooks/usePublicProductDetail', () => ({ usePublicProductDetail: () => detailMock }))

const product: PublicProductDetail = {
  id: 'prod-1',
  sku: 'DS-2CD2143',
  name: 'Cámara Domo 4K',
  description: 'Cámara IP de 4 MP con visión nocturna.',
  brand: { name: 'Hikvision', slug: 'hikvision' },
  category: { id: 'c-3', name: 'Domo', slug: 'camaras-ip-domo' },
  breadcrumb: [
    { id: 'c-1', name: 'Videovigilancia', slug: 'videovigilancia' },
    { id: 'c-2', name: 'Cámaras IP', slug: 'camaras-ip' },
  ],
  images: [
    { url: '/api/files/img-1', alt: null },
    { url: '/api/files/img-2', alt: 'Vista lateral' },
  ],
  technicalSpecs: [
    { key: 'Resolución', value: '4', unit: 'MP' },
    { key: 'Protocolo', value: 'ONVIF', unit: null },
  ],
  datasheets: [{ name: 'Ficha técnica', url: 'https://example.com/ds.pdf' }],
  price: { value: 118258.8, currency: 'COP' },
}

function renderPage(id = 'prod-1'): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [`/catalogo/productos/${id}`] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/catalogo/productos/:id',
          element: createElement(StorefrontProductPage),
        }),
      ),
    ),
  )
}

function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

beforeEach(() => {
  detailMock.status = 'ready'
  detailMock.product = product
  retryMock.mockReset()
})

describe('ficha del producto', () => {
  it('muestra marca, nombre, SKU y el precio grande con IVA incluido', () => {
    const markup = renderPage()

    expect(markup).toContain('Hikvision')
    expect(markup).toContain('>Cámara Domo 4K</h1>')
    expect(markup).toContain('SKU: DS-2CD2143')
    expect(markup).toContain('$ 118.259')
    expect(markup).toContain('IVA incluido')
  })

  it('arma la migaja de pan con los ancestros y la categoría', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-label="Ruta de navegación"')
    expect(markup).toContain('href="/tienda"')
    expect(markup).toContain('href="/catalogo"')
    expect(markup).toContain('href="/catalogo/categoria/videovigilancia"')
    expect(markup).toContain('href="/catalogo/categoria/camaras-ip"')
    expect(markup).toContain('href="/catalogo/categoria/camaras-ip-domo"')
    expect(occurrences(markup, 'aria-current="page"')).toBe(1)
  })

  it('pinta la galería con miniaturas cuando hay varias imágenes', () => {
    const markup = renderPage()

    expect(markup).toContain('src="/api/files/img-1"')
    expect(markup).toContain('aria-label="Ver imagen 2 de 2"')
    expect(markup).toContain('src="/api/files/img-2"')
  })

  it('usa un marcador y ninguna miniatura cuando no hay imágenes', () => {
    detailMock.product = { ...product, images: [] }

    const markup = renderPage()

    expect(markup).not.toContain('/api/files/')
    expect(markup).not.toContain('Imágenes del producto')
    expect(markup).toContain('from-surface-50 to-surface-200')
  })

  it('ofrece cotizar por WhatsApp con el nombre y el SKU en el mensaje', () => {
    const markup = renderPage()
    const message = encodeURIComponent('Hola, quiero cotizar el producto Cámara Domo 4K (SKU: DS-2CD2143).')

    expect(markup).toContain(`href="https://wa.me/576011234567?text=${message}"`)
    expect(markup).toContain('Cotizar por WhatsApp')
    // Summary CTA and the bottom bar of small screens.
    expect(occurrences(markup, 'https://wa.me/576011234567?text=')).toBe(2)
  })

  it('ofrece llamar por teléfono', () => {
    const markup = renderPage()

    expect(markup).toContain('href="tel:+576011234567"')
    expect(markup).toContain('>Llamar</a>')
  })

  it('muestra la descripción, la tabla de especificaciones y las fichas técnicas', () => {
    const markup = renderPage()

    expect(markup).toContain('Cámara IP de 4 MP con visión nocturna.')
    expect(markup).toContain('Especificaciones técnicas')
    expect(markup).toContain('Resolución')
    expect(markup).toContain('4 MP')
    expect(markup).toContain('ONVIF')
    expect(markup).toContain('href="https://example.com/ds.pdf"')
  })

  it('omite descripción, especificaciones y fichas cuando no hay datos', () => {
    detailMock.product = { ...product, description: null, technicalSpecs: [], datasheets: [] }

    const markup = renderPage()

    expect(markup).not.toContain('Descripción')
    expect(markup).not.toContain('Especificaciones técnicas')
    expect(markup).not.toContain('Fichas técnicas')
  })

  it('muestra la franja de confianza', () => {
    const markup = renderPage()

    expect(markup).toContain('Distribuidor autorizado')
    expect(markup).toContain('Garantía de fábrica')
    expect(markup).toContain('Envíos a toda Colombia')
  })

  it('se renderiza dentro del chrome de la tienda', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-label="Grupo Security, inicio"')
    expect(markup).toContain('© ')
  })
})

describe('producto sin precio público', () => {
  it('muestra "Precio a consultar" y mantiene el CTA de cotización', () => {
    detailMock.product = { ...product, price: null }

    const markup = renderPage()

    expect(markup).toContain('Precio a consultar')
    expect(markup).not.toContain('IVA incluido')
    expect(markup).not.toContain('$ ')
    expect(markup).toContain('Cotizar por WhatsApp')
  })
})

describe('estados', () => {
  it('muestra el esqueleto mientras carga', () => {
    detailMock.status = 'loading'
    detailMock.product = null

    const markup = renderPage()

    expect(markup).toContain('Cargando producto')
    expect(occurrences(markup, 'animate-pulse')).toBeGreaterThan(0)
  })

  it('muestra "no encontrado" con el enlace de vuelta al catálogo', () => {
    detailMock.status = 'not-found'
    detailMock.product = null

    const markup = renderPage('no-existe')

    expect(markup).toContain('Producto no encontrado')
    expect(markup).toContain('href="/catalogo"')
    expect(markup).not.toContain('Cotizar por WhatsApp')
  })

  it('muestra el error con reintento y enlace de vuelta al catálogo', () => {
    detailMock.status = 'error'
    detailMock.product = null

    const markup = renderPage()

    expect(markup).toContain('No pudimos cargar el producto')
    expect(markup).toContain('Intentar de nuevo')
    expect(markup).toContain('href="/catalogo"')
  })
})
