export type MappingKind = 'brand' | 'category' | 'subcategory'
export interface MappingResolution { kind: MappingKind; sourceText: string; targetId: string | null }
export interface MappingIncident { kind: MappingKind; code: string; sourceText: string; skus: string[] }

export interface TemplateIssue { severity: 'error' | 'warning'; code: string; message: string; sheet?: string; row?: number }
export interface PlanChange { field: string; key?: string; before: unknown; after: unknown }

export interface PreviewItem {
  row: number
  reference: string
  sku: string
  name: string
  code: string
  changes: PlanChange[]
  proposals: PlanChange[]
  pending: string[]
  protectedBy: string[]
  issues: TemplateIssue[]
  needsConfirmation: boolean
}

export interface PreviewOptions {
  brands: Array<{ id: string; name: string }>
  categories: Array<{ id: string; name: string }>
  subcategories: Array<{ id: string; name: string; categoryId: string; category: string }>
}

export interface TemplatePreview {
  previewId: string
  fileName: string
  templateVersion: string
  expiresAt: string
  summary: { total: number; create: number; update: number; unchanged: number; proposed: number; invalid: number; incidents: number; needsConfirmation: number }
  creates: PreviewItem[]
  updates: PreviewItem[]
  proposals: PreviewItem[]
  skipped: PreviewItem[]
  errors: PreviewItem[]
  unassigned: TemplateIssue[]
  mappingIncidents: MappingIncident[]
  resolutions: MappingResolution[]
  options: PreviewOptions
}

export type BatchState = 'PROCESSING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED'
export type ResultStatus = 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'PROPOSED' | 'INVALID' | 'STALE' | 'NEEDS_CONFIRMATION' | 'FAILED'
export type BatchCounts = Record<ResultStatus, number>

export interface BatchSummary {
  batchId: string
  state: BatchState
  fileName: string
  templateVersion: string
  userName: string | null
  createdAt: string
  finishedAt: string | null
  total: number
  processed: number
  percent: number
  counts: BatchCounts
  error?: string
}

export interface BatchPage { page: number; pageSize: number; total: number; items: BatchSummary[] }

export interface BatchResultRow {
  row: number
  reference: string
  sku: string
  name: string
  status: ResultStatus
  code: string
  applied: Array<{ field: string; key?: string }>
  proposals: PlanChange[]
  pending: string[]
  issues: TemplateIssue[]
  error?: string
}

export interface BatchResults { batch: BatchSummary; unassigned: TemplateIssue[]; rows: BatchResultRow[] }
