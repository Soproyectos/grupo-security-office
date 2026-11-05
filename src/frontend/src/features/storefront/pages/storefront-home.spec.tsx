import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import StorefrontHome from './StorefrontHome'

/**
 * The suite asserts what the visitor sees on a server render
 * (`react-dom/server`) of the real home page inside a `MemoryRouter`: the
 * search hero, the four category entries and the three service accesses.
 * The page is static, so no data source needs to be mocked.
 */

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

describe('portada: buscador', () => {
  it('muestra un único h1 con el título de la tienda', () => {
    const markup = renderPage()

    expect(occurrences(markup, '<h1')).toBe(1)
    expect(markup).toContain('Protege tu casa o tu negocio')
  })

  it('ofrece buscar por nombre o referencia con un campo etiquetado y su botón', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-label="Busca por nombre o referencia"')
    expect(markup).toContain('placeholder="Nombre o referencia"')
    expect(markup).toContain('action="/catalogo/buscar"')
    expect(markup).toContain('>Buscar</button>')
  })
})

describe('portada: confianza', () => {
  it('muestra solo datos verificados del sitio actual', () => {
    const markup = renderPage()

    for (const text of ['Distribuidor autorizado', 'Hikvision y Ezviz', 'Soporte sin costo adicional', 'Garantía de 1 año', 'Cuatro sedes']) {
      expect(markup).toContain(text)
    }
  })
})

describe('portada: categorías con imagen y marcas', () => {
  it('muestra cuatro mosaicos con foto hacia categorías reales', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-labelledby="home-tiles-title"')
    for (const slug of ['camaras', 'alarmas', 'control-de-acceso', 'cableado']) {
      expect(markup).toContain(`href="/catalogo/categoria/${slug}"`)
    }
    expect(markup.split('storefront-art.png').length - 1).toBeGreaterThanOrEqual(5)
  })

  it('muestra los banners de Hikvision y Ezviz con texto alternativo', () => {
    const markup = renderPage()

    expect(markup).toContain('alt="Hikvision: distribuidor autorizado"')
    expect(markup).toContain('alt="Ezviz: cámaras H8X, H80x y H90x"')
    expect(markup).toContain('href="/catalogo/buscar?q=Hikvision"')
    expect(markup).toContain('href="/catalogo/buscar?q=Ezviz"')
  })
})

describe('portada: qué quieres proteger', () => {
  it('ofrece tres entradas que llevan a categorías reales', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-labelledby="home-protect-title"')
    for (const name of ['Mi casa', 'Mi negocio', 'Mi conjunto o edificio']) {
      expect(markup).toContain(name)
    }
    expect(markup).toContain('href="/catalogo/categoria/camaras"')
    expect(markup).toContain('href="/catalogo/categoria/control-de-acceso"')
    expect(markup).toContain('href="/soluciones"')
  })
})

describe('portada: secciones de productos', () => {
  it('muestra un estante por cada categoría destacada con su enlace «Ver todo»', () => {
    const markup = renderPage()

    for (const title of ['Cámaras', 'Alarmas', 'Control de acceso', 'Casa inteligente']) {
      expect(markup).toContain(title)
    }
    expect(markup.split('Ver todo<').length - 1).toBe(4)
  })

  it('lista el resto de categorías como mosaico y enlaza a todo el catálogo', () => {
    const markup = renderPage()

    for (const slug of ['redes-y-wi-fi', 'energia-y-electricidad', 'audio-y-perifoneo', 'parqueaderos']) {
      expect(markup).toContain(`href="/catalogo/categoria/${slug}"`)
    }
    expect(markup).toContain('href="/catalogo"')
  })
})

describe('portada: sedes y WhatsApp', () => {
  it('cierra con las sedes y un enlace a WhatsApp', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-labelledby="home-branches-title"')
    expect(markup).toContain('href="/sedes"')
    expect(markup).toContain('href="https://wa.me/573160275100?text=')
  })
})

describe('portada: servicios', () => {
  it('muestra los tres accesos con su frase de acción', () => {
    const markup = renderPage()

    expect(markup).toContain('aria-label="Servicios"')
    for (const text of [
      'Asesoría para proyectos',
      'Cotiza tu proyecto',
      'Soporte técnico',
      'Configura o repara tu equipo',
      'Certificaciones',
      'Formación para técnicos',
    ]) {
      expect(markup).toContain(text)
    }
  })
})

describe('portada: accesos internos', () => {
  it('lleva los tres accesos a sus páginas de Servicios', () => {
    const markup = renderPage()

    expect(markup).toContain('href="/servicios/proyectos"')
    expect(markup).toContain('href="/servicios/soporte"')
    expect(markup).toContain('href="/servicios/certificaciones"')
    expect(markup).not.toContain('href="https://gruposecurity.co/')
  })
})

describe('chrome de la tienda', () => {
  it('se renderiza dentro del chrome con el menú principal y el pie', () => {
    const markup = renderPage()

    expect(markup).toContain('href="/tienda"')
    expect(markup).toContain('aria-label="Tienda"')
    expect(markup).toContain('Mi cuenta')
    expect(markup).toContain('© ')
  })
})
