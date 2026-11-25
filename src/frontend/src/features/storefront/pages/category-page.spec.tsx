import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { MenuCategory } from '../types/categoryMenu'
import type { PublicProductFilters, PublicProductResult } from '../types/publicProduct'
import CategoryPage from './CategoryPage'

/**
 * The repo has no DOM environment and no @testing-library, so — as MENU-04 did
 * with `mega-menu.spec.tsx` — the suite asserts what the visitor sees on a
 * server render (`react-dom/server`) of the real page inside a `MemoryRouter`:
 * the markup carries the breadcrumb, the tiles, the states and the links, and
 * the tree of categories is fed through the session store the page reads. What
 * only exists in a browser (the fetch of the tree, the Escape/focus handling of
 * the header menu) is out of reach here and is covered by the store and
 * component specs of MENU-03/MENU-04.
 */

const retryMock = vi.hoisted(() => vi.fn())
const menuMock = vi.hoisted(() => ({ status: 'ready', categories: [] as MenuCategory[], retry: retryMock }))

// The page reads the session store of `useCategoryMenu`, a module level
// singleton shared by every test of this file, so it is replaced by a fixed
// value to render the three states independently.
const productsMock = vi.hoisted(() => ({
  status: 'ready',
  items: [] as PublicProductResult[],
  total: 0,
  hasMore: false,
  loadingMore: false,
  loadMoreError: false,
  loadMore: vi.fn(),
  retry: vi.fn(),
  filters: {} as PublicProductFilters,
  paged: { filters: {} as PublicProductFilters, page: 1, pageSize: 20 },
}))

vi.mock('../hooks/usePublicProductListing', () => ({
  usePublicProductListing: (filters: { category?: string; subcategory?: string; brand?: string }) => {
    productsMock.filters = filters
    return productsMock
  },
}))

vi.mock('../hooks/usePublicProductPage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../hooks/usePublicProductPage')>(),
  usePublicProductPage: (filters: PublicProductFilters, page: number, pageSize: number) => {
    productsMock.paged = { filters, page, pageSize }
    const ready = productsMock.status === 'ready'
    return {
      data: ready ? { items: productsMock.items, total: productsMock.total } : undefined,
      isPending: productsMock.status === 'loading',
      isSuccess: ready,
      isError: productsMock.status === 'error',
      refetch: productsMock.retry,
    }
  },
}))

vi.mock('../hooks/useCategoryMenu', () => ({ useCategoryMenu: () => menuMock }))

// ---------------------------------------------------------------------------
// Fixture: the shape of the public menu (families, level 2, level 3, flat roots)
// ---------------------------------------------------------------------------

function node(
  id: string,
  name: string,
  slug: string,
  options: Partial<MenuCategory> = {},
): MenuCategory {
  return {
    id,
    ...(options.subcategoryId ? { subcategoryId: options.subcategoryId } : {}),
    ...(options.subcategorySlug ? { subcategorySlug: options.subcategorySlug } : {}),
    name,
    slug,
    imageUrl: options.imageUrl ?? null,
    iconUrl: options.iconUrl ?? null,
    isFeatured: options.isFeatured ?? false,
    sortOrder: options.sortOrder ?? 0,
    productCount: options.productCount ?? 1,
    children: options.children ?? [],
  }
}

const camarasIp = node('c-camaras', 'Cámaras IP', 'camaras-ip', {
  sortOrder: 10,
  children: [
    node('l-domo', 'Domo', 'camaras-ip-domo', { imageUrl: '/images/categories/camaras-ip-domo.svg', isFeatured: true, sortOrder: 20 }),
    node('l-bala', 'Bala', 'camaras-ip-bala', { sortOrder: 10, iconUrl: '/images/category-icons/bala.svg' }),
    node('l-ptz', 'PTZ', 'camaras-ip-ptz', { sortOrder: 30 }),
  ],
})

const grabadores = node('c-grabadores', 'Grabadores', 'grabadores', { sortOrder: 20 })

const videovigilancia = node('r-vv', 'Videovigilancia', 'videovigilancia', {
  sortOrder: 10,
  iconUrl: '/images/category-icons/videovigilancia.svg',
  children: [camarasIp, grabadores],
})

const acceso = node('r-acceso', 'Control de Acceso', 'control-de-acceso', {
  sortOrder: 20,
  children: [node('c-biometricos', 'Biométricos', 'biometricos')],
})

/** Flat root coming from the library import: no children, `sortOrder` 0. */
const cablesUtp = node('f-cables', 'Cables UTP', 'cables-utp')

const menu: MenuCategory[] = [cablesUtp, videovigilancia, acceso]

