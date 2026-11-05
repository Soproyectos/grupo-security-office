import { describe, expect, it } from 'vitest'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BadgesBlock } from './blocks/BadgesBlock'
import { FeaturesBlock } from './blocks/FeaturesBlock'
import { HighlightsBlock } from './blocks/HighlightsBlock'
import { IdentifiersBlock } from './blocks/IdentifiersBlock'
import { ImageBlock } from './blocks/ImageBlock'
import { ModelsBlock } from './blocks/ModelsBlock'
import { ResourcesBlock } from './blocks/ResourcesBlock'
import { SaveBar } from './blocks/SaveBar'
import { SpecGroupsBlock } from './blocks/SpecGroupsBlock'
import { StatusBlock } from './blocks/StatusBlock'
import { StoreBlock } from './blocks/StoreBlock'
import { WebAddressBlock } from './blocks/WebAddressBlock'
import { nextDraftBase, SheetDraftProvider, type ProductSheetEditorProps } from './SheetDraftContext'
import { toForm } from './sheet-form'
import { sheetFixture } from './fixtures'

/** Every block exported from blocks/, with a text only that block renders. */
const BLOCKS: Array<[string, ComponentType, string]> = [
  ['StoreBlock', StoreBlock, 'Nombre que ve el cliente'],
  ['StatusBlock', StatusBlock, 'Estado en la tienda'],
  ['BadgesBlock', BadgesBlock, 'Agregar etiqueta'],
  ['ImageBlock', ImageBlock, 'Imagen de la ficha (URL)'],
  ['WebAddressBlock', WebAddressBlock, 'Permitir abrir la ficha por su dirección (slug)'],
  ['IdentifiersBlock', IdentifiersBlock, 'Agregar identificador'],
  ['HighlightsBlock', HighlightsBlock, 'Agregar destacado'],
  ['FeaturesBlock', FeaturesBlock, 'Agregar característica'],
  ['ModelsBlock', ModelsBlock, 'Agregar modelo'],
  ['SpecGroupsBlock', SpecGroupsBlock, 'Aviso al pie de la tabla'],
  ['ResourcesBlock', ResourcesBlock, 'Nota sobre el firmware'],
  ['SaveBar', SaveBar, 'Guardar ficha pública'],
]

const providerProps = (): ProductSheetEditorProps => ({
  sheet: sheetFixture(),
  lifecycleStatus: 'PUBLISHED',
  saving: false,
  saveError: null,
  saved: false,
  onSave: () => undefined,
})

describe('SheetDraftProvider and blocks', () => {
  it.each(BLOCKS)('%s renders the draft values inside a SheetDraftProvider', (_name, Block, text) => {
    const html = renderToStaticMarkup(createElement(SheetDraftProvider, { ...providerProps(), children: createElement(Block) }))
    expect(html).toContain(text)
  })

  it.each(BLOCKS)('%s throws a clear error outside a SheetDraftProvider', (_name, Block) => {
    expect(() => renderToStaticMarkup(createElement(Block))).toThrow(/SheetDraftProvider/)
  })

  describe('nextDraftBase (draft restart without remount)', () => {
    it('keeps the same base while the saved copy has the same updatedAt, so unsaved edits survive', () => {
      const sheet = sheetFixture()
      const base = { updatedAt: sheet.updatedAt, initial: toForm(sheet) }
      expect(nextDraftBase(base, { ...sheet })).toBe(base)
    })

    it('rebuilds the base from the saved copy when updatedAt changes', () => {
      const sheet = sheetFixture()
      const base = { updatedAt: sheet.updatedAt, initial: toForm(sheet) }
      // toForm assigns fresh row uids on each call, so compare plain fields, not the whole form.
      const saved = { ...sheet, name: 'DVR guardado de nuevo', updatedAt: '2026-10-03T08:00:00.000Z' }
      const next = nextDraftBase(base, saved)
      expect(next).not.toBe(base)
      expect(next.updatedAt).toBe('2026-10-03T08:00:00.000Z')
      expect(next.initial.name).toBe('DVR guardado de nuevo')
      expect(next.initial.brand).toBe(toForm(saved).brand)
    })
  })

  it('StoreBlock shows the existing sheet values from the one draft', () => {
    const html = renderToStaticMarkup(createElement(SheetDraftProvider, { ...providerProps(), children: createElement(StoreBlock) }))
    expect(html).toContain('value="DVR AcuSense de 4 canales"')
    expect(html).toContain('value="Hikvision"')
  })

  it('StatusBlock is the only status selector and keeps the stored status', () => {
    const html = renderToStaticMarkup(createElement(SheetDraftProvider, { ...providerProps(), children: createElement(StatusBlock) }))
    expect(html).toContain('Estado en la tienda')
    expect(html).toContain('Vigente')
    expect(html).toContain('Descontinuado')
    expect(html).not.toContain('Nombre que ve el cliente')
  })

  it('BadgesBlock hides its own hint when showHint is false, and keeps it by default', () => {
    const render = (props: { showHint?: boolean }) =>
      renderToStaticMarkup(createElement(SheetDraftProvider, { ...providerProps(), children: createElement(BadgesBlock, props) }))
    expect(render({})).toContain('Textos cortos junto al nombre')
    expect(render({ showHint: false })).not.toContain('Textos cortos junto al nombre')
    expect(render({ showHint: false })).toContain('Agregar etiqueta')
  })
})
