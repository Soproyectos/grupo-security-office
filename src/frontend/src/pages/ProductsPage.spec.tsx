import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import ProductsPage from './ProductsPage'
import { useAuthStore } from '../stores/auth.store'
import type { Product } from '../features/products/types/product.types'

const hook = vi.hoisted(() => ({ lastArgs: null as null | { filters: Record<string, unknown>; page: number; pageSize: number } }))

vi.mock('../features/products/hooks/useProducts', () => ({
  useProducts: (args: { filters: Record<string, unknown>; page: number; pageSize: number }) => {
    hook.lastArgs = args
    return { products: [product], total: 120, categories: [], brands: [], isLoading: false, error: null }
  },
}))
vi.mock('../features/products/hooks/usePriceLists', () => ({
  usePriceLists: () => ({ priceLists: [], isLoading: false, error: null }),
}))
vi.mock('../features/catalog-validation/ValidationBatchButton', () => ({
  ValidationBatchButton: () => <div>validation-batch-mounted</div>,
}))
vi.mock('../features/catalog-publication/PublicationBoardPanel', () => ({
  PublicationBoardSection: () => <div>publication-board-mounted</div>,
}))

const product = {
  id: 'p1',
  sku: 'SKU-001',
  name: 'Cámara domo 4K',
  description: null,
  categoryId: 'c1',
  brandId: 'b1',
  technicalSpecs: null,
  isActive: true,
  isVisible: true,
  lifecycleStatus: 'PUBLISHED',
  category: { id: 'c1', name: 'Cámaras', slug: 'camaras' },
  brand: { id: 'b1', name: 'Hikvision', slug: 'hikvision' },
  images: [],
  prices: [],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
} as Product

function render(url: string, permissions: string[], roles = ['Consulta']) {
  const session = {
    isAuthenticated: true,
    user: { id: 'u1', name: 'Prueba', email: 'prueba@example.invalid', roles, permissions },
  }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <ProductsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  hook.lastArgs = null
})

describe('ProductsPage', () => {
  it('puts the view controls and pagination in the same toolbar as the Filtros button', () => {
    const html = render('/commercial/products?search=domo', [])
    const filtros = html.indexOf('type="search"')
    const toolbarEnd = html.indexOf('ml-auto flex flex-wrap items-center gap-3')
    const firstProduct = html.indexOf('Cámara domo 4K')
    expect(filtros).toBeGreaterThan(-1)
    expect(toolbarEnd).toBeGreaterThan(filtros)
    expect(firstProduct).toBeGreaterThan(toolbarEnd)
    expect(html).toContain('Buscar productos en Biblioteca')
  })

  it('no longer mentions creating products from a Lista (the help text lives in the Biblioteca strip)', () => {
    const html = render('/commercial/products', [])
    expect(html).not.toContain('Lista correspondiente')
  })

  it('remains a read-only catalog for full permissions and Super Admin', () => {
    const fullPermissions = ['products:read', 'products:write', 'products:delete', 'users:manage']

    for (const html of [
      render('/commercial/products', fullPermissions),
      render('/commercial/products', [], ['Super Admin']),
    ]) {
      expect(html).not.toContain('validation-batch-mounted')
      expect(html).not.toContain('publication-board-mounted')
      expect(html).not.toContain('Editar ficha')
    }
  })

  it('restores search, page and filters from the URL (so "Volver" keeps them)', () => {
    render('/commercial/products?search=dvr&page=3&pageSize=50&categories=c1&brands=b1&status=DRAFT', [])
    expect(hook.lastArgs).toMatchObject({
      page: 3,
      pageSize: 50,
      filters: { search: 'dvr', categoryIds: ['c1'], brandIds: ['b1'], lifecycleStatuses: ['DRAFT'] },
    })
  })

  it('starts on the first page with default filters when the URL has none', () => {
    render('/commercial/products', [])
    expect(hook.lastArgs).toMatchObject({ page: 1, pageSize: 20, filters: { search: '' } })
  })
})
