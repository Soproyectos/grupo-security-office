/** Pure helpers of the master-catalog screens: error mapping, impact confirmation, usage wording, search. */

export type MasterErrorKind =
  | 'duplicate'
  | 'delete_blocked'
  | 'impact'
  | 'unsupported'
  | 'forbidden'
  | 'validation'
  | 'other'

export interface UsageReason {
  code?: string
  count?: number
  message: string
}

export interface UsageReport {
  id?: string
  counts: Record<string, number>
  canDelete?: boolean
  reasons?: UsageReason[]
}

export interface MasterError {
  kind: MasterErrorKind
  message: string
  /** Name of the record that collides (duplicates only). */
  existingName?: string
  /** Dependency lines of a refused delete. */
  reasons?: string[]
  /** Raw impact of a change that needs confirmation. */
  impact?: Record<string, unknown>
}

const FALLBACK = 'No se pudo completar la operación. Intenta de nuevo.'

function responseOf(error: unknown): { status?: number; data?: Record<string, unknown> } {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number; data?: unknown } }).response
    const data = response?.data && typeof response.data === 'object' ? (response.data as Record<string, unknown>) : undefined
    return { status: response?.status, data }
  }
  return {}
}

const asText = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join(', ') || undefined
  return undefined
}

/** Library-specs errors nest their extra data under `details`. */
const detailsOf = (data: Record<string, unknown>): Record<string, unknown> => {
  const details = data.details
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : {}
}

/** Turns an API error into a message a person can act on. Never exposes ids. */
export function mapMasterError(error: unknown): MasterError {
  const { status, data } = responseOf(error)
  const code = typeof data?.code === 'string' ? data.code : undefined
  const message = asText(data?.message)

  if (status === 503 || code === 'SUBCATEGORY_UNSUPPORTED') {
    return {
      kind: 'unsupported',
      message: code === 'SUBCATEGORY_UNSUPPORTED' || status === 503
        ? 'Este almacén de biblioteca todavía no maneja subcategorías. Cuando se active podrás administrarlas aquí.'
        : (message ?? FALLBACK),
    }
  }
  if (status === 403) return { kind: 'forbidden', message: 'Tu acceso no permite hacer este cambio.' }

  if (status === 409) {
    if (code === 'NAME_DUPLICATED' || code === 'SLUG_DUPLICATED' || code === 'label_duplicated') {
      const existing = (data?.existing ?? detailsOf(data ?? {}).existing) as { name?: unknown; label?: unknown } | undefined
      const existingName = asText(existing?.name) ?? asText(existing?.label)
      return {
        kind: 'duplicate',
        existingName,
        message: existingName
          ? `Ya existe un registro equivalente: «${existingName}». Usa ese o cambia el nombre.`
          : (message ?? 'Ya existe un registro equivalente. Cambia el nombre.'),
      }
    }
    if (code === 'DELETE_BLOCKED') {
      const usage = data?.usage as UsageReport | undefined
      const reasons = (usage?.reasons ?? []).map((reason) => reason.message).filter(Boolean)
      return {
        kind: 'delete_blocked',
        reasons,
        message: reasons.length ? `No se puede eliminar porque ${reasons.join('; ')}.` : (message ?? 'No se puede eliminar porque está en uso.'),
      }
    }
    if (code === 'IMPACT_CONFIRMATION_REQUIRED') {
      return {
        kind: 'impact',
        impact: (data?.impact as Record<string, unknown> | undefined) ?? {},
        message: message ?? 'Este cambio afecta otros registros. Revisa el impacto y confirma para continuar.',
      }
    }
    if (code === 'option_change_with_values') {
      return {
        kind: 'impact',
        impact: detailsOf(data ?? {}),
        message: 'Cambiar o desactivar estas opciones afecta productos que ya las eligieron. Revisa el impacto y confirma para continuar.',
      }
    }
    if (code === 'unit_change_with_values') {
      return { kind: 'validation', message: 'La unidad no se puede cambiar mientras haya productos con valores guardados en ella.' }
    }
    if (code === 'spec_key_taken') return { kind: 'duplicate', message: 'Ya existe un dato con ese código. Usa otro.' }
    return { kind: 'other', message: message ?? FALLBACK }
  }
  if (status === 400) return { kind: 'validation', message: message ?? 'Revisa los datos ingresados.' }
  return { kind: 'other', message: message ?? FALLBACK }
}

/** true when the error is the "confirm the impact and resend" contract. */
export const isImpactConfirmation = (error: unknown): boolean => mapMasterError(error).kind === 'impact'

/**
 * Runs `attempt(false)`; when the API asks for impact confirmation, asks `confirm` with the mapped
 * error and, only on an explicit yes, retries with `confirmImpact: true`. Any other error is rethrown.
 */
export async function runWithImpactConfirmation<T>(
  attempt: (confirmImpact: boolean) => Promise<T>,
  confirm: (error: MasterError) => Promise<boolean> | boolean,
): Promise<{ confirmed: boolean; value: T } | { cancelled: true }> {
  try {
    return { confirmed: false, value: await attempt(false) }
  } catch (error) {
    const mapped = mapMasterError(error)
    if (mapped.kind !== 'impact') throw error
    if (!(await confirm(mapped))) return { cancelled: true }
    return { confirmed: true, value: await attempt(true) }
  }
}

