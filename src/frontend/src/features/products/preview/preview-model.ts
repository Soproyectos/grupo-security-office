/**
 * Live preview of the product sheet editor. Pure (no React, no DOM): it turns the
 * editor draft into the ProductDetail the storefront renders, following the backend
 * mapper (modules/products/public-detail/product.mapper.ts), and says in plain words
 * where each editable field shows up.
 */
import type {
  BreadcrumbItem,
  DocumentType,
  FirmwareFile,
  ProductDetail,
  ProductDocument,
  ProductFeature,
  ProductFirmware,
  ProductImage,
  ProductPrice,
  SpecGroup,
} from '../types'
import type { Product, ProductPrice as SavedPrice } from '../types/product.types'
import type { SheetForm, SheetResourceKind, TextRow } from '../sheet/sheet-form'

export type PreviewField =
  | 'name'
  | 'sku'
  | 'brand'
  | 'category'
  | 'status'
  | 'badges'
  | 'price'
  | 'highlights'
  | 'description'
  | 'features'
  | 'images'
  | 'specs'
  | 'resources'
  // Data with no place in the storefront: manufacturer codes, web address, notes...
  | 'internal'

export const PREVIEW_FIELDS: readonly PreviewField[] = [
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
]

export function isPreviewField(value: string | null | undefined): value is PreviewField {
  return (PREVIEW_FIELDS as readonly string[]).includes(value ?? '')
}

/** Editor section (id from its section index) where each field is edited. */
export const FIELD_SECTION: Record<PreviewField, string> = {
  name: 'datos-generales',
  sku: 'datos-generales',
  brand: 'datos-generales',
  category: 'datos-generales',
  status: 'datos-generales',
  badges: 'resumen',
  price: 'precios',
  highlights: 'resumen',
  description: 'descripcion',
  features: 'resumen',
  images: 'imagenes',
  specs: 'descripcion',
  resources: 'recursos',
  internal: 'datos-generales',
}

/** Field to highlight when the person only switches section; null when the section holds several fields. */
export const SECTION_DEFAULT_FIELD: Record<string, PreviewField | null> = {
  'datos-generales': null,
  imagenes: 'images',
  resumen: null,
  descripcion: null,
  precios: 'price',
  recursos: 'resources',
  publicacion: null,
  acciones: null,
  'notas-internas': null,
  historial: null,
}

export interface PreviewInput {
  product: Product
  /** Current page values; the brand is already resolved to its name. */
  values: { name: string; brandName: string; description: string }
  /** Sheet draft; null while it is still loading. */
  form: SheetForm | null
  /** Key data (datos clave) of the draft projection, shown as the first spec group. */
  keySpecItems?: { label: string; value: string }[]
}

export interface PreviewCaption {
  title: string
  text: string
  empty: boolean
}

// Tariff the storefront prices with (backend DEFAULT_PUBLIC_PRICE_LIST_CODE). The backend
// can override it from its environment, which the browser cannot read, so the default is assumed.
const PUBLIC_PRICE_LIST_CODE = 'CLIENTE_FINAL_IVA'

// Same mapping as the backend DOCUMENT_TYPES; any other resource kind is firmware or release notes.
const DOCUMENT_TYPES: Partial<Record<SheetResourceKind, DocumentType>> = {
  DATASHEET: 'datasheet',
  MANUAL: 'manual',
  QUICK_GUIDE: 'quick-guide',
  CERTIFICATE: 'certificate',
  OTHER_DOCUMENT: 'other',
}

const LEGACY_SPEC_GROUP_ID = 'especificaciones-tecnicas'
const LEGACY_SPEC_GROUP_TITLE = 'Especificaciones técnicas'

const DATASHEET_HINT =
  /ficha[\s_-]*tecnica|data[\s_-]*sheet|hoja[\s_-]*de[\s_-]*datos|technical[\s_-]*(data[\s_-]*)?sheet|spec[\s_-]*sheet/

/**
 * Builds the storefront view of the saved product with the editor draft applied.
 * With `form` null (still loading) the sheet-driven lists stay empty.
 */
