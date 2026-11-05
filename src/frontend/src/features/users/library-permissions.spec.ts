import { describe, expect, it } from 'vitest'
import {
  checkAction,
  closeSelection,
  hasPublicationComplement,
  initialSelection,
  LIBRARY_SELECTION_ACTION_IDS,
  LIBRARY_TABS,
  sameSelection,
  selectionChanges,
  selectionToActionIds,
  tabState,
  toggleTab,
  uncheckAction,
  visibleTabs,
} from './library-permissions'

const tab = (id: string) => LIBRARY_TABS.find((item) => item.id === id)!
const set = (...ids: string[]) => new Set(ids)
const sorted = (selection: Set<string>) => [...selection].sort()

describe('casillas de Biblioteca: dependencias', () => {
  it('ofrece exactamente las 16 acciones y nunca Publicar en tienda', () => {
    expect([...LIBRARY_SELECTION_ACTION_IDS].sort()).toEqual([
      'imports:read', 'imports:run', 'masters:read', 'masters:write',
      'prices:apply', 'prices:preview', 'prices:read', 'prices:save', 'products:approveSpecs', 'products:delete', 'products:notes',
      'products:read', 'products:validate', 'products:write', 'providers:read', 'providers:write',
    ])
    expect(LIBRARY_SELECTION_ACTION_IDS).toHaveLength(16)
    expect(LIBRARY_SELECTION_ACTION_IDS).not.toContain('products:publish')
  })

  it('marcar una casilla marca solo sus dependencias (cadena guardar, revisar, ver precios)', () => {
    expect(sorted(checkAction(set(), 'products:write'))).toEqual(['products:read', 'products:write'])
    expect(sorted(checkAction(set(), 'prices:save'))).toEqual(['prices:preview', 'prices:read', 'prices:save'])
    expect(sorted(checkAction(set(), 'prices:apply'))).toEqual(['prices:apply', 'prices:read'])
    expect(sorted(checkAction(set(), 'providers:write'))).toEqual(['providers:read', 'providers:write'])
    expect(sorted(checkAction(set(), 'products:notes'))).toEqual(['products:notes', 'products:read'])
  })

  it('desmarcar una dependencia desmarca lo que dependa de ella, y nada más', () => {
    const all = closeSelection(LIBRARY_SELECTION_ACTION_IDS)
    expect(uncheckAction(all, 'prices:preview').has('prices:save')).toBe(false)
    expect(uncheckAction(all, 'prices:preview').has('prices:apply')).toBe(true)
    const withoutPricesRead = uncheckAction(all, 'prices:read')
    for (const id of ['prices:preview', 'prices:save', 'prices:apply']) expect(withoutPricesRead.has(id)).toBe(false)
    expect(withoutPricesRead.has('providers:write')).toBe(true)
    const withoutProductsRead = uncheckAction(all, 'products:read')
    for (const id of ['products:write', 'products:validate', 'products:notes', 'products:delete']) expect(withoutProductsRead.has(id)).toBe(false)
    expect(withoutProductsRead.has('prices:read')).toBe(true)
    expect(sorted(uncheckAction(set('products:read', 'products:write'), 'products:write'))).toEqual(['products:read'])
  })

  it('Importaciones y Catálogos maestros marcan solo lo que necesitan', () => {
    expect(sorted(checkAction(set(), 'imports:read'))).toEqual(['imports:read', 'products:read'])
    expect(sorted(checkAction(set(), 'imports:run'))).toEqual(['imports:read', 'imports:run', 'products:read', 'products:write'])
    expect(sorted(checkAction(set(), 'masters:read'))).toEqual(['masters:read', 'products:read'])
    expect(sorted(checkAction(set(), 'masters:write'))).toEqual(['masters:read', 'masters:write', 'products:read'])
  })

  it('Aprobar datos clave es una casilla propia: Editar catálogos maestros no la marca', () => {
    expect(checkAction(set(), 'masters:write').has('products:approveSpecs')).toBe(false)
    expect(sorted(checkAction(set(), 'products:approveSpecs'))).toEqual(['products:approveSpecs', 'products:read', 'products:write'])
    const maestros = tab('maestros')
    expect(maestros.items.map((item) => item.actionId)).toEqual(['masters:read', 'masters:write', 'products:approveSpecs'])
    expect(maestros.items.find((item) => item.actionId === 'products:approveSpecs')?.label).toMatch(/Aprobar datos clave/)
  })

  it('desmarcar Ver importaciones o Ver catálogos maestros quita sus acciones dependientes', () => {
    const all = closeSelection(LIBRARY_SELECTION_ACTION_IDS)
    const withoutImports = uncheckAction(all, 'imports:read')
    expect(withoutImports.has('imports:run')).toBe(false)
    expect(withoutImports.has('products:write')).toBe(true)
    const withoutMasters = uncheckAction(all, 'masters:read')
    expect(withoutMasters.has('masters:write')).toBe(false)
    expect(withoutMasters.has('products:approveSpecs')).toBe(true)
  })

  it('quitar Importaciones no quita Fichas ni Catálogos maestros', () => {
    const all = closeSelection(LIBRARY_SELECTION_ACTION_IDS)
    const next = toggleTab(all, tab('importaciones'))
    expect(next.has('imports:read')).toBe(false)
    expect(next.has('imports:run')).toBe(false)
    expect(tabState(next, tab('fichas'))).toBe('all')
    expect(tabState(next, tab('maestros'))).toBe('all')
  })
})

