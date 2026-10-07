import { formatCurrency } from '../../../lib/format'
import { LIFECYCLE_STATUS_LABEL } from '../lib/lifecycle'

/**
 * Pure helpers that turn a raw audit-log entry into plain Spanish text:
 * who did what, when, and which fields changed (labels and values a person can read).
 * Raw ids, UUIDs and internal keys never reach the screen.
 */

/** Minimal shape of the audit entry returned by `GET /api/audit/Product/:id`. */
export interface AuditEntryInput {
  action: string
  userId?: string | null
  /** Display name resolved by the server; null when the entry has no actor or the user was deleted. */
  actorName?: string | null
  /** Legacy shape (older servers): used only as a fallback for the name. */
  user?: { name?: string | null } | null
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  createdAt: string
}

export type AuditChangeKind = 'changed' | 'set' | 'removed'

export interface AuditChangeRow {
  key: string
  label: string
  kind: AuditChangeKind
  /** Formatted previous value (null when there was none to show). */
  before: string | null
  /** Formatted new value (null when there was none to show). */
  after: string | null
}

export interface AuditEntryView {
  actor: string
  /** Verb phrase without the actor, e.g. "actualizó la ficha del producto". */
  verb: string
  /** Full sentence: "María Gómez actualizó la ficha del producto". */
  sentence: string
  when: string
  changes: AuditChangeRow[]
  tone: 'success' | 'error' | 'info' | 'warning'
}

// ------------------------------ Actions ------------------------------

const ACTION_VERBS: Record<string, string> = {
  create: 'creó el producto',
  update: 'actualizó el producto',
  update_sheet: 'actualizó la ficha del producto',
  delete: 'eliminó el producto',
  publish: 'publicó el producto en la tienda',
  unpublish: 'quitó el producto de la tienda',
  archive: 'archivó el producto',
  restore: 'restauró el producto',
  schedule_publish: 'programó la publicación del producto',
  cancel_schedule_publish: 'canceló la publicación programada del producto',
  schedule_publish_bulk: 'programó la publicación del producto junto con otros productos',
  cancel_schedule_publish_bulk: 'canceló la publicación programada del producto junto con otros productos',
  import_products: 'actualizó el producto desde una importación de lista',
  upsert: 'actualizó el producto',
  duplicate: 'duplicó el producto',
  status_change: 'cambió el estado del producto',
  update_price: 'actualizó un precio del producto',
  create_price: 'agregó un precio al producto',
  delete_price: 'eliminó un precio del producto',
  price_update: 'actualizó un precio del producto',
  price_create: 'agregó un precio al producto',
  price_delete: 'eliminó un precio del producto',
  update_stock: 'actualizó las existencias del producto',
  upload_image: 'subió una imagen del producto',
  delete_image: 'eliminó una imagen del producto',
  update_image: 'modificó una imagen del producto',
  set_primary_image: 'cambió la imagen principal del producto',
}

const FALLBACK_VERB = 'registró un cambio en el producto'

export function actionVerb(action: string | null | undefined): string {
  const key = (action ?? '').trim().toLowerCase()
  return ACTION_VERBS[key] ?? FALLBACK_VERB
}

function toneOf(action: string): AuditEntryView['tone'] {
  const key = action.trim().toLowerCase()
  if (key === 'delete' || key === 'archive' || key.startsWith('delete_')) return 'error'
  if (key === 'create' || key === 'publish' || key === 'restore') return 'success'
  if (key.startsWith('cancel_') || key === 'unpublish') return 'warning'
  return 'info'
}

// ------------------------------ Actor ------------------------------

export function actorLabel(entry: Pick<AuditEntryInput, 'userId' | 'actorName' | 'user'>): string {
  const name = (entry.actorName ?? entry.user?.name ?? '').trim()
  if (name) return name
  return entry.userId ? 'Usuario eliminado' : 'Sistema'
}

// ------------------------------ Date ------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

