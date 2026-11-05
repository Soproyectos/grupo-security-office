/**
 * Shared contract of the product sheet and the store filters (D1).
 * One list of entries is built from APPROVED template rows and PUBLISHED values;
 * the sheet group and the facets are both derived from that same list, so they
 * cannot disagree and there is no second query or source.
 */
import { validateKeySpecValue, type NormalizedKeySpecValue } from './key-spec-value.validation'
import type {
  KeySpecDataType,
  KeySpecIssue,
  ProductKeySpecValue,
  SpecDefinition,
  SpecOption,
  SubcategorySpec,
} from './key-spec.types'

export interface KeySpecEntry {
  specDefinitionId: string
  specKey: string
  label: string
  dataType: KeySpecDataType
  unit: string | null
  sortOrder: number
  isFilterable: boolean
  value: NormalizedKeySpecValue
  /** Chosen options in dictionary order; empty for scalar data. */
  selectedOptions: SpecOption[]
}

export interface KeySpecFacet {
  specKey: string
  label: string
  dataType: KeySpecDataType
  unit: string | null
  /** The very value of the entry with the same key, not a copy of another source. */
  value: NormalizedKeySpecValue
}

export interface KeySpecSheetGroup {
  id: 'datos-principales'
  title: 'Datos principales'
  items: { label: string; value: string }[]
}

/**
 * A PUBLISHED value of an APPROVED template row that was left out of the
 * projection (R3-003). It never reaches the entries, the sheet or the facets,
 * but the caller can surface it, for instance to flag the sheet for an editor.
 */
export interface KeySpecSkippedValue {
  specDefinitionId: string
  /** The definition key; the definition id when the definition itself is unknown. */
  specKey: string
  issues: KeySpecIssue[]
}

export interface KeySpecProjection {
  entries: KeySpecEntry[]
  sheetGroup: KeySpecSheetGroup | null
  facets: KeySpecFacet[]
  /** Published values that failed validation or have nothing to show, by key. */
  skipped: KeySpecSkippedValue[]
}

export interface KeySpecProjectionInput {
  subcategoryId: string | null
  definitions: SpecDefinition[]
  templates: SubcategorySpec[]
  /** Stored values of ONE product, any stage; only PUBLISHED ones are read. */
  values: ProductKeySpecValue[]
}

export function buildPublishedKeySpecProjection(input: KeySpecProjectionInput): KeySpecProjection {
  const { subcategoryId, definitions, templates, values } = input
  if (subcategoryId === null) return { entries: [], sheetGroup: null, facets: [], skipped: [] }

  const definitionById = new Map(definitions.map((d) => [d.id, d]))
  const publishedBySpec = new Map<string, ProductKeySpecValue>()
  for (const v of values) {
    if (v.stage === 'PUBLISHED' && !publishedBySpec.has(v.specDefinitionId)) publishedBySpec.set(v.specDefinitionId, v)
  }

  // Each row keeps the text it will show, so the sheet never formats a second time.
  const rows: { entry: KeySpecEntry; text: string }[] = []
  const skipped: KeySpecSkippedValue[] = []
  const skip = (specDefinitionId: string, specKey: string, issues: KeySpecIssue[]) =>
    skipped.push({ specDefinitionId, specKey, issues })

  for (const template of templates) {
    if (template.subcategoryId !== subcategoryId || template.status !== 'APPROVED') continue
    // Nothing published for an approved row is missing data (readiness), not a skipped value.
    const stored = publishedBySpec.get(template.specDefinitionId)
    if (!stored) continue
    // "Not applicable" and "unknown" are answers, not values: nothing to show, no filter, no noise.
    if (stored.state === 'NOT_APPLICABLE' || stored.state === 'UNKNOWN') continue

    const definition = definitionById.get(template.specDefinitionId)
    if (!definition) {
      const id = template.specDefinitionId
      skip(id, id, [{ code: 'definition_missing', specKey: id, message: `The definition "${id}" of a published value does not exist.` }])
      continue
    }

    const result = validateKeySpecValue(definition, stored, { subcategoryId, templates })
    if (result.ok === false) {
      skip(definition.id, definition.key, result.issues)
      continue
    }

    const order = new Map(definition.options.map((o) => [o.key, o]))
    const entry: KeySpecEntry = {
      specDefinitionId: definition.id,
      specKey: definition.key,
      label: definition.label,
      dataType: definition.dataType,
      unit: definition.unit,
      sortOrder: template.sortOrder,
      isFilterable: template.isFilterable,
      value: result.value,
      selectedOptions: result.value.optionKeys.map((k) => order.get(k)!),
    }
    // A valid value with nothing to show (say, a blank option label) must not
    // become an empty sheet row or a facet, so it leaves the one shared list.
    const text = formatKeySpecValue(entry)
    if (text === null) {
      skip(definition.id, definition.key, [
        { code: 'no_display_value', specKey: definition.key, message: `The datum "${definition.key}" has no text to display.` },
      ])
      continue
    }
    rows.push({ entry, text })
  }
  rows.sort(
    (a, b) =>
      a.entry.sortOrder - b.entry.sortOrder ||
      a.entry.label.localeCompare(b.entry.label, 'es') ||
      a.entry.specKey.localeCompare(b.entry.specKey),
  )
  skipped.sort((a, b) => a.specKey.localeCompare(b.specKey))

  const entries = rows.map((r) => r.entry)
  return {
    entries,
    sheetGroup:
      rows.length === 0
        ? null
        : {
            id: 'datos-principales',
            // User-facing Spanish copy of the existing storefront.
            title: 'Datos principales',
            items: rows.map((r) => ({ label: r.entry.label, value: r.text })),
          },
    facets: entries
      .filter((e) => e.isFilterable)
      .map((e) => ({ specKey: e.specKey, label: e.label, dataType: e.dataType, unit: e.unit, value: e.value })),
    skipped,
  }
}

/** Colombian Spanish number: decimal comma, thousands dot, no exponent notation. */
function formatColombianNumber(n: number): string {
  const plain = Math.abs(n).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 })
  const [integer, fraction] = plain.split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const text = fraction ? `${grouped},${fraction}` : grouped
  return n < 0 && text !== '0' ? `-${text}` : text
}

/**
 * Text shown on the sheet for an entry; the user-facing words are Spanish.
 * A missing value yields null and is never shown as 0, "No" or an empty string
 * (R3-002): a real zero or `false` is still shown.
 */
export function formatKeySpecValue(entry: KeySpecEntry): string | null {
  const { value } = entry
  let text: string | null | undefined
  switch (entry.dataType) {
    case 'NUMBER': {
      const n: unknown = value.valueNumber
      if (typeof n !== 'number' || !Number.isFinite(n)) return null
      const formatted = formatColombianNumber(n)
      return entry.unit ? `${formatted} ${entry.unit}` : formatted
    }
    case 'BOOLEAN': {
      const b: unknown = value.valueBoolean
      return typeof b === 'boolean' ? (b ? 'Sí' : 'No') : null
    }
    case 'OPTION':
    case 'MULTI_OPTION':
      text = entry.selectedOptions.map((o) => o.label).join(', ')
      break
    case 'TEXT':
      text = value.valueText
      break
  }
  return text && text.trim() ? text : null
}
