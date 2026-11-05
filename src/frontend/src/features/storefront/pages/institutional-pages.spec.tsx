import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ComponentType } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SolutionsPage from './SolutionsPage'
import AboutPage from './AboutPage'
import BranchesPage from './BranchesPage'
import WarrantyPage, { EXCHANGE_FORM_PDF, WARRANTY_POLICY_PDF } from './WarrantyPage'
import { BRANCHES, branchDirectionsUrl } from '../constants/branches'

function render(page: ComponentType, path: string): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(page)),
    ),
  )
}

function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

const PAGES: Array<[string, ComponentType, string, string]> = [
  ['soluciones', SolutionsPage, '/soluciones', 'Soluciones</h1>'],
  ['nosotros', AboutPage, '/nosotros', 'Nosotros</h1>'],
  ['sedes', BranchesPage, '/sedes', 'Nuestras sedes</h1>'],
  ['garantías', WarrantyPage, '/garantias', 'Garantías y devoluciones</h1>'],
]

describe.each(PAGES)('página de %s', (_name, page, path, heading) => {
  const markup = render(page, path)

  it('tiene un solo <main> y un solo <h1>', () => {
    expect(occurrences(markup, '<main')).toBe(1)
    expect(occurrences(markup, '<h1')).toBe(1)
    expect(markup).toContain(heading)
  })

  it('no usa colores sueltos', () => {
    expect(markup).not.toContain('slate-')
  })
})

describe('soluciones', () => {
  const markup = render(SolutionsPage, '/soluciones')

  it('organiza por necesidad y enlaza a búsquedas del catálogo', () => {
    for (const title of ['Vigilar un espacio', 'Detectar intrusiones', 'Controlar entradas', 'Conectar tus equipos']) {
      expect(markup).toContain(title)
    }
    expect(markup).toContain('href="/catalogo/buscar?q=c%C3%A1mara"')
    expect(markup).toContain('href="/catalogo/buscar?q=control%20de%20acceso"')
  })
})

describe('nosotros', () => {
  const markup = render(AboutPage, '/nosotros')

  it('muestra respaldo, sedes y no inventa cifras ni testimonios', () => {
    for (const text of ['Distribución', 'Soporte técnico', 'Proyectos', 'Formación', 'Pereira, Armenia, Manizales, Cali']) {
      expect(markup).toContain(text)
    }
    expect(markup).toContain('href="/sedes"')
    expect(markup).not.toMatch(/clientes felices|testimonio/i)
  })
})

describe('sedes', () => {
  const markup = render(BranchesPage, '/sedes')

  it('lista las cuatro sedes con dirección y enlace seguro «Cómo llegar»', () => {
    expect(BRANCHES).toHaveLength(4)
    for (const branch of BRANCHES) {
      expect(markup).toContain(`>${branch.city}</h2>`)
      expect(markup).toContain(branch.address)
      const url = branchDirectionsUrl(branch).replace(/&/g, '&amp;')
      expect(markup).toContain(`href="${url}"`)
    }
    expect(occurrences(markup, 'rel="noopener noreferrer"')).toBeGreaterThanOrEqual(4)
    expect(occurrences(markup, 'Cómo llegar<')).toBe(4)
  })

  it('codifica la dirección en la URL del mapa', () => {
    expect(branchDirectionsUrl({ city: 'Pereira', address: 'Calle 16 #5-38 Pereira' })).toContain('Calle%2016%20%235-38')
  })

  it('muestra a cada sede su propio teléfono, legible y como enlace tel:', () => {
    const cards = markup.split('<li class="flex flex-col').slice(1).map((chunk) => chunk.split('</li>')[0] as string)
    const expected: Record<string, [string, string]> = {
      Pereira: ['316 027 5100', 'tel:+573160275100'],
      Armenia: ['310 708 6360', 'tel:+573107086360'],
      Manizales: ['310 708 4994', 'tel:+573107084994'],
      Cali: ['317 365 3489', 'tel:+573173653489'],
    }
    expect(cards).toHaveLength(4)
    for (const card of cards) {
      const city = Object.keys(expected).find((name) => card.includes(`>${name}</h2>`)) as string
      for (const [other, [display, href]] of Object.entries(expected)) {
        if (other === city) {
          expect(card).toContain(display)
          expect(card).toContain(`href="${href}"`)
        } else {
          expect(card).not.toContain(display)
          expect(card).not.toContain(href)
        }
      }
      expect(card).toContain('min-h-11')
    }
  })

  it('muestra a cada sede su propio horario, sin mezclarlo con el de otra', () => {
    const cards = markup.split('<li class="flex flex-col').slice(1).map((chunk) => chunk.split('</li>')[0] as string)
    expect(cards).toHaveLength(4)
    const expected: Record<string, string> = {
      Pereira: '8:30 a. m.–5 p. m.',
      Armenia: '8 a. m.–12 p. m. y 1:30–5 p. m.',
      Manizales: '8 a. m.–12:30 p. m. y 2–5 p. m.',
      Cali: '8:30 a. m.–12 p. m. y 1–5 p. m.',
    }
    for (const card of cards) {
      const city = Object.keys(expected).find((name) => card.includes(`>${name}</h2>`)) as string
      for (const [other, hours] of Object.entries(expected)) {
        if (other === city) expect(card).toContain(hours)
        else expect(card).not.toContain(hours)
      }
      expect(card).toContain('Sáb:')
      expect(card).toContain('Dom:')
      expect(card).toContain('Cerrado')
    }
  })
})

describe('garantías', () => {
  const markup = render(WarrantyPage, '/garantias')

  it('aloja la política completa y los PDF en la propia web, sin enviar al sitio anterior', () => {
    expect(markup).not.toContain('gruposecurity.co')
    expect(markup).toContain(`href="${WARRANTY_POLICY_PDF}"`)
    expect(markup).toContain(`href="${EXCHANGE_FORM_PDF}"`)
    for (const text of ['Garantía', 'Retracto', 'Política de cambio', 'ley 1480 de 2011', 'nota crédito']) {
      expect(markup).toContain(text)
    }
  })

  it('enlaza a soporte y sedes por rutas internas', () => {
    expect(markup).toContain('href="/servicios/soporte"')
    expect(markup).toContain('href="/sedes"')
  })
})
