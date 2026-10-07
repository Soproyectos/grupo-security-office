import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductSheetEditor, SHEET_SECTIONS, type ProductSheetEditorProps } from './ProductSheetEditor'
import { sheetFixture } from './fixtures'

/**
 * The suite has no DOM environment (see product-detail.spec.tsx), so the editor is
 * asserted through its server render; interactions are covered on the pure model in
 * `sheet-form.spec.ts`.
 */
const render = (over: Partial<ProductSheetEditorProps> = {}) =>
  renderToStaticMarkup(
    createElement(ProductSheetEditor, {
      sheet: sheetFixture(),
      lifecycleStatus: 'PUBLISHED',
      saving: false,
      saveError: null,
      saved: false,
      onSave: () => undefined,
      ...over,
    }),
  )

describe('ProductSheetEditor (render)', () => {
  it('shows every section of the sheet', () => {
    const html = render()
    for (const section of SHEET_SECTIONS) {
      expect(html).toContain(`id="ficha-${section.id}"`)
    }
  })

  it('renders the existing sheet values', () => {
    const html = render()
    expect(html).toContain('value="DVR AcuSense de 4 canales"')
    expect(html).toContain('value="ids-e04hqhi-d"')
    expect(html).toContain('value="Hikvision"')
    expect(html).toContain('value="Destacado"')
    expect(html).toContain('Impulsado por tecnología eSSD')
    expect(html).toContain('value="AcuSense"')
    expect(html).toContain('value="iDS-E04HQHI-D"')
    // spec groups and items
    expect(html).toContain('value="Video"')
    expect(html).toContain('value="Canales"')
    expect(html).toContain('value="Resolución"')
    expect(html).toContain('value="Red"')
    // resources, both sections
    expect(html).toContain('value="Ficha técnica"')
    expect(html).toContain('value="Manual de usuario"')
    expect(html).toContain('value="Firmware Europa V4.75"')
    expect(html).toContain('value="V4.75.011"')
    expect(html).toContain('value="Europa"')
    // notes
    expect(html).toContain('Pruebas en entorno controlado.')
    expect(html).toContain('Actualiza al firmware más reciente.')
  })

  it('renders one editor block per spec group, spec row, document and firmware file', () => {
    const html = render()
    expect(html.match(/data-testid="spec-group"/g)).toHaveLength(2)
    expect(html.match(/data-testid="spec-item"/g)).toHaveLength(3)
    expect(html.match(/data-testid="resource-documents"/g)).toHaveLength(2)
    expect(html.match(/data-testid="resource-firmware"/g)).toHaveLength(2)
    expect(html.match(/data-testid="feature-row"/g)).toHaveLength(2)
  })

  it('exposes reorder and remove controls for rows', () => {
    const html = render()
    expect(html).toContain('aria-label="Subir fila 2"')
    expect(html).toContain('aria-label="Bajar grupo 1"')
    expect(html).toContain('aria-label="Quitar característica 1"')
    expect(html).toContain('Agregar fila')
    expect(html).toContain('Agregar grupo')
    expect(html).toContain('Agregar documento')
    expect(html).toContain('Agregar firmware o notas de versión')
  })

  it('links to the public sheet and, when published, to the slug URL', () => {
    const html = render()
    expect(html).toContain('href="/catalogo/productos/69ba44ee-7081-475b-8f00-b3220364bee5"')
    expect(html).toContain('Ver ficha pública')
    expect(html).toContain('href="/productos/ids-e04hqhi-d"')

    const unpublished = render({ sheet: sheetFixture({ published: false }) })
    expect(unpublished).not.toContain('href="/productos/ids-e04hqhi-d"')
  })

  it('starts clean: save is disabled until something changes', () => {
    const html = render()
    expect(html).toContain('Sin cambios pendientes.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*(<svg.*?<\/svg>)?Guardar ficha/)
  })

  it('warns when the product is not published in the store', () => {
    expect(render({ lifecycleStatus: 'DRAFT' })).toContain('aún no está publicado en la tienda')
    expect(render({ lifecycleStatus: 'PUBLISHED' })).not.toContain('aún no está publicado en la tienda')
  })

  it('surfaces a save error from the server', () => {
    const html = render({ saveError: 'Ya existe otro producto con ese slug' })
    expect(html).toContain('Ya existe otro producto con ese slug')
  })

  it('renders an empty sheet without crashing, with empty states', () => {
    const html = render({
      sheet: sheetFixture({
        name: null,
        slug: null,
        published: false,
        brand: null,
        model: null,
        badges: [],
        highlights: [],
        features: [],
        availableModels: [],
        specGroups: [],
        resources: [],
        specsDisclaimer: null,
        firmwareNote: null,
      }),
    })
    expect(html).toContain('Sin grupos todavía.')
    expect(html).toContain('Sin elementos todavía.')
    expect(html).not.toContain('data-testid="spec-group"')
  })
})
