import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EditorSaveBar, type EditorSaveBarProps } from './EditorSaveBar'

const draftState = vi.hoisted(() => ({ draft: null as Record<string, unknown> | null }))
vi.mock('../SheetDraftContext', () => ({
  useOptionalSheetDraft: () => draftState.draft,
}))

const sheetDraft = (over: Record<string, unknown> = {}) => ({
  dirty: false,
  saving: false,
  saveError: null,
  conflict: null,
  showErrors: false,
  errorCount: 0,
  onReload: () => undefined,
  handleSubmit: async () => true,
  ...over,
})

const base: EditorSaveBarProps = {
  datosDirty: false,
  datosSaving: false,
  datosError: null,
  onSaveDatos: async () => true,
}

const render = (props: Partial<EditorSaveBarProps> = {}) => renderToStaticMarkup(<EditorSaveBar {...base} {...props} />)

/** The opening tag of the primary save button (it may hold a spinner before its label). */
function saveButtonTag(html: string): string {
  const end = html.indexOf('Guardar cambios</button>')
  if (end === -1) return ''
  const start = html.lastIndexOf('<button', end)
  return html.slice(start, html.indexOf('>', start) + 1)
}

beforeEach(() => {
  draftState.draft = null
})

describe('EditorSaveBar', () => {
  it('lista solo las partes sucias: datos generales y ficha de la tienda', () => {
    draftState.draft = sheetDraft({ dirty: true })
    const html = render({ datosDirty: true })
    expect(html).toContain('Cambios sin guardar en: Datos generales, Ficha de la tienda')
    expect(count(html, 'Guardar cambios')).toBe(1)
  })

  it('lista solo la ficha cuando los datos generales están guardados', () => {
    draftState.draft = sheetDraft({ dirty: true })
    expect(render()).toContain('Cambios sin guardar en: Ficha de la tienda')
    expect(render()).not.toContain('Datos generales')
  })

  it('sin cambios ni error no se muestra', () => {
    expect(render()).toBe('')
  })

  it('sin cambios, pero con un error de datos, muestra el error y el botón desactivado', () => {
    const html = render({ datosError: 'Falta el nombre del producto.' })
    expect(html).toContain('Falta el nombre del producto.')
    expect(saveButtonTag(html)).toMatch(/disabled=""/)
    expect(html).not.toContain('Cambios sin guardar')
  })

  it('con cambios, el botón está activo', () => {
    const html = render({ datosDirty: true })
    expect(saveButtonTag(html)).not.toMatch(/disabled=""/)
  })

  it('mientras guarda muestra el estado de guardado y desactiva el botón', () => {
    const html = render({ datosDirty: true, datosSaving: true })
    expect(html).toContain('Guardando cambios…')
    expect(saveButtonTag(html)).toMatch(/disabled=""/)
  })

  it('muestra el conflicto de versión con la acción de recargar', () => {
    draftState.draft = sheetDraft({ dirty: true, conflict: { currentVersion: 7 } })
    const html = render()
    expect(html).toContain('versión vigente 7')
    expect(html).toContain('Descartar cambios y recargar')
  })

  it('muestra el error de guardado de la ficha y cuántos campos corregir', () => {
    draftState.draft = sheetDraft({ dirty: true, saveError: 'No se pudo guardar la ficha.', showErrors: true, errorCount: 2 })
    const html = render()
    expect(html).toContain('No se pudo guardar la ficha.')
    expect(html).toContain('Corrige 2 campos de la ficha marcados antes de guardar.')
  })

  it('sin ficha disponible sirve solo para los datos generales', () => {
    const html = render({ datosDirty: true })
    expect(html).toContain('Cambios sin guardar en: Datos generales')
    expect(html).not.toContain('Ficha de la tienda')
  })

  it('el botón Descartar aparece solo con datos generales sin guardar', () => {
    expect(render({ datosDirty: true, onDiscardDatos: () => undefined })).toContain('>Descartar</button>')
    draftState.draft = sheetDraft({ dirty: true })
    expect(render({ onDiscardDatos: () => undefined })).not.toContain('>Descartar</button>')
  })
})

function count(html: string, text: string): number {
  return html.split(text).length - 1
}
