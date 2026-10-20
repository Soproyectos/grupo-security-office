import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { MenuCategory } from '../types/categoryMenu'
import type { PublicProductResult } from '../types/publicProduct'
import { CategoryShopTiles } from './CategoryShopTiles'
import { ProductShelfView } from './ProductShelf'

/** Data-driven pieces of the home, rendered with fixed props (no effects on a server render). */

function category(slug: string, name: string, options: Partial<MenuCategory> = {}): MenuCategory {
  return {
    id: slug,
    name,
    slug,
    imageUrl: options.imageUrl ?? null,
    iconUrl: options.iconUrl ?? null,
    isFeatured: false,
    sortOrder: 0,
    productCount: 0,
    children: [],
  }
}

function product(id: string, overrides: Partial<PublicProductResult> = {}): PublicProductResult {
  return {
    id,
    sku: `SKU-${id}`,
    name: `Producto ${id}`,
    imageUrl: null,
    categoryName: 'Cámaras Turbo',
    categorySlug: 'camaras-turbo',
    brandName: 'Hikvision',
    isInformational: false,
    price: { value: 100000, currency: 'COP' },
    ...overrides,
  }
}

function inRouter(node: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node))
}

const shelf = { slug: 'camaras-turbo', title: 'Videovigilancia' }

describe('CategoryShopTiles', () => {
  const entries = [
    { category: category('camaras-turbo', 'Camaras Turbo'), count: 164 },
    { category: category('ups-on-line', 'UPS On Line', { imageUrl: '/images/categories/ups.jpg' }), count: 1 },
    { category: category('videovigilancia', 'Videovigilancia', { iconUrl: '/images/category-icons/videovigilancia.svg' }), count: 12 },
  ]

  it('enlaza cada tile a su categoría y muestra el conteo real', () => {
    const markup = inRouter(createElement(CategoryShopTiles, { entries }))

    expect(markup).toContain('href="/catalogo/categoria/camaras-turbo"')
    expect(markup).toContain('href="/catalogo/categoria/ups-on-line"')
    expect(markup).toContain('164 productos')
    expect(markup).toContain('1 producto<')
    expect(markup).not.toContain('1 productos')
  })

  it('usa la imagen del menú, luego el icono del menú y luego un icono por familia', () => {
    const markup = inRouter(createElement(CategoryShopTiles, { entries }))

    expect(markup).toContain('src="/images/categories/ups.jpg"')
    expect(markup).toContain('/images/category-icons/videovigilancia.svg')
    // The first tile has neither image nor icon: stroke glyph of the family.
    expect(markup).toContain('<svg')
  })

  it('sigue el diseño: borde en hover, foco visible y objetivo táctil mínimo', () => {
    const markup = inRouter(createElement(CategoryShopTiles, { entries }))

    expect(markup).toContain('hover:border-storefront-ink')
    expect(markup).toContain('focus-visible:outline')
    expect(markup).toContain('min-h-[4.5rem]')
    expect(markup).not.toContain('hover:shadow')
  })
})

describe('ProductShelfView', () => {
  it('muestra el título, hasta cuatro tarjetas con precio y el enlace "Ver todo"', () => {
    const items = ['1', '2', '3', '4'].map((id) => product(id))
    const markup = inRouter(
      createElement(ProductShelfView, { shelf, status: 'ready', items, total: 164, onRetry: vi.fn() }),
    )

    expect(markup).toContain('>Videovigilancia</h2>')
    expect(markup).toContain('href="/catalogo/categoria/camaras-turbo"')
    expect(markup).toContain('Ver todo<span class="sr-only"> en Videovigilancia</span>')
    expect(markup.split('IVA incluido').length - 1).toBe(4)
    expect(markup).toContain('href="/catalogo/productos/1"')
  })

  it('se oculta cuando la categoría no tiene productos', () => {
    const markup = inRouter(
      createElement(ProductShelfView, { shelf, status: 'ready', items: [], total: 0, onRetry: vi.fn() }),
    )

    expect(markup).toBe('')
  })

  it('muestra el esqueleto mientras carga, conservando el título', () => {
    const markup = inRouter(
      createElement(ProductShelfView, { shelf, status: 'loading', items: [], total: 0, onRetry: vi.fn() }),
    )

    expect(markup).toContain('Cargando Videovigilancia')
    expect(markup.split('data-testid="product-skeleton-card"').length - 1).toBe(4)
    expect(markup).toContain('>Videovigilancia</h2>')
  })

  it('muestra el error de la vitrina con reintento', () => {
    const markup = inRouter(
      createElement(ProductShelfView, { shelf, status: 'error', items: [], total: 0, onRetry: vi.fn() }),
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('No pudimos cargar los productos de Videovigilancia')
    expect(markup).toContain('Intentar de nuevo')
  })
})
