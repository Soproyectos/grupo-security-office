import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuCategory } from '../features/storefront/types/categoryMenu'
import type { PublicProductResult } from '../features/storefront/types/publicProduct'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('./api', () => ({ default: { get } }))

import { fetchCategoryMenu, searchPublicProducts } from './public-catalog.service'

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
    children: [
      {
        id: 'child-1',
        name: 'Cámaras IP',
        slug: 'cameras-ip',
        imageUrl: null,
        iconUrl: null,
        isFeatured: true,
        sortOrder: 0,
        children: [
          {
            id: 'grandchild-1',
            name: 'Cámaras domo',
            slug: 'cameras-domo',
            imageUrl: null,
            iconUrl: null,
            isFeatured: false,
            sortOrder: 0,
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

describe('searchPublicProducts', () => {
  beforeEach(() => {
    get.mockReset()
  })

  const results: PublicProductResult[] = [
    {
      id: 'prod-1',
      name: 'Cámara Domo 4K',
      imageUrl: '/api/files/img-1',
      categoryName: 'Cámaras IP',
      categorySlug: 'camaras-ip',
    },
    {
      id: 'prod-2',
      name: 'Lector biométrico',
      imageUrl: null,
      categoryName: 'Control de Acceso',
      categorySlug: 'control-de-acceso',
    },
  ]

  it('pide el endpoint público de productos con el término y el límite', async () => {
    get.mockResolvedValue({ data: { data: results } })

    await searchPublicProducts('cámara')

    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/public/products', {
      params: { q: 'cámara', limit: 24 },
    })
  })

  it('desenvuelve el payload doble envuelto y devuelve los resultados completos', async () => {
    get.mockResolvedValue({ data: { data: results } })

    const result = await searchPublicProducts('cámara')

    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual(results)
  })

  it('resuelve también la forma que entrega el interceptor del cliente', async () => {
    get.mockResolvedValue({ data: results })

    await expect(searchPublicProducts('cámara')).resolves.toEqual(results)
  })

  it('devuelve un arreglo vacío cuando la búsqueda no trae productos', async () => {
    get.mockResolvedValue({ data: { data: [] } })

    await expect(searchPublicProducts('xyz-sin-resultados')).resolves.toEqual([])
  })

  const invalidPayloads: [string, unknown][] = [
    ['sin envoltorio y sin arreglo', { status: 'ok' }],
    ['con data nulo', { data: null }],
    ['con doble data nulo', { data: { data: null } }],
    ['con data que no es arreglo', { data: { unexpected: true } }],
  ]

  it.each(invalidPayloads)('devuelve resultados vacíos si el payload es %s', async (_caso: string, payload: unknown) => {
    get.mockResolvedValue(payload)

    await expect(searchPublicProducts('cámara')).resolves.toEqual([])
  })

  it('propaga el error HTTP para que la página pueda ofrecer reintentar', async () => {
    const failure = Object.assign(new Error('Network Error'), {
      response: undefined,
    })
    get.mockRejectedValue(failure)

    await expect(searchPublicProducts('cámara')).rejects.toBe(failure)
  })
})
