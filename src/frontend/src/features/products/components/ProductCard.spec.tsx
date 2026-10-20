import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ProductCard } from './ProductCard'
import { StockBadge } from './ProductIndicators'
import type { Product } from '../types/product.types'

const baseProduct = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  sku: 'IDS-E04HQHI-D',
  name: 'DVR Turbo 4 canales',
  description: null,
  categoryId: 'c1',
  brandId: 'b1',
  technicalSpecs: null,
  isActive: true,
  isVisible: true,
  publishStatus: 'publicado',
  stockStatus: 'no_stock_data',
  category: { id: 'c1', name: 'DVRs Turbo', slug: 'dvrs-turbo' },
  brand: { id: 'b1', name: 'Hikvision', slug: 'hikvision' },
  images: [],
  prices: [],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...over,
})

const render = (product: Product) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(ProductCard, { product, onEdit: vi.fn(), onTransition: vi.fn(), onDelete: vi.fn(), readOnly: true }),
    ),
  )

describe('ProductCard image', () => {
  it('shows the product image (resolved through the API origin) when the list returns one', () => {
    const html = render(
      baseProduct({ images: [{ id: 'i1', url: '/api/files/44a6225e', isPrimary: true, alt: null }] }),
    )
    expect(html).toContain('<img')
    expect(html).toContain('src="/api/files/44a6225e"')
    expect(html).not.toContain('<svg class="w-20 h-20')
  })

  it('also shows an image that is not flagged primary (backend falls back to the first image)', () => {
    const html = render(
      baseProduct({ images: [{ id: 'i2', url: 'https://cdn.test/dvr.webp', isPrimary: false, alt: null }] }),
    )
    expect(html).toContain('src="https://cdn.test/dvr.webp"')
  })

  it('falls back to the placeholder only when the product has no images', () => {
    const html = render(baseProduct({ images: [] }))
    expect(html).not.toContain('<img')
    expect(html).toContain('w-20 h-20')
  })
})

describe('"SIN DATOS" badge', () => {
  it('means "no stock record exists" (stock), not "no technical data" or "no image"', () => {
    const noStock = renderToStaticMarkup(createElement(StockBadge, { product: baseProduct({ stockStatus: 'no_stock_data' }) }))
    expect(noStock).toContain('SIN DATOS')
    expect(noStock).toContain('Disponibilidad no registrada')

    const withImageAndSpecs = baseProduct({
      stockStatus: 'no_stock_data',
      technicalSpecs: { canales: 4 },
      images: [{ id: 'i1', url: '/api/files/x', isPrimary: true, alt: null }],
    })
    expect(renderToStaticMarkup(createElement(StockBadge, { product: withImageAndSpecs }))).toContain('SIN DATOS')

    const inStock = renderToStaticMarkup(createElement(StockBadge, { product: baseProduct({ stockStatus: 'in_stock', availableQty: 3 }) }))
    expect(inStock).toContain('STOCK OK')
  })
})
