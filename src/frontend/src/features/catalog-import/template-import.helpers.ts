import type {
  BatchState, MappingIncident, MappingKind, MappingResolution, PreviewItem, PreviewOptions, ResultStatus, TemplateIssue, TemplatePreview,
} from './template-import.types'

export type WizardStage = 'template' | 'upload' | 'resolve' | 'preview' | 'progress' | 'result'

export const WIZARD_STEPS: ReadonlyArray<{ stage: WizardStage; label: string }> = [
  { stage: 'template', label: 'Plantilla' },
  { stage: 'upload', label: 'Subir y validar' },
  { stage: 'resolve', label: 'Resolver' },
  { stage: 'preview', label: 'Vista previa' },
  { stage: 'progress', label: 'Confirmar y progreso' },
  { stage: 'result', label: 'Resultado' },
]

export type StepState = 'done' | 'current' | 'upcoming'

export function stepStates(current: WizardStage): Array<{ stage: WizardStage; label: string; number: number; state: StepState }> {
  const index = WIZARD_STEPS.findIndex((step) => step.stage === current)
  return WIZARD_STEPS.map((step, i) => ({ ...step, number: i + 1, state: i < index ? 'done' : i === index ? 'current' : 'upcoming' }))
}

// ---------------------------------------------------------------- permissions

/** Read-only users see the template download and the history only; running needs `imports:run`. */
export function visibleSections(canRun: boolean): Array<'wizard' | 'history'> {
  return canRun ? ['wizard', 'history'] : ['history']
}

// ---------------------------------------------------------------- errors

export interface FriendlyError { message: string; details: string[] }

const asRecord = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined)

/** Turns an HTTP/network error into a short Spanish message plus optional detail lines (structure errors of the file). */
export function friendlyImportError(error: unknown): FriendlyError {
  const response = asRecord(asRecord(error)?.response)
  const status = typeof response?.status === 'number' ? response.status : undefined
  const body = asRecord(response?.data)
  const code = typeof body?.code === 'string' ? body.code : undefined
  const message = typeof body?.message === 'string' ? body.message : undefined
  const fatal = Array.isArray(body?.fatal) ? (body.fatal as unknown[]) : []
  const details = fatal
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item?.message === 'string')
    .map((item) => `${item.sheet ? `Hoja ${String(item.sheet)}` : 'Archivo'}${typeof item.row === 'number' ? `, fila ${item.row}` : ''}: ${String(item.message)}`)

  if (!response) return { message: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.', details: [] }
  if (status === 403) return { message: 'Tu cuenta no tiene permiso para hacer esto. Pide el acceso de importaciones a quien administra la plataforma.', details: [] }
  if (status === 413 || code === 'CATALOG_TEMPLATE_FILE_TOO_LARGE') return { message: 'El archivo es demasiado grande. Divídelo en partes más pequeñas e inténtalo de nuevo.', details: [] }
  if (status === 409) {
    return { message: message ?? 'El catálogo cambió o esta vista previa ya se aplicó. Sube el archivo de nuevo para revisar los datos actuales.', details: [] }
  }
  if (status === 404) return { message: 'No encontramos esta importación o ya venció. Sube el archivo de nuevo.', details: [] }
  if (code === 'CATALOG_TEMPLATE_INVALID') return { message: message ?? 'El archivo no cumple la plantilla. Descarga la plantilla vigente e inténtalo de nuevo.', details }
  if (status === 400) return { message: message ?? 'No pudimos leer el archivo. Usa un archivo .xlsx de la plantilla.', details }
  return { message: message ?? 'No se pudo completar la operación. Inténtalo de nuevo en unos minutos.', details: [] }
}

export const isAcceptedFileName = (name: string) => /\.xlsx$/i.test(name.trim())

// ---------------------------------------------------------------- preview

export type PreviewTabKey = 'creates' | 'updates' | 'proposals' | 'skipped' | 'errors'

export const PREVIEW_TAB_LABELS: Record<PreviewTabKey, string> = {
  creates: 'Productos nuevos',
  updates: 'Se completan',
  proposals: 'Propuestas',
  skipped: 'Sin cambios',
  errors: 'Con errores',
}

/** Rows of each preview tab, with its count; empty tabs stay visible so people see "0". */
export function previewTabs(preview: Pick<TemplatePreview, PreviewTabKey>): Array<{ key: PreviewTabKey; label: string; count: number; rows: PreviewItem[] }> {
  return (Object.keys(PREVIEW_TAB_LABELS) as PreviewTabKey[]).map((key) => ({ key, label: PREVIEW_TAB_LABELS[key], count: preview[key].length, rows: preview[key] }))
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre', description: 'Descripción', brand: 'Marca', category: 'Categoría', subcategory: 'Subcategoría', classification: 'Clasificación',
  technicalSpecs: 'Características', extraAttributes: 'Atributos', features: 'Características destacadas', resources: 'Imágenes y documentos',
  images: 'Imágenes', documents: 'Documentos', firmware: 'Firmware',
}
export const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(vacío)'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try { return JSON.stringify(value) } catch { return '(valor complejo)' }
}

export interface ChangeLine { field: string; label: string; before: string; after: string }
export const changeLines = (changes: Array<{ field: string; key?: string; before: unknown; after: unknown }>): ChangeLine[] =>
  changes.map((change) => ({
    field: change.field,
    label: change.key ? `${fieldLabel(change.field)} (${change.key})` : fieldLabel(change.field),
    before: displayValue(change.before),
    after: displayValue(change.after),
  }))

// ---------------------------------------------------------------- mappings

export const MAPPING_KIND_LABELS: Record<MappingKind, string> = { brand: 'Marca', category: 'Categoría', subcategory: 'Subcategoría' }

