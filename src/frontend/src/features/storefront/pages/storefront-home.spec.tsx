import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { MenuCategory } from '../types/categoryMenu'
import { HOME_BRANDS, HOME_SHELVES, brandSearchHref } from '../constants/home-catalog'
import StorefrontHome from './StorefrontHome'

/**
 * As HOM-01's sibling `category-page.spec.tsx` did, the suite asserts what the
 * visitor sees on a server render (`react-dom/server`) of the real page inside
 * a `MemoryRouter`: the slider, the shelves, the brands and the states. Effects
 * do not run on a server render, so the data-driven pieces (tiles with counts,
 * filled shelves) are covered by `home-components.spec.tsx`; here the page shows
 * their loading state. The tree of categories is fed through the session store
 * the page reads.
 */

const retryMock = vi.hoisted(() => vi.fn())
const menuMock = vi.hoisted(() => ({ status: 'ready', categories: [] as MenuCategory[], retry: retryMock }))

// The page reads the session store of `useCategoryMenu`, a module level
// singleton shared by every test of this file, so it is replaced by a fixed
// value to render the three states independently.
vi.mock('../hooks/useCategoryMenu', () => ({ useCategoryMenu: () => menuMock }))

// ---------------------------------------------------------------------------
// Fixture: the shape of the public menu (featured tiles carry the photos)
// ---------------------------------------------------------------------------

function node(
  id: string,
  name: string,
  slug: string,
  options: Partial<MenuCategory> = {},
): MenuCategory {
  return {
    id,
    name,
    slug,
    imageUrl: options.imageUrl ?? null,
    iconUrl: options.iconUrl ?? null,
    isFeatured: options.isFeatured ?? false,
    sortOrder: options.sortOrder ?? 0,
    productCount: options.productCount ?? 0,
    children: options.children ?? [],
  }
}

const videovigilancia = node('r-vv', 'Videovigilancia', 'videovigilancia', {
  sortOrder: 10,
  productCount: 12,
  children: [
    node('c-camaras', 'Cámaras IP', 'camaras-ip', {
      sortOrder: 10,
      children: [
        node('l-domo', 'Domo', 'camaras-ip-domo', { imageUrl: '/images/categories/camaras-ip-domo.svg', isFeatured: true, sortOrder: 20 }),
        node('l-bala', 'Bala', 'camaras-ip-bala', { sortOrder: 10 }),
      ],
    }),
  ],
})

const energia = node('r-energia', 'Energía y Respaldo', 'energia-y-respaldo', {
  sortOrder: 20,
  productCount: 1,
  children: [
    node('l-ups', 'UPS', 'ups', { imageUrl: '/images/categories/ups.jpg', isFeatured: true, sortOrder: 10 }),
  ],
})

/** Flat root from the library import: featured tiles skip it (no children). */
const cablesUtp = node('f-cables', 'Cables UTP', 'cables-utp', { isFeatured: true, productCount: 0 })

const menu: MenuCategory[] = [cablesUtp, videovigilancia, energia]

function renderPage(): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/tienda'] },
      createElement(
        Routes,
        null,
        createElement(Route, { path: '/tienda', element: createElement(StorefrontHome) }),
      ),
    ),
  )
}

/** Number of times a substring shows up in the markup. */
function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

beforeEach(() => {
  menuMock.status = 'ready'
  menuMock.categories = menu
  retryMock.mockReset()
})

describe('slider de la vitrina', () => {
  it('muestra los dos banners de la web anterior', () => {
    const markup = renderPage()

    expect(markup).toContain('src="/images/home/banner-hikvision-distribuidor.png"')
    expect(markup).toContain('src="/images/home/banner-ezviz-nuevas.png"')
    expect(markup).toContain('aria-roledescription="carousel"')
  })

  it('no superpone texto sobre los banners y deja un h1 solo para lectores de pantalla', () => {
    const markup = renderPage()

    expect(markup).not.toContain('Todo para tu seguridad, en un solo lugar')
    expect(markup).not.toContain('bg-gradient-to-r from-black')
    expect(markup).toContain('<h1 class="sr-only">Grupo Security: seguridad electrónica al mejor precio</h1>')
    expect(occurrences(markup, '<h1')).toBe(1)
  })

  it('expone flechas y paginación para navegarlo', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-label="Promoción anterior"')
    expect(markup).toContain('aria-label="Promoción siguiente"')
    expect(markup).toContain('aria-label="Ir a la promoción 2"')
  })

  it('oculta a lectores de pantalla y saca del tab las diapositivas que no se ven', () => {
    const markup = renderPage()

    expect(occurrences(markup, 'aria-hidden="true" tabindex="-1"')).toBe(1)
    expect(markup).toContain('motion-reduce:transition-none')
  })

  it('da a flechas y puntos un área táctil de 44 px', () => {
    const markup = renderPage()

    expect(occurrences(markup, 'h-11 w-11')).toBeGreaterThanOrEqual(2)
    expect(occurrences(markup, 'group flex h-11 w-8')).toBe(2)
  })
})