function renderPage(slug: string, query = ''): string {
  const route = createElement(
      MemoryRouter,
      { initialEntries: [`/catalogo/categoria/${slug}${query}`] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/catalogo/categoria/:slug',
          element: createElement(CategoryPage),
        }),
      ),
  )
  const client = new QueryClient()
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, route))
}

/** Number of times a substring shows up in the markup. */
function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

const product: PublicProductResult = {
  id: 'prod-1',
  sku: 'DS-2CD2143',
  name: 'Cámara Domo 4K',
  imageUrl: null,
  categoryName: 'Cámaras IP',
  categorySlug: 'camaras-ip',
  brandName: 'Hikvision',
  isInformational: false,
  price: { value: 118258.8, currency: 'COP' },
}

beforeEach(() => {
  productsMock.status = 'ready'
  productsMock.items = []
  productsMock.total = 0
  productsMock.hasMore = false
  menuMock.status = 'ready'
  menuMock.categories = menu
  retryMock.mockReset()
})

describe('búsqueda de la categoría por slug', () => {
  it('mantiene accesible por URL directa una categoría vacía y ofrece contacto', () => {
    const emptyCategory = node('empty-child', 'Cámaras especiales', 'camaras-especiales', { productCount: 0 })
    menuMock.categories = [node('cameras', 'Cámaras', 'camaras', { productCount: 0, children: [emptyCategory] })]

    const markup = renderPage('camaras-especiales')

    expect(markup).toContain('<h1 class="mt-4 lg:mt-0 text-page-title font-bold text-ink-900 whitespace-nowrap lg:truncate">Cámaras especiales</h1>')
    expect(markup).toContain('Aún no hay productos en esta categoría')
    expect(markup).toContain('href="/servicios/soporte"')
  })

  it('conserva subcategoría, marca y varios requisitos al leer la URL de Cámaras', () => {
    const cameraRoot = node('root-camera', 'Cámaras', 'camaras', {
      productCount: 2,
      children: [
        node('ip', 'Cámaras IP y Wi-Fi', 'legacy-ip-row', { productCount: 1, subcategoryId: 'sub-ip', subcategorySlug: 'camaras-ip-wifi' }),
        node('analog', 'Cámaras analógicas', 'camaras-analogicas', { productCount: 1, subcategoryId: 'sub-analog' }),
        node('special', 'Cámaras especiales y para vehículos', 'camaras-especiales-vehiculos', { productCount: 1, subcategoryId: 'sub-special' }),
        node('accessories', 'Soportes y accesorios', 'soportes-accesorios', { productCount: 8, subcategoryId: 'sub-accessories' }),
      ],
    })
    menuMock.categories = [cameraRoot]

    const markup = renderPage('camaras', '?tipo=camaras-ip-wifi&brand=hikvision&keySpec=resolution%3A4k&requirement=protocolo%3AHTTP&requirement=protocolo%3AHTTPS')

    expect(markup).toContain('>Cámaras IP y Wi-Fi</h1>')
    expect(markup).toContain('href="/catalogo/categoria/camaras"')
    expect(markup).not.toContain('id="camera-family-filter"')
    expect(markup).not.toContain('id="categoria-subcategorias"')
    expect(productsMock.paged).toEqual({
      filters: { category: 'camaras', subcategory: 'camaras-ip-wifi', brand: 'hikvision', q: undefined, keySpec: [], requirement: ['protocolo:HTTP', 'protocolo:HTTPS'] },
      page: 1,
      pageSize: 20,
    })

    expect(renderPage('camaras', '?tipo=soportes-accesorios')).toContain('>Soportes y accesorios</h1>')
  })

  /** A root is found and the breadcrumb has no family above it. */
  it('responde por una raíz sin familia en la migaja de pan', () => {
    const markup = renderPage('videovigilancia')

    expect(markup).toContain('<h1 class="mt-4 lg:mt-0 text-page-title font-bold text-ink-900 whitespace-nowrap lg:truncate">Videovigilancia</h1>')
    expect(occurrences(markup, 'aria-current="page"')).toBe(1)
    // Nothing between Catálogo and the category itself.
    expect(occurrences(markup, 'href="/catalogo/categoria/')).toBe(2)
  })

  /**
   * The mega menu links level-2 headers and level-3 leaves, so the lookup has to
   * walk the whole tree: a roots-only search would answer "no encontrada" for
   * most of the links of the menu.
   */
  it('responde por una categoría de nivel 3 con su cadena de ancestros', () => {
    const markup = renderPage('camaras-ip-domo')

    expect(markup).toContain('<h1 class="mt-4 lg:mt-0 text-page-title font-bold text-ink-900 whitespace-nowrap lg:truncate">Domo</h1>')
    expect(markup).toContain('href="/catalogo/categoria/videovigilancia"')
    expect(markup).toContain('href="/catalogo/categoria/camaras-ip"')
    expect(markup).toContain('Videovigilancia')
    expect(markup).toContain('Cámaras IP')
  })

  it('no encuentra un slug que no existe en ningún nivel', () => {
    const markup = renderPage('categoria-borrada')

    expect(markup).toContain('Categoría no encontrada')
  })

  it('no encuentra nada cuando el árbol llegó vacío', () => {
    menuMock.categories = []

    expect(renderPage('videovigilancia')).toContain('Categoría no encontrada')
  })

  /**
   * The endpoint caps the tree at 3 levels. The search stops at the same depth,
   * so a payload deeper than the contract cannot produce a landing page.
   */
  it('respeta el tope de profundidad del contrato del endpoint', () => {
    menuMock.categories = [
      node('d-1', 'Nivel 1', 'nivel-1', {
        children: [
          node('d-2', 'Nivel 2', 'nivel-2', {
            children: [node('d-3', 'Nivel 3', 'nivel-3', { children: [node('d-4', 'Nivel 4', 'nivel-4')] })],
          }),
        ],
      }),
    ]

    expect(renderPage('nivel-3')).toContain('>Nivel 3</h1>')
    expect(renderPage('nivel-4')).toContain('Categoría no encontrada')
  })
})