export const incidentKey = (kind: MappingKind, sourceText: string) => `${kind}:${sourceText.trim().toLowerCase()}`

export function resolutionFor(resolutions: MappingResolution[], kind: MappingKind, sourceText: string): string | null {
  return resolutions.find((r) => incidentKey(r.kind, r.sourceText) === incidentKey(kind, sourceText))?.targetId ?? null
}

/** Existing masters a person may pick for an incident. Never offers anything that does not exist. */
export function mappingChoices(kind: MappingKind, options: PreviewOptions): Array<{ id: string; label: string }> {
  if (kind === 'brand') return options.brands.map((b) => ({ id: b.id, label: b.name }))
  if (kind === 'category') return options.categories.map((c) => ({ id: c.id, label: c.name }))
  return options.subcategories.map((s) => ({ id: s.id, label: `${s.name} (${s.category})` }))
}

/** Replaces (or removes, when targetId is null) the decision of one source text. */
export function upsertResolution(current: MappingResolution[], next: MappingResolution): MappingResolution[] {
  const rest = current.filter((r) => incidentKey(r.kind, r.sourceText) !== incidentKey(next.kind, next.sourceText))
  return next.targetId ? [...rest, next] : rest
}

export function groupIncidents(incidents: MappingIncident[]): Array<{ kind: MappingKind; label: string; items: MappingIncident[] }> {
  return (['brand', 'category', 'subcategory'] as MappingKind[])
    .map((kind) => ({ kind, label: MAPPING_KIND_LABELS[kind], items: incidents.filter((i) => i.kind === kind) }))
    .filter((group) => group.items.length > 0)
}

export function incidentMessage(incident: MappingIncident): string {
  const count = incident.skus.length
  return `"${incident.sourceText || '(vacío)'}" no coincide con ningún registro existente. Afecta ${count} ${count === 1 ? 'producto' : 'productos'}.`
}

export function conflictNotice(error: unknown): string | null {
  const body = asRecord(asRecord(asRecord(error)?.response)?.data)
  const code = typeof body?.code === 'string' ? body.code : ''
  if (code === 'CLASSIFICATION_CONFLICT' || (typeof body?.message === 'string' && /CLASSIFICATION_CONFLICT/.test(body.message))) {
    return 'Esa subcategoría no pertenece a la categoría elegida. Escoge una opción que corresponda.'
  }
  return null
}

// ---------------------------------------------------------------- confirmUnresolved

/** SKUs of new products that can be added "keeping the source text + incident". */
export const confirmableSkus = (preview: Pick<TemplatePreview, 'creates'>): string[] =>
  preview.creates.filter((item) => item.needsConfirmation).map((item) => item.sku)

export function toggleSku(selected: readonly string[], sku: string): string[] {
  return selected.includes(sku) ? selected.filter((s) => s !== sku) : [...selected, sku]
}

/** Only SKUs that are still confirmable remain after a mapping change recalculated the preview. */
export function buildConfirmUnresolved(selected: readonly string[], preview: Pick<TemplatePreview, 'creates'>): string[] {
  const allowed = new Set(confirmableSkus(preview))
  return selected.filter((sku) => allowed.has(sku))
}

export const toggleAllSkus = (preview: Pick<TemplatePreview, 'creates'>, selected: readonly string[]): string[] => {
  const all = confirmableSkus(preview)
  return all.length > 0 && all.every((sku) => selected.includes(sku)) ? [] : all
}

export function canConfirmImport(input: { canRun: boolean; busy: boolean; preview: TemplatePreview | null }): boolean {
  if (!input.canRun || input.busy || !input.preview) return false
  const s = input.preview.summary
  return s.create + s.update + s.proposed > 0
}

// ---------------------------------------------------------------- progress

export function progressPercent(processed: number, total: number): number {
  if (!Number.isFinite(processed) || !Number.isFinite(total) || total <= 0) return total === 0 ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((processed / total) * 100)))
}

export const POLL_INTERVAL_MS = 2000
export const MAX_POLLS = 900 // about 30 minutes; afterwards the person reopens the batch from the history

export const isBatchFinished = (state: BatchState) => state !== 'PROCESSING'
export const shouldKeepPolling = (state: BatchState, polls: number) => state === 'PROCESSING' && polls < MAX_POLLS

export const BATCH_STATE_LABELS: Record<BatchState, string> = {
  PROCESSING: 'En proceso',
  COMPLETED: 'Terminada',
  COMPLETED_WITH_ERRORS: 'Terminada con avisos',
  FAILED: 'No se completó',
}

export const RESULT_STATUS_LABELS: Record<ResultStatus, string> = {
  CREATED: 'Creado como borrador',
  UPDATED: 'Completado',
  UNCHANGED: 'Sin cambios',
  PROPOSED: 'Propuesta (no se aplicó)',
  INVALID: 'Con errores, no se importó',
  STALE: 'Cambió mientras tanto, no se aplicó',
  NEEDS_CONFIRMATION: 'Faltó confirmar',
  FAILED: 'Falló al guardar',
}

export function countLines(counts: Record<ResultStatus, number>): Array<{ status: ResultStatus; label: string; value: number }> {
  return (Object.keys(RESULT_STATUS_LABELS) as ResultStatus[]).map((status) => ({ status, label: RESULT_STATUS_LABELS[status], value: counts[status] ?? 0 }))
}

export const issueLine = (issue: TemplateIssue) =>
  `${issue.severity === 'error' ? 'Error' : 'Aviso'}${issue.sheet ? ` · hoja ${issue.sheet}` : ''}${issue.row ? ` · fila ${issue.row}` : ''}: ${issue.message}`

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}
