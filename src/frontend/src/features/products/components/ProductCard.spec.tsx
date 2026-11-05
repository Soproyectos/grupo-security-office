import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { ProductCard } from './ProductCard'
import { ProductTableRow } from './ProductTableRow'
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
    expect(html).not.toContain('<svg class="w-14 h-14')
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
    expect(html).toContain('w-14 h-14')
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

describe('"Editar ficha" entry point', () => {
  const noop = { onEdit: vi.fn(), onTransition: vi.fn(), onDelete: vi.fn(), readOnly: true }
  const card = (onEditSheet?: (id: string) => void) =>
    renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(ProductCard, { product: baseProduct(), ...noop, onEditSheet })),
    )
  const row = (onEditSheet?: (id: string) => void) =>
    renderToStaticMarkup(
      createElement(
        'table',
        null,
        createElement(
          'tbody',
          null,
          createElement(ProductTableRow, { product: baseProduct(), ...noop, onOpen: vi.fn(), onEditSheet }),
        ),
      ),
    )

  it('appears on a read-only card and row only when onEditSheet is provided', () => {
    expect(card(vi.fn())).toContain('Editar ficha')
    expect(row(vi.fn())).toContain('Editar ficha')
    expect(card()).not.toContain('Editar ficha')
    expect(row()).not.toContain('Editar ficha')
  })

  it('does not turn the read-only catalog into an editor (no move/edit/delete controls)', () => {
    const html = card(vi.fn()) + row(vi.fn())
    expect(html).not.toContain('Mover de categoría')
    expect(html).not.toContain('title="Editar"')
    expect(html).not.toContain('title="Eliminar"')
    expect(row(vi.fn())).toContain('>Ver<')
  })
})
