import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { MenuCategory } from '../types/categoryMenu'
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
    name,
    slug,
    imageUrl: options.imageUrl ?? null,
    iconUrl: options.iconUrl ?? null,
    isFeatured: options.isFeatured ?? false,
    sortOrder: options.sortOrder ?? 0,
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

function renderPage(slug: string): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [`/catalogo/categoria/${slug}`] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/catalogo/categoria/:slug',
          element: createElement(CategoryPage),
        }),
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

describe('búsqueda de la categoría por slug', () => {
  /** A root is found and the breadcrumb has no family above it. */
  it('responde por una raíz sin familia en la migaja de pan', () => {
    const markup = renderPage('videovigilancia')

    expect(markup).toContain('<h1 class="mt-4 text-page-title font-bold text-ink-900">Videovigilancia</h1>')
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

    expect(markup).toContain('<h1 class="mt-4 text-page-title font-bold text-ink-900">Domo</h1>')
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
    expect(markup).toContain('href="/"')
    expect(markup).toContain('href="/catalogo"')
    expect(markup).toContain('href="/catalogo/categoria/videovigilancia"')
    expect(markup).toContain('Videovigilancia')
    expect(markup).toContain('Cámaras IP')
    expect(occurrences(markup, 'aria-current="page"')).toBe(1)
  })

  it('usa el nombre de la categoría como título de la página', () => {
    const markup = renderPage('camaras-ip')

    expect(markup).toContain('<h1 class="mt-4 text-page-title font-bold text-ink-900">Cámaras IP</h1>')
  })

  it('enlaza cada subcategoría con su página de categoría', () => {
    const markup = renderPage('videovigilancia')

    expect(markup).toContain('href="/catalogo/categoria/camaras-ip"')
    expect(markup).toContain('href="/catalogo/categoria/grabadores"')
    expect(occurrences(markup, 'rounded-full border border-security-500')).toBe(2)
    // The children of the page, not the ones of the level-2 page.
    expect(markup).not.toContain('href="/catalogo/categoria/camaras-ip-domo"')
  })

  it('ordena las subcategorías por sortOrder', () => {
    const markup = renderPage('camaras-ip')

    const domo = markup.indexOf('camaras-ip-domo')
    const bala = markup.indexOf('camaras-ip-bala')
    const ptz = markup.indexOf('camaras-ip-ptz')

    // The tree arrives as Domo (20), Bala (10), PTZ (30).
    expect(bala).toBeLessThan(domo)
    expect(domo).toBeLessThan(ptz)
  })

  it('pinta la portada del hijo y el icono de trazo como máscara del texto', () => {
    const markup = renderPage('camaras-ip')

    expect(markup).toContain('src="/images/categories/camaras-ip-domo.svg"')
    expect(markup).toContain('text-security-500')
    expect(markup).toMatch(/mask-image:url\((&quot;|')?\/images\/category-icons\/bala\.svg/)
    // PTZ has neither cover nor icon: the circle keeps a neutral placeholder.
    expect(occurrences(markup, 'bg-surface-100')).toBe(1)
  })

  it('anuncia que los productos de la categoría están por llegar', () => {
    const markup = renderPage('camaras-ip')

    expect(markup).toContain('Productos próximamente')
    expect(markup).toContain('Estamos preparando el inventario de esta categoría')
  })

  it('avisa cuando la categoría no tiene subcategorías', () => {
    const markup = renderPage('grabadores')

    expect(markup).toContain('todavía no tiene subcategorías')
    expect(markup).toContain('Productos próximamente')
    expect(markup).not.toContain('aria-labelledby="categoria-subcategorias"')
  })

  /** A flat root from the library import is a valid destination too. */
  it('responde por una categoría plana, sin familia', () => {
    const markup = renderPage('cables-utp')

    expect(markup).toContain('<h1 class="mt-4 text-page-title font-bold text-ink-900">Cables UTP</h1>')
    // No family in the trail: the breadcrumb stops at Catálogo.
    expect(markup).toContain('Catálogo')
    expect(markup).not.toContain('aria-labelledby="categoria-subcategorias"')
    expect(markup).toContain('todavía no tiene subcategorías')
    expect(markup).toContain('Productos próximamente')
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

  it('muestra el mismo bloque cuando el árbol no se pudo cargar', () => {
    menuMock.status = 'error'
    const markup = renderPage('videovigilancia')

    expect(markup).toContain('Categoría no encontrada')
    expect(markup).toContain('Volver al catálogo')
    expect(markup).not.toContain('aria-labelledby="categoria-subcategorias"')
  })

  it('no deja un esqueleto en el DOM cuando el árbol está listo', () => {
    expect(renderPage('videovigilancia')).not.toContain('role="status"')
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
