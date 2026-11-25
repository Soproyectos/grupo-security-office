import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuCategory } from '../features/storefront/types/categoryMenu'
import type { PublicProductResult } from '../features/storefront/types/publicProduct'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('./api', () => ({ default: { get } }))

import { fetchCategoryMenu, fetchPublicKeySpecFacets, fetchPublicProducts, fetchPublicRequirements } from './public-catalog.service'

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
      isInformational: false,
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
      isInformational: false,
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

  it('envía subcategoría persistida junto con su categoría padre', async () => {
    get.mockResolvedValue({ data: { data: results, meta } })

    await fetchPublicProducts({ category: 'camaras', subcategory: 'camaras-ip-wifi' })

    expect(get).toHaveBeenCalledWith('/public/products', {
      params: { category: 'camaras', subcategory: 'camaras-ip-wifi', offset: 0, limit: 24 },
    })
  })

  it('envía la selección de referencias exactas en una sola consulta de la categoría', async () => {
    get.mockResolvedValue({ data: { data: results, meta } })

    await fetchPublicProducts({ category: 'camaras', sku: ['CAM (2.8mm)/LA', 'CAM+02'] }, 0, 2)

    expect(get).toHaveBeenCalledTimes(1)
    const query = new URL(get.mock.calls[0]?.[0], 'https://tienda.example').searchParams
    expect(query.get('category')).toBe('camaras')
    expect(query.get('limit')).toBe('2')
    expect(query.getAll('sku')).toEqual(['CAM (2.8mm)/LA', 'CAM+02'])
  })

  it('envía cada faceta keySpec repetida como parámetro de URL', async () => {
    get.mockResolvedValue({ data: { data: results, meta } })

    await fetchPublicProducts({ category: 'camaras', subcategory: 'camaras-ip-wifi', keySpec: ['resolution:4k', 'color:black'] })

    expect(get).toHaveBeenCalledWith('/public/products?offset=0&limit=24&category=camaras&subcategory=camaras-ip-wifi&keySpec=resolution%3A4k&keySpec=color%3Ablack')
  })

  it('pide las facetas públicas para la subcategoría seleccionada', async () => {
    const facets = { subcategoryId: 'sub-ip', products: 2, facets: [{ specKey: 'resolution', label: 'Resolución', dataType: 'ENUM', unit: null, values: [{ value: '4k', label: '4K', count: 2 }] }] }
    get.mockResolvedValue({ data: { data: facets } })

    await expect(fetchPublicKeySpecFacets('sub-ip')).resolves.toEqual(facets)
    expect(get).toHaveBeenCalledWith('/public/catalog/key-spec-facets', { params: { subcategoryId: 'sub-ip' } })
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

describe('fetchPublicKeySpecFacets (forma inválida)', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it.each([
    ['facets no es arreglo', { data: { facets: 'x' } }],
    ['faceta sin values', { data: { facets: [{ specKey: 'color' }] } }],
    ['payload sin facets', { data: { foo: 1 } }],
  ])('devuelve el respaldo vacío si %s', async (_caso: string, payload: unknown) => {
    get.mockResolvedValue(payload)

    await expect(fetchPublicKeySpecFacets('sub-ip')).resolves.toEqual({ subcategoryId: 'sub-ip', products: 0, facets: [] })
  })

  it('normaliza products no numérico a 0', async () => {
    get.mockResolvedValue({ data: { subcategoryId: 'sub-ip', products: 'many', facets: [] } })

    await expect(fetchPublicKeySpecFacets('sub-ip')).resolves.toMatchObject({ products: 0, facets: [] })
  })
})

describe('fetchPublicRequirements', () => {
  const facet = { specKey: 'protocolo', label: 'Protocolo', dataType: 'ENUM', unit: null, values: [{ value: 'TCP', label: 'TCP', count: 3 }] }

  beforeEach(() => {
    get.mockReset()
  })

  it('envía categoría, subcategoría, búsqueda, marca, keySpec y requirement en la query exacta', async () => {
    get.mockResolvedValue({ data: { facets: [], products: 0 } })

    await fetchPublicRequirements('camaras', 'camaras-ip-wifi', {
      q: 'panel',
      brand: 'ajax',
      keySpec: ['resolution:4k', 'color:black'],
      requirement: ['zonas:16', 'protocolo:TCP'],
    })

    expect(get).toHaveBeenCalledWith(
      '/public/catalog/requirements?category=camaras&subcategory=camaras-ip-wifi&q=panel&brand=ajax&keySpec=resolution%3A4k&keySpec=color%3Ablack&requirement=zonas%3A16&requirement=protocolo%3ATCP',
    )
  })

  const body = { products: 2, facets: [facet] }

  it.each([
    ['doble envoltorio', { data: { data: body } }],
    ['envoltorio simple', { data: body }],
    ['objeto plano', body],
  ])('desenvuelve la respuesta con %s', async (_caso: string, responseData: unknown) => {
    get.mockResolvedValue({ data: responseData })

    await expect(fetchPublicRequirements('camaras')).resolves.toEqual({ products: 2, facets: [facet], truncated: undefined })
  })

  it('conserva truncated cuando el servidor lo envía', async () => {
    get.mockResolvedValue({ data: { products: 2, facets: [facet], truncated: true } })

    await expect(fetchPublicRequirements('camaras')).resolves.toMatchObject({ truncated: true })
  })

  it('normaliza products ausente a 0', async () => {
    get.mockResolvedValue({ data: { facets: [facet] } })

    await expect(fetchPublicRequirements('camaras')).resolves.toMatchObject({ products: 0, facets: [facet] })
  })

  it.each([
    ['data con forma inválida', { data: { foo: 1 } }],
    ['facets no es arreglo', { data: { facets: 'x', products: 1 } }],
    ['faceta sin values', { data: { facets: [{ specKey: 'protocolo' }], products: 1 } }],
  ])('rechaza si %s', async (_caso: string, payload: unknown) => {
    get.mockResolvedValue(payload)

    await expect(fetchPublicRequirements('camaras')).rejects.toThrow('No se pudieron leer los requisitos de esta categoría')
  })

  it('propaga el error HTTP de la API', async () => {
    const failure = Object.assign(new Error('Request failed with status code 400'), { response: { status: 400 } })
    get.mockRejectedValue(failure)

    await expect(fetchPublicRequirements('camaras')).rejects.toBe(failure)
  })
})
