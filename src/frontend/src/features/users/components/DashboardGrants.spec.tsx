import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

// ---------------------------------------------------------------------------
// El repo no tiene entorno DOM ni @testing-library, así que el componente se
// exercise en dos piezas: el markup se comprueba con render estático (con la
// consulta simulada) y la lógica de selección, que es la que decide qué se
// guarda, se comprueba con las funciones puras que exporta.
// ---------------------------------------------------------------------------

const { GRANTS } = vi.hoisted(() => ({
  GRANTS: [
    { permission: 'dashboard:pack:ventas', effect: 'GRANT', reason: null },
    { permission: 'storefront:write', effect: 'GRANT', reason: null },
  ],
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: GRANTS, isLoading: false, error: null }),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import DashboardGrants from './DashboardGrants'
import {
  selectionFromGrants,
  togglePackInSelection,
  togglePermissionInSelection,
} from '../lib/grant-selection'

/** Etiqueta del `<input>` que precede al texto dado. */
function checkboxOf(markup: string, title: string): string {
  const at = markup.indexOf(title)
  expect(at, `no se encontró la casilla de "${title}"`).toBeGreaterThan(-1)

  const open = markup.lastIndexOf('<input', at)
  return markup.slice(open, markup.indexOf('>', open) + 1)
}

describe('Configuración de tienda en el modal de concesiones', () => {
  const markup = renderToStaticMarkup(createElement(DashboardGrants, { userId: 'user-1' }))

  it('muestra la sección con sus dos casillas', () => {
    expect(markup).toContain('Configuración de tienda')
    expect(markup).toContain('Ver la configuración')
    expect(markup).toContain('Editar la configuración')
  })

  it('refleja la concesión de tienda ya guardada y deja la otra libre', () => {
    expect(checkboxOf(markup, 'Editar la configuración')).toContain('checked')
    expect(checkboxOf(markup, 'Ver la configuración')).not.toContain('checked')
  })

  it('mantiene la sección de paneles junto a la de tienda', () => {
    expect(markup).toContain('Paneles extra')
    expect(markup).toContain('Ventas y metas')
  })
})

describe('selección de concesiones', () => {
  // El botón de guardar envía `[...selected]` y `replaceForUser` sustituye el
  // conjunto en bloque: lo que no esté en la selección se pierde. Estos casos
  // son la red que impide que tocar una familia borre la otra.
  it('carga todas las concesiones guardadas, sin filtrar por familia', () => {
    const selection = selectionFromGrants([
      { permission: 'dashboard:pack:ventas' },
      { permission: 'storefront:write' },
    ])

    expect([...selection]).toEqual(['dashboard:pack:ventas', 'storefront:write'])
  })

  it('marcar un paquete conserva la concesión previa de storefront:write', () => {
    const selection = selectionFromGrants([
      { permission: 'storefront:write' },
      { permission: 'dashboard:pack:ventas' },
    ])

    const saved = togglePackInSelection(selection, 'cotizaciones')

    expect([...saved]).toEqual(
      expect.arrayContaining([
        'dashboard:pack:ventas',
        'dashboard:pack:cotizaciones',
        'storefront:write',
      ]),
    )
  })

  it('desmarcar un paquete tampoco toca la concesión de tienda', () => {
    const selection = selectionFromGrants([
      { permission: 'dashboard:pack:ventas' },
      { permission: 'storefront:write' },
    ])

    const saved = togglePackInSelection(selection, 'ventas')

    expect([...saved]).toEqual(['storefront:write'])
  })

  it('conceder storefront:write conserva los paneles ya concedidos', () => {
    const selection = selectionFromGrants([
      { permission: 'dashboard:pack:ventas' },
      { permission: 'dashboard:block:kpi-ventas-mes' },
    ])

    const saved = togglePermissionInSelection(selection, 'storefront:write')

    expect([...saved]).toEqual([
      'dashboard:pack:ventas',
      'dashboard:block:kpi-ventas-mes',
      'storefront:write',
    ])
  })

  it('desmarcar storefront:write conserva el resto de la selección', () => {
    const selection = selectionFromGrants([
      { permission: 'dashboard:pack:ventas' },
      { permission: 'storefront:read' },
      { permission: 'storefront:write' },
    ])

    const saved = togglePermissionInSelection(selection, 'storefront:write')

    expect([...saved]).toEqual(['dashboard:pack:ventas', 'storefront:read'])
  })
})