describe('casilla de pestaña (atajo)', () => {
  it('marca todas las casillas de la pestaña y sus dependencias', () => {
    expect(tabState(set(), tab('fichas'))).toBe('none')
    const next = toggleTab(set(), tab('fichas'))
    expect(sorted(next)).toEqual(['products:delete', 'products:notes', 'products:read', 'products:validate', 'products:write'])
    expect(tabState(next, tab('fichas'))).toBe('all')
    expect(tabState(next, tab('productos'))).toBe('some')
    expect(tabState(toggleTab(set(), tab('precios')), tab('precios'))).toBe('all')
  })

  it('con parciales muestra estado intermedio y marcar el atajo completa la pestaña', () => {
    const partial = set('products:read', 'products:write')
    expect(tabState(partial, tab('fichas'))).toBe('some')
    expect(tabState(toggleTab(partial, tab('fichas')), tab('fichas'))).toBe('all')
  })

  it('desmarcar una pestaña completa quita las suyas', () => {
    expect(toggleTab(toggleTab(set(), tab('precios')), tab('precios')).size).toBe(0)
  })

  it('desmarcar Fichas conserva «Ver productos» si Productos está completo', () => {
    const both = toggleTab(toggleTab(set(), tab('productos')), tab('fichas'))
    const next = toggleTab(both, tab('fichas'))
    expect(sorted(next)).toEqual(['prices:read', 'products:read'])
    expect(tabState(next, tab('productos'))).toBe('all')
  })

  it('desmarcar Productos no borra lo que Fichas y Precios aún necesitan', () => {
    const all = closeSelection(LIBRARY_SELECTION_ACTION_IDS)
    const next = toggleTab(all, tab('productos'))
    expect(next.has('products:read')).toBe(true)
    expect(next.has('prices:read')).toBe(true)
    expect(next.size).toBe(all.size)
  })
})

describe('pestañas visibles y estado inicial', () => {
  it('muestra Productos=ver, Fichas=editar y Precios=revisar archivo', () => {
    expect(visibleTabs(set()).map((item) => item.id)).toEqual([])
    expect(visibleTabs(set('products:read')).map((item) => item.id)).toEqual(['productos'])
    expect(visibleTabs(set('products:read', 'products:write')).map((item) => item.id)).toEqual(['productos', 'fichas'])
    expect(visibleTabs(set('prices:read', 'prices:preview')).map((item) => item.id)).toEqual(['precios'])
    expect(visibleTabs(set('prices:read')).map((item) => item.id)).toEqual([])
  })

  it('Importaciones se abre con imports:read y Catálogos maestros con masters:read, no por pertenecer a Biblioteca', () => {
    expect(visibleTabs(set('products:read', 'products:write')).map((item) => item.id)).not.toContain('importaciones')
    expect(visibleTabs(set('products:read', 'imports:read')).map((item) => item.id)).toEqual(['productos', 'importaciones'])
    expect(visibleTabs(set('masters:read')).map((item) => item.id)).toEqual(['maestros'])
    expect(visibleTabs(set('masters:write', 'products:approveSpecs')).map((item) => item.id)).toEqual([])
  })

  it('el estado inicial refleja lo que ya tiene, sin contar el complemento ni alcances no globales', () => {
    const base = { catalogVersion: 'v', grantedById: 'x', reason: null }
    const sources = [
      { id: 'a', kind: 'template', templateId: 'biblioteca-fichas', ...base },
      { id: 'b', kind: 'template', templateId: 'biblioteca-publicacion', ...base },
      { id: 'c', kind: 'manual', templateId: null, ...base },
    ]
    const initial = initialSelection({
      sources,
      grants: [
        { sourceId: 'a', actionId: 'products:read', scope: 'global' },
        { sourceId: 'a', actionId: 'products:write', scope: 'global' },
        { sourceId: 'b', actionId: 'products:validate', scope: 'global' },
        { sourceId: 'b', actionId: 'products:publish', scope: 'global' },
        { sourceId: 'c', actionId: 'prices:apply', scope: 'global' },
        { sourceId: 'c', actionId: 'products:notes', scope: 'list', resourceId: 'x' },
        { sourceId: 'c', actionId: 'customers:read', scope: 'own' },
      ],
    })
    expect(sorted(initial)).toEqual(['prices:apply', 'products:read', 'products:write'])
    expect(hasPublicationComplement({ sources })).toBe(true)
    expect(hasPublicationComplement({ sources: sources.slice(0, 1) })).toBe(false)
    expect(initialSelection(undefined).size).toBe(0)
  })

  it('compara selecciones y calcula los cambios a guardar en orden estable', () => {
    const before = set('products:read', 'products:write')
    const after = set('products:read', 'prices:read', 'prices:preview')
    expect(sameSelection(before, set('products:write', 'products:read'))).toBe(true)
    expect(sameSelection(before, after)).toBe(false)
    expect(selectionChanges(before, after)).toEqual({ added: ['prices:read', 'prices:preview'], removed: ['products:write'] })
    expect(selectionToActionIds(set('prices:read', 'products:read'))).toEqual(['products:read', 'prices:read'])
  })
})
