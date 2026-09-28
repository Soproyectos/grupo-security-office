import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { MenuCategory } from '../types/categoryMenu'
import CatalogIndexPage from './CatalogIndexPage'

/**
 * El repo no tiene entorno DOM ni @testing-library, así que — como hicieron
 * `category-page.spec.tsx` (MENU-05) y `search-results-page.spec.tsx` (HOM-02) —
 * esta suite afirma lo que el visitante ve en un render de servidor
 * (`react-dom/server`) de la página real dentro de un `MemoryRouter`: el markup
 * lleva la migaja de pan, las fichas, los estados y los enlaces, y el árbol de
 * categorías entra por el store de sesión que lee la página. Lo que solo existe
 * en el navegador (el fetch del árbol, el click del botón de reintento) queda
 * fuera de alcance aquí y está cubierto por las specs del store y de los
 * componentes del menú.
 */

const retryMock = vi.hoisted(() => vi.fn())
const menuMock = vi.hoisted(() => ({ status: 'ready', categories: [] as MenuCategory[], retry: retryMock }))

// La página lee el store de sesión de `useCategoryMenu`, un singleton a nivel de
// módulo compartido por todos los tests del archivo, así que se reemplaza por
// un valor fijo para renderizar los tres estados por separado.
vi.mock('../hooks/useCategoryMenu', () => ({ useCategoryMenu: () => menuMock }))

// ---------------------------------------------------------------------------
// Fixture: la misma forma del menú público del spec hermano (MENU-05) — una
// familia con subcategorías, otra familia y una raíz plana de la librería
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
    node('l-domo', 'Domo', 'camaras-ip-domo', {
      imageUrl: '/images/categories/camaras-ip-domo.svg',
      isFeatured: true,
      sortOrder: 20,
    }),
  ],
})

const videovigilancia = node('r-vv', 'Videovigilancia', 'videovigilancia', {
  sortOrder: 10,
  iconUrl: '/images/category-icons/videovigilancia.svg',
  children: [camarasIp],
})

const acceso = node('r-acceso', 'Control de Acceso', 'control-de-acceso', {
  sortOrder: 20,
  children: [node('c-biometricos', 'Biométricos', 'biometricos')],
})

/** Raíz plana que viene de la importación de la librería: sin hijos, `sortOrder` 0. */
const cablesUtp = node('f-cables', 'Cables UTP', 'cables-utp')

const menu: MenuCategory[] = [cablesUtp, videovigilancia, acceso]

function renderPage(): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/catalogo'] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/catalogo',
          element: createElement(CatalogIndexPage),
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

describe('índice del catálogo', () => {
  it('muestra la migaja de pan con Inicio y el catálogo como página actual', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-label="Ruta de navegación"')
    expect(markup).toContain('href="/tienda"')
    // El índice es la raíz del árbol: no hay ancestros que mostrar.
    expect(occurrences(markup, 'aria-current="page"')).toBe(1)
    expect(markup).toMatch(/aria-current="page"[^>]*>Catálogo</)
  })

  /**
   * El punto del índice: la barra lateral del mega menú solo muestra las
   * familias con hijos (`navigableRoots`), así que las 35 raíces planas de la
   * librería se navegan desde aquí. Todas las raíces, planas o no, son destino.
   */
  it('enlaza cada raíz con su página de categoría, incluidas las planas', () => {
    const markup = renderPage()

    expect(markup).toContain('href="/catalogo/categoria/cables-utp"')
    expect(markup).toContain('href="/catalogo/categoria/videovigilancia"')
    expect(markup).toContain('href="/catalogo/categoria/control-de-acceso"')
    // Una ficha por raíz.
    expect(occurrences(markup, 'rounded-full border border-security-500')).toBe(3)
    // Las raíces, no sus subcategorías: el árbol se profundiza en su propia página.
    expect(markup).not.toContain('href="/catalogo/categoria/camaras-ip"')
    expect(markup).not.toContain('href="/catalogo/categoria/biometricos"')
  })

  it('ordena las raíces por sortOrder', () => {
    // El árbol llega como Control de Acceso (20), Videovigilancia (10), Cables UTP (0).
    menuMock.categories = [acceso, videovigilancia, cablesUtp]

    const markup = renderPage()

    const cables = markup.indexOf('cables-utp')
    const videovigilanciaLink = markup.indexOf('catalogo/categoria/videovigilancia')
    const accesoLink = markup.indexOf('catalogo/categoria/control-de-acceso')

    expect(cables).toBeLessThan(videovigilanciaLink)
    expect(videovigilanciaLink).toBeLessThan(accesoLink)
  })

  it('pinta el título de la página y el encabezado de todas las categorías', () => {
    const markup = renderPage()

    expect(markup).toContain('<h1 class="mt-4 text-page-title font-bold text-ink-900">Catálogo</h1>')
    expect(markup).toContain('aria-labelledby="catalogo-todas-categorias"')
    expect(markup).toContain('Todas las categorías')
  })

  it('se renderiza dentro del chrome de la tienda', () => {
    const markup = renderPage()

    // Header (logo, disparador del mega menú) y footer de StorefrontChrome.
    expect(markup).toContain('aria-label="Grupo Security, inicio"')
    expect(markup).toContain('aria-controls="category-mega-menu"')
    expect(markup).toContain('© ')
  })
})

describe('estado de carga', () => {
  it('muestra el esqueleto mientras carga el árbol', () => {
    menuMock.status = 'loading'
    const markup = renderPage()

    expect(markup).toContain('role="status"')
    expect(markup).toContain('Cargando catálogo')
    expect(occurrences(markup, 'animate-pulse')).toBeGreaterThan(0)
    // El esqueleto mantiene la forma de la página: círculos donde van las fichas.
    expect(occurrences(markup, 'rounded-full bg-surface-200')).toBe(6)
    // ...y aún no hay contenido real.
    expect(markup).not.toContain('aria-labelledby="catalogo-todas-categorias"')
    expect(markup).not.toContain('href="/catalogo/categoria/')
  })

  it('no deja un esqueleto en el DOM cuando el árbol está listo', () => {
    expect(renderPage()).not.toContain('role="status"')
  })
})

describe('estado vacío', () => {
  it('avisa que la biblioteca todavía no tiene categorías', () => {
    menuMock.categories = []
    const markup = renderPage()

    expect(markup).toContain('El catálogo todavía no tiene categorías')
    expect(markup).toContain('<h1 class="mt-4 text-page-title font-bold text-ink-900">Catálogo</h1>')
    // Sin categorías no hay nada que enlistar ni enlaces de categoría.
    expect(markup).not.toContain('aria-labelledby="catalogo-todas-categorias"')
    expect(markup).not.toContain('href="/catalogo/categoria/')
  })
})

describe('error de carga', () => {
  it('muestra el mensaje y el botón de reintentar', () => {
    menuMock.status = 'error'
    const markup = renderPage()

    expect(markup).toContain('No pudimos cargar el catálogo')
    expect(markup).toContain('Revisa tu conexión')
    // El botón existe y su texto es el del resto de bloques de error de la tienda.
    // `renderToStaticMarkup` no ejecuta manejadores, así que el `onClick` (el
    // `retry` del store de sesión) no se puede disparar aquí: lo que se fija es
    // que el control está en el markup, y el reintento del store tiene su propia
    // spec (`useCategoryMenu`).
    expect(markup).toContain('Intentar de nuevo')
    expect(markup).toContain('type="button"')
    expect(markup).not.toContain('aria-labelledby="catalogo-todas-categorias"')
    expect(markup).not.toContain('role="status"')
  })
})