const COUNT_LABELS: Record<string, (n: number) => string> = {
  products: (n) => `${n} producto(s)`,
  children: (n) => `${n} categoría(s) hija(s)`,
  subcategories: (n) => `${n} subcategoría(s)`,
  templateEntries: (n) => `${n} dato(s) en su molde`,
  approvedTemplateEntries: (n) => `${n} dato(s) del molde aprobados`,
  prices: (n) => `${n} precio(s)`,
  priceCount: (n) => `${n} precio(s)`,
  quotes: (n) => `${n} cotización(es)`,
  customerAccounts: (n) => `${n} cuenta(s) de cliente`,
  portalTiers: (n) => `${n} nivel(es) del portal`,
  portalMappings: (n) => `${n} equivalencia(s) del portal`,
  productValues: (n) => `${n} valor(es) guardado(s) en productos`,
  optionSelections: (n) => `${n} selección(es) de opciones`,
  selections: (n) => `${n} producto(s) ya eligieron estas opciones`,
  proposed: (n) => `${n} dato(s) propuesto(s)`,
  approved: (n) => `${n} dato(s) aprobado(s)`,
  retired: (n) => `${n} dato(s) retirado(s)`,
  storedValues: (n) => `${n} valor(es) guardado(s) en productos`,
}

/** Counts with a value above zero, worded for people. Unknown keys are ignored. */
export function usageCountLines(counts: Record<string, number> | undefined): string[] {
  if (!counts) return []
  return Object.entries(counts)
    .filter(([key, value]) => typeof value === 'number' && value > 0 && COUNT_LABELS[key])
    .map(([key, value]) => COUNT_LABELS[key]!(value))
}

/** Summary line of a usage report: whether it can be deleted and why not. */
export function usageSummary(usage: UsageReport): { canDelete: boolean; lines: string[]; blockers: string[] } {
  const blockers = (usage.reasons ?? []).map((reason) => reason.message).filter(Boolean)
  return { canDelete: usage.canDelete ?? blockers.length === 0, lines: usageCountLines(usage.counts), blockers }
}

export type NameResolver = (id: string) => string | undefined

/**
 * Impact lines of a change that needs confirmation. Ids are resolved to names through `resolveName`
 * and never shown; raw keys (option keys, ids) are skipped.
 */
export function impactLines(impact: Record<string, unknown> | undefined, resolveName?: NameResolver): string[] {
  if (!impact) return []
  const lines: string[] = []
  const countKeys = ['products', 'children', 'subcategories', 'templateEntries', 'priceCount', 'selections']
  for (const key of countKeys) {
    const value = impact[key]
    if (typeof value === 'number' && value > 0) lines.push(COUNT_LABELS[key]!(value))
  }
  const from = impact.fromCategoryId ?? impact.fromParentId
  const to = impact.toCategoryId ?? impact.toParentId
  if (from !== undefined || to !== undefined) {
    const name = (id: unknown) => (typeof id === 'string' ? (resolveName?.(id) ?? 'otra categoría') : 'sin categoría padre (raíz)')
    lines.push(`Cambia de categoría padre: de «${name(from)}» a «${name(to)}»`)
  }
  if (typeof impact.fromCurrency === 'string' && typeof impact.toCurrency === 'string') {
    lines.push(`Cambia la moneda de ${impact.fromCurrency} a ${impact.toCurrency}`)
  }
  return lines
}

/** Normalised text for accent/case-insensitive search. */
export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchesQuery(query: string, ...fields: unknown[]): boolean {
  const needle = normalizeText(query)
  if (!needle) return true
  return fields.some((field) => normalizeText(field).includes(needle))
}

/** Slug derived from a name (lowercase, hyphens, no accents). */
export function slugify(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Notice shown by the tariff create form: a tariff is only a label. */
export const TARIFF_CREATE_NOTICE = 'Crear una tarifa solo registra su nombre, código y moneda. No carga precios ni la asigna a clientes.'

export const SPEC_TYPE_LABELS: Record<string, string> = {
  TEXT: 'Texto',
  NUMBER: 'Número',
  BOOLEAN: 'Sí / No',
  OPTION: 'Una opción',
  MULTI_OPTION: 'Varias opciones',
}

export const TEMPLATE_STATUS_LABELS: Record<string, string> = {
  PROPOSED: 'Propuesto',
  APPROVED: 'Aprobado',
  RETIRED: 'Retirado',
}

/** Approval is its own permission: masters:write alone never implies it. */
export const canShowApproveButton = (hasApproveSpecs: boolean, status: string): boolean => hasApproveSpecs && status === 'PROPOSED'

/** Stable key of a dictionary datum or option: lowercase snake_case starting with a letter. */
export function snakeKey(label: string): string {
  const base = normalizeText(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const key = /^[a-z]/.test(base) ? base : base ? `o_${base}` : ''
  return key.slice(0, 64)
}

export interface OptionRow {
  key: string
  label: string
  isActive: boolean
}

export interface OptionsDraft {
  /** Options that already exist, as edited. */
  rows: OptionRow[]
  /** The original rows, to send only what changed. */
  original: OptionRow[]
  /** One new option label per line. */
  newLines: string
}

/** Options to send: changed existing ones plus the new lines (keys derived, repeated ones skipped). */
export function buildOptionsPayload(draft: OptionsDraft): { key: string; label: string; isActive?: boolean }[] {
  const changed = draft.rows
    .filter((row) => {
      const before = draft.original.find((item) => item.key === row.key)
      return !before || before.label !== row.label.trim() || before.isActive !== row.isActive
    })
    .map((row) => ({ key: row.key, label: row.label.trim(), isActive: row.isActive }))
  const taken = new Set(draft.rows.map((row) => row.key))
  const added: { key: string; label: string }[] = []
  for (const line of draft.newLines.split('\n')) {
    const label = line.trim()
    const key = snakeKey(label)
    if (!label || !key || taken.has(key)) continue
    taken.add(key)
    added.push({ key, label })
  }
  return [...changed, ...added]
}
