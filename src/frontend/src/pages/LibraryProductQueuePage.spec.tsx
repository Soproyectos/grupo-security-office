import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import LibraryProductQueuePage from './LibraryProductQueuePage'
import {
  buildLibraryProductQueueParams,
  parseLibraryProductQueueParams,
} from './library-product-queue-url'
import type { Product } from '../features/products/types/product.types'

const hookState = vi.hoisted(() => ({
  products: [] as unknown[],
  total: 0,
  isLoading: false,
  error: null as unknown,
  lastRequest: null as null | { filters: { search: string }; page: number; pageSize: number },
  permissions: [] as string[],
}))

vi.mock('../features/products/hooks/useProducts', () => ({
  useProducts: ({ filters, page, pageSize }: { filters: { search: string }; page: number; pageSize: number }) => {
    hookState.lastRequest = { filters, page, pageSize }
    return { ...hookState, meta: undefined, categories: [], brands: [] }
  },
}))

vi.mock('../lib/rbac', () => ({ useHasPermission: (permission: string) => hookState.permissions.includes(permission) }))

const product = (over: Partial<Product>): Product => ({
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
  images: [{ id: 'i1', url: '/api/files/i1', isPrimary: true }],
  prices: [
    { id: 'pr1', value: 100, currency: 'COP', validFrom: null, validUntil: null, priceList: { id: 'l1', name: 'Tarifa', code: 'T' } },
  ],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...over,
})

const incomplete = product({
  id: 'p-incomplete',
  sku: 'SKU-PENDIENTE',
  name: 'Lector sin ficha',
  lifecycleStatus: 'DRAFT',
  images: [],
  prices: [],
  brand: null as unknown as Product['brand'],
})
const complete = product({ id: 'p-complete', sku: 'SKU-COMPLETO', name: 'Producto completo' })

const render = (search = '') => {
  const client = new QueryClient()
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/commercial/library/update/products${search}`]}>
        <LibraryProductQueuePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  hookState.products = [incomplete, complete]
  hookState.total = 2
  hookState.isLoading = false
  hookState.error = null
  hookState.lastRequest = null
  hookState.permissions = ['products:write']
})

describe('estado URL de LibraryProductQueuePage', () => {
  it('restaura búsqueda, página, tamaño, vista y filtro rápido desde la URL', () => {
    const params = new URLSearchParams('search=SKU-002&page=3&pageSize=50&view=list&pending=noPrice')
    expect(parseLibraryProductQueueParams(params)).toEqual({
      search: 'SKU-002', page: 3, pageSize: 50, layout: 'list', pending: 'noPrice',
    })
  })

  it('normaliza parámetros inválidos y serializa solo el estado necesario para volver de la ficha', () => {
    expect(parseLibraryProductQueueParams(new URLSearchParams('page=-2&pageSize=999&view=weird&pending=unknown'))).toEqual({
      search: '', page: 1, pageSize: 20, layout: 'list', pending: null,
    })
    const query = buildLibraryProductQueueParams({ search: ' SKU-002 ', page: 2, pageSize: 50, layout: 'list', pending: 'draft' })
    expect(query.toString()).toBe('search=SKU-002&page=2&pageSize=50&pending=draft')
  })
})

describe('LibraryProductQueuePage', () => {
  it('muestra «Nuevo producto» solo con la concesión de escritura de productos', () => {
    const withGrant = render()
    expect(withGrant).toContain('Nuevo producto')
    expect(withGrant).toContain('href="/commercial/library/update/products/new"')
    hookState.permissions = ['prices:read']
    const without = render()
    expect(without).not.toContain('Nuevo producto')
    expect(without).not.toContain('/products/new')
  })

  it('muestra «Seleccionar para publicar» solo con la concesión de publicar productos', () => {
    expect(render()).not.toContain('Seleccionar para publicar')
    hookState.permissions = ['products:publish']
    const html = render()
    expect(html).toContain('Seleccionar para publicar')
    expect(html).not.toContain('type="checkbox"')
  })

  it('muestra el catálogo completo al entrar, incluidos los productos sin pendientes', () => {
    const html = render()
    expect(html).toContain('Buscar por nombre o SKU')
    expect(html).toContain('SKU-PENDIENTE')
    expect(html).toContain('Lector sin ficha')
    expect(html).toContain('SKU-COMPLETO')
    expect(html).toContain('Producto completo')
    expect(html.match(/Editar ficha/g)).toHaveLength(2)
    expect(html).toContain('Siguiente pendiente')
    expect(html).not.toContain('Importar catálogo')
  })

  it('no muestra una acción de importación general en el catálogo', () => {
    hookState.permissions = []
    expect(render()).not.toContain('Importar catálogo')
  })

  it('muestra los filtros rápidos y aclara que sus conteos solo abarcan la página cargada', () => {
    const html = render()
    for (const label of ['Sin imagen', 'Sin marca', 'Sin precio', 'Borrador']) expect(html).toContain(label)
    expect(html).toContain('conteos consideran solo los 2 productos cargados en esta página')
    expect(html).toContain('aria-label="Filtros rápidos sobre esta página"')
  })

  it('envía la búsqueda de URL al filtro del endpoint y restaura modo lista, página y tamaño', () => {
    hookState.products = [incomplete]
    hookState.total = 140
    const html = render('?search=SKU-PENDIENTE&page=2&pageSize=50&view=list&pending=noPrice')

    expect(hookState.lastRequest).toEqual({ filters: { search: 'SKU-PENDIENTE' }, page: 2, pageSize: 50 })
    expect(html).toContain('value="SKU-PENDIENTE"')
    expect(html).toContain('aria-label="Ver como lista" aria-pressed="true"')
    expect(html).toContain('Página 2 de 3')
    expect(html).toContain('Editar ficha')
    expect(html).not.toContain('SKU-COMPLETO')
  })

  it('Siguiente pendiente abre solo si hay un producto con datos pendientes', () => {
    const html = render()
    expect(html).toContain('>Siguiente pendiente</button>')
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Siguiente pendiente<\/button>/)
    hookState.products = [complete]
    hookState.total = 1
    const completeOnly = render()
    expect(completeOnly).toMatch(/<button[^>]*disabled=""[^>]*>Siguiente pendiente<\/button>/)
  })

  it('distingue el estado vacío, la búsqueda sin coincidencias y el filtro rápido sin coincidencias', () => {
    hookState.products = []
    hookState.total = 0
    expect(render()).toContain('Aún no hay productos en el catálogo')
    expect(render('?search=desconocido')).toContain('No se encontraron productos')
    hookState.products = [complete]
    hookState.total = 1
    expect(render('?pending=noPrice')).toContain('No hay productos con “sin precio” en esta página')
  })

  it('muestra carga y error con recuperación separada de los estados vacíos', () => {
    hookState.products = []
    hookState.isLoading = true
    expect(render()).toContain('Cargando productos')
    hookState.isLoading = false
    hookState.error = new Error('boom')
    const html = render()
    expect(html).toContain('No se pudo cargar el catálogo')
    expect(html).toContain('>Reintentar</button>')
    expect(html).toContain('role="alert"')
  })
})