export function buildPreviewProduct({ product, values, form, keySpecItems }: PreviewInput): ProductDetail {
  const name = values.name.trim() || product.name
  const models = nonBlankValues(form?.availableModels)
  const resources = form ? buildResources(form, product, models) : { documents: [], firmware: null }
  const gallery = buildGallery(product, form, name)

  return {
    id: product.id,
    slug: form?.slug.trim() ?? '',
    price: publicPrice(product.prices ?? [], Date.now()),
    isInformational: false,
    description: values.description.trim() || null,
    images: gallery,
    brand: values.brandName.trim(),
    model: form?.model.trim() || product.sku,
    name,
    status: form?.status === 'DISCONTINUED' ? 'discontinued' : 'active',
    badges: nonBlankValues(form?.badges),
    breadcrumb: buildBreadcrumb(product),
    image: gallery[0] ?? null,
    highlights: nonBlankValues(form?.highlights),
    features: buildFeatures(form),
    availableModels: models,
    specGroups: withKeySpecGroup(form ? buildSpecGroups(form, product) : [], keySpecItems),
    specsDisclaimer: nonEmpty(form?.specsDisclaimer),
    documents: resources.documents,
    firmware: resources.firmware,
  }
}

/** Caption for the field the person is editing; `null` means no field is focused. */
export function describePreviewField(field: PreviewField | null, preview: ProductDetail): PreviewCaption {
  switch (field) {
    case null:
      return caption('Vista previa', 'Elige un campo para ver dónde aparece en la tienda.')
    case 'name':
      return caption('Nombre del producto', 'Es el título grande de la ficha.')
    case 'sku':
      return caption('Referencia (SKU)', 'Aparece como código pequeño sobre el nombre.')
    case 'brand':
      return caption('Marca', 'Aparece como «Marca: …» bajo el nombre.')
    case 'category':
      return caption('Categoría', 'Aparece en la ruta de navegación sobre el nombre.')
    case 'status':
      return caption('Estado en la tienda', 'Un producto descontinuado muestra un aviso junto al código.')
    case 'badges':
      return preview.badges.length === 0
        ? caption('Etiquetas', 'Aún no hay etiquetas. Cuando agregues una, aparecerá junto al código del producto.', true)
        : caption('Etiquetas', 'Son las etiquetas pequeñas junto al código del producto.')
    case 'price':
      return preview.price === null
        ? caption('Precio', 'Sin precio vigente: la tienda muestra «Precio a consultar».', true)
        : caption('Precio', 'Es el precio vigente para el cliente. Se actualiza al cambiarlo en Precios.')
    case 'highlights':
      return preview.highlights.length === 0
        ? caption('Destacados', 'Aún no hay destacados. Cuando agregues uno, aparecerá como viñeta bajo el nombre.', true)
        : caption('Destacados', 'Es la lista con viñetas bajo el nombre.')
    case 'description':
      // The storefront replaces the description with the highlights list, so it is hidden then.
      if (preview.highlights.length > 0) {
        return caption('Descripción', 'Ahora no se ve en la tienda porque el producto tiene destacados.', true)
      }
      if (preview.description === null) {
        return caption('Descripción', 'Aún no hay descripción. Se mostrará bajo el nombre.', true)
      }
      return caption('Descripción', 'Se muestra bajo el nombre.')
    case 'features':
      return preview.features.length === 0
        ? caption('Características', 'Aún no hay características. Cuando agregues una, aparecerá como ícono con texto.', true)
        : caption('Características', 'Son los íconos con texto bajo los botones.')
    case 'images':
      return preview.images.length === 0
        ? caption('Imágenes', 'Aún no hay fotos. Sube la primera para que se vea en la ficha.', true)
        : caption('Imágenes', 'La primera foto es la principal; las demás van en la galería.')
    case 'specs':
      return preview.specGroups.length === 0
        ? caption('Especificaciones', 'Aún no hay especificaciones. La sección aparecerá cuando agregues el primer grupo.', true)
        : caption('Especificaciones', 'Es la tabla técnica al final de la ficha.')
    case 'resources':
      return preview.documents.length === 0 && preview.firmware === null
        ? caption('Recursos', 'Aún no hay recursos. La sección aparecerá cuando agregues el primero.', true)
        : caption('Recursos', 'Son los documentos y el firmware que el cliente puede descargar.')
    case 'internal':
      return caption('Solo uso interno', 'Este dato no aparece en la tienda.')
  }
}

/** Caption for a section that has no storefront preview; null for sections that do. */
export function describeSectionWithoutPreview(sectionId: string): PreviewCaption | null {
  switch (sectionId) {
    case 'publicacion':
      return caption('Publicar', 'Aquí decides cuándo se muestra la ficha; no cambia su contenido.')
    case 'acciones':
      return caption('Archivar o quitar', 'Esta sección no cambia lo que ve el cliente.')
    case 'notas-internas':
      return caption('Notas internas', 'Las notas son solo para tu equipo: no aparecen en la tienda.')
    case 'historial':
      return caption('Historial', 'Solo lectura: no cambia lo que ve el cliente.')
    case 'datos-clave':
      return caption('Datos clave', 'La vista previa muestra el borrador de los datos clave, no lo publicado.')
    default:
      return null
  }
}

