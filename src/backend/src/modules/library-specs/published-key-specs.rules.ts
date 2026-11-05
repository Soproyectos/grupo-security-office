/**
 * Pure rules shared by the public sheet, the admin draft preview and the store
 * filters. Everything is derived from ONE `KeySpecProjection` (built by the
 * domain projection), so the sheet items and the filter predicates cannot disagree.
 */
import { formatKeySpecValue, type KeySpecEntry, type KeySpecProjection } from '../products/key-specs/key-spec-projection'
import type { ProductKeySpecValue } from '../products/key-specs/key-spec.types'
import { sameAnswer, toNormalized } from './library-specs.rules'

/** One key spec on the public sheet. `value` is the display text and already carries the unit. */
export interface PublicKeySpecItem {
  key: string
  label: string
  value: string
  unit?: string
  order: number
}

/** Sheet items of a projection, in projection order. A real 0 or false is shown; nothing missing becomes 0. */
export function toPublicKeySpecItems(projection: KeySpecProjection): PublicKeySpecItem[] {
  const texts = projection.sheetGroup?.items ?? []
  return projection.entries.map((e, i) => ({
    key: e.specKey,
    label: e.label,
    value: texts[i].value,
    ...(e.unit ? { unit: e.unit } : {}),
    order: e.sortOrder,
  }))
}

/** WORKING values over PUBLISHED ones, re-labelled PUBLISHED so the published builder can read them. */
export function overlayDraftValues(values: ProductKeySpecValue[]): ProductKeySpecValue[] {
  const bySpec = new Map<string, ProductKeySpecValue>()
  for (const v of values) if (v.stage === 'PUBLISHED') bySpec.set(v.specDefinitionId, v)
  for (const v of values) if (v.stage === 'WORKING') bySpec.set(v.specDefinitionId, v)
  return [...bySpec.values()].map((v) => ({ ...v, stage: 'PUBLISHED' as const }))
}

// ------------------------------------------------------------- publication

export interface PublicationPlan {
  /** WORKING rows to copy because the PUBLISHED one is missing or different. */
  upsert: ProductKeySpecValue[]
  /** Spec definitions published today that the WORKING set no longer holds. */
  remove: string[]
  unchanged: number
}

/** The PUBLISHED set becomes a copy of the WORKING set. Pure: used to publish and to flag pending changes. */
export function planKeySpecPublication(working: ProductKeySpecValue[], published: ProductKeySpecValue[]): PublicationPlan {
  const publishedBySpec = new Map(published.map((v) => [v.specDefinitionId, v]))
  const upsert: ProductKeySpecValue[] = []
  let unchanged = 0
  for (const w of working) {
    const p = publishedBySpec.get(w.specDefinitionId)
    if (p && sameAnswer({ state: p.state, value: toNormalized(p) }, { state: w.state, value: toNormalized(w) })) unchanged++
    else upsert.push(w)
  }
  const workingSpecs = new Set(working.map((w) => w.specDefinitionId))
  const remove = published.filter((p) => !workingSpecs.has(p.specDefinitionId)).map((p) => p.specDefinitionId)
  return { upsert, remove, unchanged }
}

// ----------------------------------------------------------------- filters

export interface KeySpecFilter {
  specKey: string
  value: string
}

/** `keySpec=<specKey>:<value>`; the value may itself contain ':'. Null when malformed. */
export function parseKeySpecFilter(raw: string): KeySpecFilter | null {
  const at = raw.indexOf(':')
  if (at <= 0) return null
  const specKey = raw.slice(0, at).trim()
  const value = raw.slice(at + 1).trim()
  return specKey && value ? { specKey, value } : null
}

export interface KeySpecFilterValue {
  /** What a client sends after the key in `keySpec=<specKey>:<value>`. */
  value: string
  label: string
}

/** The filter values one entry offers: exact value for scalars, option keys for option data. */
export function filterValuesOf(entry: KeySpecEntry): KeySpecFilterValue[] {
  switch (entry.dataType) {
    case 'NUMBER':
      return entry.value.valueNumber === null
        ? []
        : [{ value: String(entry.value.valueNumber), label: formatKeySpecValue(entry) ?? String(entry.value.valueNumber) }]
    case 'BOOLEAN':
      return entry.value.valueBoolean === null ? [] : [{ value: String(entry.value.valueBoolean), label: entry.value.valueBoolean ? 'Sí' : 'No' }]
    case 'TEXT':
      return entry.value.valueText ? [{ value: entry.value.valueText, label: entry.value.valueText }] : []
    case 'OPTION':
    case 'MULTI_OPTION':
      return entry.selectedOptions.map((o) => ({ value: o.key, label: o.label }))
  }
}

const canonical = (entry: KeySpecEntry, raw: string): string => {
  if (entry.dataType !== 'NUMBER') return raw.trim().toLowerCase()
  const n = raw.trim() === '' ? NaN : Number(raw)
  return Number.isFinite(n) ? String(n) : ''
}

/** Facets are the filterable entries of the projection (the same list the sheet shows). */
export function filterableEntries(projection: KeySpecProjection): KeySpecEntry[] {
  const keys = new Set(projection.facets.map((f) => f.specKey))
  return projection.entries.filter((e) => keys.has(e.specKey))
}

/** True when every filter matches a filterable entry of the projection. */
export function projectionMatchesFilters(projection: KeySpecProjection, filters: KeySpecFilter[]): boolean {
  const entries = filterableEntries(projection)
  return filters.every((f) => {
    const entry = entries.find((e) => e.specKey === f.specKey)
    if (!entry) return false
    const wanted = canonical(entry, f.value)
    return wanted !== '' && filterValuesOf(entry).some((v) => canonical(entry, v.value) === wanted)
  })
}
