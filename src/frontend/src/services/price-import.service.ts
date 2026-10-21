import api from './api'

export interface PriceImportIssue {
  row: number | null
  column?: string
  code: string
  message: string
}

export interface PreviewPrice {
  code: string
  raw: string
  rounded: string
  previous: string | null
  difference: string | null
  wasRounded: boolean
  change: 'new' | 'changed' | 'unchanged'
}

export interface PriceImportRow {
  row: number
  sku: string
  status: 'valid' | 'error'
  issues: PriceImportIssue[]
  prices: PreviewPrice[]
}

/** Extra counters of the mixed-lista preview (SKU matching, 30 % alert); absent in old responses. */
export interface PriceImportMixedSummary {
  unlistedRows?: number
  unknownRows?: number
  rejectedRows?: number
  rowsInInaccessibleListas?: number
  largeChangePrices?: number
  largeChangeThresholdPct?: number
}

export interface PriceImportPreview {
  listaId?: string | null
  fileName: string
  currency: 'COP'
  taxIncluded: true
  rounding: 'HALF_UP'
  readOnly: true
  summary: {
    rows: number
    validRows: number
    errorRows: number
    prices: number
    newPrices: number
    changedPrices: number
    unchangedPrices: number
    roundedPrices: number
  } & PriceImportMixedSummary
  issues: PriceImportIssue[]
  rows: PriceImportRow[]
}

/** Single-template preview: rows are matched by SKU across the catalog, so no lista is sent. */
export async function previewPriceFile(file: File, signal?: AbortSignal): Promise<PriceImportPreview> {
  const form = new FormData()
  form.append('file', file)
  const response = await api.post<PriceImportPreview>('/prices/import/preview', form, { signal })
  return response.data
}

export async function previewPriceImport(listaId: string, file: File, signal?: AbortSignal): Promise<PriceImportPreview> {
  const form = new FormData()
  form.append('listaId', listaId)
  form.append('file', file)
  const response = await api.post<PriceImportPreview>('/prices/import/preview', form, { signal })
  return response.data
}

// ─── IMP-02 — descarga de plantilla NUEVA (§3): nunca toca el archivo del usuario ───

export type PriceTemplateMode = 'vacias' | 'referencias'

/** Extrae el nombre del archivo del header Content-Disposition del servidor. */
export function parseTemplateFileName(contentDisposition: string | undefined): string {
  const match = contentDisposition && /filename="?([^";]+)"?/i.exec(contentDisposition)
  return match?.[1] ?? 'plantilla-precios.xlsx'
}

/**
 * Descarga la plantilla generada por el servidor (archivo NUEVO). Las tarifas
 * viajan como csv en el orden del usuario; el servidor las reordena y valida
 * contra PRICE_IMPORT_TARIFFS (nada de tarifas inventadas).
 */
export async function downloadPriceTemplate(
  listaId: string,
  mode: PriceTemplateMode,
  tariffs?: string[],
): Promise<{ blob: Blob; fileName: string }> {
  const params: Record<string, string> = { listaId, mode }
  if (tariffs && tariffs.length > 0) params.tariffs = tariffs.join(',')
  const response = await api.get('/prices/import/template', { params, responseType: 'blob' })
  const headers = (response as { headers?: Record<string, string | undefined> }).headers
  return {
    blob: response.data as Blob,
    fileName: parseTemplateFileName(headers?.['content-disposition'] ?? headers?.['Content-Disposition']),
  }
}

/** Official empty template (sheet PLANTILLA, "(CON IVA)" headers); needs no lista. */
export async function downloadOfficialPriceTemplate(): Promise<{ blob: Blob; fileName: string }> {
  const response = await api.get('/prices/import/template/official', { responseType: 'blob' })
  const headers = (response as { headers?: Record<string, string | undefined> }).headers
  return {
    blob: response.data as Blob,
    fileName: parseTemplateFileName(headers?.['content-disposition'] ?? headers?.['Content-Disposition']),
  }
}

/** Guarda el blob como descarga del navegador (sin jsdom: usa document/URL reales en runtime). */
export function saveTemplateDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

// ─── IMP-06 — revisión persistida, aplicar e historial (backend IMP-04/05) ───

export interface PriceImportRevisionTariff {
  code: string
  priceListId: string | null
  validFrom: string | null
  validUntil: string | null
}

export interface PriceImportRevisionApplyResult {
  revisionId: string
  status: 'APLICADA'
  alreadyApplied: boolean
  appliedRows: number
  appliedPrices: number
  tariffs: string[]
  appliedAt: string
  unchangedPrices?: number
  rejectedRows?: number
  largeChangesConfirmed?: boolean
}

