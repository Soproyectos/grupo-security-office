import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProductNotFoundError } from './api/productsApi'
import { ProductDetailRoute } from './ProductDetailRoute'
import type { ProductDetail } from './types'

/**
 * No DOM environment: the suite asserts the server render of the real route
 * inside a `MemoryRouter`, with the query hook replaced by a fixed value.
 */

const queryMock = vi.hoisted(() => ({
  data: undefined as ProductDetail | undefined,
  isPending: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}))

vi.mock('./api/useProduct', () => ({ useProduct: () => queryMock }))

const bare: ProductDetail = {
  id: 'prod-1',
  slug: '',
  price: { value: 118258.8, currency: 'COP' },
  description: 'Cámara IP de 4 MP con visión nocturna.',
  brand: 'Hikvision',
  model: 'DS-2CD2143',
  name: 'Cámara Domo 4K',
  status: 'active',
  badges: [],
  breadcrumb: [
    { label: 'Catálogo', href: '/catalogo' },
    { label: 'Videovigilancia', href: '/catalogo/categoria/videovigilancia' },
    { label: 'Domo', href: '/catalogo/categoria/camaras-ip-domo' },
  ],
  image: { src: '/api/files/img-1', alt: 'Cámara Domo 4K' },
  images: [
    { src: '/api/files/img-1', alt: 'Cámara Domo 4K' },
    { src: '/api/files/img-2', alt: 'Vista lateral' },
  ],
  highlights: [],
  features: [],
  availableModels: [],
  specGroups: [],
  documents: [],
  firmware: null,
}

const enriched: ProductDetail = {
  ...bare,
  slug: 'ids-e04hqhi-d',
  badges: ['Destacado'],
  highlights: ['Compresión H.265+'],
  features: [{ id: 'f1', label: 'AcuSense', icon: 'shield' }],
  specGroups: [{ id: 'video', title: 'Video', items: [{ label: 'Canales', value: '4' }] }],
  documents: [
    { id: 'd1', type: 'datasheet', title: 'Datasheet', language: 'es', url: 'https://example.com/ds.pdf' },
  ],
  firmware: {
    files: [{ id: 'fw1', kind: 'firmware', title: 'Firmware', url: 'https://example.com/fw.bin', requiresLicense: true }],
    appliesTo: [],
  },
}

function renderRoute(path = '/catalogo/productos/prod-1'): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: '/catalogo/productos/:id', element: createElement(ProductDetailRoute) }),
      ),
    ),
  )
}

function jsonLd(markup: string): Record<string, unknown> {
  const match = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(markup)
  return JSON.parse((match?.[1] ?? '').replace(/&quot;/g, '"')) as Record<string, unknown>
}

beforeEach(() => {
  queryMock.data = bare
  queryMock.isPending = false
  queryMock.isError = false
  queryMock.error = null
  queryMock.refetch.mockReset()
})

