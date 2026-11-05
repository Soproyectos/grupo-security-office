/**
 * Pure validation of key-data values and of template rows (F5, F6).
 * No Nest, no Prisma: it receives already assembled state and returns issues.
 * Service-level rules that the future tables cannot express as constraints
 * (datum belongs to the template, option is valid) live here.
 */
import type {
  KeySpecDataType,
  KeySpecIssue,
  KeySpecValueState,
  SpecDefinition,
  SubcategorySpec,
} from './key-spec.types'

export const TEXT_MAX_LENGTH = 300

export interface KeySpecValueInput {
  valueText?: string | null
  valueNumber?: number | null
  valueBoolean?: boolean | null
  optionKeys?: string[] | null
  /** Unit the number was typed in; must match the dictionary unit when given. */
  unit?: string | null
  /**
   * Answer state. Absent means KNOWN (the original contract). Callers that handle
   * NOT_APPLICABLE / UNKNOWN should still filter them out before asking for a value;
   * if one reaches this function it is accepted only with no value at all and yields
   * an empty normalized value.
   */
  state?: KeySpecValueState
}

export interface KeySpecValueContext {
  subcategoryId: string | null
  templates: SubcategorySpec[]
}

/** Only the column of the definition's type is filled; the others stay empty. */
export interface NormalizedKeySpecValue {
  valueText: string | null
  valueNumber: number | null
  valueBoolean: boolean | null
  optionKeys: string[]
}

export type KeySpecValueResult =
  | { ok: true; value: NormalizedKeySpecValue }
  | { ok: false; issues: KeySpecIssue[] }

type ValueField = 'valueText' | 'valueNumber' | 'valueBoolean' | 'optionKeys'

const FIELD_BY_TYPE: Record<KeySpecDataType, ValueField> = {
  TEXT: 'valueText',
  NUMBER: 'valueNumber',
  BOOLEAN: 'valueBoolean',
  OPTION: 'optionKeys',
  MULTI_OPTION: 'optionKeys',
}

const ALL_FIELDS: ValueField[] = ['valueText', 'valueNumber', 'valueBoolean', 'optionKeys']

const emptyValue = (): NormalizedKeySpecValue => ({
  valueText: null,
  valueNumber: null,
  valueBoolean: null,
  optionKeys: [],
})

/**
 * The datum can be held at all: active and part of the subcategory template.
 * Shared by values and by the NOT_APPLICABLE / UNKNOWN answers.
 */
export function validateKeySpecHolder(
  definition: SpecDefinition,
  ctx: KeySpecValueContext,
): KeySpecIssue[] {
  const issues: KeySpecIssue[] = []
  const issue = (code: string, message: string) => issues.push({ code, specKey: definition.key, message })
  if (!definition.isActive) {
    issue('definition_inactive', `The datum "${definition.key}" is inactive.`)
  }
  const inTemplate =
    ctx.subcategoryId !== null &&
    ctx.templates.some(
      (t) =>
        t.subcategoryId === ctx.subcategoryId &&
        t.specDefinitionId === definition.id &&
        t.status !== 'RETIRED',
    )
  if (!inTemplate) {
    issue('not_in_template', `The datum "${definition.key}" is not part of the template of this subcategory.`)
  }
  return issues
}

