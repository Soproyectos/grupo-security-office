/**
 * Readiness checks for a product's key data (F6, P3). Pure, advisory inputs for
 * the publication rules: only APPROVED, required template rows can block; the
 * name length only ever warns.
 */
import { validateKeySpecValue } from './key-spec-value.validation'
import type { KeySpecStage, ProductKeySpecValue, SpecDefinition, SubcategorySpec } from './key-spec.types'

export interface MissingRequiredKeySpec {
  specKey: string
  label: string
  reason: string
  /**
   * Set only for an explicit answer that does not complete the datum:
   * `explicit_unknown` (the editor said "unknown") or `required_marked_not_applicable`
   * (a required datum marked as not applicable: a human must review it).
   */
  flag?: 'explicit_unknown' | 'required_marked_not_applicable'
}

export interface MissingRequiredKeySpecsInput {
  subcategoryId: string | null
  definitions: SpecDefinition[]
  templates: SubcategorySpec[]
  /** Stored values of ONE product, any stage. */
  values: ProductKeySpecValue[]
  /** Stage whose values are checked: WORKING while editing, PUBLISHED at publication. */
  stage: KeySpecStage
}

/**
 * Required data of the APPROVED template whose value at `stage` is missing or
 * invalid. PROPOSED and RETIRED rows never block (F6). Whether a datum is
 * filterable is irrelevant here: required and filterable are independent.
 */
export function missingRequiredKeySpecs(input: MissingRequiredKeySpecsInput): MissingRequiredKeySpec[] {
  const { subcategoryId, definitions, templates, values, stage } = input
  if (subcategoryId === null) return []

  const definitionById = new Map(definitions.map((d) => [d.id, d]))
  const missing: (MissingRequiredKeySpec & { sortOrder: number })[] = []

  for (const template of templates) {
    if (template.subcategoryId !== subcategoryId || template.status !== 'APPROVED' || !template.isRequired) continue

    const definition = definitionById.get(template.specDefinitionId)
    if (!definition) {
      missing.push({
        specKey: template.specDefinitionId,
        label: template.specDefinitionId,
        reason: 'The datum is required but its definition does not exist.',
        sortOrder: template.sortOrder,
      })
      continue
    }

    const stored = values.find((v) => v.specDefinitionId === definition.id && v.stage === stage)
    if (!stored) {
      missing.push({
        specKey: definition.key,
        label: definition.label,
        reason: 'The required datum has no value.',
        sortOrder: template.sortOrder,
      })
      continue
    }

    // Explicit answers without a value never complete a required datum.
    if (stored.state === 'UNKNOWN' || stored.state === 'NOT_APPLICABLE') {
      const unknown = stored.state === 'UNKNOWN'
      missing.push({
        specKey: definition.key,
        label: definition.label,
        reason: unknown
          ? 'The required datum was explicitly marked as unknown.'
          : 'The required datum was marked as not applicable and needs a human review.',
        flag: unknown ? 'explicit_unknown' : 'required_marked_not_applicable',
        sortOrder: template.sortOrder,
      })
      continue
    }

    const result = validateKeySpecValue(definition, stored, { subcategoryId, templates })
    if (result.ok === false) {
      missing.push({
        specKey: definition.key,
        label: definition.label,
        reason: result.issues.map((i) => i.message).join(' '),
        sortOrder: template.sortOrder,
      })
    }
  }

  return missing
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'es'))
    .map(({ specKey, label, reason, flag }) => (flag ? { specKey, label, reason, flag } : { specKey, label, reason }))
}

export interface NameLengthWarning {
  code: 'name_long'
  length: number
  limit: number
  message: string
}

export const NAME_LENGTH_LIMIT = 70

/**
 * Decision P3: the warning starts at the limit (70 characters and above). A
 * long commercial name only warns: it is never truncated and never blocks
 * publication, so the caller keeps the original text untouched.
 */
export function nameLengthWarning(name: string, limit: number = NAME_LENGTH_LIMIT): NameLengthWarning | null {
  const length = name.trim().length
  if (length < limit) return null
  return {
    code: 'name_long',
    length,
    limit,
    message: `The commercial name has ${length} characters; fewer than ${limit} read better in the store.`,
  }
}
