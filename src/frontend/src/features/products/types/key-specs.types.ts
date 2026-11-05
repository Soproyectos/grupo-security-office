/** Classification tree and key data ("datos clave") of a product, as the API returns them. */

export interface ClassificationSubcategory {
  id: string
  name: string
  slug: string
}

export interface ClassificationRoot {
  id: string
  name: string
  slug: string
  subcategories: ClassificationSubcategory[]
}

export type ClassificationStatus = 'complete' | 'incomplete'

export type KeySpecDataType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'OPTION' | 'MULTI_OPTION'
export type KeySpecTemplateStatus = 'PROPOSED' | 'APPROVED' | 'RETIRED'
/** Explicit state of a datum. Optional everywhere: the server may not send it yet. */
export type KeySpecEntryState = 'KNOWN' | 'NOT_APPLICABLE' | 'UNKNOWN'

export interface KeySpecOption {
  key: string
  label: string
  isActive?: boolean
}

export interface SpecTemplateEntry {
  specKey: string
  label: string
  dataType: KeySpecDataType
  unit: string | null
  status: KeySpecTemplateStatus
  isRequired: boolean
  isFilterable?: boolean
  requiredReason: string | null
  sortOrder: number
  /** Only present when the template endpoint sends them; otherwise the options come from the values endpoint. */
  options?: KeySpecOption[]
}

export interface SpecTemplate {
  subcategoryId: string
  entries: SpecTemplateEntry[]
}

/** One stage (working or published) of a stored value. */
export interface KeySpecStageValue {
  /** Derived read field: 'unknown' | 'zero' | 'false' | 'set' | 'not_applicable'. */
  state?: string | null
  /** Persisted state; null when there is no row. */
  storedState?: KeySpecEntryState | null
  valueText: string | null
  valueNumber: number | null
  valueBoolean: boolean | null
  optionKeys: string[]
  updatedAt?: string
  updatedBy?: string | null
  provenance?: string | null
}

export interface KeySpecItem {
  specKey: string
  label: string
  dataType: KeySpecDataType
  unit: string | null
  options: KeySpecOption[]
  template: { status: KeySpecTemplateStatus; isRequired: boolean; isFilterable?: boolean; sortOrder: number } | null
  outsideTemplate: boolean
  working: KeySpecStageValue | null
  published: KeySpecStageValue | null
  pendingChange?: boolean
  provenance?: string | null
}

export interface KeySpecValues {
  productId: string
  subcategoryId: string | null
  items: KeySpecItem[]
  outsideTemplateCount?: number
}

export interface KeySpecWriteEntry {
  specKey: string
  valueText?: string | null
  valueNumber?: number | null
  valueBoolean?: boolean | null
  optionKeys?: string[]
  unit?: string | null
  state?: KeySpecEntryState
  clear?: boolean
}

export interface KeySpecWriteResult {
  specKey: string
  outcome: 'saved' | 'unchanged' | 'rejected'
  code?: string
  message?: string
}

export interface MissingKeySpec {
  specKey: string
  label: string
  /** missing_required | explicit_unknown | required_marked_not_applicable, or a free-text reason from older servers. */
  code?: string
  /** Newer servers: 'explicit_unknown' | 'required_marked_not_applicable'. */
  flag?: string
  reason?: string
}

export interface KeySpecMissing {
  productId?: string
  subcategoryId?: string | null
  missing: MissingKeySpec[]
}

export interface ChangePreviewKept {
  specKey: string
  label: string
  stages?: string[]
}

export interface ChangePreviewNewlyMissing {
  specKey: string
  label: string
  isRequired?: boolean
  status?: KeySpecTemplateStatus
}

export interface SubcategoryChangePreview {
  fromSubcategoryId?: string | null
  toSubcategoryId?: string
  kept: ChangePreviewKept[]
  needsReview: ChangePreviewKept[]
  newlyMissing: ChangePreviewNewlyMissing[]
}

export interface KeySpecProjectionItem {
  label: string
  value: string
}

export interface KeySpecProjectionSide {
  sheetGroup: { title?: string; items: KeySpecProjectionItem[] } | null
}

export interface KeySpecProjection {
  productId?: string
  published: KeySpecProjectionSide | null
  draft: KeySpecProjectionSide | null
}