describe('categoría conocida', () => {
  it('muestra la migaja de pan con la familia y la categoría', () => {
    const markup = renderPage('camaras-ip')

    expect(markup).toContain('aria-label="Ruta de navegación"')
    expect(markup).toContain('href="/tienda"')
    expect(markup).toContain('href="/catalogo"')
    expect(markup).toContain('href="/catalogo/categoria/videovigilancia"')
    expect(markup).toContain('Videovigilancia')
    expect(markup).toContain('Cámaras IP')
    expect(occurrences(markup, 'aria-current="page"')).toBe(1)
  })

  it('usa el nombre de la categoría como título de la página', () => {
    const markup = renderPage('camaras-ip')

    expect(markup).toContain('<h1 class="mt-4 lg:mt-0 text-page-title font-bold text-ink-900 whitespace-nowrap lg:truncate">Cámaras IP</h1>')
  })

  it('enlaza cada subcategoría con su página de categoría', () => {
    const markup = renderPage('videovigilancia')

    expect(markup).toContain('href="/catalogo/categoria/camaras-ip"')
    expect(markup).toContain('href="/catalogo/categoria/grabadores"')
    expect(occurrences(markup, 'rounded-full border border-security-500')).toBe(2)
    // The children of the page, not the ones of the level-2 page.
    expect(markup).not.toContain('href="/catalogo/categoria/camaras-ip-domo"')
  })

  it('ordena las subcategorías de una familia por sortOrder', () => {
    menuMock.categories = [node('test-root', 'Familia', 'familia', { children: camarasIp.children })]
    const markup = renderPage('familia')

    const domo = markup.indexOf('camaras-ip-domo')
    const bala = markup.indexOf('camaras-ip-bala')
    const ptz = markup.indexOf('camaras-ip-ptz')

    // The tree arrives as Domo (20), Bala (10), PTZ (30).
    expect(bala).toBeLessThan(domo)
    expect(domo).toBeLessThan(ptz)
  })

  it('pinta la portada del hijo y el icono de trazo como máscara del texto', () => {
    menuMock.categories = [node('test-root', 'Familia', 'familia', { children: camarasIp.children })]
    const markup = renderPage('familia')

    expect(markup).toContain('src="/images/categories/camaras-ip-domo.svg"')
    expect(markup).toContain('text-security-500')
    expect(markup).toMatch(/mask-image:url\((&quot;|')?\/images\/category-icons\/bala\.svg/)
    // PTZ has neither cover nor icon: the circle keeps a neutral placeholder.
    expect(occurrences(markup, 'bg-surface-100 text-ink-500"><svg')).toBe(1)
  })

  it('muestra la grilla de productos con su precio y el conteo', () => {
    productsMock.items = [product]
    productsMock.total = 30
    const markup = renderPage('camaras-ip')

    expect(markup).toContain('aria-labelledby="categoria-productos"')
    expect(markup).toContain('Cámara Domo 4K')
    expect(markup).toContain('$ 118.259')
    expect(markup).toContain('30 productos</p>')
    expect(markup).not.toContain('Productos próximamente')
  })

  it('pagina y busca dentro de la misma subcategoría', () => {
    productsMock.items = [product]
    productsMock.total = 85
    const markup = renderPage('camaras-ip', '?page=2&limit=40&q=domo&brand=hikvision')

    expect(markup).toContain('Página 2 de 3')
    expect(markup).toContain('Buscar en esta categoría')
    expect(markup).toContain('Paginación superior')
    expect(markup).not.toContain('id="categoria-subcategorias"')
    expect(productsMock.paged).toMatchObject({
      filters: { category: 'camaras-ip', q: 'domo', brand: 'hikvision' },
      page: 2,
      pageSize: 40,
    })
  })

  it('muestra el esqueleto mientras cargan los productos', () => {
    productsMock.status = 'loading'
    productsMock.items = []

    const markup = renderPage('camaras-ip')

    expect(markup).toContain('Cargando productos')
    expect(markup).not.toContain('Cámara Domo 4K')
  })

  it('muestra el estado vacío solo cuando el total es cero', () => {
    productsMock.items = []
    productsMock.total = 0

    const markup = renderPage('camaras-ip')

    expect(markup).toContain('Aún no hay productos en esta categoría')
  })

  it('ofrece reintentar cuando fallan los productos, sin tumbar la página', () => {
    productsMock.status = 'error'
    productsMock.items = []

    const markup = renderPage('camaras-ip')

    expect(markup).toContain('No pudimos cargar los productos')
    expect(markup).toContain('>Cámaras IP</h1>')
  })

  it('no imprime avisos ni sección cuando la categoría no tiene subcategorías', () => {
    const markup = renderPage('grabadores')

    expect(markup).not.toContain('subcategorías')
    expect(markup).not.toContain('aria-labelledby="categoria-subcategorias"')
  })

  /** A flat root from the library import is a valid destination too. */
  it('responde por una categoría plana, sin familia', () => {
    const markup = renderPage('cables-utp')

    expect(markup).toContain('<h1 class="mt-4 lg:mt-0 text-page-title font-bold text-ink-900 whitespace-nowrap lg:truncate">Cables UTP</h1>')
    // No family in the trail: the breadcrumb stops at Catálogo.
    expect(markup).toContain('Catálogo')
    expect(markup).not.toContain('aria-labelledby="categoria-subcategorias"')
    expect(markup).not.toContain('todavía no tiene subcategorías')
  })

  it('se renderiza dentro del chrome de la tienda', () => {
    const markup = renderPage('videovigilancia')

    // Header (logo, trigger of the mega menu) and footer of StorefrontChrome.
    expect(markup).toContain('aria-label="Grupo Security, inicio"')
    expect(markup).toContain('aria-controls="category-mega-menu"')
    expect(markup).toContain('© ')
  })
})

describe('categoría desconocida y error', () => {
  it('responde 404 con el mensaje y el regreso al catálogo', () => {
    const markup = renderPage('categoria-borrada')

    expect(markup).toContain('Categoría no encontrada')
    expect(markup).toContain('categoria-borrada')
    expect(markup).toContain('Volver al catálogo')
    expect(markup).toContain('href="/catalogo"')
    expect(occurrences(markup, 'href="/catalogo"')).toBe(1)
    expect(markup).not.toContain('Productos próximamente')
  })

  it('permite reintentar la carga del árbol de categorías', () => {
    menuMock.status = 'error'
    const markup = renderPage('videovigilancia')

    expect(markup).toContain('No pudimos cargar la categoría')
    expect(markup).toContain('Intentar de nuevo')
    expect(markup).not.toContain('Categoría no encontrada')
    expect(markup).not.toContain('aria-labelledby="categoria-subcategorias"')
  })

  it('no deja un esqueleto en el DOM cuando el árbol y los productos están listos', () => {
    productsMock.items = [product]
    productsMock.total = 1
    const markup = renderPage('videovigilancia')
    expect(markup).not.toContain('Cargando productos')
    expect(markup).toContain('1 producto</p>')
  })
})

describe('estado de carga', () => {
  it('muestra el esqueleto mientras carga el árbol', () => {
    menuMock.status = 'loading'
    const markup = renderPage('videovigilancia')

    expect(markup).toContain('role="status"')
    expect(markup).toContain('Cargando categoría')
    expect(occurrences(markup, 'animate-pulse')).toBeGreaterThan(0)
    // The skeleton keeps the shape of the page: circles where the tiles go.
    expect(occurrences(markup, 'rounded-full bg-surface-200')).toBe(6)
    // ...and no real content yet.
    expect(markup).not.toContain('aria-labelledby="categoria-subcategorias"')
    expect(markup).not.toContain('Productos próximamente')
    expect(markup).not.toContain('Categoría no encontrada')
  })
})
