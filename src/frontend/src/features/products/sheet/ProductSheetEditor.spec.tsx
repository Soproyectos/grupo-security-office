import { describe, expect, it } from 'vitest'
import { createElement, type ReactNode } from 'react'
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
    // Only the selected group's rows are in the panel; the others show as tabs.
    expect(html).toContain('id="spec-tab-')
    expect(html).toContain('>Red<')
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
    expect(html.match(/role="tab"/g)).toHaveLength(2)
    expect(html.match(/data-testid="spec-group"/g)).toHaveLength(1)
    expect(html.match(/data-testid="spec-item"/g)).toHaveLength(2)
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

  it('las notas internas ya no forman parte de la ficha pública (viven en su propia sección)', () => {
    const html = render()
    expect(html).not.toContain('Notas internas')
    expect(html).not.toContain('data-testid="internal-notes"')
    expect(html).toContain('Aviso al pie de la tabla')
    expect(html).toContain('Nota sobre el firmware')
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

  it('dentro del editor de producto no repite lo que ya hacen otras secciones', () => {
    const html = render({
      embedded: true,
      lifecycleStatus: 'DRAFT',
      validation: { status: 'REVISION_PENDIENTE', label: 'revisión pendiente', pending: true },
    })
    // Publicar (requisitos y estado) y el índice del editor ya lo dicen.
    expect(html).not.toContain('aún no está publicado en la tienda')
    expect(html).not.toContain('Estado de validación:')
    expect(html).not.toContain('la tienda sigue mostrando la última versión publicada')
    expect(html).not.toContain('Ver ficha pública')
    // El encabezado propio no se repite: lo pone la sección del editor.
    expect(html).not.toContain('<h2')
    // Imágenes ya cubre las fotos: la imagen de la ficha solo aparece si ya tenía un valor.
    // Los avisos al cliente viven dentro de Especificaciones y Recursos, no en una sección aparte.
    expect(html).not.toContain('Avisos al cliente')
    expect(html).not.toContain('id="ficha-notas"')
    // Sin tarjetas dentro de la tarjeta de la sección.
    expect(html).not.toContain('rounded-xl p-5')
    expect(html).toContain('Permitir abrir la ficha por su dirección (slug)')
    expect(html).not.toContain('Publicar en la tienda se hace')
    expect(html).toContain('Marca en la tienda')
    expect(html).toContain('Referencia (modelo)')
    expect(html).not.toContain('Marca (ficha)')
    // Sin cambios y sin errores no hay barra de guardado.
    expect(html).not.toContain('Guardar ficha pública')
  })

  it('dentro del editor de producto conserva la imagen de la ficha cuando ya tiene valor', () => {
    const html = render({ embedded: true, sheet: sheetFixture({ imageUrl: 'https://cdn.example.invalid/ficha.jpg' }) })
    expect(html).toContain('Imagen de la ficha')
    expect(html).toContain('Vacío = se usan las fotos de la sección Imágenes')
    expect(html).toContain('value="https://cdn.example.invalid/ficha.jpg"')
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
    const fwStart = html.indexOf('>Firmware</h4>')
    const fwSection = html.slice(fwStart)
    expect(fwSection).not.toContain('Subir archivo…')
  })

  it('CAT-04 (frontend-documentos): sin el prop de subida no se ofrece el botón (ni con licencias ni sin ellas)', () => {
    const html = render()
    expect(html).not.toContain('Subir archivo…')
    // La subida de firmware sigue sin ofrecerse para nadie (E1).
    const fwStart = html.indexOf('>Firmware</h4>')
    expect(html.slice(fwStart)).toContain('inventario de formatos')
  })

  it('CAT-03 (regla 2): Destacados son beneficios — sin campos de tienda ni precio/stock', () => {
    const html = render()
    expect(html).toContain('Puntos fuertes del producto')
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
    expect(html).toContain('Agrega el primer grupo')
    expect(html).not.toContain('role="tabpanel"')
    expect(html).toContain('Sin elementos todavía.')
    expect(html).not.toContain('data-testid="spec-group"')
  })

  describe('campos del encabezado sin plegar', () => {
    it('muestra imagen, dirección e identificadores siempre visibles; la marca va plegada cuando está vacía', () => {
      const empty = render({
        embedded: true,
        sheet: sheetFixture({ brand: null, imageUrl: null, imageAlt: null, slug: null, published: false, manufacturerRefs: [] }),
      })
      expect(empty.match(/<details/g)).toHaveLength(1)
      expect(empty).toContain('Usar otra marca en la tienda')
      expect(empty).not.toMatch(/<details[^>]*open=""/)
      for (const text of [
        'Marca en la tienda',
        'Imagen de la ficha',
        'Texto alternativo de la imagen',
        'Slug',
        'Permitir abrir la ficha por su dirección (slug)',
        'Identificadores del fabricante',
      ]) {
        expect(empty).toContain(text)
      }
      expect(empty).not.toContain('Cambiar marca o imagen solo en la tienda')
      expect(empty).not.toContain('Dirección web e identificadores')
    })
  })

  describe('especificaciones en maestro-detalle', () => {
    it('lista los grupos y pinta solo el panel del primero por defecto', () => {
      const html = render()
      expect(html).toContain('role="tablist"')
      expect(html.match(/role="tab"/g)).toHaveLength(2)
      expect(html.match(/role="tabpanel"/g)).toHaveLength(1)
      expect(html).toContain('aria-selected="true"')
      expect(html).toContain('aria-label="Título del grupo 1"')
      expect(html).not.toContain('aria-label="Título del grupo 2"')
      expect(html).toContain('2 filas')
      expect(html).toContain('1 fila')
    })

    it('sin grupos muestra un estado vacío que guía y deja agregar el primero', () => {
      const html = render({ sheet: sheetFixture({ specGroups: [] }) })
      expect(html).toContain('Agrega el primer grupo')
      expect(html).toContain('Agregar grupo')
      expect(html).not.toContain('role="tab"')
    })
  })

  describe('embedded con renderSection', () => {
    const renderSection = ({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) =>
      createElement('section', { id: `seccion-ficha-${id}`, 'data-testid': 'host-section' }, createElement('h3', null, title), hint ? createElement('p', null, hint) : null, children)

    it('delega cada bloque a la página: una ancla y un título por sección, sin h3 propios', () => {
      const html = render({ embedded: true, renderSection })
      expect(html.match(/data-testid="host-section"/g)).toHaveLength(SHEET_SECTIONS.length)
      for (const [id, title] of [
        ['identidad', 'Encabezado'],
        ['destacados', 'Destacados'],
        ['caracteristicas', 'Características'],
        ['modelos', 'Modelos disponibles'],
        ['especificaciones', 'Especificaciones'],
        ['documentos', 'Recursos'],
      ]) {
        expect(html.match(new RegExp(`id="seccion-ficha-${id}"`, 'g'))).toHaveLength(1)
        expect(html.match(new RegExp(`<h3>${title}</h3>`, 'g'))).toHaveLength(1)
      }
      expect(html).not.toContain('<h3 id="ficha-')
      expect(html).not.toContain('id="ficha-identidad"')
      expect(html).not.toContain('seccion-ficha-notas')
      expect(html.match(/<form/g)).toHaveLength(1)
    })

    it('sigue el orden de la tienda y reparte los avisos dentro de Especificaciones y Recursos', () => {
      const html = render({ embedded: true, renderSection })
      expect(SHEET_SECTIONS.map((s) => s.id)).toEqual(['identidad', 'destacados', 'caracteristicas', 'modelos', 'especificaciones', 'documentos'])
      const at = (id: string) => html.indexOf(`id="seccion-ficha-${id}"`)
      const order = SHEET_SECTIONS.map((s) => at(s.id))
      expect([...order].sort((a, b) => a - b)).toEqual(order)
      const specs = html.slice(at('especificaciones'), at('documentos'))
      expect(specs).toContain('Pruebas en entorno controlado.')
      expect(specs).toContain('Se muestra al pie de la tabla de especificaciones.')
      expect(specs).not.toContain('Actualiza al firmware más reciente.')
      const resources = html.slice(at('documentos'))
      expect(resources).toContain('Actualiza al firmware más reciente.')
      expect(resources).toContain('>Documentos técnicos</h4>')
      expect(resources).toContain('>Firmware</h4>')
    })

    it('muestra una sola barra de guardado pegajosa con un error, y ninguna sin cambios', () => {
      const withError = render({ embedded: true, renderSection, saveError: 'Fallo de prueba' })
      expect(withError.match(/Guardar ficha pública/g)).toHaveLength(1)
      expect(withError).toContain('biblioteca-editor__savebar')
      expect(withError).toContain('Fallo de prueba')
      expect(render({ embedded: true, renderSection })).not.toContain('Guardar ficha pública')
      expect(render({ embedded: true, renderSection, saveError: 'Fallo de prueba', saveBarVisible: false })).not.toContain('Guardar ficha pública')
    })

    it('conserva el aviso de conflicto 409 y la recarga dentro de la barra', () => {
      const html = render({
        embedded: true,
        renderSection,
        onReload: () => undefined,
        conflict: { code: 'sheet-version-conflict', currentVersion: 3, currentUpdatedAt: null } as never,
      })
      expect(html).toContain('Descartar cambios y recargar')
      expect(html.match(/Guardar ficha pública/g)).toHaveLength(1)
    })
  })
})
