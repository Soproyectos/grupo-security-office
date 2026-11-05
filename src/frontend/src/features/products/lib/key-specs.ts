import type {
  KeySpecDataType,
  KeySpecItem,
  KeySpecMissing,
  KeySpecProjection,
  KeySpecProjectionItem,
  KeySpecStageValue,
  KeySpecWriteEntry,
  KeySpecWriteResult,
  MissingKeySpec,
  SpecTemplate,
  SubcategoryChangePreview,
} from '../types/key-specs.types'

/**
 * Pure model of the "Datos clave" form. A datum is in one of three modes:
 * a value (including 0 and "No", which are real values), "No aplica" or "Desconocido".
 * Only an empty value draft means "nothing"; zero and false are never empty.
 */
export type DraftMode = 'value' | 'not_applicable' | 'unknown'

export interface KeySpecDraft {
  mode: DraftMode
  text: string
  /** Kept as typed so "3," or "0" survive editing. */
  number: string
  boolean: boolean | null
  optionKeys: string[]
}

export const emptyDraft = (): KeySpecDraft => ({ mode: 'value', text: '', number: '', boolean: null, optionKeys: [] })

/** What the editor currently sees for a datum: the working value, else the published one. */
export const effectiveStage = (item: KeySpecItem): KeySpecStageValue | null => item.working ?? item.published

/** Explicit state sent by newer servers (uppercase). Legacy lowercase values only describe presence. */
function explicitMode(stage: KeySpecStageValue): DraftMode {
  if (stage.storedState === 'NOT_APPLICABLE' || stage.state === 'not_applicable') return 'not_applicable'
  if (stage.storedState === 'UNKNOWN') return 'unknown'
  return 'value'
}

/** The draft that reproduces exactly what is stored. */
export function baselineDraft(item: KeySpecItem): KeySpecDraft {
  const stage = effectiveStage(item)
  if (!stage) return emptyDraft()
  const mode = explicitMode(stage)
  if (mode !== 'value') return { ...emptyDraft(), mode }
  return {
    mode: 'value',
    text: stage.valueText ?? '',
    number: stage.valueNumber === null || stage.valueNumber === undefined ? '' : String(stage.valueNumber),
    boolean: stage.valueBoolean ?? null,
    optionKeys: [...(stage.optionKeys ?? [])],
  }
}