export function formatAuditDate(value: string | Date | null | undefined): string {
  if (!value) return 'fecha desconocida'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'fecha desconocida'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

// ------------------------------ Field labels ------------------------------

const FIELD_LABELS: Record<string, string> = {
  sku: 'SKU',
  name: 'Nombre',
  description: 'Descripción',
  lifecycleStatus: 'Estado en la tienda',
  isActive: 'Activo',
  isVisible: 'Visible en la tienda',
  publishStatus: 'Estado de publicación',
  publishAt: 'Publicación programada para',
  unpublishAt: 'Despublicación programada para',
  publishedAt: 'Fecha de publicación',
  unpublishReason: 'Motivo de despublicación',
  price: 'Precio',
  listPrice: 'Precio de lista',
  unitPrice: 'Precio unitario',
  cost: 'Costo',
  value: 'Valor',
  currency: 'Moneda',
  stock: 'Existencias',
  quantity: 'Cantidad',
  technicalSpecs: 'Especificaciones técnicas',
  extraAttributes: 'Atributos extra',
  documents: 'Documentos',
  images: 'Imágenes',
  alt: 'Texto alternativo',
  isPrimary: 'Imagen principal',
  sortOrder: 'Orden',
  url: 'Dirección del archivo',
  type: 'Tipo',
  // Public sheet (update_sheet) — also reused by the generic fallback.
  slug: 'Dirección pública (slug)',
  published: 'Publicada',
  status: 'Estado',
  brand: 'Marca',
  model: 'Modelo',
  badges: 'Insignias',
  highlights: 'Destacados',
  features: 'Características',
  availableModels: 'Modelos disponibles',
  imageUrl: 'Imagen de la ficha',
  imageAlt: 'Texto alternativo de la imagen',
  specsDisclaimer: 'Aviso de especificaciones',
  firmwareNote: 'Nota de firmware',
  specGroups: 'Grupos de especificaciones',
  resources: 'Documentos y firmware',
  // Catalog fields as stored on the product.
  catalogName: 'Nombre de la ficha',
  catalogSlug: 'Dirección pública (slug)',
  catalogPublished: 'Ficha publicada',
  catalogStatus: 'Estado de la ficha',
  catalogBrand: 'Marca de la ficha',
  catalogModel: 'Modelo de la ficha',
  catalogBadges: 'Insignias',
  catalogHighlights: 'Destacados',
  catalogFeatures: 'Características',
  catalogAvailableModels: 'Modelos disponibles',
  catalogImageUrl: 'Imagen de la ficha',
  catalogImageAlt: 'Texto alternativo de la imagen',
  catalogSpecsDisclaimer: 'Aviso de especificaciones',
  catalogFirmwareNote: 'Nota de firmware',
  // Imports and bulk operations.
  fileName: 'Archivo',
  totalRows: 'Filas leídas',
  created: 'Creados',
  updated: 'Actualizados',
  skipped: 'Omitidos',
  errors: 'Errores',
  failed: 'Fallidos',
  succeeded: 'Exitosos',
  processed: 'Procesados',
  durationMs: 'Duración',
  columnsMapped: 'Columnas reconocidas',
  columnsExtra: 'Columnas adicionales',
  columnsSkipped: 'Columnas omitidas',
}

/** Overrides when the action edits the public sheet: the same keys mean other things there. */
const SHEET_LABELS: Record<string, string> = {
  name: 'Nombre de la ficha',
  slug: 'Dirección pública (slug)',
  published: 'Ficha publicada por su dirección (slug)',
  status: 'Estado de la ficha',
  brand: 'Marca de la ficha',
  model: 'Modelo de la ficha',
}

/** Keys that are internal bookkeeping: never shown. */
const HIDDEN_KEYS = new Set([
  'id',
  'uid',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'password',
  'token',
  'ipAddress',
  'userAgent',
  'defaultsByMissingInference',
  'identityChangesDetected',
])

const ID_KEY = /(^id$|Ids?$|_id$|Uuid$)/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isHiddenKey(key: string): boolean {
  return HIDDEN_KEYS.has(key) || ID_KEY.test(key)
}

function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function fieldLabel(key: string, action?: string): string {
  if (action?.trim().toLowerCase() === 'update_sheet' && SHEET_LABELS[key]) return SHEET_LABELS[key]
  return FIELD_LABELS[key] ?? humanizeKey(key)
}

// ------------------------------ Values ------------------------------

const MONEY_KEYS = new Set(['price', 'listPrice', 'unitPrice', 'cost', 'amount', 'total', 'subtotal'])

const ENUM_LABELS: Record<string, Record<string, string>> = {
  lifecycleStatus: LIFECYCLE_STATUS_LABEL,
  publishStatus: {
    borrador: 'Borrador',
    publicado: 'Publicado',
    programado: 'Programado',
    archivado: 'Archivado',
  },
  status: { ACTIVE: 'Vigente', DISCONTINUED: 'Descontinuado' },
  catalogStatus: { ACTIVE: 'Vigente', DISCONTINUED: 'Descontinuado' },
  type: {
    PORTADA: 'Portada',
    LOGO: 'Logo',
    PRINCIPAL: 'Principal',
    COMPLEMENTARIA: 'Complementaria',
    EXTRA: 'Extra',
  },
}

const MAX_TEXT = 120
export const EMPTY_VALUE = 'vacío'

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

export function formatAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return EMPTY_VALUE
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return EMPTY_VALUE
    if (MONEY_KEYS.has(key)) return formatCurrency(value, 'COP')
    if (key === 'durationMs') return `${(value / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} s`
    return value.toLocaleString('es-CO')
  }
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return EMPTY_VALUE
    if (ISO_DATE.test(text)) return formatAuditDate(text)
    const enumLabel = ENUM_LABELS[key]?.[text] ?? ENUM_LABELS[key]?.[text.toLowerCase()]
    if (enumLabel) return enumLabel
    if (MONEY_KEYS.has(key) && /^-?\d+(\.\d+)?$/.test(text)) return formatCurrency(Number(text), 'COP')
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? 'ninguno' : plural(value.length, 'elemento', 'elementos')
  }
  if (typeof value === 'object') {
    const size = Object.keys(value as Record<string, unknown>).length
    return size === 0 ? EMPTY_VALUE : plural(size, 'dato', 'datos')
  }
  return String(value)
}

