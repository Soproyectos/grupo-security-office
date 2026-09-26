import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import CoverageSelector, { COVERAGE_CITIES } from './CoverageSelector'

/**
 * As the sibling suites did (`StorefrontFooter.spec.tsx`, `mega-menu.spec.tsx`),
 * the suite asserts what the visitor sees on a server render
 * (`react-dom/server`) of the selector: the trigger with its pin and label, the
 * a11y attributes and the static demo cities (the list stays in the DOM hidden
 * while closed). Events that only exist in the browser (the `mousedown` and
 * `keydown` listeners on `document`, the click on the trigger) cannot run here
 * and are covered by reading the wiring in the component; the picked city is
 * asserted through the `defaultCity` prop, which is the state after a pick.
 */

function renderSelector(props: Parameters<typeof CoverageSelector>[0] = {}): string {
  return renderToStaticMarkup(createElement(CoverageSelector, props))
}

describe('disparador de cobertura', () => {
  it('muestra el pin y la etiqueta genérica cerrada', () => {
    const markup = renderSelector()

    expect(markup).toContain('Ciudades de cobertura')
    expect(markup).toContain('aria-haspopup="listbox"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('<svg')
    expect(markup).toContain('aria-hidden="true"')
  })

  it('muestra la ciudad elegida en el disparador tras la selección', () => {
    const markup = renderSelector({ defaultCity: 'Medellín' })

    expect(markup).toContain('Medellín')
    expect(markup).toContain('aria-expanded="false"')
  })
})

describe('lista de ciudades demo', () => {
  it('declara las ocho ciudades demo en el listbox', () => {
    const markup = renderSelector()

    for (const city of COVERAGE_CITIES) {
      expect(markup).toContain(city)
    }
    expect(COVERAGE_CITIES).toHaveLength(8)
    expect(markup).toContain('role="listbox"')
    expect(markup).toContain('aria-label="Ciudades de cobertura"')
  })

  it('mantiene la lista oculta mientras está cerrada', () => {
    const markup = renderSelector()

    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('hidden')
  })

  it('marca con aria-selected la ciudad elegida y deja las demás sin marcar', () => {
    const markup = renderSelector({ defaultCity: 'Cali' })

    expect(markup.split('aria-selected="true"').length - 1).toBe(1)
    expect(markup.split('aria-selected="false"').length - 1).toBe(7)
    expect(markup).toContain('Cali')
  })
})
