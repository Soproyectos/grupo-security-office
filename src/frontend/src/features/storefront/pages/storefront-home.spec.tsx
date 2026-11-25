import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import StorefrontHome from './StorefrontHome'

type MockMenuNode = {
  id: string
  name: string
  slug: string
  productCount: number
  subcategoryId?: string
  subcategorySlug?: string
  children: MockMenuNode[]
}

const categoryMenuMock = vi.hoisted(() => ({
  status: 'ready',
  categories: [] as MockMenuNode[],
  retry: vi.fn(),
}))

vi.mock('../hooks/useCategoryMenu', () => ({ useCategoryMenu: () => categoryMenuMock }))

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

beforeEach(() => {
  categoryMenuMock.status = 'ready'
  categoryMenuMock.categories = ['camaras', 'alarmas', 'control-de-acceso', 'cableado', 'redes-y-wi-fi', 'energia-y-electricidad', 'audio-y-perifoneo', 'parqueaderos', 'casa-inteligente']
    .map((slug) => ({
      id: slug, name: slug, slug, productCount: 1,
      children: slug === 'camaras' ? [
        { id: 'sub-ip', name: 'Cámaras IP y Wi-Fi', slug: 'legacy-ip-row', subcategoryId: 'sub-ip', subcategorySlug: 'camaras-ip-wifi', productCount: 1, children: [] },
        { id: 'sub-analog', name: 'Cámaras analógicas', slug: 'camaras-analogicas', subcategoryId: 'sub-analog', productCount: 1, children: [] },
        { id: 'sub-special', name: 'Cámaras especiales y para vehículos', slug: 'camaras-especiales', subcategoryId: 'sub-special', productCount: 1, children: [] },
        { id: 'sub-accessory', name: 'Soportes y accesorios', slug: 'soportes-accesorios', subcategoryId: 'sub-accessory', productCount: 5, children: [] },
      ] : [],
    }))
})

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

    for (const text of ['Distribuidor autorizado', 'Hikvision y Ezviz', 'Soporte técnico', 'Garantía de 1 año', 'Cuatro sedes']) {
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
    for (const slug of ['camaras', 'alarmas', 'control-de-acceso', 'cableado']) {
      expect(markup).toContain(`src="/images/home/tiles/${slug}.jpg"`)
    }
  })

  it('oculta mosaicos de categoría sin productos públicos', () => {
    categoryMenuMock.categories = categoryMenuMock.categories.map((category) =>
      category.slug === 'camaras' ? { ...category, productCount: 0 } : category,
    )
    const markup = renderPage()
    expect(markup).not.toContain('href="/catalogo/categoria/camaras"')
    expect(markup).toContain('href="/catalogo/categoria/alarmas"')
  })

  it('mantiene las marcas cuando falla el menú y permite reintentar las categorías', () => {
    categoryMenuMock.status = 'error'
    categoryMenuMock.categories = []

    const markup = renderPage()

    expect(markup).toContain('No pudimos cargar las categorías')
    expect(markup).toContain('Reintentar')
    expect(markup).not.toContain('href="/catalogo/categoria/camaras"')
  })
})

describe('portada: secciones retiradas', () => {
  it('no muestra «¿Qué quieres proteger?» ni los banners de marcas', () => {
    const markup = renderPage()

    expect(markup).not.toContain('home-protect-title')
    expect(markup).not.toContain('Qué quieres proteger')
    expect(markup).not.toContain('aria-label="Marcas"')
    expect(markup).not.toContain('alt="Ezviz: cámaras H8X, H80x y H90x"')
  })
})

describe('portada: secciones de productos', () => {
  it('no muestra vitrinas de productos y admite categorías sin subcategorías en el menú', () => {
    categoryMenuMock.categories = categoryMenuMock.categories.map((category) => ({ ...category, children: [] }))
    const markup = renderPage()

    for (const title of ['Cámaras de seguridad', 'Alarmas', 'Control de acceso']) {
      expect(markup).toContain(title)
    }
    expect(markup).not.toContain('id="home-shelf-')
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