describe('compra por categoría', () => {
  it('muestra un tile por categoría con productos y el conteo que trae el menú', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-labelledby="home-categorias-title"')
    expect(markup).toContain('Compra por categoría')
    expect(markup).toContain('href="/catalogo/categoria/videovigilancia"')
    expect(markup).toContain('12 productos')
    expect(markup).toContain('1 producto<')
    expect(markup).not.toContain('href="/catalogo/categoria/cables-utp"')
    expect(markup).not.toContain('Cargando categorías')
  })

  it('muestra el esqueleto con la forma de los tiles mientras carga el menú', () => {
    menuMock.status = 'loading'
    menuMock.categories = []

    const markup = renderPage()

    expect(markup).toContain('Cargando categorías')
    expect(occurrences(markup, 'h-12 w-12 shrink-0 animate-pulse')).toBe(8)
    expect(markup).not.toContain('href="/catalogo/categoria/videovigilancia"')
  })

  it('muestra el error con el reintento del hook', () => {
    menuMock.status = 'error'

    const markup = renderPage()

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('No pudimos cargar las categorías')
    expect(markup).toContain('Intentar de nuevo')
    expect(markup).not.toContain('href="/catalogo/categoria/cables-utp"')
  })
})

describe('vitrinas de productos', () => {
  it('muestra las tres vitrinas del catálogo real con su enlace "Ver todo"', () => {
    const markup = renderPage()

    for (const shelf of HOME_SHELVES) {
      expect(markup).toContain(`aria-labelledby="home-shelf-${shelf.slug}"`)
      expect(markup).toContain(shelf.title)
      expect(markup).toContain(`href="/catalogo/categoria/${shelf.slug}"`)
    }
    expect(HOME_SHELVES).toHaveLength(3)
    expect(occurrences(markup, 'Ver todo')).toBe(3)
  })

  it('muestra un esqueleto de cuatro tarjetas por vitrina mientras cargan', () => {
    const markup = renderPage()

    expect(occurrences(markup, 'data-testid="product-skeleton-card"')).toBe(12)
  })

  it('ya no contiene las secciones de demostración con precios ficticios', () => {
    const markup = renderPage()

    expect(markup).not.toContain('Ofertas')
    expect(markup).not.toContain('Novedades')
    expect(markup).not.toContain('Desde $')
  })
})

describe('marcas', () => {
  it('muestra las marcas reales como chips que abren la búsqueda', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-labelledby="home-marcas-title"')
    for (const brand of HOME_BRANDS) {
      expect(markup).toContain(`href="${brandSearchHref(brand)}"`)
      expect(markup).toContain(`>${brand.label}</a>`)
    }
  })
})

describe('soluciones destacadas', () => {
  it('muestra la sección con sus cuatro tarjetas y sus CTA', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-labelledby="home-soluciones-title"')
    expect(markup).toContain('Soluciones destacadas')
    expect(markup).toContain('Videovigilancia corporativa')
    expect(markup).toContain('Control de acceso')
    expect(markup).toContain('Detección de intrusos')
    expect(markup).toContain('Respaldo de energía')
    expect(occurrences(markup, 'Ver solución')).toBe(4)
  })

  it('apunta cada solución a una categoría o búsqueda real, no al catálogo general', () => {
    const markup = renderPage()

    expect(markup).toContain('href="/catalogo/categoria/camaras-turbo"')
    expect(markup).toContain('href="/catalogo/categoria/ups-on-line"')
    expect(markup).toContain('href="/catalogo/categoria/cercos-electricos"')
    expect(markup).toContain('href="/catalogo/buscar?q=cerradura"')
  })

  it('expone los controles anterior/siguiente de la lista', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-label="Ver soluciones anteriores"')
    expect(markup).toContain('aria-label="Ver soluciones siguientes"')
    expect(markup).toContain('aria-label="Lista de soluciones destacadas"')
  })

  it('sigue el orden categorías, vitrinas, marcas y soluciones', () => {
    const markup = renderPage()

    const categorias = markup.indexOf('Compra por categoría')
    const vitrina = markup.indexOf('Videovigilancia</h2>')
    const marcas = markup.indexOf('Marcas que distribuimos')
    const soluciones = markup.indexOf('Soluciones destacadas')

    expect(categorias).toBeGreaterThanOrEqual(0)
    expect(vitrina).toBeGreaterThan(categorias)
    expect(marcas).toBeGreaterThan(vitrina)
    expect(soluciones).toBeGreaterThan(marcas)
  })
})

describe('canales de venta', () => {
  it('muestra la sección de canales con los cuatro títulos', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-labelledby="home-canales-title"')
    expect(markup).toContain('Canales de venta')
    expect(markup).toContain('Venta telefónica')
    expect(markup).toContain('Ventas al por mayor')
  })
})

describe('chrome de la tienda', () => {
  it('se renderiza dentro del chrome y el logo apunta a /tienda', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-label="Grupo Security, inicio"')
    expect(markup).toContain('aria-controls="category-mega-menu"')
    expect(markup).toContain('href="/tienda"')
    expect(markup).toContain('© ')
  })
})
