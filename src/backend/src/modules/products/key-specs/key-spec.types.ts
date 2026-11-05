/**
 * Library key data ("datos principales") — storage-agnostic domain types.
 * They mirror the tables planned in docs/biblioteca-dominio/estructura-biblioteca.md
 * (`spec_definitions`, `subcategory_specs`, `product_spec_values`) but import
 * nothing from Prisma or Nest, so the rules stay testable without a database.
 */

export type KeySpecDataType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'OPTION' | 'MULTI_OPTION'

/** One allowed choice of an OPTION / MULTI_OPTION definition. */
export interface SpecOption {
  key: string
  label: string
  sortOrder: number
  isActive: boolean
}

/** Dictionary entry: what a datum is, its type, its unit and its allowed options. */
export interface SpecDefinition {
  id: string
  key: string
  label: string
  dataType: KeySpecDataType
  /** Canonical unit of NUMBER values (`W`, `GB`); null for unitless data. */
  unit: string | null
  options: SpecOption[]
  isActive: boolean
}

/** A template row only counts while APPROVED; PROPOSED rows never block (F6). */
export type SubcategorySpecStatus = 'PROPOSED' | 'APPROVED' | 'RETIRED'

/** Template ("molde") row: one datum asked by one subcategory. */
export interface SubcategorySpec {
  subcategoryId: string
  specDefinitionId: string
  status: SubcategorySpecStatus
  isRequired: boolean
  isFilterable: boolean
  /** Written justification of a required datum (F6). */
  requiredReason: string | null
  sortOrder: number
  approvedById: string | null
  approvedAt: Date | null
}

/**
 * WORKING = editor draft. PUBLISHED = copied when the editorial revision is
 * approved. The product sheet and the store filters read only PUBLISHED.
 */
export type KeySpecStage = 'WORKING' | 'PUBLISHED'

/**
 * What a stored answer means. KNOWN carries a value (a real 0 or `false` is KNOWN);
 * NOT_APPLICABLE ("does not apply to this product") and UNKNOWN ("explicitly not
 * known yet") carry none. "No row" is a third, different thing: never answered.
 */
export type KeySpecValueState = 'KNOWN' | 'NOT_APPLICABLE' | 'UNKNOWN'

/** One stored value; only the column of the definition's type is filled. */
export interface ProductKeySpecValue {
  productId: string
  specDefinitionId: string
  stage: KeySpecStage
  valueText: string | null
  valueNumber: number | null
  valueBoolean: boolean | null
  optionKeys: string[]
  /** Absent means KNOWN. NOT_APPLICABLE / UNKNOWN rows carry no value at all. */
  state?: KeySpecValueState
}

export interface KeySpecIssue {
  code: string
  specKey: string
  message: string
}
