import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import type { PublicKeySpecFacet } from '../../../services/public-catalog.service'
import ParameterRequirements, { visibleFacetOptions } from './ParameterRequirements'

/**
 * SSR suite: no clicks and no effects here, so checked/disabled state is read
 * from the markup. React adds `<!-- -->` between text nodes; they are stripped
 * before comparing text.
 */

function facet(specKey: string, values: PublicKeySpecFacet['values'], extra: Partial<PublicKeySpecFacet> = {}): PublicKeySpecFacet {
  return { specKey, label: extra.label ?? 'Zonas', dataType: 'NUMBER', unit: extra.unit ?? null, values }
}

function option(value: string, count: number): PublicKeySpecFacet['values'][number] {
  return { value, label: `Opción ${value}`, count }
}

function render(props: Partial<Parameters<typeof ParameterRequirements>[0]> & { facets: PublicKeySpecFacet[] }): string {
  const markup = renderToStaticMarkup(createElement(ParameterRequirements, {
    selected: [],
    maxSelections: 10,
    onToggle: () => undefined,
    ...props,
  }))
  return markup.replace(/<!-- -->/g, '')
}

/** Each checkbox row as its own markup block. */
function rows(markup: string): string[] {
  return markup.split('<label').slice(1)
}

const eightOptions = facet('zonas', Array.from({ length: 8 }, (_, index) => option(String(index + 1), 2)))

describe('ParameterRequirements: opciones visibles', () => {
  it('muestra 6 casillas y el botón con el total cuando hay 8 opciones con productos', () => {
    const markup = render({ facets: [eightOptions] })

    expect(rows(markup)).toHaveLength(6)
    expect(markup).toContain('Ver las 8 opciones')
  })

  it('no muestra el botón de ver más con 6 opciones o menos', () => {
    const markup = render({ facets: [facet('zonas', eightOptions.values.slice(0, 6))] })

    expect(rows(markup)).toHaveLength(6)
    expect(markup).not.toContain('Ver las')
  })

  it('oculta una opción sin productos si no está marcada, y muestra una marcada aunque tenga cero', () => {
    const withZero = facet('zonas', [option('1', 0), option('2', 3), option('3', 0)])

    const plain = render({ facets: [withZero] })
    expect(plain).not.toContain('Opción 1')
    expect(plain).not.toContain('Opción 3')
    expect(plain).toContain('Opción 2')

    const selectedZero = render({ facets: [withZero], selected: ['zonas:3'] })
    const selectedRow = rows(selectedZero).find((row) => row.includes('Opción 3'))
    expect(selectedRow).toBeDefined()
    expect(selectedRow).toContain('checked=""')
  })

  it('marca la casilla de un requisito seleccionado', () => {
    const markup = render({ facets: [eightOptions], selected: ['zonas:2'] })
    const row = rows(markup).find((item) => item.includes('Opción 2'))

    expect(row).toContain('checked=""')
  })

  it('deshabilita las casillas no marcadas al alcanzar el máximo y avisa del límite', () => {
    const markup = render({ facets: [facet('zonas', [option('1', 2), option('2', 2)])], selected: ['zonas:1'], maxSelections: 1 })
    const [marked, free] = rows(markup)

    expect(marked).toContain('checked=""')
    expect(marked).not.toContain('disabled=""')
    expect(free).toContain('disabled=""')
    expect(markup).toContain('Puedes marcar hasta 1 requisitos.')
  })

  it('no muestra el aviso de límite mientras queda espacio', () => {
    const markup = render({ facets: [eightOptions], selected: ['zonas:1'], maxSelections: 10 })

    expect(markup).not.toContain('Puedes marcar hasta')
  })

  it('no renderiza el fieldset de una faceta sin opciones visibles', () => {
    const empty = facet('color', [option('negro', 0)], { label: 'Color' })
    const markup = render({ facets: [empty, facet('zonas', [option('1', 4)])] })

    expect(markup).not.toContain('>Color<')
    expect(markup.split('<fieldset').length - 1).toBe(1)
  })

  it('muestra el aviso de truncado solo cuando llega truncated', () => {
    const message = 'Hay más requisitos de los que podemos mostrar. Elige una subcategoría o usa la búsqueda para afinar.'

    expect(render({ facets: [eightOptions], truncated: true })).toContain(message)
    expect(render({ facets: [eightOptions] })).not.toContain(message)
    expect(render({ facets: [eightOptions], truncated: false })).not.toContain(message)
  })
})

describe('visibleFacetOptions', () => {
  it('pliega a las seis primeras cuando no está expandido', () => {
    const { options, visible } = visibleFacetOptions(eightOptions, new Set(), false)

    expect(options).toHaveLength(8)
    expect(visible).toHaveLength(6)
  })

  it('muestra todas cuando está expandido', () => {
    const { visible } = visibleFacetOptions(eightOptions, new Set(), true)

    expect(visible).toHaveLength(8)
  })

  it('mantiene visible una opción marcada fuera de las seis primeras aunque esté plegado', () => {
    const { visible } = visibleFacetOptions(eightOptions, new Set(['zonas:8']), false)

    expect(visible.map((item) => item.value)).toEqual(['1', '2', '3', '4', '5', '6', '8'])
  })
})

const occurrences = (text: string, needle: string) => text.split(needle).length - 1

describe('ParameterRequirements: secciones plegables', () => {
  const two = [facet('a', [option('1', 2)], { label: 'Primera' }), facet('b', [option('2', 3)], { label: 'Segunda' }), facet('c', [option('3', 1)], { label: 'Tercera' })]

  it('la primera llega abierta y las demás cerradas, cada una con su botón', () => {
    const markup = render({ facets: two })

    expect(occurrences(markup, 'aria-expanded="true"')).toBe(1)
    expect(occurrences(markup, 'aria-expanded="false"')).toBe(2)
    expect(markup).toContain('aria-controls="requirement-b"')
  })

  it('una sección con una opción marcada llega abierta', () => {
    const markup = render({ facets: two, selected: ['c:3'] })

    expect(occurrences(markup, 'aria-expanded="true"')).toBe(2)
  })
})