describe('ficha de un producto sin datos enriquecidos', () => {
  it('muestra nombre, marca, SKU y el precio con IVA incluido', () => {
    const markup = renderRoute()

    expect(markup).toContain('>Cámara Domo 4K</h1>')
    expect(markup).toContain('Marca: Hikvision')
    expect(markup).toContain('SKU: DS-2CD2143')
    expect(markup).toContain('$ 118.259')
    expect(markup).toContain('IVA incluido')
  })

  it('no pinta secciones vacías ni la barra de secciones', () => {
    const markup = renderRoute()

    expect(markup).not.toContain('id="especificaciones"')
    expect(markup).not.toContain('id="recursos"')
    expect(markup).not.toContain('Secciones del producto')
    expect(markup).not.toContain('Tecnologías destacadas')
    expect(markup).not.toContain('Modelos disponibles')
  })

  it('usa la descripción cuando no hay puntos destacados', () => {
    expect(renderRoute()).toContain('Cámara IP de 4 MP con visión nocturna.')
  })

  it('arma la migaja de pan con rutas de la tienda y termina en la categoría', () => {
    const markup = renderRoute()
    const crumbs = markup.slice(markup.indexOf('aria-label="Ruta de navegación"'), markup.indexOf('</nav>'))

    expect(crumbs).toContain('href="/tienda"')
    expect(crumbs).toContain('href="/catalogo/categoria/videovigilancia"')
    expect(crumbs).toContain('href="/catalogo/categoria/camaras-ip-domo"')
    // Last crumb is the category (a link); the product name is not repeated there.
    expect(crumbs.lastIndexOf('Domo')).toBeGreaterThan(crumbs.lastIndexOf('Videovigilancia'))
    expect(crumbs).not.toContain('Cámara Domo 4K')
    expect(crumbs).not.toContain('aria-current="page"')
  })

  it('coloca las características y la franja de confianza bajo la galería, una sola vez', () => {
    queryMock.data = enriched
    const markup = renderRoute()

    expect(markup.split('Tecnologías destacadas').length - 1).toBe(1)
    expect(markup.split('Garantía de fábrica').length - 1).toBe(1)
    // DOM order keeps the mobile flow: gallery, title and purchase, then chips and trust.
    const gallery = markup.indexOf('Imágenes del producto')
    const title = markup.indexOf('<h1')
    const chips = markup.indexOf('Tecnologías destacadas')
    const trust = markup.indexOf('Garantía de fábrica')
    expect(gallery).toBeGreaterThan(-1)
    expect(title).toBeGreaterThan(gallery)
    expect(chips).toBeGreaterThan(title)
    expect(trust).toBeGreaterThan(chips)
  })

  it('pinta la galería con miniaturas cuando hay varias imágenes', () => {
    const markup = renderRoute()

    expect(markup).toContain('src="/api/files/img-1"')
    expect(markup).toContain('aria-label="Ver imagen 2 de 2"')
  })

  it('muestra un marcador sin miniaturas cuando no hay imágenes', () => {
    queryMock.data = { ...bare, image: null, images: [] }

    const markup = renderRoute()

    expect(markup).toContain('Imagen no disponible')
    expect(markup).not.toContain('Imágenes del producto')
  })

  it('ofrece cotizar por WhatsApp y llamar', () => {
    const markup = renderRoute()
    const message = encodeURIComponent('Hola, quiero cotizar el producto Cámara Domo 4K (SKU: DS-2CD2143).')

    expect(markup).toContain(`href="https://wa.me/576011234567?text=${message}"`)
    expect(markup).toContain('href="tel:+576011234567"')
    expect(markup.split('Cotizar por WhatsApp').length - 1).toBeGreaterThanOrEqual(2)
  })

  it('muestra la franja de confianza y el chrome de la tienda', () => {
    const markup = renderRoute()

    expect(markup).toContain('Garantía de fábrica')
    expect(markup).toContain('aria-label="Grupo Security, inicio"')
  })

  it('emite JSON-LD sin campos vacíos', () => {
    const data = jsonLd(renderRoute())

    expect(data).toMatchObject({ name: 'Cámara Domo 4K', sku: 'DS-2CD2143', brand: { name: 'Hikvision' } })
    expect(data).toHaveProperty('offers.price', 118258.8)
    expect(data).not.toHaveProperty('additionalProperty')
  })

  it('omite marca, descripción, imagen y oferta del JSON-LD cuando no existen', () => {
    queryMock.data = { ...bare, brand: '', description: null, image: null, images: [], price: null }

    const data = jsonLd(renderRoute())

    expect(Object.keys(data).sort()).toEqual(['@context', '@type', 'mpn', 'name', 'sku'])
  })

  it('muestra "Precio a consultar" sin precio público y mantiene el CTA', () => {
    queryMock.data = { ...bare, price: null }

    const markup = renderRoute()

    expect(markup).toContain('Precio a consultar')
    expect(markup).not.toContain('IVA incluido')
    expect(markup).not.toContain('$ ')
    expect(markup).toContain('Cotizar por WhatsApp')
  })

  it('ofrece solo la sección con datos en la barra de secciones', () => {
    queryMock.data = { ...bare, specGroups: enriched.specGroups }

    const markup = renderRoute()

    expect(markup).toContain('id="especificaciones"')
    expect(markup).toContain('href="#especificaciones"')
    expect(markup).not.toContain('id="recursos"')
    expect(markup).not.toContain('href="#recursos"')
  })
})

describe('ficha de un producto enriquecido', () => {
  beforeEach(() => {
    queryMock.data = enriched
  })

  it('pinta especificaciones, recursos y la barra con ambos accesos', () => {
    const markup = renderRoute()

    expect(markup).toContain('id="especificaciones"')
    expect(markup).toContain('id="recursos"')
    expect(markup).toContain('href="#especificaciones"')
    expect(markup).toContain('href="#recursos"')
  })

  it('pinta puntos destacados, tecnologías, insignias y el precio', () => {
    const markup = renderRoute()

    expect(markup).toContain('Compresión H.265+')
    expect(markup).toContain('AcuSense')
    expect(markup).toContain('Destacado')
    expect(markup).toContain('IVA incluido')
    expect(markup).not.toContain('Cámara IP de 4 MP con visión nocturna.')
  })

  it('incluye las especificaciones en el JSON-LD', () => {
    expect(jsonLd(renderRoute())).toHaveProperty('additionalProperty', [
      { '@type': 'PropertyValue', name: 'Canales', value: '4' },
    ])
  })
})

describe('estados', () => {
  it('muestra el esqueleto mientras carga', () => {
    queryMock.data = undefined
    queryMock.isPending = true

    const markup = renderRoute()

    expect(markup).toContain('Cargando producto')
    expect(markup).not.toContain('Cotizar por WhatsApp')
  })

  it('muestra "no encontrado" con el enlace de vuelta al catálogo y sin reintento', () => {
    queryMock.data = undefined
    queryMock.isError = true
    queryMock.error = new ProductNotFoundError('nope')

    const markup = renderRoute()

    expect(markup).toContain('Producto no encontrado')
    expect(markup).toContain('href="/catalogo"')
    expect(markup).not.toContain('Intentar de nuevo')
  })

  it('muestra el error con reintento y enlace de vuelta al catálogo', () => {
    queryMock.data = undefined
    queryMock.isError = true
    queryMock.error = new Error('boom')

    const markup = renderRoute()

    expect(markup).toContain('No pudimos cargar el producto')
    expect(markup).toContain('Intentar de nuevo')
    expect(markup).toContain('href="/catalogo"')
  })
})
