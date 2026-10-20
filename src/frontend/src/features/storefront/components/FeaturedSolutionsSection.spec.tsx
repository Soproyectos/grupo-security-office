import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import FeaturedSolutionsSection from './FeaturedSolutionsSection'
import { FEATURED_SOLUTIONS } from '../fixtures/featured-solutions'

/**
 * As its sibling `StorefrontSalesChannels.spec.tsx` does, the suite asserts
 * what the visitor sees on a server render (`react-dom/server`) of the
 * section. The cards use `Link`, so the section renders inside a
 * `MemoryRouter`. There is no backend contract for solutions: the suite reads
 * the same temporary fixture the page feeds the section, and asserts the
 * heading, every card, the CTA labels, the semantic section and the
 * accessible scroll controls.
 */

function renderSection(): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(FeaturedSolutionsSection, { solutions: FEATURED_SOLUTIONS }),
    ),
  )
}

/** Number of times a substring shows up in the markup. */
function occurrences(markup: string, needle: string): number {
  return markup.split(needle).length - 1
}

describe('soluciones destacadas', () => {
  it('pinta la sección semántica con su encabezado', () => {
    const markup = renderSection()

    expect(markup).toContain('<section')
    expect(markup).toContain('aria-labelledby="home-soluciones-title"')
    expect(markup).toContain('id="home-soluciones-title"')
    expect(markup).toContain('Soluciones destacadas')
  })

  it('pinta las cuatro tarjetas con categoría, título y descripción', () => {
    const markup = renderSection()

    for (const solution of FEATURED_SOLUTIONS) {
      expect(markup).toContain(solution.title)
      expect(markup).toContain(solution.category)
      expect(markup).toContain(solution.description)
    }
  })

  it('pinta el CTA de cada tarjeta con su etiqueta y destino', () => {
    const markup = renderSection()

    // One CTA per fixture card, each pointing at its own real destination.
    expect(occurrences(markup, 'Ver solución')).toBe(FEATURED_SOLUTIONS.length)
    for (const solution of FEATURED_SOLUTIONS) {
      expect(markup).toContain(`href="${solution.href}"`)
      expect(solution.href).not.toBe('/catalogo')
    }
  })

  it('describe cada portada con un alt útil', () => {
    const markup = renderSection()

    for (const solution of FEATURED_SOLUTIONS) {
      expect(markup).toContain(`alt="${solution.imageAlt}"`)
    }
  })

  it('expone controles anterior/siguiente accesibles por teclado', () => {
    const markup = renderSection()

    expect(markup).toContain('aria-label="Ver soluciones anteriores"')
    expect(markup).toContain('aria-label="Ver soluciones siguientes"')
    expect(occurrences(markup, 'aria-controls="home-soluciones-lista"')).toBe(2)
    // Native buttons: keyboard reachable without extra wiring.
    expect(occurrences(markup, '<button type="button"')).toBe(2)
  })

  it('deja la lista alcanzable por teclado como región con nombre', () => {
    const markup = renderSection()

    expect(markup).toContain('id="home-soluciones-lista"')
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('aria-label="Lista de soluciones destacadas"')
  })
})