export interface PriceImportRevisionHeader {
  id: string
  listaId: string | null
  status: 'GUARDADA' | 'APLICADA' | 'DESCARTADA'
  fileName: string
  fileHash: string
  fileSize: number
  fileAvailable: boolean
  idempotencyKey: string
  currency: 'COP'
  taxIncluded: true
  rounding: 'HALF_UP'
  policyVersion: string
  parserVersion: string
  trailerVersion: string | null
  tariffs: PriceImportRevisionTariff[]
  summary: PriceImportPreview['summary']
  createdById: string | null
  createdAt: string
  appliedAt: string | null
  appliedResult: PriceImportRevisionApplyResult | null
}

export interface PriceImportRevisionDetail extends PriceImportRevisionHeader {
  rows: PriceImportRow[]
  totalRows: number
  page: number
  pageSize: number
}

export interface PriceImportRevisionPage {
  items: PriceImportRevisionHeader[]
  total: number
  page: number
  pageSize: number
}

/** Clave de idempotencia del cliente: guardar dos veces con la misma no duplica. */
export function createRevisionIdempotencyKey(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID()
  return `rev-${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

/** Guarda la revisión (servidor recalcula; el navegador NO manda filas ni precios). */
export async function savePriceRevision(
  listaId: string,
  file: File,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<PriceImportRevisionHeader> {
  const form = new FormData()
  form.append('listaId', listaId)
  form.append('idempotencyKey', idempotencyKey)
  form.append('file', file)
  const response = await api.post<PriceImportRevisionHeader>('/prices/import/revisions', form, { signal })
  return response.data
}

export async function listPriceRevisions(listaId: string, page?: number, pageSize?: number): Promise<PriceImportRevisionPage> {
  const params: Record<string, string> = { listaId }
  if (page) params.page = String(page)
  if (pageSize) params.pageSize = String(pageSize)
  const response = await api.get<PriceImportRevisionPage>('/prices/import/revisions', { params })
  return response.data
}

export async function getPriceRevision(id: string, page?: number, pageSize?: number): Promise<PriceImportRevisionDetail> {
  const params: Record<string, string> = {}
  if (page) params.page = String(page)
  if (pageSize) params.pageSize = String(pageSize)
  const response = await api.get<PriceImportRevisionDetail>(`/prices/import/revisions/${id}`, { params })
  return response.data
}

/** Single-template save: the server recalculates; no lista is sent. */
export async function savePriceFileRevision(file: File, idempotencyKey: string, signal?: AbortSignal): Promise<PriceImportRevisionHeader> {
  const form = new FormData()
  form.append('idempotencyKey', idempotencyKey)
  form.append('file', file)
  const response = await api.post<PriceImportRevisionHeader>('/prices/import/revisions', form, { signal })
  return response.data
}

export interface ApplyPriceRevisionOptions {
  /** Must equal the number of rejected rows left unapplied when there are any. */
  acknowledgeRejectedRows?: number
  confirmLargeChanges?: boolean
}

/** Aplica la revisión (acción separada `prices:apply`). Reintento idempotente por el servidor. */
export async function applyPriceRevision(id: string, options?: ApplyPriceRevisionOptions): Promise<PriceImportRevisionApplyResult> {
  const response = await api.post<PriceImportRevisionApplyResult>(`/prices/import/revisions/${id}/apply`, options ?? {})
  return response.data
}

// ─── Unknown SKUs of an applied revision: hidden draft "pending ficha" or skip ───

export interface UnknownReferenceItem {
  rowNumber: number
  sku: string
  canCreate: boolean
  prices: Array<{ tariffCode: string; received: string; value: string }>
}

export interface UnknownReferencesView {
  revisionId: string
  status: string
  canCreate: boolean
  defaults: { brandId: string | null; categoryId: string | null }
  items: UnknownReferenceItem[]
  total: number
  page: number
  pageSize: number
}

export type UnknownReferenceResolution =
  | { rowNumber: number; action: 'SKIP' }
  | { rowNumber: number; action: 'CREATE'; name: string; brandId: string; categoryId: string }

export interface UnknownReferenceOutcome {
  rowNumber: number
  status: 'CREATED' | 'SKIPPED' | 'FAILED'
  code?: string
  message?: string
  productId?: string
}

export async function listUnknownReferences(revisionId: string): Promise<UnknownReferencesView> {
  const response = await api.get<UnknownReferencesView>(`/prices/import/revisions/${revisionId}/unknown-references`)
  return response.data
}

export async function resolveUnknownReferences(
  revisionId: string,
  items: UnknownReferenceResolution[],
): Promise<{ revisionId: string; results: UnknownReferenceOutcome[] }> {
  const response = await api.post<{ revisionId: string; results: UnknownReferenceOutcome[] }>(
    `/prices/import/revisions/${revisionId}/unknown-references/resolve`,
    { items },
  )
  return response.data
}

export async function discardPriceRevision(id: string): Promise<PriceImportRevisionHeader> {
  const response = await api.delete<PriceImportRevisionHeader>(`/prices/import/revisions/${id}`)
  return response.data
}

export async function downloadPriceRevisionFile(id: string): Promise<{ blob: Blob; fileName: string }> {
  const response = await api.get(`/prices/import/revisions/${id}/file`, { responseType: 'blob' })
  const headers = (response as { headers?: Record<string, string | undefined> }).headers
  return {
    blob: response.data as Blob,
    fileName: parseTemplateFileName(headers?.['content-disposition'] ?? headers?.['Content-Disposition']),
  }
}

// ─── IMP-07 (07A) — exportación de la lista (solo datos/tarifas autorizados) ───

/**
 * Exporta las referencias y los precios VIGENTES de una lista como .xlsx.
 * El servidor exige `prices:read` y el acceso a la lista; aquí solo se pide el
 * archivo (nunca se manda el archivo del usuario).
 */
export async function exportListaPrices(
  listaId: string,
  tariffs?: string[],
): Promise<{ blob: Blob; fileName: string }> {
  const params: Record<string, string> = { listaId }
  if (tariffs && tariffs.length > 0) params.tariffs = tariffs.join(',')
  const response = await api.get('/prices/import/export', { params, responseType: 'blob' })
  const headers = (response as { headers?: Record<string, string | undefined> }).headers
  return {
    blob: response.data as Blob,
    fileName: parseTemplateFileName(headers?.['content-disposition'] ?? headers?.['Content-Disposition']),
  }
}

// ─── IMP-07B (07B) — perfiles de proveedor reutilizables ───

export interface ProviderEquivalence {
  externalRef: string
  productId: string
}

export interface ProviderProfile {
  id: string
  providerName: string
  sheet: string
  headerRow: number
  thousandsSeparator: string
  decimalSeparator: string
  currency: string
  tariffs: string[]
  expectedColumns: string[]
  version: number
  createdAt: string
  updatedAt: string
  equivalences: ProviderEquivalence[]
}

export interface ProviderProfileInput {
  providerName: string
  sheet: string
  headerRow: number
  thousandsSeparator: string
  decimalSeparator: string
  currency: string
  tariffs: string[]
  expectedColumns: string[]
}

/** Reconocimiento: `requiresReview` = el encabezado cambió o el proveedor es nuevo. */
export interface ProviderRecognition {
  found: boolean
  profileId: string | null
  providerName: string
  version: number | null
  matches: boolean
  requiresReview: boolean
  expectedColumns: string[]
}

/** Resolución de una referencia externa: sin equivalencia única queda `pending`. */
export interface ResolvedReference {
  externalRef: string
  productId: string | null
  status: 'resolved' | 'pending'
}

export async function listProviderProfiles(): Promise<ProviderProfile[]> {
  const response = await api.get<ProviderProfile[]>('/prices/import/profiles')
  return response.data
}

export async function getProviderProfile(id: string): Promise<ProviderProfile> {
  const response = await api.get<ProviderProfile>(`/prices/import/profiles/${id}`)
  return response.data
}

export async function createProviderProfile(input: ProviderProfileInput): Promise<ProviderProfile> {
  const response = await api.post<ProviderProfile>('/prices/import/profiles', input)
  return response.data
}

export async function updateProviderProfile(id: string, input: ProviderProfileInput): Promise<ProviderProfile> {
  const response = await api.put<ProviderProfile>(`/prices/import/profiles/${id}`, input)
  return response.data
}

export async function deleteProviderProfile(id: string): Promise<{ id: string; deleted: true }> {
  const response = await api.delete<{ id: string; deleted: true }>(`/prices/import/profiles/${id}`)
  return response.data
}

export async function setProviderEquivalences(
  id: string,
  equivalences: ProviderEquivalence[],
): Promise<ProviderProfile> {
  const response = await api.put<ProviderProfile>(`/prices/import/profiles/${id}/equivalences`, { equivalences })
  return response.data
}

export async function recognizeProviderProfile(
  providerName: string,
  headers: string[],
): Promise<ProviderRecognition> {
  const response = await api.post<ProviderRecognition>('/prices/import/profiles/recognize', { providerName, headers })
  return response.data
}

export async function resolveProviderReferences(
  id: string,
  references: string[],
): Promise<{ profileId: string; resolution: ResolvedReference[] }> {
  const response = await api.post<{ profileId: string; resolution: ResolvedReference[] }>(
    `/prices/import/profiles/${id}/resolve`,
    { references },
  )
  return response.data
}
