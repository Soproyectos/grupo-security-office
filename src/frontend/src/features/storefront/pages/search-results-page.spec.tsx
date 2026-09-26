import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { PublicProductResult } from '../types/publicProduct'
import SearchResultsPage from './SearchResultsPage'

/**
 * The repo has no DOM environment and no @testing-library, so — as
 * `category-page.spec.tsx` did — the suite asserts what the visitor sees on a
 * server render (`react-dom/server`) of the real page inside a `MemoryRouter`:
 * the markup carries the results grid, the states and the links, and the hook
 * is fed through a fixed value. What only exists in a browser (the submit
 * event of the header form, the fetch of the results) is out of reach here and
 * is covered by the store and service specs of HOM-02.
 */

const retryMock = vi.hoisted(() => vi.fn())
const searchMock = vi.hoisted(() => ({
  status: 'ready',
  results: [] as PublicProductResult[],
  retry: retryMock,
}))

vi.mock('../hooks/usePublicProductSearch', () => ({ usePublicProductSearch: () => searchMock }))

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

function renderPage(query?: string): string {
  const entry = query === undefined ? '/catalogo/buscar' : `/catalogo/buscar?q=${encodeURIComponent(query)}`
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [entry] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/catalogo/buscar',
          element: createElement(SearchResultsPage),
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
  searchMock.status = 'ready'
  searchMock.results = results
  retryMock.mockReset()
})

describe('resultados de búsqueda', () => {
  it('muestra una tarjeta por producto con nombre, imagen y link a su categoría', () => {
    const markup = renderPage('cámara')

    expect(markup).toContain('Cámara Domo 4K')
    expect(markup).toContain('Lector biométrico')
    expect(markup).toContain('href="/catalogo/categoria/camaras-ip"')
    expect(markup).toContain('href="/catalogo/categoria/control-de-acceso"')
    // The image of the first product, resolved against the backend origin
    // (dev: relative, served by the Vite proxy).
    expect(markup).toContain('src="/api/files/img-1"')
  })

  it('no pinta un <img> para un resultado sin imagen', () => {
    searchMock.results = [results[1]!]

    const markup = renderPage('biométrico')

    expect(markup).toContain('Lector biométrico')
    // No card image at all (the logo of the chrome header is an <img> too).
    expect(markup).not.toContain('src="/api/files/img-1"')
    expect(markup).not.toContain('object-cover')
  })

  it('muestra el término buscado bajo el título de la página', () => {
    const markup = renderPage('domo')

    expect(markup).toContain('>Resultados de búsqueda</h1>')
    expect(markup).toContain('«domo»')
  })

  it('se renderiza dentro del chrome de la tienda', () => {
    const markup = renderPage('domo')

    expect(markup).toContain('aria-label="Grupo Security, inicio"')
    expect(markup).toContain('aria-controls="category-mega-menu"')
    expect(markup).toContain('© ')
  })
})

describe('estado vacío', () => {
  it('avisa que no hubo resultados para el término buscado', () => {
    searchMock.results = []

    const markup = renderPage('candado-ineexistente')

    expect(markup).toContain('No encontramos resultados para')
    expect(markup).toContain('«candado-ineexistente»')
    expect(markup).not.toContain('href="/catalogo/categoria/')
  })

  it('ofrece explorar categorías cuando no hay resultados', () => {
    searchMock.results = []

    const markup = renderPage('candado-ineexistente')

    expect(markup).toContain('Explorar categorías')
    expect(markup).toContain('href="/tienda"')
  })

  it('muestra una guía cuando el header llegó sin término', () => {
    searchMock.status = 'idle'
    searchMock.results = []

    const markup = renderPage()

    expect(markup).toContain('Escribe lo que estás buscando')
    expect(markup).not.toContain('No encontramos resultados para')
  })
})

describe('estado de carga', () => {
  it('muestra el esqueleto mientras carga la búsqueda', () => {
    searchMock.status = 'loading'

    const markup = renderPage('cámara')

    expect(markup).toContain('role="status"')
    expect(markup).toContain('Cargando resultados')
    expect(occurrences(markup, 'animate-pulse')).toBeGreaterThan(0)
    // The skeleton keeps the shape of the grid: 8 cards.
    expect(occurrences(markup, 'h-40 w-full animate-pulse bg-surface-200')).toBe(8)
    // ...and no real content yet.
    expect(markup).not.toContain('Cámara Domo 4K')
    expect(markup).not.toContain('No encontramos resultados para')
  })

  it('no deja un esqueleto en el DOM cuando los resultados están listos', () => {
    const markup = renderPage('cámara')

    expect(markup).not.toContain('Cargando resultados')
  })
})

describe('error de conexión', () => {
  it('muestra el mensaje y el botón de reintentar', () => {
    searchMock.status = 'error'

    const markup = renderPage('cámara')

    expect(markup).toContain('No pudimos cargar los resultados')
    expect(markup).toContain('Revisa tu conexión e inténtalo de nuevo.')
    expect(markup).toContain('Intentar de nuevo')
    expect(markup).not.toContain('href="/catalogo/categoria/')
  })
})

describe('buscador del header', () => {
  it('apunta el formulario del header a la página de resultados', () => {
    // Without a DOM environment the submit event cannot be fired on a static
    // render, so the navigation itself is exercised in the browser; the
    // structure (form -> /catalogo/buscar, input -> q) is what this suite
    // pins down, and it is what makes the submit reach the route even
    // without JavaScript (native GET action).
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ['/catalogo/buscar'] }, createElement(SearchResultsPage)),
    )

    expect(markup).toContain('action="/catalogo/buscar"')
    expect(markup).toContain('method="get"')
    expect(markup).toContain('name="q"')
    expect(markup).toContain('placeholder="¿Qué estás buscando?"')
    expect(markup).toContain('aria-label="Buscar"')
  })
})
