/**
 * Pure model of the "Ficha" editor: API view <-> form state, validation, and the
 * list operations (add / remove / reorder) used by the UI. Kept free of React so it
 * can be unit-tested without a DOM.
 */

export const FEATURE_ICONS = ['shield', 'chip', 'video', 'person', 'audio', 'cloud', 'storage'] as const
export type SheetFeatureIcon = (typeof FEATURE_ICONS)[number]

export const FEATURE_ICON_LABELS: Record<SheetFeatureIcon, string> = {
  shield: 'Escudo (seguridad)',
  chip: 'Chip (procesamiento)',
  video: 'Video',
  person: 'Persona (analítica)',
  audio: 'Audio',
  cloud: 'Nube',
  storage: 'Almacenamiento',
}

export const RESOURCE_KINDS = [
  'DATASHEET',
  'MANUAL',
  'QUICK_GUIDE',
  'CERTIFICATE',
  'OTHER_DOCUMENT',
  'FIRMWARE',
  'RELEASE_NOTES',
] as const
export type SheetResourceKind = (typeof RESOURCE_KINDS)[number]

export const RESOURCE_KIND_LABELS: Record<SheetResourceKind, string> = {
  DATASHEET: 'Ficha técnica',
  MANUAL: 'Manual',
  QUICK_GUIDE: 'Guía rápida',
  CERTIFICATE: 'Certificado',
  OTHER_DOCUMENT: 'Otro documento',
  FIRMWARE: 'Firmware',
  RELEASE_NOTES: 'Notas de versión',
}

export type ResourceSection = 'documents' | 'firmware'
export const DOCUMENT_KINDS: SheetResourceKind[] = ['DATASHEET', 'MANUAL', 'QUICK_GUIDE', 'CERTIFICATE', 'OTHER_DOCUMENT']
export const FIRMWARE_KINDS: SheetResourceKind[] = ['FIRMWARE', 'RELEASE_NOTES']

