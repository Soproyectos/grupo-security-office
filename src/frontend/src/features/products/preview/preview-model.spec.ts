import { describe, expect, it } from 'vitest'
import { sheetFixture } from '../sheet/fixtures'
import { newFeature, newResource, newSpecGroup, toForm } from '../sheet/sheet-form'
import type { ProductSheetApi, SheetForm } from '../sheet/sheet-form'
import type { ProductDetail } from '../types'
import type { Product } from '../types/product.types'
import {
  buildPreviewProduct,
  describePreviewField,
  describeSectionWithoutPreview,
  FIELD_SECTION,
  isPreviewField,
  PREVIEW_FIELDS,
  SECTION_DEFAULT_FIELD,
} from './preview-model'

const SECTION_IDS = [
  'datos-generales',
  'imagenes',
  'resumen',
  'descripcion',
  'precios',
  'recursos',
  'publicacion',
  'acciones',
  'notas-internas',
  'historial',
]

const values = { name: 'DVR AcuSense de 4 canales', brandName: 'Hikvision', description: '' }

const clientTariff = { id: 'list-cliente', name: 'Cliente final IVA', code: 'CLIENTE_FINAL_IVA' }

const savedProduct = (over: Partial<Product> = {}): Product => ({
  id: 'prod-1',
  sku: 'IDS-E04HQHI-D',
  name: 'DVR Turbo 4 canales',
  description: null,
  categoryId: 'cat-video',
  brandId: 'brand-hikvision',
  technicalSpecs: null,
  isActive: true,
  isVisible: true,
  category: { id: 'cat-video', name: 'Video', slug: 'video' },
  brand: { id: 'brand-hikvision', name: 'Hikvision', slug: 'hikvision' },
  images: [],
  prices: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const priceEntry = (over: Partial<Product['prices'][number]> = {}): Product['prices'][number] => ({
  id: 'price-1',
  value: 1500000,
  currency: 'COP',
  validFrom: null,
  validUntil: null,
  priceList: clientTariff,
  ...over,
})

const formFrom = (over: Partial<ProductSheetApi> = {}): SheetForm => toForm(sheetFixture(over))

const previewOf = (
  product: Product = savedProduct(),
  form: SheetForm | null = formFrom(),
  page: typeof values = values,
): ProductDetail => buildPreviewProduct({ product, values: page, form })

/** Preview of the default fixtures with `over` applied on top, for the caption tests. */
const basePreview = (over: Partial<ProductDetail> = {}): ProductDetail => ({ ...previewOf(), ...over })

describe('buildPreviewProduct: identity and text', () => {
  it('uses the edited name, and the saved name when the edited one is blank', () => {
    expect(previewOf(savedProduct(), formFrom(), { ...values, name: '  Nombre nuevo  ' }).name).toBe('Nombre nuevo')
    expect(previewOf(savedProduct(), formFrom(), { ...values, name: '   ' }).name).toBe('DVR Turbo 4 canales')
  })

  it('uses the sheet model, and the SKU when the model is blank', () => {
    expect(previewOf().model).toBe('iDS-E04HQHI-D')
    expect(previewOf(savedProduct(), formFrom({ model: '   ' })).model).toBe('IDS-E04HQHI-D')
  })

  it('maps slug, brand, description, status and the spec disclaimer', () => {
    expect(previewOf()).toMatchObject({
      id: 'prod-1',
      slug: 'ids-e04hqhi-d',
      brand: 'Hikvision',
      description: null,
      status: 'active',
      isInformational: false,
      specsDisclaimer: 'Pruebas en entorno controlado.',
    })
    expect(previewOf(savedProduct(), formFrom({ status: 'DISCONTINUED' })).status).toBe('discontinued')
    expect(previewOf(savedProduct(), formFrom(), { ...values, description: '  Cámara 4K  ' }).description).toBe('Cámara 4K')
  })

  it('drops blank badge and highlight rows', () => {
    const preview = previewOf(savedProduct(), formFrom({ badges: ['  Nuevo ', '   '], highlights: ['', ' Uno '] }))
    expect(preview.badges).toEqual(['Nuevo'])
    expect(preview.highlights).toEqual(['Uno'])
  })

  it('drops feature rows without a label and gives new rows their client id', () => {
    const form = formFrom({
      features: [
        { id: 'acusense', label: ' AcuSense ', icon: 'person' },
        { id: 'vacia', label: '   ', icon: 'cloud' },
      ],
    })
    form.features.push({ ...newFeature(), label: 'Nueva', icon: 'cloud' })

    expect(previewOf(savedProduct(), form).features).toEqual([
      { id: 'acusense', label: 'AcuSense', icon: 'person' },
      { id: form.features[2]?.uid, label: 'Nueva', icon: 'cloud' },
    ])
  })

  it('cleans spec groups: key or title slug, skips blank titles and blank items', () => {
    const form = formFrom({ specGroups: [] })
    form.specGroups = [
      {
        uid: 'g1',
        key: 'video',
        title: ' Video ',
        items: [
          { uid: 'i1', label: 'Canales', value: '4' },
          { uid: 'i2', label: ' ', value: 'sin nombre' },
          { uid: 'i3', label: 'Resolución', value: '  ' },
        ],
      },
      { ...newSpecGroup(), title: '   ' },
      { ...newSpecGroup(), title: 'Protección perimetral', items: [{ uid: 'i4', label: 'Zonas', value: '8' }] },
      { ...newSpecGroup(), title: 'Video', items: [] },
    ]

    const { specGroups } = previewOf(savedProduct(), form)
    // The fourth group has no key and its title slug is taken, so it gets the backend's "-2" suffix.
    expect(specGroups.map((group) => group.id)).toEqual(['video', 'proteccion-perimetral', 'video-2'])
    expect(specGroups[0]?.items).toEqual([{ label: 'Canales', value: '4' }])
    expect(specGroups[1]?.items).toEqual([{ label: 'Zonas', value: '8' }])
    expect(specGroups[2]?.items).toEqual([])
  })

  it('gives the form null lists without throwing', () => {
    const preview = previewOf(savedProduct(), null)

    expect(preview).toMatchObject({
      slug: '',
      model: 'IDS-E04HQHI-D',
      status: 'active',
      badges: [],
      highlights: [],
      features: [],
      availableModels: [],
      specGroups: [],
      documents: [],
      firmware: null,
      images: [],
      image: null,
    })
    expect(preview.specsDisclaimer).toBeUndefined()
    expect(preview.name).toBe('DVR AcuSense de 4 canales')
  })
})

describe('buildPreviewProduct: resources', () => {
  it('splits resources into documents and firmware, with release notes as firmware', () => {
    const preview = previewOf()

    expect(preview.documents).toEqual([
      {
        id: expect.any(String),
        type: 'datasheet',
        title: 'Ficha técnica',
        language: 'en',
        url: 'https://example.com/ds.pdf',
        fileName: 'ds.pdf',
      },
      {
        id: expect.any(String),
        type: 'manual',
        title: 'Manual de usuario',
        language: 'es',
        url: '/api/files/manual-1',
        fileName: undefined,
      },
    ])
    expect(preview.firmware?.files.map((file) => [file.kind, file.title, file.requiresLicense])).toEqual([
      ['firmware', 'Firmware Europa V4.75', true],
      ['release-notes', 'Notas de versión', false],
    ])
    expect(preview.firmware?.files[0]).toMatchObject({ version: 'V4.75.011', region: 'Europa' })
    expect(preview.firmware?.files[1]?.region).toBeUndefined()
    expect(preview.firmware?.appliesTo).toEqual(['iDS-E04HQHI-D'])
    expect(preview.firmware?.note).toBe('Actualiza al firmware más reciente.')
  })

  it('skips resource rows without a title or a URL', () => {
    const form = formFrom({ resources: [] })
    form.resources = [
      { ...newResource('documents'), title: '', url: 'https://example.com/a.pdf' },
      { ...newResource('documents'), title: 'Sin enlace', url: '   ' },
    ]

    const preview = previewOf(savedProduct(), form)
    expect(preview.documents).toEqual([])
    expect(preview.firmware).toBeNull()
  })

  it('leaves firmware null when there are no firmware or release-note files', () => {
    const form = formFrom({
      resources: [
        {
          kind: 'DATASHEET',
          title: 'Ficha técnica',
          language: 'es',
          url: 'https://example.com/ds.pdf',
          fileName: null,
          version: null,
          region: null,
          requiresLicense: false,
        },
      ],
    })

    expect(previewOf(savedProduct(), form).firmware).toBeNull()
  })

  it('trims the firmware note and leaves it out when blank', () => {
    expect(previewOf(savedProduct(), formFrom({ firmwareNote: '  Nota con espacios  ' })).firmware?.note).toBe(
      'Nota con espacios',
    )
    expect(previewOf(savedProduct(), formFrom({ firmwareNote: '   ' })).firmware?.note).toBeUndefined()
  })

  it('uses the legacy datasheets when the sheet has no documents', () => {
    const product = savedProduct({
      documents: [
        { name: 'Ficha técnica PDF', url: 'https://cdn.test/ficha.pdf' },
        { name: 'Foto', url: 'https://cdn.test/foto.jpg' },
        { name: 'Hoja de datos', url: 'javascript:alert(1)' },
        { name: 'Ficha con barra', url: 'https://cdn.test\\ficha.pdf' },
        { name: 'Ficha con control', url: 'https://cdn.test/ficha\u0007.pdf' },
      ],
    })

    expect(previewOf(product, formFrom({ resources: [] })).documents).toEqual([
      {
        id: 'datasheet-0',
        type: 'datasheet',
        title: 'Ficha técnica PDF',
        language: 'es',
        url: 'https://cdn.test/ficha.pdf',
      },
    ])
  })

  it('uses the legacy technical list when the sheet has no spec groups', () => {
    const legacy = [
      { key: 'Resolución', value: '1080p', unit: 'px' },
      { key: 'Canales', value: 4, unit: null },
      { key: 'Vacío', value: '   ', unit: null },
      { key: 'Soporta', value: ['H.264', 'H.265'], unit: null },
    ]
    // The backend stores a list here although the frontend type says record: the cast mirrors the saved data.
    const product = savedProduct({ technicalSpecs: legacy as unknown as Product['technicalSpecs'] })

    expect(previewOf(product, formFrom({ specGroups: [] })).specGroups).toEqual([
      {
        id: 'especificaciones-tecnicas',
        title: 'Especificaciones técnicas',
        items: [
          { label: 'Resolución', value: '1080p px' },
          { label: 'Canales', value: '4' },
          { label: 'Soporta', value: 'H.264, H.265' },
        ],
      },
    ])
  })
})

describe('buildPreviewProduct: gallery, breadcrumb and price', () => {
  it('shows the sheet photo first, then the primary photo, without duplicates or empty urls', () => {
    const product = savedProduct({
      images: [
        { id: 'a', url: '/api/files/2', isPrimary: false, alt: null },
        { id: 'b', url: '/api/files/1', isPrimary: true, alt: 'Vista frontal' },
        { id: 'c', url: '', isPrimary: false },
        { id: 'd', url: 'https://cdn.test/hero.jpg', isPrimary: false },
      ],
    })
    const form = formFrom({ imageUrl: 'https://cdn.test/hero.jpg', imageAlt: '' })

    const preview = previewOf(product, form)
    expect(preview.images).toEqual([
      { src: 'https://cdn.test/hero.jpg', alt: 'DVR AcuSense de 4 canales' },
      { src: '/api/files/1', alt: 'Vista frontal' },
      { src: '/api/files/2', alt: 'DVR AcuSense de 4 canales' },
    ])
    expect(preview.image).toEqual(preview.images[0])
  })

  it('leaves the gallery and the main image empty when there are no photos', () => {
    const preview = previewOf(savedProduct(), formFrom({ imageUrl: null }))
    expect(preview.images).toEqual([])
    expect(preview.image).toBeNull()
  })

  it('starts the breadcrumb at the catalog and ends with the category', () => {
    expect(previewOf().breadcrumb).toEqual([
      { label: 'Catálogo', href: '/catalogo' },
      { label: 'Video', href: '/catalogo/categoria/video' },
    ])
    expect(previewOf(savedProduct({ category: { id: 'cat-video', name: 'Video', slug: '' } })).breadcrumb).toEqual([
      { label: 'Catálogo', href: '/catalogo' },
      { label: 'Video', href: '#' },
    ])
  })

  it('shows the public tariff price, and null when it is missing, expired, not yet valid or not positive', () => {
    const priceOf = (prices: Product['prices']) => previewOf(savedProduct({ prices })).price

    expect(priceOf([priceEntry({ priceList: { id: 'm', name: 'Mayorista', code: 'MAYORISTA' }, value: 900000 }), priceEntry()])).toEqual({
      value: 1500000,
      currency: 'COP',
    })
    expect(priceOf([priceEntry({ priceList: { id: 'm', name: 'Mayorista', code: 'MAYORISTA' } })])).toBeNull()
    expect(priceOf([priceEntry({ validUntil: '2020-01-01T00:00:00.000Z' })])).toBeNull()
    expect(priceOf([priceEntry({ validFrom: '2999-01-01T00:00:00.000Z' })])).toBeNull()
    expect(priceOf([priceEntry({ value: 0 })])).toBeNull()
    expect(priceOf([priceEntry({ validFrom: '2020-01-01T00:00:00.000Z', validUntil: '2999-01-01T00:00:00.000Z' })])).toEqual({
      value: 1500000,
      currency: 'COP',
    })
  })
})

describe('field map', () => {
  it('lists every preview field once, in order', () => {
    expect([...PREVIEW_FIELDS]).toEqual([
      'name',
      'sku',
      'brand',
      'category',
      'status',
      'badges',
      'price',
      'highlights',
      'description',
      'features',
      'images',
      'specs',
      'resources',
      'internal',
    ])
  })

  it('maps every preview field to an editor section, and internal data to the general data', () => {
    expect(Object.keys(FIELD_SECTION).sort()).toEqual([...PREVIEW_FIELDS].sort())
    for (const field of PREVIEW_FIELDS) expect(SECTION_IDS).toContain(FIELD_SECTION[field])
    expect(FIELD_SECTION.internal).toBe('datos-generales')
  })

  it('accepts preview fields and rejects anything else', () => {
    expect(isPreviewField('name')).toBe(true)
    expect(isPreviewField('internal')).toBe(true)
    expect(isPreviewField('slug')).toBe(false)
    expect(isPreviewField('Nombre')).toBe(false)
    expect(isPreviewField('')).toBe(false)
    expect(isPreviewField(null)).toBe(false)
    expect(isPreviewField(undefined)).toBe(false)
  })

  it('highlights a field only for single-purpose sections', () => {
    expect(Object.keys(SECTION_DEFAULT_FIELD).sort()).toEqual([...SECTION_IDS].sort())
    const defaults = Object.entries(SECTION_DEFAULT_FIELD).filter(([, field]) => field !== null)
    expect(Object.fromEntries(defaults)).toEqual({ imagenes: 'images', precios: 'price', recursos: 'resources' })
  })
})

describe('describePreviewField', () => {
  it('describes the preview itself when no field is focused', () => {
    expect(describePreviewField(null, basePreview())).toEqual({
      title: 'Vista previa',
      text: 'Elige un campo para ver dónde aparece en la tienda.',
      empty: false,
    })
  })

  it('describes the fixed fields', () => {
    const preview = basePreview()
    expect(describePreviewField('name', preview)).toEqual({
      title: 'Nombre del producto',
      text: 'Es el título grande de la ficha.',
      empty: false,
    })
    expect(describePreviewField('sku', preview)).toEqual({
      title: 'Referencia (SKU)',
      text: 'Aparece como código pequeño sobre el nombre.',
      empty: false,
    })
    expect(describePreviewField('brand', preview)).toEqual({
      title: 'Marca',
      text: 'Aparece como «Marca: …» bajo el nombre.',
      empty: false,
    })
    expect(describePreviewField('category', preview)).toEqual({
      title: 'Categoría',
      text: 'Aparece en la ruta de navegación sobre el nombre.',
      empty: false,
    })
    expect(describePreviewField('status', preview)).toEqual({
      title: 'Estado en la tienda',
      text: 'Un producto descontinuado muestra un aviso junto al código.',
      empty: false,
    })
    expect(describePreviewField('internal', preview)).toEqual({
      title: 'Solo uso interno',
      text: 'Este dato no aparece en la tienda.',
      empty: false,
    })
  })

  it('describes badges, highlights and features, empty and filled', () => {
    expect(describePreviewField('badges', basePreview({ badges: [] }))).toEqual({
      title: 'Etiquetas',
      text: 'Aún no hay etiquetas. Cuando agregues una, aparecerá junto al código del producto.',
      empty: true,
    })
    expect(describePreviewField('badges', basePreview())).toEqual({
      title: 'Etiquetas',
      text: 'Son las etiquetas pequeñas junto al código del producto.',
      empty: false,
    })
    expect(describePreviewField('highlights', basePreview({ highlights: [] }))).toEqual({
      title: 'Destacados',
      text: 'Aún no hay destacados. Cuando agregues uno, aparecerá como viñeta bajo el nombre.',
      empty: true,
    })
    expect(describePreviewField('highlights', basePreview())).toEqual({
      title: 'Destacados',
      text: 'Es la lista con viñetas bajo el nombre.',
      empty: false,
    })
    expect(describePreviewField('features', basePreview({ features: [] }))).toEqual({
      title: 'Características',
      text: 'Aún no hay características. Cuando agregues una, aparecerá como ícono con texto.',
      empty: true,
    })
    expect(describePreviewField('features', basePreview())).toEqual({
      title: 'Características',
      text: 'Son los íconos con texto bajo los botones.',
      empty: false,
    })
  })

  it('hides the description while the product has highlights', () => {
    expect(describePreviewField('description', basePreview({ highlights: ['Uno'], description: 'Texto' }))).toEqual({
      title: 'Descripción',
      text: 'Ahora no se ve en la tienda porque el producto tiene destacados.',
      empty: true,
    })
    expect(describePreviewField('description', basePreview({ highlights: [], description: null }))).toEqual({
      title: 'Descripción',
      text: 'Aún no hay descripción. Se mostrará bajo el nombre.',
      empty: true,
    })
    expect(describePreviewField('description', basePreview({ highlights: [], description: 'Texto' }))).toEqual({
      title: 'Descripción',
      text: 'Se muestra bajo el nombre.',
      empty: false,
    })
  })

  it('describes price, images, specs and resources, empty and filled', () => {
    expect(describePreviewField('price', basePreview({ price: null }))).toEqual({
      title: 'Precio',
      text: 'Sin precio vigente: la tienda muestra «Precio a consultar».',
      empty: true,
    })
    expect(describePreviewField('price', basePreview({ price: { value: 1500000, currency: 'COP' } }))).toEqual({
      title: 'Precio',
      text: 'Es el precio vigente para el cliente. Se actualiza al cambiarlo en Precios.',
      empty: false,
    })
    expect(describePreviewField('images', basePreview({ images: [] }))).toEqual({
      title: 'Imágenes',
      text: 'Aún no hay fotos. Sube la primera para que se vea en la ficha.',
      empty: true,
    })
    expect(describePreviewField('images', basePreview({ images: [{ src: 'https://cdn.test/a.jpg', alt: 'A' }] }))).toEqual({
      title: 'Imágenes',
      text: 'La primera foto es la principal; las demás van en la galería.',
      empty: false,
    })
    expect(describePreviewField('specs', basePreview({ specGroups: [] }))).toEqual({
      title: 'Especificaciones',
      text: 'Aún no hay especificaciones. La sección aparecerá cuando agregues el primer grupo.',
      empty: true,
    })
    expect(describePreviewField('specs', basePreview())).toEqual({
      title: 'Especificaciones',
      text: 'Es la tabla técnica al final de la ficha.',
      empty: false,
    })
    expect(describePreviewField('resources', basePreview({ documents: [], firmware: null }))).toEqual({
      title: 'Recursos',
      text: 'Aún no hay recursos. La sección aparecerá cuando agregues el primero.',
      empty: true,
    })
    expect(describePreviewField('resources', basePreview({ firmware: null }))).toEqual({
      title: 'Recursos',
      text: 'Son los documentos y el firmware que el cliente puede descargar.',
      empty: false,
    })
  })
})

describe('describeSectionWithoutPreview', () => {
  it('describes the sections that have no preview', () => {
    expect(describeSectionWithoutPreview('publicacion')).toEqual({
      title: 'Publicar',
      text: 'Aquí decides cuándo se muestra la ficha; no cambia su contenido.',
      empty: false,
    })
    expect(describeSectionWithoutPreview('acciones')).toEqual({
      title: 'Archivar o quitar',
      text: 'Esta sección no cambia lo que ve el cliente.',
      empty: false,
    })
    expect(describeSectionWithoutPreview('notas-internas')).toEqual({
      title: 'Notas internas',
      text: 'Las notas son solo para tu equipo: no aparecen en la tienda.',
      empty: false,
    })
    expect(describeSectionWithoutPreview('historial')).toEqual({
      title: 'Historial',
      text: 'Solo lectura: no cambia lo que ve el cliente.',
      empty: false,
    })
  })

  it('returns null for sections that show in the preview or are unknown', () => {
    expect(describeSectionWithoutPreview('datos-generales')).toBeNull()
    expect(describeSectionWithoutPreview('precios')).toBeNull()
    expect(describeSectionWithoutPreview('no-existe')).toBeNull()
  })
})

describe('buildPreviewProduct key data', () => {
  it('puts the draft key data first as "Datos principales"', async () => {
    const { buildPreviewProduct } = await import('./preview-model')
    const preview = buildPreviewProduct({
      product: { id: 'p', sku: 'S', name: 'N', brand: { id: 'b', name: 'B', slug: 'b' }, category: { id: 'c', name: 'C', slug: 'c' }, images: [], prices: [], technicalSpecs: null } as never,
      values: { name: 'N', brandName: 'B', description: '' },
      form: null,
      keySpecItems: [{ label: 'Potencia', value: '0 W' }],
    })
    expect(preview.specGroups[0]).toEqual({ id: 'datos-principales', title: 'Datos principales', items: [{ label: 'Potencia', value: '0 W' }] })
  })

  it('adds nothing when there are no key data', async () => {
    const { buildPreviewProduct } = await import('./preview-model')
    const preview = buildPreviewProduct({
      product: { id: 'p', sku: 'S', name: 'N', brand: { id: 'b', name: 'B', slug: 'b' }, category: { id: 'c', name: 'C', slug: 'c' }, images: [], prices: [], technicalSpecs: null } as never,
      values: { name: 'N', brandName: 'B', description: '' },
      form: null,
      keySpecItems: [],
    })
    expect(preview.specGroups).toEqual([])
  })
})