function isIdValue(value: unknown): boolean {
  return typeof value === 'string' && UUID.test(value.trim())
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a == null && b == null
  if (typeof a !== typeof b || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) if (!deepEqual(left[key], right[key])) return false
  return true
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

// ------------------------------ Changes ------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Readable list of what changed. Only fields that differ are listed when both sides exist. */
export function buildChanges(
  oldValues: unknown,
  newValues: unknown,
  action?: string,
): AuditChangeRow[] {
  const before = isRecord(oldValues) ? oldValues : null
  const after = isRecord(newValues) ? newValues : null
  const rows: AuditChangeRow[] = []

  if (before && after) {
    // Compare the keys written now; keys present only in the old snapshot did not change.
    for (const key of Object.keys(after)) {
      if (isHiddenKey(key)) continue
      const previous = before[key]
      const next = after[key]
      if (deepEqual(previous, next)) continue
      if (isIdValue(previous) || isIdValue(next)) continue
      const beforeText = formatAuditValue(key, previous)
      let afterText = formatAuditValue(key, next)
      // Same summary on both sides (e.g. two lists of 3 items with different content).
      if (afterText === beforeText) afterText = `${afterText} (con cambios)`
      rows.push({
        key,
        label: fieldLabel(key, action),
        kind: isEmpty(previous) && !isEmpty(next) ? 'set' : !isEmpty(previous) && isEmpty(next) ? 'removed' : 'changed',
        before: beforeText,
        after: afterText,
      })
    }
    return rows
  }

  const single = after ?? before
  if (!single) return rows
  const kind: AuditChangeKind = after ? 'set' : 'removed'
  for (const key of Object.keys(single)) {
    if (isHiddenKey(key)) continue
    const value = single[key]
    if (isIdValue(value)) continue
    if (isEmpty(value)) continue
    const text = formatAuditValue(key, value)
    rows.push({
      key,
      label: fieldLabel(key, action),
      kind,
      before: kind === 'removed' ? text : null,
      after: kind === 'set' ? text : null,
    })
  }
  return rows
}

// ------------------------------ Entry ------------------------------

export function describeAuditEntry(entry: AuditEntryInput): AuditEntryView {
  const actor = actorLabel(entry)
  const verb = actionVerb(entry.action)
  return {
    actor,
    verb,
    sentence: `${actor} ${verb}`,
    when: formatAuditDate(entry.createdAt),
    changes: buildChanges(entry.oldValues, entry.newValues, entry.action),
    tone: toneOf(entry.action ?? ''),
  }
}
