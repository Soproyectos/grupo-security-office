import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { MenuCategory } from '../types/categoryMenu'
import StorefrontHome from './StorefrontHome'

/**
 * As HOM-01's sibling `category-page.spec.tsx` did, the suite asserts what the
 * visitor sees on a server render (`react-dom/server`) of the real page inside
 * a `MemoryRouter`: the hero, the category tiles, the demo sections and the
 * states. The tree of categories is fed through the session store the page
 * reads, and the fetch itself is out of reach here (no DOM environment).
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
    children: options.children ?? [],
  }
}

const videovigilancia = node('r-vv', 'Videovigilancia', 'videovigilancia', {
  sortOrder: 10,
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
  children: [
    node('l-ups', 'UPS', 'ups', { imageUrl: '/images/categories/ups.jpg', isFeatured: true, sortOrder: 10 }),
  ],
})

/** Flat root from the library import: featured tiles skip it (no children). */
const cablesUtp = node('f-cables', 'Cables UTP', 'cables-utp', { isFeatured: true })

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

describe('hero de la vitrina', () => {
  it('muestra el banner y la copy principal', () => {
    const markup = renderPage()

    expect(markup).toContain('src="/images/home/hero-vitrina.svg"')
    expect(markup).toContain('aria-labelledby="home-hero-title"')
    expect(markup).toContain('Todo para tu seguridad, en un solo lugar')
  })

  it('apunta el CTA al catálogo', () => {
    const markup = renderPage()

    expect(markup).toContain('Ver catálogo')
    expect(markup).toContain('href="/catalogo"')
  })
})

describe('tiles de categoría', () => {
  it('pinta un tile por familia con su foto real del payload', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-labelledby="home-categorias-title"')
    expect(markup).toContain('href="/catalogo/categoria/camaras-ip-domo"')
    expect(markup).toContain('href="/catalogo/categoria/ups"')
    expect(markup).toContain('src="/images/categories/camaras-ip-domo.svg"')
    expect(markup).toContain('src="/images/categories/ups.jpg"')
    // The flat root has no children: featuredTiles skips it.
    expect(markup).not.toContain('href="/catalogo/categoria/cables-utp"')
  })

  it('no deja tiles en el DOM cuando el árbol llegó vacío', () => {
    menuMock.categories = []

    const markup = renderPage()

    expect(markup).toContain('Aún no hay categorías destacadas para mostrar.')
    expect(markup).not.toContain('href="/catalogo/categoria/')
  })
})

describe('secciones temáticas', () => {
  it('muestra las tres secciones de demo', () => {
    const markup = renderPage()

    expect(markup).toContain('Marcas destacadas')
    expect(markup).toContain('Ofertas')
    expect(markup).toContain('Novedades')
  })

  it('enlaza cada tarjeta de demo al catálogo', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-labelledby="home-marcas-title"')
    expect(markup).toContain('aria-labelledby="home-ofertas-title"')
    expect(markup).toContain('aria-labelledby="home-novedades-title"')
    // 1 hero CTA + 10 demo cards.
    expect(occurrences(markup, 'href="/catalogo"')).toBe(11)
    // The ofertas cards carry a demo price.
    expect(markup).toContain('Desde $899.900')
  })

  it('no deja un precio en las secciones que no llevan precio', () => {
    const markup = renderPage()

    // The demo prices live only in the ofertas section.
    expect(occurrences(markup, 'Desde $')).toBe(3)
  })
})

describe('estados del menú', () => {
  it('muestra el esqueleto mientras carga el árbol', () => {
    menuMock.status = 'loading'

    const markup = renderPage()

    expect(markup).toContain('role="status"')
    expect(markup).toContain('Cargando categorías')
    expect(occurrences(markup, 'animate-pulse')).toBeGreaterThan(0)
    // The skeleton keeps the shape of the row: 12 circles where the tiles go.
    expect(occurrences(markup, 'rounded-full bg-surface-200')).toBe(12)
    expect(markup).not.toContain('href="/catalogo/categoria/')
  })

  it('muestra el error con el reintento del hook', () => {
    menuMock.status = 'error'

    const markup = renderPage()

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('No pudimos cargar las categorías')
    expect(markup).toContain('Intentar de nuevo')
    expect(markup).not.toContain('href="/catalogo/categoria/')
  })

  it('no deja esqueleto ni error cuando el árbol está listo', () => {
    const markup = renderPage()

    expect(markup).not.toContain('role="status"')
    expect(markup).not.toContain('role="alert"')
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