export const sectionOfKind = (kind: SheetResourceKind): ResourceSection =>
  FIRMWARE_KINDS.includes(kind) ? 'firmware' : 'documents'

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,127}$/
export const URL_REGEX = /^(https?:\/\/[^\s/$.?#][^\s]*|\/api\/[^\s]*)$/i
export const LANGUAGE_REGEX = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const LIMITS = {
  badges: 10,
  highlights: 20,
  features: 12,
  availableModels: 50,
  specGroups: 40,
  itemsPerGroup: 100,
  resources: 60,
} as const

// ------------------------------ API shapes ------------------------------

export interface ProductSheetApi {
  productId: string
  sku: string
  productName: string
  name: string | null
  slug: string | null
  published: boolean
  status: 'ACTIVE' | 'DISCONTINUED'
  brand: string | null
  model: string | null
  badges: string[]
  highlights: string[]
  features: { id: string; label: string; icon: SheetFeatureIcon }[]
  availableModels: string[]
  imageUrl: string | null
  imageAlt: string | null
  specsDisclaimer: string | null
  firmwareNote: string | null
  specGroups: { key: string; title: string; items: { label: string; value: string }[] }[]
  resources: {
    kind: SheetResourceKind
    title: string
    language: string
    url: string
    fileName: string | null
    version: string | null
    region: string | null
    requiresLicense: boolean
  }[]
  updatedAt: string
}

/** Body of `PUT /products/:id/sheet`. */
export interface ProductSheetPayload {
  name: string | null
  slug: string | null
  published: boolean
  status: 'ACTIVE' | 'DISCONTINUED'
  brand: string | null
  model: string | null
  badges: string[]
  highlights: string[]
  features: { id?: string; label: string; icon: SheetFeatureIcon }[]
  availableModels: string[]
  imageUrl: string | null
  imageAlt: string | null
  specsDisclaimer: string | null
  firmwareNote: string | null
  specGroups: { key?: string; title: string; items: { label: string; value: string }[] }[]
  resources: {
    kind: SheetResourceKind
    title: string
    language: string
    url: string
    fileName: string | null
    version: string | null
    region: string | null
    requiresLicense: boolean
  }[]
}

// ------------------------------ Form state ------------------------------

/** Every editable row has a client-only `uid` so React keys survive reordering. */
export interface TextRow {
  uid: string
  value: string
}
export interface FeatureRow {
  uid: string
  id?: string
  label: string
  icon: SheetFeatureIcon
}
export interface SpecItemRow {
  uid: string
  label: string
  value: string
}
export interface SpecGroupRow {
  uid: string
  key?: string
  title: string
  items: SpecItemRow[]
}
export interface ResourceRow {
  uid: string
  kind: SheetResourceKind
  title: string
  language: string
  url: string
  fileName: string
  version: string
  region: string
  requiresLicense: boolean
}

export interface SheetForm {
  name: string
  slug: string
  published: boolean
  status: 'ACTIVE' | 'DISCONTINUED'
  brand: string
  model: string
  imageUrl: string
  imageAlt: string
  badges: TextRow[]
  highlights: TextRow[]
  features: FeatureRow[]
  availableModels: TextRow[]
  specGroups: SpecGroupRow[]
  resources: ResourceRow[]
  specsDisclaimer: string
  firmwareNote: string
}

let uidCounter = 0
export const nextUid = (): string => `row-${++uidCounter}`

const textRows = (values: string[]): TextRow[] => values.map((value) => ({ uid: nextUid(), value }))

export function toForm(sheet: ProductSheetApi): SheetForm {
  return {
    name: sheet.name ?? '',
    slug: sheet.slug ?? '',
    published: sheet.published,
    status: sheet.status,
    brand: sheet.brand ?? '',
    model: sheet.model ?? '',
    imageUrl: sheet.imageUrl ?? '',
    imageAlt: sheet.imageAlt ?? '',
    badges: textRows(sheet.badges),
    highlights: textRows(sheet.highlights),
    features: sheet.features.map((f) => ({ uid: nextUid(), id: f.id, label: f.label, icon: f.icon })),
    availableModels: textRows(sheet.availableModels),
    specGroups: sheet.specGroups.map((g) => ({
      uid: nextUid(),
      key: g.key,
      title: g.title,
      items: g.items.map((i) => ({ uid: nextUid(), label: i.label, value: i.value })),
    })),
    resources: sheet.resources.map((r) => ({
      uid: nextUid(),
      kind: r.kind,
      title: r.title,
      language: r.language,
      url: r.url,
      fileName: r.fileName ?? '',
      version: r.version ?? '',
      region: r.region ?? '',
      requiresLicense: r.requiresLicense,
    })),
    specsDisclaimer: sheet.specsDisclaimer ?? '',
    firmwareNote: sheet.firmwareNote ?? '',
  }
}

const orNull = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const nonBlank = (rows: TextRow[]): string[] => rows.map((r) => r.value.trim()).filter(Boolean)

/** Form -> request body. Blank text becomes null; blank list rows are dropped. */
export function toPayload(form: SheetForm): ProductSheetPayload {
  return {
    name: orNull(form.name),
    slug: orNull(form.slug),
    published: form.published,
    status: form.status,
    brand: orNull(form.brand),
    model: orNull(form.model),
    badges: nonBlank(form.badges),
    highlights: nonBlank(form.highlights),
    features: form.features.map((f) => ({
      ...(f.id ? { id: f.id } : {}),
      label: f.label.trim(),
      icon: f.icon,
    })),
    availableModels: nonBlank(form.availableModels),
    imageUrl: orNull(form.imageUrl),
    imageAlt: orNull(form.imageAlt),
    specsDisclaimer: orNull(form.specsDisclaimer),
    firmwareNote: orNull(form.firmwareNote),
    specGroups: form.specGroups.map((g) => ({
      ...(g.key ? { key: g.key } : {}),
      title: g.title.trim(),
      items: g.items.map((i) => ({ label: i.label.trim(), value: i.value.trim() })),
    })),
    resources: form.resources.map((r) => ({
      kind: r.kind,
      title: r.title.trim(),
      language: r.language.trim().toLowerCase(),
      url: r.url.trim(),
      fileName: orNull(r.fileName),
      version: orNull(r.version),
      region: orNull(r.region),
      requiresLicense: r.requiresLicense,
    })),
  }
}

/** Comparable snapshot used for the unsaved-changes check. */
export const snapshot = (form: SheetForm): string => JSON.stringify(toPayload(form))

// ------------------------------ Validation ------------------------------

/** Errors keyed by field path, e.g. `slug`, `features.1.label`, `specGroups.0.items.2.value`. */
export type SheetErrors = Record<string, string>

export function validateForm(form: SheetForm): SheetErrors {
  const errors: SheetErrors = {}
  const slug = form.slug.trim()

  if (slug) {
    if (!SLUG_REGEX.test(slug)) errors.slug = 'Usa minúsculas, números y guiones (máx. 128).'
    else if (UUID_REGEX.test(slug)) errors.slug = 'El slug no puede tener formato de identificador (UUID).'
  } else if (form.published) {
    errors.slug = 'Una ficha publicada necesita un slug.'
  }

  const imageUrl = form.imageUrl.trim()
  if (imageUrl && !URL_REGEX.test(imageUrl)) errors.imageUrl = 'Debe ser una URL http(s) o una ruta /api/...'

  if (nonBlank(form.badges).length > LIMITS.badges) errors.badges = `Máximo ${LIMITS.badges} insignias.`
  if (nonBlank(form.highlights).length > LIMITS.highlights) errors.highlights = `Máximo ${LIMITS.highlights} destacados.`
  if (form.features.length > LIMITS.features) errors.features = `Máximo ${LIMITS.features} características.`
  if (nonBlank(form.availableModels).length > LIMITS.availableModels) {
    errors.availableModels = `Máximo ${LIMITS.availableModels} modelos.`
  }
  if (form.specGroups.length > LIMITS.specGroups) errors.specGroups = `Máximo ${LIMITS.specGroups} grupos.`
  if (form.resources.length > LIMITS.resources) errors.resources = `Máximo ${LIMITS.resources} documentos y firmware.`

  form.features.forEach((f, i) => {
    if (!f.label.trim()) errors[`features.${i}.label`] = 'Escribe el texto de la característica.'
    if (!FEATURE_ICONS.includes(f.icon)) errors[`features.${i}.icon`] = 'Elige un ícono.'
  })

  form.specGroups.forEach((g, gi) => {
    if (!g.title.trim()) errors[`specGroups.${gi}.title`] = 'El grupo necesita un título.'
    if (g.items.length > LIMITS.itemsPerGroup) errors[`specGroups.${gi}.items`] = `Máximo ${LIMITS.itemsPerGroup} filas.`
    g.items.forEach((item, ii) => {
      if (!item.label.trim()) errors[`specGroups.${gi}.items.${ii}.label`] = 'Falta el nombre.'
      if (!item.value.trim()) errors[`specGroups.${gi}.items.${ii}.value`] = 'Falta el valor.'
    })
  })

  form.resources.forEach((r, i) => {
    if (!r.title.trim()) errors[`resources.${i}.title`] = 'Falta el título.'
    const url = r.url.trim()
    if (!url) errors[`resources.${i}.url`] = 'Falta la URL.'
    else if (!URL_REGEX.test(url)) errors[`resources.${i}.url`] = 'Debe ser http(s) o una ruta /api/...'
    if (!LANGUAGE_REGEX.test(r.language.trim())) errors[`resources.${i}.language`] = 'Idioma inválido (ej. es, en).'
  })

  return errors
}

// ------------------------------ List operations ------------------------------

export function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index)
}

