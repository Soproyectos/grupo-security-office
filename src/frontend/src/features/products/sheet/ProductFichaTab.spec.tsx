import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProductFichaTab } from './ProductFichaTab'
import { SHEET_SECTIONS } from './ProductSheetEditor'
import type { Product } from '../types/product.types'

/**
 * No DOM environment (see product-detail.spec.tsx): the tab is asserted through its server
 * render. The sheet block renders its loading state there; its fields are covered by
 * ProductSheetEditor.spec.tsx.
 */
const product: Product = {
  id: 'prod-1',
  sku: 'IDS-E04HQHI-D',
  name: 'DVR Turbo 4 canales',
  description: 'DVR de 4 canales',
  categoryId: 'cat-1',
  brandId: 'brand-1',
  technicalSpecs: { Canales: '4' },
  extraAttributes: null,
  isActive: true,
  isVisible: true,
  lifecycleStatus: 'PUBLISHED',
  category: { id: 'cat-1', name: 'DVRs Turbo', slug: 'dvrs-turbo' },
  brand: { id: 'brand-1', name: 'Hikvision', slug: 'hikvision' },
  images: [{ id: 'img-1', url: '/api/files/img-1', isPrimary: true, alt: 'Frente', type: 'PRINCIPAL' }],
  documents: [{ name: 'Datasheet', url: 'https://example.com/ds.pdf', type: 'pdf' }],
  prices: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

const categories = [{ id: 'cat-1', name: 'DVRs Turbo' }] as never[]
const brands = [{ id: 'brand-1', name: 'Hikvision' }] as never[]

const render = (over: Partial<Parameters<typeof ProductFichaTab>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(ProductFichaTab, {
        product,
        categories,
        brands,
        isContextual: true,
        canEditSheet: true,
        ...over,
      }),
    ),
  )

describe('ProductFichaTab', () => {
  it('puts general info, photos, sheet and attributes on one surface', () => {
    const html = render()

    for (const id of ['informacion', 'fotos', 'atributos']) {
      expect(html).toContain(`id="ficha-${id}"`)
    }
    expect(html).toContain('value="DVR Turbo 4 canales"')
    expect(html).toContain('Subir imagen')
    expect(html).toContain('Documentos adjuntos')
    expect(html).toContain('Especificaciones técnicas')
  })

  it('links every block from one navigation, including the sheet sections', () => {
    const html = render()

    expect(html.split('aria-label="Secciones de la ficha"').length - 1).toBe(1)
    for (const id of ['informacion', 'fotos', 'atributos', ...SHEET_SECTIONS.map((s) => s.id)]) {
      expect(html).toContain(`href="#ficha-${id}"`)
    }
  })

  it('names what each button saves', () => {
    const html = render()

    expect(html).toContain('Guardar información general')
    expect(html).toContain('Guardar atributos')
    expect(html).toContain('se guardan al instante')
  })

  it('keeps the sheet editor out when the user cannot write', () => {
    const html = render({ canEditSheet: false })

    expect(html).not.toContain('href="#ficha-identidad"')
    expect(html).toContain('id="ficha-informacion"')
    expect(html).toContain('id="ficha-fotos"')
  })

  it('shows only a read-only general info outside a Lista', () => {
    const html = render({ isContextual: false, canEditSheet: false })

    expect(html).toContain('id="ficha-informacion"')
    expect(html).toContain('Esta vista de catálogo es de solo lectura')
    expect(html).not.toContain('Guardar información general')
    expect(html).not.toContain('id="ficha-fotos"')
    expect(html).not.toContain('id="ficha-atributos"')
    expect(html).not.toContain('Documentos adjuntos')
  })
})
