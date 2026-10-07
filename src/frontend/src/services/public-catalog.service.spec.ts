import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuCategory } from '../features/storefront/types/categoryMenu'
import type { PublicProductResult } from '../features/storefront/types/publicProduct'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('./api', () => ({ default: { get } }))

import { fetchCategoryMenu, fetchPublicProducts } from './public-catalog.service'

// ---------------------------------------------------------------------------
// Covered scenarios:
// ✅ Unwraps the DOUBLE wrapped payload `{ data: { data: [...] } }` (controller +
//    TransformInterceptor) and returns the tree untouched
// ✅ Also resolves the shape the client interceptor delivers (`{ data: [...] }`)
// ✅ Requests the correct public endpoint
// ✅ An unexpected shape is an empty menu, not an exception
// ✅ HTTP errors do propagate (the consumer needs to be able to retry)
// ---------------------------------------------------------------------------

const menu: MenuCategory[] = [
  {
    id: 'root-1',
    name: 'Videovigilancia',
    slug: 'videovigilancia',
    imageUrl: '/images/categories/videovigilancia.svg',
    iconUrl: '/images/categories/icons/videovigilancia.svg',
    isFeatured: false,
    sortOrder: 10,
    productCount: 0,
    children: [
      {
        id: 'child-1',
        name: 'Cámaras IP',
        slug: 'cameras-ip',
        imageUrl: null,
        iconUrl: null,
        isFeatured: true,
        sortOrder: 0,
        productCount: 0,
        children: [
          {
            id: 'grandchild-1',
            name: 'Cámaras domo',
            slug: 'cameras-domo',
            imageUrl: null,
            iconUrl: null,
            isFeatured: false,
            sortOrder: 0,
            productCount: 0,
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 'root-2',
    name: 'Control de acceso',
    slug: 'control-de-acceso',
    imageUrl: null,
    iconUrl: null,
    isFeatured: false,
    sortOrder: 20,
    productCount: 0,
    children: [],
  },
]

describe('fetchCategoryMenu', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('pide el endpoint público del menú', async () => {
    get.mockResolvedValue({ data: { data: menu } })

    await fetchCategoryMenu()

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/public/categories/menu')
  })

  /**
   * MENU-02 finding: the wire payload is `{ data: { data: [...] } }` (the
   * service returns `{ data }` and the global TransformInterceptor wraps it
   * again). Unwrapping a single layer would hand the mega menu an object where
   * it expects an array, and it would break on the first map.
   */
  it('desenvuelve el payload doble envuelto y devuelve el árbol completo', async () => {
    get.mockResolvedValue({ data: { data: menu } })

    const result = await fetchCategoryMenu()

    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual(menu)
    expect(result[0]?.children[0]?.children[0]?.name).toBe('Cámaras domo')
  })

  /** What the service really receives in production: the `api` client
   * interceptor has already peeled the outer layer. */
  it('resuelve también la forma que entrega el interceptor del cliente', async () => {
    get.mockResolvedValue({ data: menu })

    await expect(fetchCategoryMenu()).resolves.toEqual(menu)
  })

  it('propaga el error HTTP para que el consumidor pueda reintentar', async () => {
    const failure = Object.assign(new Error('Request failed with status code 429'), {
      response: { status: 429, data: { message: 'ThrottledException' } },
    })
    get.mockRejectedValue(failure)

    await expect(fetchCategoryMenu()).rejects.toBe(failure)
  })

  const invalidPayloads: [string, unknown][] = [
    ['sin envoltorio y sin arreglo', { status: 'ok' }],
    ['con data ausente', {}],
    ['con data nulo', { data: null }],
    ['con data que no es arreglo', { data: { unexpected: true } }],
    ['con doble data nulo', { data: { data: null } }],
  ]

  it.each(invalidPayloads)('devuelve un menú vacío si el payload es %s', async (_caso: string, payload: unknown) => {
    get.mockResolvedValue(payload)

    await expect(fetchCategoryMenu()).resolves.toEqual([])
  })

  it('no trunca un arreglo que llega sin envolver', async () => {
    get.mockResolvedValue({ data: menu })

    await expect(fetchCategoryMenu()).resolves.toHaveLength(2)
  })
})

describe('fetchPublicProducts', () => {
  beforeEach(() => {
    get.mockReset()
  })

  const results: PublicProductResult[] = [
    {
      id: 'prod-1',
      sku: 'CAM-4K',
      name: 'Cámara Domo 4K',
      imageUrl: '/api/files/img-1',
      categoryName: 'Cámaras IP',
      categorySlug: 'camaras-ip',
      brandName: 'Hikvision',
      price: { value: 118258.8, currency: 'COP' },
    },
    {
      id: 'prod-2',
      sku: 'LEC-01',
      name: 'Lector biométrico',
      imageUrl: null,
      categoryName: 'Control de Acceso',
      categorySlug: 'control-de-acceso',
      brandName: null,
      price: null,
    },
  ]
  const meta = { total: 40, offset: 0, limit: 24 }

  it('pide el endpoint público con el término, la categoría, el offset y el límite', async () => {
    get.mockResolvedValue({ data: { data: results, meta } })

    await fetchPublicProducts({ q: 'cámara', category: 'camaras-ip' }, 24)

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/public/products', {
      params: { q: 'cámara', category: 'camaras-ip', offset: 24, limit: 24 },
    })
  })

  it('omite los filtros vacíos', async () => {
    get.mockResolvedValue({ data: { data: [], meta: { total: 0, offset: 0, limit: 24 } } })

    await fetchPublicProducts({ q: '' })

    expect(get).toHaveBeenCalledWith('/public/products', { params: { offset: 0, limit: 24 } })
  })

  it('desenvuelve el payload doble envuelto y devuelve items y total', async () => {
    get.mockResolvedValue({ data: { data: { data: results, meta } } })

    await expect(fetchPublicProducts({ q: 'cámara' })).resolves.toEqual({
      items: results,
      total: 40,
      offset: 0,
      limit: 24,
    })
  })

  it('resuelve también la forma que entrega el interceptor del cliente', async () => {
    get.mockResolvedValue({ data: { data: results, meta } })

    const page = await fetchPublicProducts({ q: 'cámara' })

    expect(page.items).toEqual(results)
    expect(page.total).toBe(40)
  })

  it('usa la cantidad de items como total cuando falta meta', async () => {
    get.mockResolvedValue({ data: results })

    await expect(fetchPublicProducts({ q: 'cámara' })).resolves.toMatchObject({ total: 2 })
  })

  it('devuelve un listado vacío cuando la búsqueda no trae productos', async () => {
    get.mockResolvedValue({ data: { data: [], meta: { total: 0, offset: 0, limit: 24 } } })

    await expect(fetchPublicProducts({ q: 'xyz' })).resolves.toMatchObject({ items: [], total: 0 })
  })

  const invalidPayloads: [string, unknown][] = [
    ['sin envoltorio y sin arreglo', { status: 'ok' }],
    ['con data nulo', { data: null }],
    ['con doble data nulo', { data: { data: null } }],
    ['con data que no es arreglo', { data: { unexpected: true } }],
  ]

  it.each(invalidPayloads)('devuelve un listado vacío si el payload es %s', async (_caso: string, payload: unknown) => {
    get.mockResolvedValue(payload)

    await expect(fetchPublicProducts({ q: 'cámara' })).resolves.toMatchObject({ items: [], total: 0 })
  })

  it('propaga el error HTTP para que la página pueda ofrecer reintentar', async () => {
    const failure = Object.assign(new Error('Network Error'), { response: undefined })
    get.mockRejectedValue(failure)

    await expect(fetchPublicProducts({ q: 'cámara' })).rejects.toBe(failure)
  })
})