/** Parses "12", "3.5" or "3,5". Empty gives null. Invalid gives undefined. 0 is a valid number. */
export function parseNumberInput(raw: string): number | null | undefined {
  const text = raw.trim().replace(',', '.')
  if (text === '') return null
  if (!/^-?\d+(\.\d+)?$/.test(text)) return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

export function isDraftEmpty(dataType: KeySpecDataType, draft: KeySpecDraft): boolean {
  if (draft.mode !== 'value') return false
  switch (dataType) {
    case 'TEXT':
      return draft.text.trim() === ''
    case 'NUMBER':
      return draft.number.trim() === ''
    case 'BOOLEAN':
      return draft.boolean === null
    default:
      return draft.optionKeys.length === 0
  }
}

function comparable(dataType: KeySpecDataType, draft: KeySpecDraft): string {
  if (draft.mode !== 'value') return draft.mode
  switch (dataType) {
    case 'TEXT':
      return `v:${draft.text.trim()}`
    case 'NUMBER': {
      const parsed = parseNumberInput(draft.number)
      return `v:${parsed === undefined ? draft.number.trim() : String(parsed)}`
    }
    case 'BOOLEAN':
      return `v:${String(draft.boolean)}`
    default:
      return `v:${[...draft.optionKeys].sort().join('|')}`
  }
}

export const draftsEqual = (dataType: KeySpecDataType, a: KeySpecDraft, b: KeySpecDraft): boolean =>
  comparable(dataType, a) === comparable(dataType, b)

export interface BuiltEntries {
  entries: KeySpecWriteEntry[]
  /** Local problems by specKey; those entries are not sent. */
  errors: Record<string, string>
}

/** Turns the edited drafts into the body of PUT /key-specs. Untouched or unchanged data produce no entry. */
export function buildEntries(items: KeySpecItem[], overrides: Record<string, KeySpecDraft>): BuiltEntries {
  const entries: KeySpecWriteEntry[] = []
  const errors: Record<string, string> = {}
  for (const item of items) {
    const draft = overrides[item.specKey]
    if (!draft) continue
    const base = baselineDraft(item)
    if (draftsEqual(item.dataType, draft, base)) continue

    if (draft.mode === 'not_applicable') {
      entries.push({ specKey: item.specKey, state: 'NOT_APPLICABLE' })
      continue
    }
    if (draft.mode === 'unknown') {
      entries.push({ specKey: item.specKey, state: 'UNKNOWN' })
      continue
    }
    if (isDraftEmpty(item.dataType, draft)) {
      entries.push({ specKey: item.specKey, clear: true })
      continue
    }

    const entry: KeySpecWriteEntry = { specKey: item.specKey }
    if (base.mode !== 'value') entry.state = 'KNOWN'
    switch (item.dataType) {
      case 'TEXT':
        entry.valueText = draft.text.trim()
        break
      case 'NUMBER': {
        const parsed = parseNumberInput(draft.number)
        if (parsed === undefined || parsed === null) {
          errors[item.specKey] = 'Escribe un número, por ejemplo 12 o 3,5.'
          continue
        }
        entry.valueNumber = parsed
        if (item.unit) entry.unit = item.unit
        break
      }
      case 'BOOLEAN':
        entry.valueBoolean = draft.boolean
        break
      default:
        entry.optionKeys = [...draft.optionKeys]
    }
    entries.push(entry)
  }
  return { entries, errors }
}

/** After a partial save: saved and unchanged data drop their draft, rejected ones keep it so the person can fix it. */
export function applySaveResults(overrides: Record<string, KeySpecDraft>, results: KeySpecWriteResult[]): Record<string, KeySpecDraft> {
  const next = { ...overrides }
  for (const result of results) {
    if (result.outcome !== 'rejected') delete next[result.specKey]
  }
  return next
}

export function summarizeResults(results: KeySpecWriteResult[]): { saved: number; unchanged: number; rejected: number } {
  return {
    saved: results.filter((r) => r.outcome === 'saved').length,
    unchanged: results.filter((r) => r.outcome === 'unchanged').length,
    rejected: results.filter((r) => r.outcome === 'rejected').length,
  }
}

const REJECTION_MESSAGES: Record<string, string> = {
  not_in_template: 'Este dato no pertenece a la plantilla de la subcategoría.',
  invalid_number: 'El número no es válido.',
  number_out_of_range: 'El número es demasiado grande.',
  unit_mismatch: 'La unidad no coincide con la del dato.',
  option_not_allowed: 'Esa opción no está permitida para este dato.',
  option_inactive: 'Esa opción ya no está disponible.',
  option_cardinality: 'Este dato admite una sola opción.',
  duplicate_option: 'Hay una opción repetida.',
  duplicate_entry: 'El dato está repetido en el envío.',
  text_too_long: 'El texto es demasiado largo.',
  type_mismatch: 'El valor no corresponde al tipo de dato.',
  empty_value: 'Escribe un valor o usa «Quitar valor».',
  cannot_clear_published: 'Este valor ya está publicado y no se puede quitar. Cámbialo por otro.',
  clear_with_value: 'No se puede quitar el valor y escribir otro a la vez.',
  state_with_value: 'No aplica y Desconocido no llevan valor. Quita el valor o elige «Con valor».',
  value_required: 'Escribe un valor para este dato.',
  invalid_state: 'El estado elegido no es válido para este dato.',
  unknown_spec: 'Este dato ya no existe.',
  definition_inactive: 'Este dato fue desactivado.',
  product_not_found: 'El producto ya no existe. Recarga la página.',
}

/** Spanish text for a rejected entry; never shows the raw server code or its English message. */
export function rejectionMessage(result: Pick<KeySpecWriteResult, 'code'>): string {
  return (result.code && REJECTION_MESSAGES[result.code]) || 'No se pudo guardar este dato. Revisa el valor.'
}

export interface KeySpecRow {
  item: KeySpecItem
  /** Required and approved: the only combination that counts as required. */
  requiredCounts: boolean
  requiredReason: string | null
  proposed: boolean
}

export interface KeySpecLayout {
  rows: KeySpecRow[]
  /** Stored values whose datum is not in the template: never deleted, shown apart for review. */
  review: KeySpecRow[]
}

/** Template order first; values outside the template go to the review group. */
export function buildLayout(items: KeySpecItem[], template: SpecTemplate | undefined): KeySpecLayout {
  const reasons = new Map((template?.entries ?? []).map((entry) => [entry.specKey, entry.requiredReason]))
  const toRow = (item: KeySpecItem): KeySpecRow => ({
    item,
    requiredCounts: Boolean(item.template?.isRequired) && item.template?.status === 'APPROVED',
    requiredReason: reasons.get(item.specKey) ?? null,
    proposed: item.template?.status === 'PROPOSED',
  })
  const inTemplate = items.filter((item) => !item.outsideTemplate && item.template && item.template.status !== 'RETIRED')
  const outside = items.filter((item) => item.outsideTemplate)
  const order = (item: KeySpecItem) => item.template?.sortOrder ?? Number.MAX_SAFE_INTEGER
  return {
    rows: [...inTemplate].sort((a, b) => order(a) - order(b)).map(toRow),
    review: outside.map(toRow),
  }
}

/** Readable stored value (for the review group). */
export function describeStoredValue(item: KeySpecItem): string {
  const stage = effectiveStage(item)
  if (!stage) return 'Sin valor'
  const mode = explicitMode(stage)
  if (mode === 'not_applicable') return 'No aplica'
  if (mode === 'unknown') return 'Desconocido'
  switch (item.dataType) {
    case 'TEXT':
      return stage.valueText?.trim() ? stage.valueText : 'Sin valor'
    case 'NUMBER':
      return stage.valueNumber === null || stage.valueNumber === undefined
        ? 'Sin valor'
        : `${stage.valueNumber}${item.unit ? ` ${item.unit}` : ''}`
    case 'BOOLEAN':
      return stage.valueBoolean === null || stage.valueBoolean === undefined ? 'Sin valor' : stage.valueBoolean ? 'Sí' : 'No'
    default: {
      const labels = (stage.optionKeys ?? []).map((key) => item.options.find((option) => option.key === key)?.label ?? key)
      return labels.length > 0 ? labels.join(', ') : 'Sin valor'
    }
  }
}

/** Spanish sentence for one missing item. Unknown reasons never leak the server's English text. */
export function missingMessage(missing: MissingKeySpec): string {
  switch (missing.flag ?? missing.code) {
    case 'missing_required':
      return 'Falta este dato obligatorio.'
    case 'explicit_unknown':
      return 'Está marcado como «Desconocido» y es obligatorio.'
    case 'required_marked_not_applicable':
      return 'Está marcado como «No aplica» pero es obligatorio.'
    default:
      return 'Falta completar este dato.'
  }
}

export const missingList = (missing: KeySpecMissing | undefined): MissingKeySpec[] => missing?.missing ?? []

/** DOM id of a datum's field, so a missing item can scroll to it. */
export const keySpecFieldId = (specKey: string) => `keyspec-${specKey}`

export interface ChangePreviewSummary {
  kept: number
  needsReview: number
  newlyMissing: number
  newlyRequired: number
  /** True when the change touches stored values or adds data to fill in. */
  hasImpact: boolean
}

export function summarizeChangePreview(preview: SubcategoryChangePreview): ChangePreviewSummary {
  const kept = preview.kept?.length ?? 0
  const needsReview = preview.needsReview?.length ?? 0
  const newlyMissing = preview.newlyMissing?.length ?? 0
  const newlyRequired = (preview.newlyMissing ?? []).filter((m) => m.isRequired && m.status !== 'PROPOSED').length
  return { kept, needsReview, newlyMissing, newlyRequired, hasImpact: kept + needsReview + newlyMissing > 0 }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** Count lines shown before confirming a subcategory change. */
export function describeChangePreview(summary: ChangePreviewSummary): string[] {
  return [
    `${plural(summary.kept, 'dato se conserva', 'datos se conservan')}.`,
    `${plural(summary.needsReview, 'dato queda por revisar', 'datos quedan por revisar')} (no se borran).`,
    `${plural(summary.newlyMissing, 'dato nuevo por completar', 'datos nuevos por completar')}.`,
  ]
}

/** Items of the draft projection, as the preview shows them. */
export function draftKeySpecItems(projection: KeySpecProjection | undefined): KeySpecProjectionItem[] {
  const items = projection?.draft?.sheetGroup?.items ?? []
  return items.filter((item) => item.label?.trim() && item.value?.trim())
}