export function validateKeySpecValue(
  definition: SpecDefinition,
  input: KeySpecValueInput,
  ctx: KeySpecValueContext,
): KeySpecValueResult {
  const issues: KeySpecIssue[] = validateKeySpecHolder(definition, ctx)
  const issue = (code: string, message: string) => issues.push({ code, specKey: definition.key, message })

  // Structural problems first: a value is meaningless if the datum cannot be held at all.
  if (issues.length > 0) return { ok: false, issues }

  // Contract: this validates a KNOWN value. A non-KNOWN state never carries a value.
  if (input.state !== undefined && input.state !== 'KNOWN') {
    const carriesValue =
      input.valueText != null || input.valueNumber != null || input.valueBoolean != null || (input.optionKeys?.length ?? 0) > 0
    if (carriesValue) {
      issue('state_with_value', `The state ${input.state} of "${definition.key}" carries no value.`)
      return { ok: false, issues }
    }
    return { ok: true, value: emptyValue() }
  }

  const present: Record<ValueField, boolean> = {
    valueText: input.valueText != null,
    valueNumber: input.valueNumber != null,
    valueBoolean: input.valueBoolean != null,
    // An empty list is "nothing provided", the same as null.
    optionKeys: (input.optionKeys?.length ?? 0) > 0,
  }
  const expected = FIELD_BY_TYPE[definition.dataType]
  const foreign = ALL_FIELDS.filter((f) => f !== expected && present[f])
  if (foreign.length > 0) {
    issue('type_mismatch', `The datum "${definition.key}" (${definition.dataType}) does not accept: ${foreign.join(', ')}.`)
  }
  if (!present[expected]) {
    if (foreign.length === 0) issue('empty_value', `The datum "${definition.key}" has no value.`)
    return { ok: false, issues }
  }

  const value = emptyValue()
  switch (definition.dataType) {
    case 'TEXT': {
      if (typeof input.valueText !== 'string') {
        issue('type_mismatch', `The datum "${definition.key}" expects a string.`)
        break
      }
      const text = input.valueText.trim()
      if (!text) issue('empty_value', `The datum "${definition.key}" has no value.`)
      else if (text.length > TEXT_MAX_LENGTH) {
        issue('text_too_long', `The datum "${definition.key}" exceeds ${TEXT_MAX_LENGTH} characters.`)
      } else value.valueText = text
      break
    }
    case 'NUMBER': {
      const n: unknown = input.valueNumber
      if (typeof n !== 'number') {
        issue('type_mismatch', `The datum "${definition.key}" expects a number, strings are not accepted.`)
      } else if (!Number.isFinite(n)) {
        issue('invalid_number', `The datum "${definition.key}" must be a finite number.`)
      } else {
        if (input.unit != null && input.unit.trim() !== (definition.unit ?? '')) {
          issue(
            'unit_mismatch',
            `The datum "${definition.key}" is stored in "${definition.unit ?? 'no unit'}", got "${input.unit}".`,
          )
        } else value.valueNumber = n
      }
      break
    }
    case 'BOOLEAN': {
      if (typeof input.valueBoolean !== 'boolean') {
        issue('type_mismatch', `The datum "${definition.key}" expects a boolean.`)
      } else value.valueBoolean = input.valueBoolean
      break
    }
    case 'OPTION':
    case 'MULTI_OPTION': {
      const keys = input.optionKeys ?? []
      if (definition.dataType === 'OPTION' && keys.length !== 1) {
        issue('option_cardinality', `The datum "${definition.key}" takes exactly one option, got ${keys.length}.`)
        break
      }
      const seen = new Set<string>()
      const repeated = new Set<string>()
      for (const key of keys) {
        if (seen.has(key)) {
          if (!repeated.has(key)) issue('duplicate_option', `The option "${key}" is repeated in "${definition.key}".`)
          repeated.add(key)
          continue
        }
        seen.add(key)
        const option = definition.options.find((o) => o.key === key)
        if (!option) issue('option_not_allowed', `The option "${key}" is not in the dictionary of "${definition.key}".`)
        else if (!option.isActive) issue('option_inactive', `The option "${key}" of "${definition.key}" is inactive.`)
      }
      if (issues.length === 0) {
        const order = new Map(definition.options.map((o) => [o.key, o.sortOrder]))
        value.optionKeys = [...seen].sort((a, b) => order.get(a)! - order.get(b)! || a.localeCompare(b))
      }
      break
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value }
}

/**
 * Mirrors the future SQL CHECK constraints of `subcategory_specs`, so the rule
 * is testable before the migration exists. The issue `specKey` carries the
 * `specDefinitionId`, because a template row does not know the datum key.
 *
 * Required and filterable are independent (F6): an essential datum need not be
 * a filter, and a filter need not be required. Nothing here relates them.
 */
export function validateSubcategorySpec(spec: SubcategorySpec): KeySpecIssue[] {
  const issues: KeySpecIssue[] = []
  if (spec.isRequired && !spec.requiredReason?.trim()) {
    issues.push({
      code: 'required_without_reason',
      specKey: spec.specDefinitionId,
      message: 'A required datum must record its written justification.',
    })
  }
  if (spec.status === 'APPROVED' && (!spec.approvedById || !spec.approvedAt)) {
    issues.push({
      code: 'approved_without_approver',
      specKey: spec.specDefinitionId,
      message: 'An approved template row must record who approved it and when.',
    })
  }
  return issues
}