export function appendItem<T>(list: T[], item: T): T[] {
  return [...list, item]
}

export function replaceAt<T>(list: T[], index: number, item: T): T[] {
  return list.map((current, i) => (i === index ? item : current))
}

/** Swaps the element at `index` with its previous (-1) or next (+1) neighbor. */
export function moveItem<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list
  const next = [...list]
  const current = next[index] as T
  next[index] = next[target] as T
  next[target] = current
  return next
}

/**
 * Reorders inside a sub-list of a flat list: moves `list[index]` past the nearest
 * neighbor that satisfies `sameGroup` (documents and firmware live in one array).
 */
export function moveWithinGroup<T>(
  list: T[],
  index: number,
  direction: -1 | 1,
  sameGroup: (item: T) => boolean,
): T[] {
  let target = index + direction
  while (target >= 0 && target < list.length && !sameGroup(list[target] as T)) target += direction
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved as T)
  return next
}

export const newTextRow = (value = ''): TextRow => ({ uid: nextUid(), value })
export const newFeature = (): FeatureRow => ({ uid: nextUid(), label: '', icon: 'shield' })
export const newSpecItem = (): SpecItemRow => ({ uid: nextUid(), label: '', value: '' })
export const newSpecGroup = (): SpecGroupRow => ({ uid: nextUid(), title: '', items: [newSpecItem()] })
export const newResource = (section: ResourceSection): ResourceRow => ({
  uid: nextUid(),
  kind: section === 'firmware' ? 'FIRMWARE' : 'DATASHEET',
  title: '',
  language: 'es',
  url: '',
  fileName: '',
  version: '',
  region: '',
  requiresLicense: section === 'firmware',
})