// ------------------------------ Helpers ------------------------------

const caption = (title: string, text: string, empty = false): PreviewCaption => ({ title, text, empty })

const nonEmpty = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const nonBlankValues = (rows: TextRow[] | undefined): string[] =>
  (rows ?? []).map((row) => row.value.trim()).filter(Boolean)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Trimmed text capped at `max` characters; null when blank or not text. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed.slice(0, max)
}

const stripAccents = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Lowercase, accent-free, dash-separated key from free text (backend slugifyKey). */
function slugifyKey(text: string, maxLength = 64): string {
  return stripAccents(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')
}

/** `base`, or `base-2`, `base-3`… when taken; records the result. */
function uniqueKey(base: string, taken: Set<string>): string {
  let candidate = base
  let n = 2
  while (taken.has(candidate)) candidate = `${base}-${n++}`.slice(-64)
  taken.add(candidate)
  return candidate
}

const hasControlChars = (text: string): boolean =>
  [...text].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)

/** Only https/http links or site paths; never javascript:, data:, //host or credentials (backend safeDocumentUrl). */
function safeLink(raw: unknown): { url: string; path: string } | null {
  if (typeof raw !== 'string') return null
  const url = raw.trim()
  if (url === '' || url.length > 2048 || hasControlChars(url) || url.includes('\\')) return null
  if (url.startsWith('/')) {
    if (url.startsWith('//')) return null
    return { url, path: url.split(/[?#]/)[0] ?? '' }
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.username !== '' || parsed.password !== '') return null
    return { url, path: parsed.pathname }
  } catch {
    return null
  }
}

/** Legacy product documents shown as datasheets (backend sanitizeDatasheets). */
function sanitizeDatasheets(raw: unknown): { name: string; url: string }[] {
  const entries: unknown[] = Array.isArray(raw) ? raw : []
  const sheets: { name: string; url: string }[] = []
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const link = safeLink(entry.url)
    if (link === null) continue
    const name = cleanText(entry.name, 200)
    const type = cleanText(entry.type, 60)
    const hinted =
      (name !== null && DATASHEET_HINT.test(stripAccents(name))) ||
      (type !== null && (DATASHEET_HINT.test(stripAccents(type)) || stripAccents(type) === 'ficha'))
    if (!hinted && !/\.pdf$/i.test(link.path)) continue
    sheets.push({ name: name ?? 'Ficha técnica', url: link.url })
  }
  return sheets
}

function formatSpecValue(value: unknown): string | null {
  if (typeof value === 'string') return cleanText(value, 500)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (Array.isArray(value)) {
    const parts = value
      .map((item: unknown) => (typeof item === 'string' || typeof item === 'number' ? formatSpecValue(item) : null))
      .filter((item): item is string => item !== null)
    return parts.length > 0 ? parts.join(', ') : null
  }
  return null
}

interface LegacySpec {
  key: string
  value: string
  unit: string | null
}

/** Legacy `technicalSpecs` entries that have a value (backend sanitizeTechnicalSpecs). */
function sanitizeTechnicalSpecs(raw: unknown): LegacySpec[] {
  const entries: unknown[] = Array.isArray(raw) ? raw : []
  const specs: LegacySpec[] = []
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const key = cleanText(entry.key, 120)
    const value = formatSpecValue(entry.value)
    if (key === null || value === null) continue
    specs.push({ key, value, unit: cleanText(entry.unit, 30) })
  }
  return specs
}

// ------------------------------ Mapping ------------------------------

function buildBreadcrumb(product: Product): BreadcrumbItem[] {
  const trail: BreadcrumbItem[] = [{ label: 'Catálogo', href: '/catalogo' }]
  if (product.category) {
    const slug = product.category.slug
    trail.push({ label: product.category.name, href: slug ? `/catalogo/categoria/${slug}` : '#' })
  }
  return trail
}

