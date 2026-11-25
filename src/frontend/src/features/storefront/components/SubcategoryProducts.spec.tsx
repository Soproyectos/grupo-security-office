import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { MenuCategory } from '../types/categoryMenu'
import type { PublicKeySpecFacet } from '../../../services/public-catalog.service'
import SubcategoryProducts, { RequirementsPanelContent, toggleRequirementParams } from './SubcategoryProducts'

/**
 * SSR suite for the subcategory listing. The services are mocked, and the
 * listing hook is replaced so each test can read the filters the page sends.
 * Query state is seeded into the client cache; SSR never runs queries.
 */

const serviceMock = vi.hoisted(() => ({
  fetchPublicBrands: vi.fn(),
  fetchPublicKeySpecFacets: vi.fn(),
  fetchPublicRequirements: vi.fn(),
  fetchPublicProducts: vi.fn(),
}))

const pageMock = vi.hoisted(() => ({
  calls: [] as Array<{ filters: Record<string, unknown>; page: number; pageSize: number; enabled: boolean }>,
}))

vi.mock('../../../services/public-catalog.service', () => serviceMock)

vi.mock('../hooks/usePublicProductPage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../hooks/usePublicProductPage')>(),
  usePublicProductPage: (filters: Record<string, unknown>, page: number, pageSize: number, enabled: boolean) => {
    pageMock.calls.push({ filters, page, pageSize, enabled })
    return { data: undefined, isPending: true, isSuccess: false, isError: false, refetch: () => undefined }
  },
}))

function node(id: string, name: string, slug: string, options: Partial<MenuCategory> = {}): MenuCategory {
  return {
    id,
    ...(options.subcategoryId ? { subcategoryId: options.subcategoryId } : {}),
    ...(options.subcategorySlug ? { subcategorySlug: options.subcategorySlug } : {}),
    name,
    slug,
    imageUrl: null,
    iconUrl: null,
    isFeatured: false,
    sortOrder: 0,
    productCount: options.productCount ?? 1,
    children: options.children ?? [],
  }
}

const category = node('c-alarmas', 'Alarmas', 'alarmas')
const subcategory = node('s-zonas', 'Alarmas por zonas', 'alarmas-zonas-row', { subcategoryId: 'sub-zonas', subcategorySlug: 'alarmas-zonas' })

const facet: PublicKeySpecFacet = {
  specKey: 'protocolo',
  label: 'Protocolo',
  dataType: 'ENUM',
  unit: null,
  values: [{ value: 'TCP', label: 'TCP', count: 4 }],
}

const URL_WITH_FILTERS = '/catalogo/categoria/alarmas?q=panel&brand=ajax&requirement=zonas:16&requirement=protocolo:TCP'

const requirementScope = {
  q: 'panel',
  brand: 'ajax',
  keySpec: [],
  requirement: ['zonas:16', 'protocolo:TCP'],
}

interface RenderOptions {
  url?: string
  seed?: (client: QueryClient) => void
}

function renderListing(options: RenderOptions = {}): { markup: string; client: QueryClient } {
  const client = new QueryClient()
  options.seed?.(client)
  const tree = createElement(
    QueryClientProvider,
    { client },
    createElement(
      MemoryRouter,
      { initialEntries: [options.url ?? URL_WITH_FILTERS] },
      createElement(SubcategoryProducts, { category, subcategory, children: [], emptyState: createElement('p', null, 'Sin productos') }),
    ),
  )
  const markup = renderToStaticMarkup(tree).replace(/<!-- -->/g, '')
  return { markup, client }
}

function requirementsKey(): unknown[] {
  return ['storefront', 'requirements', 'alarmas', 'alarmas-zonas', requirementScope]
}

describe('toggleRequirementParams', () => {
  it('añade un requisito nuevo al final y conserva q, marca y tipo', () => {
    const next = toggleRequirementParams(new URLSearchParams('q=panel&brand=ajax&tipo=alarmas&requirement=zonas:16'), 'protocolo:TCP')

    expect(next.getAll('requirement')).toEqual(['zonas:16', 'protocolo:TCP'])
    expect(next.get('q')).toBe('panel')
    expect(next.get('brand')).toBe('ajax')
    expect(next.get('tipo')).toBe('alarmas')
  })

  it('quita un requisito que ya estaba marcado', () => {
    const next = toggleRequirementParams(new URLSearchParams('requirement=zonas:16&requirement=protocolo:TCP'), 'zonas:16')

    expect(next.getAll('requirement')).toEqual(['protocolo:TCP'])
  })

  it('no duplica un requisito repetido en la URL', () => {
    const next = toggleRequirementParams(new URLSearchParams('requirement=a&requirement=a'), 'b')

    expect(next.getAll('requirement')).toEqual(['a', 'b'])
  })

  it('no añade un requisito número 11', () => {
    const ten = Array.from({ length: 10 }, (_, index) => `r${index + 1}`)
    const current = new URLSearchParams(ten.map((value) => ['requirement', value]))

    const next = toggleRequirementParams(current, 'r11')

    expect(next.getAll('requirement')).toEqual(ten)
  })

  it('no modifica los parámetros originales', () => {
    const current = new URLSearchParams('q=panel&requirement=a')
    const before = current.toString()

    toggleRequirementParams(current, 'b')

    expect(current.toString()).toBe(before)
  })

  it('reescribe todos los requisitos en orden estable y conserva los demás parámetros', () => {
    const next = toggleRequirementParams(new URLSearchParams('requirement=b&x=1&requirement=a'), 'c')

    expect(next.getAll('requirement')).toEqual(['b', 'a', 'c'])
    expect(next.get('x')).toBe('1')
  })
})

