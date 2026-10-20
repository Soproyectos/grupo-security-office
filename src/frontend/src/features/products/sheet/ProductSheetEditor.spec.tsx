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

  it('CAT-03 (H4): muestra los identificadores del fabricante en Identidad', () => {
    const html = render()
    expect(html).toContain('Identificadores del fabricante')
    expect(html).toContain('value="DS-E04HQHI-D/PN"')
    expect(html).toContain('value="7798123456789"')
    expect(html).toContain('Agregar identificador')
  })

  it('CAT-03 (H2): el 409 de versión avisa con la versión vigente, ofrece recargar y NO finge éxito', () => {
    const reloaded: string[] = []
    const html = render({
      conflict: { currentVersion: 9 },
      onReload: () => reloaded.push('reload'),
      saved: false,
    })
    expect(html).toContain('versión vigente 9')
    expect(html).toContain('NO se guardaron')
    expect(html).toContain('Descartar cambios y recargar')
    // Sin falso éxito: el aviso verde de guardado no aparece durante el conflicto.
    expect(html).not.toContain('Ficha guardada.')
  })

  it('CAT-03 (H2): durante el conflicto el banner es el de versión, no el error genérico', () => {
    const html = render({ conflict: { currentVersion: 4 }, saveError: 'otro error' })
    expect(html).toContain('versión vigente 4')
    expect(html).not.toContain('otro error')
  })

  it('CAT-03 (frontend-tecnicos): las notas internas se pintan MARCADAS como privadas y separadas de las públicas', () => {
    const html = render()
    expect(html).toContain('Notas internas (privadas)')
    expect(html).toContain('Nunca se publican')
    expect(html).toContain('Almacén Bodega 2')
    // Separación explícita: las notas públicas van etiquetadas como públicas.
    expect(html).toContain('Aviso de especificaciones (público)')
    expect(html).toContain('Nota de firmware (pública)')
  })

  it('CAT-03 (frontend-tecnicos): sin permiso el campo no aparece y se avisa que se conservan', () => {
    const html = render({
      sheet: sheetFixture({ canSeeInternalNotes: false, internalNotes: null }),
    })
    expect(html).not.toContain('Notas internas (privadas)')
    expect(html).not.toContain('Almacén Bodega 2')
    expect(html).toContain('No tienes permiso para ver ni editar las notas internas')
    expect(html).toContain('se conservan al guardar')
  })

  it('CAT-03 (frontend-tecnicos): Modelos es solo lista de modelos — sin precio/stock (no hay variantes nuevas)', () => {
    const html = render()
    const start = html.indexOf('id="ficha-modelos"')
    const end = html.indexOf('id="ficha-especificaciones"')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const modelos = html.slice(start, end)
    expect(modelos).not.toMatch(/type="number"/)
    expect(modelos).not.toMatch(/<label[^>]*>\s*(Precio|Stock|Existencias|Variante)/i)
    expect(modelos).toContain('Agregar modelo')
  })

  it('CAT-03 (regla 5): muestra el estado de validación y el aviso de revisión pendiente', () => {
    const pendiente = render({ validation: { status: 'REVISION_PENDIENTE', label: 'revisión pendiente', pending: true } })
    expect(pendiente).toContain('Estado de validación:')
    expect(pendiente).toContain('revisión pendiente')
    expect(pendiente).toContain('la tienda sigue mostrando la última versión publicada')
    // Sin falso éxito ni autorización implícita: no hay botón/enlace de publicar
    // (el copy del editor puede nombrar la publicación; la acción no existe aquí).
    expect(pendiente).not.toMatch(/<(button|a)[^>]*>(?:\s*<svg[\s\S]*?<\/svg>\s*)?Publicar[^<]*<\/(button|a)>/i)

    const publicada = render({ validation: { status: 'PUBLICADA', label: 'publicada', pending: false } })
    expect(publicada).toContain('Estado de validación:')
    expect(publicada).toContain('publicada')
    expect(publicada).not.toContain('la tienda sigue mostrando la última versión publicada')
  })

  it('CAT-04 (frontend-documentos): aviso de descarga autorizada, hint de subida de firmware y PDF opcional', () => {
    const html = render({
      onUploadAsset: async () => ({ url: '/api/files/x' }),
      sheet: sheetFixture({
        resources: [
          { kind: 'MANUAL', title: 'Manual con licencia', language: 'es', url: '/api/files/doc-1', fileName: 'manual.pdf', version: null, region: null, requiresLicense: true },
        ],
      }),
    })
    expect(html).toContain('La ficha técnica (PDF) es opcional')
    expect(html).toContain('Este archivo queda PRIVADO')
    expect(html).toContain('Descarga autorizada')
    // Firmware: NO se ofrece subida (diferido con motivo); sí se ve el hint.
    expect(html).toContain('inventario de formatos')
    expect(html).toContain('Subir archivo…')
    // La subida solo aparece en documentos, nunca en la sección firmware.
    const fwStart = html.indexOf('Firmware y notas de versión')
    const fwSection = html.slice(fwStart, html.indexOf('id="ficha-notas"'))
    expect(fwSection).not.toContain('Subir archivo…')
  })

  it('CAT-04 (frontend-documentos): sin el prop de subida no se ofrece el botón (ni con licencias ni sin ellas)', () => {
    const html = render()
    expect(html).not.toContain('Subir archivo…')
    // La subida de firmware sigue sin ofrecerse para nadie (E1).
    const fwStart = html.indexOf('Firmware y notas de versión')
    expect(html.slice(fwStart)).toContain('inventario de formatos')
  })

  it('CAT-03 (regla 2): Destacados son beneficios — sin campos de tienda ni precio/stock', () => {
    const html = render()
    expect(html).toContain('Puntos fuertes o beneficios del producto')
    expect(html).toContain('No fijan precio ni stock')
    // La sección de destacados no contiene campos editables de tienda
    // (ni inputs numéricos de precio/stock, ni labels de esos campos):
    // solo filas de frases. El hint las MENCIONA para prohibirlas, no las pinta.
    const start = html.indexOf('id="ficha-destacados"')
    const end = html.indexOf('id="ficha-caracteristicas"')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const destacados = html.slice(start, end)
    expect(destacados).not.toMatch(/type="number"/)
    expect(destacados).not.toMatch(/<label[^>]*>\s*(Precio|Stock|Existencias)/i)
    expect(destacados).toContain('Agregar destacado')
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