/** Sheet photo first, then the saved photos with the primary one first; duplicates and empty urls are dropped. */
function buildGallery(product: Product, form: SheetForm | null, name: string): ProductImage[] {
  const gallery: ProductImage[] = []
  const add = (src: string, alt: string) => {
    if (src && !gallery.some((image) => image.src === src)) gallery.push({ src, alt })
  }
  if (form) add(form.imageUrl.trim(), nonEmpty(form.imageAlt) ?? name)
  // Stable sort: the photos keep their saved order apart from the primary one.
  const saved = [...(product.images ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  for (const image of saved) add(image.url, image.alt ?? name)
  return gallery
}

function isOpenAt(window: { validFrom: string | null; validUntil: string | null }, now: number): boolean {
  const started = !window.validFrom || Date.parse(window.validFrom) <= now
  const notEnded = !window.validUntil || Date.parse(window.validUntil) >= now
  return started && notEnded
}

/** The storefront price: the public tariff, valid now and positive (backend PublicPricingService). */
function publicPrice(prices: SavedPrice[], now: number): ProductPrice | null {
  for (const price of prices) {
    if (price.priceList?.code !== PUBLIC_PRICE_LIST_CODE) continue
    if (!isOpenAt(price, now)) continue
    if (!Number.isFinite(price.value) || price.value <= 0) continue
    return { value: price.value, currency: price.currency }
  }
  return null
}

function buildFeatures(form: SheetForm | null): ProductFeature[] {
  const features: ProductFeature[] = []
  for (const row of form?.features ?? []) {
    const label = row.label.trim()
    if (label) features.push({ id: row.id || row.uid, label, icon: row.icon })
  }
  return features
}

const KEY_SPEC_GROUP_ID = 'datos-principales'

/** Puts the draft key data first, as the storefront sheet does with its "Datos principales" group. */
function withKeySpecGroup(groups: SpecGroup[], items: { label: string; value: string }[] | undefined): SpecGroup[] {
  if (!items || items.length === 0) return groups
  return [{ id: KEY_SPEC_GROUP_ID, title: 'Datos principales', items }, ...groups.filter((group) => group.id !== KEY_SPEC_GROUP_ID)]
}

function buildSpecGroups(form: SheetForm, product: Product): SpecGroup[] {
  const keys = new Set<string>()
  const groups: SpecGroup[] = []
  form.specGroups.forEach((row, index) => {
    const title = row.title.trim()
    if (!title) return
    const base = row.key?.trim() || slugifyKey(title) || `grupo-${index + 1}`
    groups.push({
      id: uniqueKey(base, keys),
      title,
      items: row.items.flatMap((item) => {
        const label = item.label.trim()
        const value = item.value.trim()
        return label && value ? [{ label, value }] : []
      }),
    })
  })
  if (groups.length > 0) return groups

  // Without sheet groups the storefront shows the legacy technical list as one group.
  const legacy = sanitizeTechnicalSpecs(product.technicalSpecs)
  if (legacy.length === 0) return []
  return [
    {
      id: LEGACY_SPEC_GROUP_ID,
      title: LEGACY_SPEC_GROUP_TITLE,
      items: legacy.map((spec) => ({
        label: spec.key,
        value: spec.unit ? `${spec.value} ${spec.unit}` : spec.value,
      })),
    },
  ]
}

interface ResourcesView {
  documents: ProductDocument[]
  firmware: ProductFirmware | null
}

/** Splits the sheet resources into documents and firmware (backend product.mapper). */
function buildResources(form: SheetForm, product: Product, models: string[]): ResourcesView {
  const documents: ProductDocument[] = []
  const firmwareFiles: FirmwareFile[] = []

  for (const row of form.resources) {
    const title = row.title.trim()
    const url = row.url.trim()
    if (!title || !url) continue
    const type = DOCUMENT_TYPES[row.kind]
    if (type) {
      documents.push({
        id: row.uid,
        type,
        title,
        language: row.language.trim().toLowerCase(),
        url,
        fileName: nonEmpty(row.fileName),
      })
    } else {
      firmwareFiles.push({
        id: row.uid,
        kind: row.kind === 'FIRMWARE' ? 'firmware' : 'release-notes',
        title,
        version: nonEmpty(row.version),
        region: nonEmpty(row.region),
        url,
        requiresLicense: row.requiresLicense,
      })
    }
  }

  // Without sheet documents the storefront falls back to the product's legacy datasheets.
  if (documents.length === 0) {
    sanitizeDatasheets(product.documents).forEach((sheet, index) => {
      documents.push({ id: `datasheet-${index}`, type: 'datasheet', title: sheet.name, language: 'es', url: sheet.url })
    })
  }

  return {
    documents,
    firmware:
      firmwareFiles.length > 0
        ? { note: nonEmpty(form.firmwareNote), files: firmwareFiles, appliesTo: models }
        : null,
  }
}
