import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LibraryProductEditorPage, { EditorLoadError, EditorNotFound, isPublicationEditingDisabled } from './LibraryProductEditorPage'
import { useAuthStore } from '../stores/auth.store'
import type { Product } from '../features/products/types/product.types'

/** The index of the editor: eleven flat entries, in this order. */
const INDEX = [
  ['datos-generales', 'Datos generales'],
  ['datos-clave', 'Datos clave'],
  ['imagenes', 'Imágenes'],
  ['resumen', 'Resumen para el cliente'],
  ['descripcion', 'Descripción y especificaciones'],
  ['precios', 'Precios'],
  ['recursos', 'Recursos'],
  ['publicacion', 'Publicar'],
  ['acciones', 'Archivar o quitar'],
  ['notas-internas', 'Notas internas'],
  ['historial', 'Historial'],
] as const

vi.mock('../features/products/sheet/ProductPhotosSection', () => ({
  ProductPhotosSection: () => <p>FOTOS-MOCK</p>,
}))
vi.mock('../features/products/audit/ProductAuditTab', () => ({
  ProductAuditTab: () => <p>HISTORIAL-MOCK</p>,
}))
// The sheet scope and its slots pass their children through; the blocks are replaced by markers.
vi.mock('../features/products/sheet/ProductSheetTab', () => ({
  ProductSheetScope: ({ children }: { children: ReactNode }) => <div data-sheet-scope="true">{children}</div>,
  SheetSlot: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
// `draftState` is the sheet draft of the save bar (null: no sheet). `formState` is the sheet form the disclosures read.
const draftState = vi.hoisted(() => ({ draft: null as Record<string, unknown> | null }))
const formState = vi.hoisted(() => ({ form: {} as Record<string, unknown> }))
vi.mock('../features/products/sheet/SheetDraftContext', () => ({
  useSheetDraft: () => ({ form: formState.form }),
  useOptionalSheetDraft: () => draftState.draft,
}))
vi.mock('../features/products/sheet/blocks/StatusBlock', () => ({ StatusBlock: () => <p>BLOQUE-ESTADO</p> }))
vi.mock('../features/products/sheet/blocks/SpecGroupsBlock', () => ({ SpecGroupsBlock: () => <p>BLOQUE-ESPECIFICACIONES</p> }))
vi.mock('../features/products/sheet/blocks/BadgesBlock', () => ({ BadgesBlock: () => <p>BLOQUE-ETIQUETAS</p> }))
vi.mock('../features/products/sheet/blocks/IdentifiersBlock', () => ({ IdentifiersBlock: () => <p>BLOQUE-IDENTIFICADORES</p> }))
vi.mock('../features/products/sheet/blocks/HighlightsBlock', () => ({ HighlightsBlock: () => <p>BLOQUE-DESTACADOS</p> }))
vi.mock('../features/products/sheet/blocks/FeaturesBlock', () => ({ FeaturesBlock: () => <p>BLOQUE-CARACTERISTICAS</p> }))
vi.mock('../features/products/sheet/blocks/ResourcesBlock', () => ({ ResourcesBlock: () => <p>BLOQUE-RECURSOS</p> }))
vi.mock('../features/products/sheet/blocks/WebAddressBlock', () => ({ WebAddressBlock: () => <p>BLOQUE-DIRECCION</p> }))
vi.mock('../features/products/sheet/ProductInternalNotes', () => ({
  ProductInternalNotes: () => <div><textarea readOnly>NOTES-DRAFT-MOCK</textarea></div>,
}))
vi.mock('../features/catalog-publication/LibraryPublicationSection', () => ({
  LibraryPublicationSection: ({ product, disabled }: { product: Product; disabled?: boolean }) => (
    <section data-testid="library-publication-section" data-disabled={String(Boolean(disabled))}>
      PUBLICACION-REAL:{product.id}
    </section>
  ),
}))

const ALL = ['products:read', 'products:write', 'products:delete', 'products:publish', 'products:notes', 'prices:read', 'prices:apply']

function login(permissions: string[]) {
  const session = {
    isAuthenticated: true,
    user: { id: 'u1', name: 'Prueba', email: 'prueba@example.invalid', roles: ['Admin Comercial'], permissions },
  }
  useAuthStore.setState(session)
  Object.assign(useAuthStore.getInitialState(), session)
}

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  sku: 'SKU-001',
  name: 'Cámara domo 4K',
  description: 'Cámara para interiores',
  categoryId: 'c1',
  brandId: 'b1',
  listaId: 'l-1',
  technicalSpecs: { resolucion: '8 MP' },
  extraAttributes: null,
  isActive: true,
  isVisible: true,
  lifecycleStatus: 'PUBLISHED',
  category: { id: 'c1', name: 'Cámaras', slug: 'camaras' },
  brand: { id: 'b1', name: 'Hikvision', slug: 'hikvision' },
  images: [{ id: 'i1', url: 'https://cdn.example.invalid/domo.jpg', isPrimary: true }],
  prices: [
    { id: 'pr1', value: 250000, currency: 'COP', validFrom: null, validUntil: null, priceList: { id: 'pl1', name: 'Cliente final', code: 'CLIENTE_FINAL_IVA' } },
  ],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...over,
})

function render({ data = product(), permissions = ALL, hash = '' }: { data?: Product | null; permissions?: string[]; hash?: string } = {}) {
  login(permissions)
  const client = new QueryClient()
  client.setQueryData(['user-access', 'u1'], {
    grants: permissions.map((actionId) => ({ actionId, scope: 'global' })),
    packages: [
      { id: 'biblioteca-consulta', applied: permissions.includes('products:read') },
      { id: 'biblioteca-fichas', applied: permissions.includes('products:write') },
      { id: 'biblioteca-precios', applied: permissions.includes('prices:preview') },
      { id: 'biblioteca-publicacion', applied: permissions.includes('products:publish') },
    ],
  })
  if (data) {
    client.setQueryData(['product', 'p1'], data)
    client.setQueryData(['product-prices', 'p1'], (data.prices ?? []).map((item) => ({
      ...item,
      productId: 'p1',
      priceListId: item.priceList?.id ?? 'pl1',
      createdAt: '',
      updatedAt: '',
    })))
  }
  client.setQueryData(['priceLists'], [{ id: 'pl1', name: 'Cliente final', code: 'CLIENTE_FINAL_IVA', currency: 'COP', isActive: true, validFrom: null, validUntil: null }])
  client.setQueryData(['categories'], [{ id: 'c1', name: 'Cámaras', slug: 'camaras' }])
  client.setQueryData(['brands'], [{ id: 'b1', name: 'Hikvision', slug: 'hikvision' }])
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: '/commercial/library/update/products/p1', hash, state: { from: '/commercial/products?page=2' } }]}>
        <Routes>
          <Route path="/commercial/library/update/products/:productId" element={<LibraryProductEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** HTML of one section: from its anchor to the next section. */
function sectionOf(html: string, id: string): string {
  const start = html.indexOf(`id="seccion-${id}"`)
  if (start === -1) return ''
  const end = html.indexOf('<section id="seccion-', start + 1)
  return html.slice(start, end === -1 ? undefined : end)
}

const count = (html: string, text: string) => html.split(text).length - 1

/** A sheet draft with unsaved changes unless told otherwise. */
const sheetDraft = (over: Record<string, unknown> = {}) => ({
  dirty: true,
  saving: false,
  saveError: null,
  conflict: null,
  showErrors: false,
  errorCount: 0,
  onReload: undefined,
  handleSubmit: async () => true,
  ...over,
})

/** The sheet form with nothing filled in: the disclosures start closed. */
const EMPTY_FORM = { imageUrl: '', imageAlt: '', manufacturerRefs: [], slug: '', published: false }

beforeEach(() => {
  login(ALL)
  draftState.draft = null
  formState.form = { ...EMPTY_FORM }
})

describe('LibraryProductEditorPage', () => {
  it('muestra la ruta de navegación con enlaces y el SKU como último elemento, y el nombre como título', () => {
    const html = render()
    expect(html).toContain('href="/commercial/products"')
    expect(html).not.toContain('href="/commercial/library/update"')
    expect(html).toMatch(/<a[^>]*href="\/commercial\/library\/update\/products"[^>]*>Fichas de producto<\/a>/)
    expect(html).toMatch(/<li[^>]*aria-current="page"[^>]*>SKU-001<\/li>/)
    expect(html).toContain('>Cámara domo 4K</h2>')
    expect(html).toContain('>Volver</button>')
  })

  it('muestra un índice plano de 11 entradas, en orden, sin grupos', () => {
    const html = render()
    const ids = [...html.matchAll(/aria-controls="seccion-([\w-]+)"/g)].map((match) => match[1])
    expect(ids).toEqual(INDEX.map(([id]) => id))
    const desktop = html.slice(html.indexOf('biblioteca-editor__desktop-index'), html.indexOf('</div>', html.indexOf('biblioteca-editor__desktop-index')))
    const positions = INDEX.map(([, label]) => desktop.indexOf(`>${label}`))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(html).not.toContain('>Ficha pública<')
    expect(html).not.toContain('<optgroup')
    expect(html).not.toContain('biblioteca-editor__index-group')
  })

  it('quita del índice las secciones etiquetas, destacados y caracteristicas, que ahora viven en Resumen', () => {
    const html = render()
    for (const id of ['etiquetas', 'destacados', 'caracteristicas', 'modelos']) {
      expect(html).not.toContain(`aria-controls="seccion-${id}"`)
      expect(html).not.toContain(`id="seccion-${id}"`)
    }
  })

  it('mantiene los paneles montados con uno visible', () => {
    const html = render()
    for (const [id] of INDEX) expect(html).toContain(`id="seccion-${id}"`)
    expect(html).not.toContain('id="seccion-datos-generales" hidden=""')
    expect(html).toContain('id="seccion-imagenes" hidden=""')
    expect(html).toContain('aria-label="Sección de la ficha"')
    expect(html).toContain('FOTOS-MOCK')
    expect(html).toContain('HISTORIAL-MOCK')
    expect(html).toContain('NOTES-DRAFT-MOCK')
  })

  it('cada título de sección aparece una sola vez', () => {
    const html = render()
    for (const [, label] of INDEX) {
      expect(count(html, `>${label}</h3>`)).toBe(1)
    }
  })

  it('en Descripción y especificaciones: Descripción y Especificaciones son subtítulos h3, una sola vez', () => {
    const section = sectionOf(render(), 'descripcion')
    expect(section).toMatch(/<h3[^>]*>\s*<label[^>]*for="editor-description"[^>]*>Descripción<\/label><\/h3>/)
    expect(count(section, '>Especificaciones</h3>')).toBe(1)
    expect(count(section, 'BLOQUE-ESPECIFICACIONES')).toBe(1)
  })

  it('bajo el subtítulo Descripción dice cuándo se ve', () => {
    const section = sectionOf(render(), 'descripcion')
    expect(section).toContain('Se muestra bajo el nombre solo si el producto no tiene destacados.')
  })

  it('oculta la lista simple anterior cuando el producto no tiene valores en ella', () => {
    const html = render({ data: product({ technicalSpecs: null, extraAttributes: null }) })
    expect(html).not.toContain('Lista simple anterior')
    expect(html).not.toContain('La tienda muestra esta lista solo cuando')
    expect(html).not.toContain('Especificaciones técnicas')
  })

  it('muestra la lista simple anterior plegada (sin open) cuando el producto ya tiene valores', () => {
    const section = sectionOf(render(), 'descripcion')
    expect(section).toMatch(/<details(?![^>]*\bopen\b)[^>]*>\s*<summary[^>]*>Lista simple anterior<\/summary>/)
    expect(section).toContain('La tienda muestra esta lista solo cuando el producto no tiene grupos de especificaciones. Para productos nuevos usa la tabla de arriba.')
    expect(section).toContain('8 MP')
  })

  it('coloca cada bloque de la ficha dentro de su sección', () => {
    const html = render()
    const expected: Array<[string, string]> = [
      ['datos-generales', 'BLOQUE-ESTADO'],
      ['datos-generales', 'BLOQUE-IDENTIFICADORES'],
      ['resumen', 'BLOQUE-ETIQUETAS'],
      ['resumen', 'BLOQUE-DESTACADOS'],
      ['resumen', 'BLOQUE-CARACTERISTICAS'],
      ['descripcion', 'BLOQUE-ESPECIFICACIONES'],
      ['recursos', 'BLOQUE-RECURSOS'],
      ['publicacion', 'BLOQUE-DIRECCION'],
    ]
    for (const [section, marker] of expected) {
      expect(sectionOf(html, section)).toContain(marker)
    }
    expect(sectionOf(html, 'imagenes')).not.toContain('BLOQUE-')
    expect(sectionOf(html, 'acciones')).not.toContain('BLOQUE-')
  })

  it('marca cada zona de la ficha con el campo que muestra, para la vista previa', () => {
    const html = render()
    for (const field of ['name', 'sku', 'brand', 'category', 'status', 'internal', 'images', 'badges', 'highlights', 'features', 'description', 'specs', 'price', 'resources']) {
      expect(html).toContain(`data-preview-field="${field}"`)
    }
  })

  it('no repite ningún bloque de la ficha: cada uno aparece una vez', () => {
    const html = render()
    for (const marker of ['BLOQUE-ESTADO', 'BLOQUE-ESPECIFICACIONES', 'BLOQUE-ETIQUETAS', 'BLOQUE-IDENTIFICADORES', 'BLOQUE-DESTACADOS', 'BLOQUE-CARACTERISTICAS', 'BLOQUE-RECURSOS', 'BLOQUE-DIRECCION']) {
      expect(count(html, marker)).toBe(1)
    }
  })

  it('no muestra En la tienda, la marca de la tienda, Modelos disponibles ni la imagen de la ficha', () => {
    const html = render()
    expect(html).not.toContain('En la tienda')
    expect(html).not.toContain('Marca en la tienda')
    expect(html).not.toContain('Modelos disponibles')
    expect(html).not.toContain('Imagen de la ficha')
    expect(html).not.toContain('BLOQUE-IMAGEN')
    expect(html).not.toContain('BLOQUE-MODELOS')
  })

  it('muestra el selector Estado en la tienda una sola vez, dentro de Datos generales', () => {
    const html = render()
    expect(count(html, 'BLOQUE-ESTADO')).toBe(1)
    expect(sectionOf(html, 'datos-generales')).toContain('BLOQUE-ESTADO')
  })

  it('pone los códigos del fabricante plegados en Datos generales, con la ayuda de uso interno', () => {
    const closed = sectionOf(render(), 'datos-generales')
    expect(closed).toMatch(/<details(?![^>]*\bopen\b)[^>]*>\s*<summary[^>]*>Códigos del fabricante \(solo uso interno\)<\/summary>/)
    expect(closed).toContain('El cliente no los ve en la tienda.')
    expect(closed).toContain('BLOQUE-IDENTIFICADORES')
  })

  it('abre los códigos del fabricante solo si ya tienen valores', () => {
    formState.form = { ...EMPTY_FORM, manufacturerRefs: [{ uid: 'r1', value: '7701234567890' }] }
    expect(sectionOf(render(), 'datos-generales')).toMatch(/<details[^>]*\bopen\b[^>]*>\s*<summary[^>]*>Códigos del fabricante/)
  })

  it('en el resumen para el cliente hay tres subtítulos h3, cada uno con su ayuda, y ninguna ayuda interna', () => {
    const section = sectionOf(render(), 'resumen')
    expect(section).toContain('>Resumen para el cliente</h3>')
    const helps: Array<[string, string]> = [
      ['Etiquetas', 'Etiqueta pequeña junto al código del producto, por ejemplo «Destacado».'],
      ['Destacados', 'Lista con viñetas bajo el nombre. Escribe los beneficios principales.'],
      ['Características', 'Íconos con texto bajo los botones, por ejemplo «eSSD 1 TB». Es un resumen rápido; la tabla técnica va en Especificaciones.'],
    ]
    for (const [title, help] of helps) {
      expect(count(section, `>${title}</h3>`)).toBe(1)
      expect(section).toContain(help)
    }
    expect(count(section, '<h3')).toBe(4)
    expect(section).not.toContain('Textos cortos junto al nombre')
  })

  it('la dirección web va plegada al final de Publicar, como avanzado', () => {
    const section = sectionOf(render(), 'publicacion')
    expect(section).toMatch(/<details(?![^>]*\bopen\b)[^>]*>\s*<summary[^>]*>Dirección web \(avanzado\)<\/summary>/)
    expect(section.indexOf('PUBLICACION-REAL:p1')).toBeLessThan(section.indexOf('Dirección web (avanzado)'))
  })

  it('abre la dirección web si el producto ya tiene slug o está permitida por dirección', () => {
    formState.form = { ...EMPTY_FORM, slug: 'camara-domo-4k' }
    expect(sectionOf(render(), 'publicacion')).toMatch(/<details[^>]*\bopen\b[^>]*>\s*<summary[^>]*>Dirección web/)
    formState.form = { ...EMPTY_FORM, published: true }
    expect(sectionOf(render(), 'publicacion')).toMatch(/<details[^>]*\bopen\b[^>]*>\s*<summary[^>]*>Dirección web/)
  })

  it('el nombre del producto dice que es lo que ve el cliente en la tienda', () => {
    const html = render()
    expect(html).toContain('Es el nombre que ve el cliente en la tienda.')
    expect(html).not.toContain('más abajo')
  })

  it('pone un solo botón Guardar cambios al final del editor, sin Guardar datos ni Guardar ficha pública', () => {
    draftState.draft = sheetDraft()
    const html = render()
    expect(count(html, 'Guardar cambios')).toBe(1)
    expect(html).toMatch(/<button[^>]*>Guardar cambios<\/button>/)
    expect(html).not.toContain('Guardar datos')
    expect(html).not.toContain('Guardar ficha pública')
    expect(html.indexOf('Guardar cambios')).toBeGreaterThan(html.indexOf('id="seccion-historial"'))
  })

  it('la barra lista las partes con cambios sin guardar, en español simple', () => {
    draftState.draft = sheetDraft()
    expect(render()).toContain('Cambios sin guardar en: Ficha de la tienda')
  })

  it('no muestra la barra de guardado sin cambios ni errores', () => {
    draftState.draft = sheetDraft({ dirty: false })
    const html = render()
    expect(html).not.toContain('data-testid="editor-save-bar"')
    expect(html).not.toContain('Guardar cambios')
  })

  it('abre la sección indicada por un hash profundo', () => {
    const html = render({ hash: '#seccion-descripcion' })
    expect(html).not.toContain('id="seccion-descripcion" hidden=""')
    expect(html).toContain('id="seccion-datos-generales" hidden=""')
    expect(html).toContain('NOTES-DRAFT-MOCK')
  })

  it('abre Resumen para el cliente con su propio anclaje', () => {
    const html = render({ hash: '#seccion-resumen' })
    expect(html).not.toContain('id="seccion-resumen" hidden=""')
  })

  it('redirige los anclajes antiguos de la ficha a la sección que ahora tiene su contenido', () => {
    const redirects: Array<[string, string]> = [
      ['#seccion-ficha-publica', 'datos-generales'],
      ['#ficha-identidad', 'datos-generales'],
      ['#ficha-modelos', 'datos-generales'],
      ['#seccion-etiquetas', 'resumen'],
      ['#ficha-destacados', 'resumen'],
      ['#ficha-caracteristicas', 'resumen'],
      ['#seccion-ficha-notas', 'descripcion'],
      ['#ficha-especificaciones', 'descripcion'],
      ['#ficha-documentos', 'recursos'],
    ]
    for (const [hash, target] of redirects) {
      const html = render({ hash })
      expect(html, hash).not.toContain(`id="seccion-${target}" hidden=""`)
    }
  })

  it('ofrece archivo y restauración desde Fichas según el estado autorizado por la API', () => {
    const live = render({ data: product({ allowedActions: ['ARCHIVE'] }), permissions: ['products:write', 'products:notes'] })
    expect(live).toContain('Archivar producto')
    expect(live).not.toContain('Restaurar producto')
    const archived = render({ data: product({ lifecycleStatus: 'ARCHIVED', allowedActions: ['RESTORE'] }) })
    expect(archived).toContain('Restaurar producto')
    expect(archived).not.toContain('Archivar producto')
  })

  it('en Datos generales deja el SKU en solo lectura y muestra los valores guardados', () => {
    const html = render()
    expect(html).toContain('value="Cámara domo 4K"')
    expect(html).toMatch(/data-testid="sku-readonly"[^>]*>SKU-001<\/p>/)
    expect(html).not.toMatch(/<input[^>]*value="SKU-001"/)
    expect(html).toContain('Cámara para interiores')
    expect(html).toMatch(/<option value="b1" selected="">Hikvision<\/option>/)
    // The root category is derived from the subcategory and shown read-only (no free category select).
    expect(html).toMatch(/data-testid="classification-root"[^>]*>Cámaras<\/p>/)
    expect(html).not.toContain('id="editor-category"')
  })

  it('monta la sección real de publicación solo con acceso de publicación', () => {
    const html = render()
    expect(html).toContain('PUBLICACION-REAL:p1')
    expect(html).toContain('data-testid="library-publication-section" data-disabled="false"')
    expect(render({ permissions: ['products:write'] })).not.toContain('PUBLICACION-REAL:p1')
    expect(render({ permissions: ['products:publish'] })).toContain('PUBLICACION-REAL:p1')
  })

  it('bloquea la edición de publicación con borradores generales o de ficha pública', () => {
    expect(isPublicationEditingDisabled(false, false)).toBe(false)
    expect(isPublicationEditingDisabled(true, false)).toBe(true)
    expect(isPublicationEditingDisabled(false, true)).toBe(true)
  })

  it('no muestra una barra de guardado si no hay cambios pendientes', () => {
    const html = render()
    expect(html).not.toContain('biblioteca-editor__savebar')
    expect(html).not.toContain('Datos generales guardados.')
  })

  it('etiqueta cómo se guarda cada parte, sin repetir la ayuda en cada sección', () => {
    const html = render()
    expect(html).toContain('se guardan al instante')
    expect(html).toContain('Las notas internas tienen su propio guardado')
    expect(html).not.toContain('Se guarda con')
    expect(html).not.toContain('Editar ficha pública')
  })

  it('permite administrar precios con Fichas y Precios sin depender de la lista heredada', () => {
    const html = render()
    expect(html).toContain('Cliente final')
    expect(html).toContain('CLIENTE_FINAL_IVA')
    expect(html).toContain('>Nuevo precio</button>')
    expect(html).toContain('>Editar</button>')
    const withoutLista = render({ data: product({ listaId: null }) })
    expect(withoutLista).toContain('>Nuevo precio</button>')
    expect(render({ data: product({ prices: [] }) })).toContain('Este producto aún no tiene precios asignados.')
  })

  it('resume dónde se muestra y ya no enlaza a la pestaña Publicación', () => {
    const html = render({ permissions: ['products:read', 'products:write'] })
    expect(html).toContain('Publicado')
    expect(html).toContain('Estado de publicación')
    expect(html).toContain('Visible en la tienda')
    expect(html).not.toContain('/catalog-management/publication')
    expect(html).not.toContain('Abrir publicación')
    expect(html).toMatch(/<a[^>]*href="\/catalogo\/productos\/p1"[^>]*>Ver ficha publicada<\/a>/)
    const draft = render({ data: product({ lifecycleStatus: 'DRAFT', isActive: false, isVisible: false }), permissions: ['products:read', 'products:write'] })
    expect(draft).toContain('Borrador')
    expect(draft).toContain('Sin programar')
    expect(draft).not.toContain('Ver ficha publicada')
  })

  it('muestra en el encabezado si la ficha está Publicado o Borrador', () => {
    const published = render()
    expect(published).toMatch(/data-testid="editor-status-badge"[^>]*>Publicado<\/span>/)
    const draft = render({ data: product({ lifecycleStatus: 'DRAFT', isVisible: false }) })
    expect(draft).toMatch(/data-testid="editor-status-badge"[^>]*>Borrador<\/span>/)
    const legacy = render({ data: product({ lifecycleStatus: undefined }) })
    expect(legacy).toMatch(/data-testid="editor-status-badge"[^>]*>Borrador<\/span>/)
  })

  it('muestra Archivar y Quitar producto (peligro) según los permisos, sin Mover de categoría', () => {
    const html = render()
    expect(html).not.toContain('Mover de categoría')
    expect(html).toMatch(/<button[^>]*bg-\[var\(--color-error\)\][^>]*>Quitar producto<\/button>/)

    const writeOnly = render({ permissions: ['products:write'] })
    expect(writeOnly).toContain('>Archivar producto</button>')
    expect(writeOnly).not.toContain('Quitar producto')
    expect(writeOnly).not.toContain('PUBLICACION-REAL:p1')

    const readOnly = render({ permissions: [] })
    expect(readOnly).not.toContain('Mover de categoría')
    expect(readOnly).not.toContain('Quitar producto')
    expect(readOnly).not.toContain('Editar ficha pública')
    expect(readOnly).not.toContain('Editar precios')
    expect(readOnly).not.toContain('href="#seccion-ficha-publica"')
    expect(readOnly).not.toContain('seccion-ficha-identidad')
    expect(readOnly).toContain('No tienes permisos para archivar ni quitar productos.')
  })

  it('sin permiso de escritura no monta bloques de la ficha ni su barra', () => {
    draftState.draft = sheetDraft()
    const readOnly = render({ permissions: [] })
    expect(readOnly).not.toContain('BLOQUE-')
    expect(readOnly).not.toContain('Guardar cambios')
    expect(readOnly).not.toContain('Códigos del fabricante')
    expect(readOnly).not.toContain('Dirección web (avanzado)')
    for (const id of ['resumen', 'recursos']) {
      expect(readOnly).not.toContain(`id="seccion-${id}"`)
    }
  })

  it('muestra el estado de carga mientras llega el producto', () => {
    const html = render({ data: null })
    expect(html).toContain('Cargando producto')
    expect(html).not.toContain('Datos generales')
  })

  it('con permiso de escritura muestra Editar | Vista previa y la vista previa de la ficha', () => {
    const html = render()
    expect(html).toContain('aria-label="Qué quieres ver"')
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Editar<\/button>/)
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Vista previa<\/button>/)
    expect(html).toContain('biblioteca-editor__layout--preview')
    expect(html).toContain('data-view="editar"')
    expect(html).toContain('>Así lo ve el cliente</h3>')
    expect(html).toContain('data-wide="false"')
  })

  it('sin permiso de escritura no muestra el selector de vista ni la vista previa', () => {
    const readOnly = render({ permissions: [] })
    expect(readOnly).not.toContain('aria-label="Qué quieres ver"')
    expect(readOnly).not.toContain('>Vista previa</button>')
    expect(readOnly).not.toContain('biblioteca-editor__layout--preview')
    expect(readOnly).not.toContain('Así lo ve el cliente')
    expect(readOnly).toContain('class="biblioteca-editor__layout"')
  })
})

describe('estados sin producto', () => {
  const inRouter = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

  it('producto inexistente: avisa y devuelve a Fichas de producto', () => {
    const html = inRouter(<EditorNotFound />)
    expect(html).toContain('No encontramos este producto')
    expect(html).toContain('href="/commercial/library/update/products"')
  })

  it('error de carga: muestra el mensaje del servidor y Reintentar', () => {
    const html = inRouter(<EditorLoadError error={{ response: { data: { message: 'Servicio caído' } } }} onRetry={() => undefined} />)
    expect(html).toContain('Servicio caído')
    expect(html).toContain('role="alert"')
    expect(html).toContain('>Reintentar</button>')
  })
})