describe('listado de subcategoría: filtros y consultas', () => {
  it('envía al listado los mismos q, marca y requisitos de la URL', () => {
    renderListing()
    const last = pageMock.calls[pageMock.calls.length - 1]

    expect(last?.filters).toEqual({
      category: 'alarmas',
      subcategory: 'alarmas-zonas',
      q: 'panel',
      brand: 'ajax',
      keySpec: [],
      requirement: ['zonas:16', 'protocolo:TCP'],
    })
  })

  it('usa en la consulta de requisitos la misma clave y alcance de filtros', () => {
    const { client } = renderListing()
    const keys = client.getQueryCache().findAll({ queryKey: ['storefront', 'requirements'] }).map((query) => query.queryKey)

    expect(keys).toEqual([requirementsKey()])
  })

  it('recorta a diez los requisitos y descarta los duplicados', () => {
    const many = Array.from({ length: 12 }, (_, index) => `requirement=r${index + 1}`).join('&')
    renderListing({ url: `/catalogo/categoria/alarmas?${many}&requirement=r1` })
    const last = pageMock.calls[pageMock.calls.length - 1]

    expect(last?.filters.requirement).toEqual(Array.from({ length: 10 }, (_, index) => `r${index + 1}`))
  })
})

describe('panel de requisitos: carga, errores y avisos', () => {
  function renderPanel(props: Partial<ComponentProps<typeof RequirementsPanelContent>> = {}): string {
    const tree = createElement(RequirementsPanelContent, {
      isPending: false,
      isError: false,
      error: null,
      data: undefined,
      selected: [],
      onToggle: () => undefined,
      onClear: () => undefined,
      onRetry: () => undefined,
      ...props,
    })
    return renderToStaticMarkup(tree).replace(/<!-- -->/g, '')
  }

  it('muestra el esqueleto accesible mientras carga', () => {
    const markup = renderPanel({ isPending: true })

    expect(markup).toContain('Cargando requisitos técnicos')
    expect(markup).not.toContain('Reintentar')
  })

  it('muestra el error de carga de requisitos con Reintentar', () => {
    const markup = renderPanel({ isError: true, error: new Error('Network Error') })

    expect(markup).toContain('No pudimos cargar los requisitos técnicos.')
    expect(markup).toContain('Reintentar')
    expect(markup).not.toContain('Quitar requisitos')
  })

  it('ante un 400 con requisitos marcados ofrece quitarlos y reintentar', () => {
    const badRequest = Object.assign(new Error('Bad Request'), { response: { status: 400 } })
    const markup = renderPanel({ isError: true, error: badRequest, selected: ['zonas:16'] })

    expect(markup).toContain('Alguno de los filtros ya no está disponible.')
    expect(markup).toContain('Quitar requisitos')
    expect(markup).toContain('Reintentar')
    expect(markup).not.toContain('No pudimos cargar los requisitos técnicos.')
  })

  it('ante un 400 sin requisitos marcados usa el mensaje general', () => {
    const badRequest = Object.assign(new Error('Bad Request'), { response: { status: 400 } })
    const markup = renderPanel({ isError: true, error: badRequest, selected: [] })

    expect(markup).toContain('No pudimos cargar los requisitos técnicos.')
    expect(markup).not.toContain('Quitar requisitos')
  })

  it('muestra el aviso de truncado cuando la respuesta lo marca', () => {
    const markup = renderPanel({ data: { products: 3, facets: [facet], truncated: true } })

    expect(markup).toContain('Hay más requisitos de los que podemos mostrar.')
  })

  it('no muestra el aviso de truncado si la respuesta no lo marca', () => {
    const markup = renderPanel({ data: { products: 3, facets: [facet] } })

    expect(markup).not.toContain('Hay más requisitos de los que podemos mostrar.')
  })
})
