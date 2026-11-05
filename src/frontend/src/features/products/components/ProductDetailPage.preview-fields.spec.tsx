import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ProductDetailPage } from './ProductDetailPage'
import type { ProductDetail } from '../types'

/**
 * Live preview contract: the storefront elements carry data-preview-field so the editor
 * can highlight them. Server render only (no DOM), like the other product storefront specs.
 */

const complete: ProductDetail = {
  id: 'prod-1',
  slug: 'ids-e04hqhi-d',
  price: { value: 118258.8, currency: 'COP' },
  isInformational: false,
  description: 'Cámara IP de 4 MP con visión nocturna.',
  brand: 'Hikvision',
  model: 'DS-2CD2143',
  name: 'Cámara Domo 4K',
  status: 'discontinued',
  badges: ['Destacado'],
  breadcrumb: [
    { label: 'Catálogo', href: '/catalogo' },
    { label: 'Videovigilancia', href: '/catalogo/categoria/videovigilancia' },
  ],
  image: { src: '/api/files/img-1', alt: 'Cámara Domo 4K' },
  images: [
    { src: '/api/files/img-1', alt: 'Cámara Domo 4K' },
    { src: '/api/files/img-2', alt: 'Vista lateral' },
  ],
  highlights: ['Compresión H.265+'],
  features: [{ id: 'f1', label: 'AcuSense', icon: 'shield' }],
  availableModels: [],
  specGroups: [{ id: 'video', title: 'Video', items: [{ label: 'Canales', value: '4' }] }],
  specsDisclaimer: 'Las especificaciones pueden cambiar sin previo aviso.',
  documents: [{ id: 'd1', type: 'datasheet', title: 'Ficha técnica', language: 'es', url: 'https://example.com/ds.pdf' }],
  firmware: {
    files: [{ id: 'fw1', kind: 'firmware', title: 'Firmware', url: 'https://example.com/fw.bin', requiresLicense: true }],
    appliesTo: [],
  },
}

function render(product: ProductDetail): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ProductDetailPage product={product} />
    </MemoryRouter>,
  )
}

describe('ProductDetailPage preview fields', () => {
  it('marks each storefront zone with the sheet field it shows', () => {
    const html = render(complete)

    for (const field of ['category', 'images', 'sku', 'badges', 'status', 'name', 'brand', 'price', 'highlights', 'features', 'resources', 'specs']) {
      expect(html).toContain(`data-preview-field="${field}"`)
    }
  })

  it('marks the description when the product has no highlights', () => {
    const html = render({ ...complete, highlights: [] })

    expect(html).toContain('data-preview-field="description"')
    expect(html).not.toContain('data-preview-field="highlights"')
  })

  it('keeps the price zone when there is no public price', () => {
    const html = render({ ...complete, price: null, isInformational: true })

    expect(html).toContain('Ficha informativa')
    expect(html).toContain('data-preview-field="price"')
  })
})
