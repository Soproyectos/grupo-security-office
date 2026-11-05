/**
 * Pure helpers of the key-data services: value state, equality, number
 * normalization and the subcategory-change preview. No Prisma, no Nest, so
 * every rule is unit-testable.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type {
  KeySpecDataType,
  KeySpecIssue,
  KeySpecValueState,
  ProductKeySpecValue,
  SpecDefinition,
  SubcategorySpec,
} from '../products/key-specs/key-spec.types'
import type { KeySpecValueInput, NormalizedKeySpecValue } from '../products/key-specs/key-spec-value.validation'

/** Decimal(18,6) holds up to 12 integer digits. */
export const MAX_ABS_NUMBER = 999_999_999_999

/**
 * Derived reading of one stored answer. `unknown` covers both "no row" and an
 * explicit UNKNOWN (use the stored state to tell them apart); `not_applicable`
 * is an explicit NOT_APPLICABLE; `zero` and `false` are real known values.
 */
export type ValueState = 'unknown' | 'zero' | 'false' | 'set' | 'not_applicable'

export const badRequest = (code: string, message: string, details?: unknown) =>
  new BadRequestException({ code, message, feedback: [message], ...(details ? { details } : {}) })
export const conflict = (code: string, message: string, details?: unknown) =>
  new ConflictException({ code, message, feedback: [message], ...(details ? { details } : {}) })
export const notFound = (code: string, message: string) => new NotFoundException({ code, message })

/** Same rounding as the column (scale 6), so a re-run compares equal to what was stored. */
export const roundToScale = (n: number): number => Number(n.toFixed(6))

/**
 * unknown (nothing stored) / zero (numeric 0) / false (boolean false) / set.
 * Missing numeric data is `unknown`, never `zero`.
 */
export function valueState(
  dataType: KeySpecDataType,
  value: NormalizedKeySpecValue | null | undefined,
  stored: KeySpecValueState = 'KNOWN',
): ValueState {
  if (stored === 'NOT_APPLICABLE') return 'not_applicable'
  if (stored === 'UNKNOWN') return 'unknown'
  if (!value) return 'unknown'
  switch (dataType) {
    case 'NUMBER':
      if (value.valueNumber === null || value.valueNumber === undefined) return 'unknown'
      return value.valueNumber === 0 ? 'zero' : 'set'
    case 'BOOLEAN':
      if (value.valueBoolean === null || value.valueBoolean === undefined) return 'unknown'
      return value.valueBoolean === false ? 'false' : 'set'
    case 'TEXT':
      return value.valueText && value.valueText.trim() ? 'set' : 'unknown'
    default:
      return value.optionKeys.length > 0 ? 'set' : 'unknown'
  }
}

/** True when the input carries nothing at all: such an entry never erases a stored value. */
export function isBlankInput(input: KeySpecValueInput): boolean {
  const text = input.valueText == null || (typeof input.valueText === 'string' && input.valueText.trim() === '')
  return (
    text &&
    input.valueNumber == null &&
    input.valueBoolean == null &&
    (input.optionKeys == null || input.optionKeys.length === 0)
  )
}

export function normalizedEquals(a: NormalizedKeySpecValue, b: NormalizedKeySpecValue): boolean {
  const ka = [...a.optionKeys].sort()
  const kb = [...b.optionKeys].sort()
  return (
    a.valueText === b.valueText &&
    a.valueNumber === b.valueNumber &&
    a.valueBoolean === b.valueBoolean &&
    ka.length === kb.length &&
    ka.every((k, i) => k === kb[i])
  )
}

/** Same answer = same stored state and same value. A missing state is KNOWN. */
export function sameAnswer(
  a: { state?: KeySpecValueState; value: NormalizedKeySpecValue },
  b: { state?: KeySpecValueState; value: NormalizedKeySpecValue },
): boolean {
  return (a.state ?? 'KNOWN') === (b.state ?? 'KNOWN') && normalizedEquals(a.value, b.value)
}

export const toNormalized = (v: ProductKeySpecValue): NormalizedKeySpecValue => ({
  valueText: v.valueText,
  valueNumber: v.valueNumber === null ? null : roundToScale(v.valueNumber),
  valueBoolean: v.valueBoolean,
  optionKeys: [...v.optionKeys],
})

export const issuesToDetails = (issues: KeySpecIssue[]) => issues.map(({ code, specKey, message }) => ({ code, specKey, message }))

export interface SubcategoryChangePreview {
  fromSubcategoryId: string | null
  toSubcategoryId: string
  /** Stored values whose datum the new template also uses: they stay as they are. */
  kept: { specKey: string; label: string; stages: string[] }[]
  /** Stored values whose datum is not in the new template: never deleted, flagged for review (F2). */
  needsReview: { specKey: string; label: string; stages: string[] }[]
  /** Data of the new template (not retired) that has no stored value yet. */
  newlyMissing: { specKey: string; label: string; isRequired: boolean; status: SubcategorySpec['status'] }[]
}

export function buildSubcategoryChangePreview(input: {
  fromSubcategoryId: string | null
  toSubcategoryId: string
  definitions: SpecDefinition[]
  newTemplates: SubcategorySpec[]
  values: ProductKeySpecValue[]
}): SubcategoryChangePreview {
  const { fromSubcategoryId, toSubcategoryId, definitions, values } = input
  const byId = new Map(definitions.map((d) => [d.id, d]))
  const live = input.newTemplates
    .filter((t) => t.subcategoryId === toSubcategoryId && t.status !== 'RETIRED')
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const inNew = new Set(live.map((t) => t.specDefinitionId))

  const stagesBySpec = new Map<string, string[]>()
  for (const v of values) {
    const list = stagesBySpec.get(v.specDefinitionId) ?? []
    if (!list.includes(v.stage)) list.push(v.stage)
    stagesBySpec.set(v.specDefinitionId, list)
  }

  const kept: SubcategoryChangePreview['kept'] = []
  const needsReview: SubcategoryChangePreview['needsReview'] = []
  for (const [specId, stages] of stagesBySpec) {
    const def = byId.get(specId)
    const row = { specKey: def?.key ?? specId, label: def?.label ?? specId, stages: [...stages].sort() }
    ;(inNew.has(specId) ? kept : needsReview).push(row)
  }
  const bySpecKey = (a: { specKey: string }, b: { specKey: string }) => a.specKey.localeCompare(b.specKey)
  kept.sort(bySpecKey)
  needsReview.sort(bySpecKey)

  const newlyMissing = live
    .filter((t) => !stagesBySpec.has(t.specDefinitionId))
    .map((t) => ({
      specKey: byId.get(t.specDefinitionId)?.key ?? t.specDefinitionId,
      label: byId.get(t.specDefinitionId)?.label ?? t.specDefinitionId,
      isRequired: t.isRequired,
      status: t.status,
    }))

  return { fromSubcategoryId, toSubcategoryId, kept, needsReview, newlyMissing }
}
