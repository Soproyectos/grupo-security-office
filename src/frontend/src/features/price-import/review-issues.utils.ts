import type { PriceImportIssue, PriceImportPreview, PriceImportRow } from '../../services/price-import.service'
import { formatPreviewPesos } from './preview.utils'

export type ReviewIssueGroupId =
  | 'unknownReference' | 'duplicateReference' | 'ambiguousReference' | 'invalidReference' | 'invalidPrice'
  | 'forbidden' | 'tariffUnavailable' | 'largeChanges' | 'storedMismatch' | 'ignoredColumn' | 'other'

export interface ReviewIssueItem {
  /** Excel row, or null for problems that affect the whole file. */
  row: number | null
  reference: string
  column: string
  detail: string
}

export interface ReviewIssueGroup {
  id: ReviewIssueGroupId
  title: string
  /** What happens with the rows in this group, in plain Spanish. */
  effect: string
  /** "error" blocks the rows; "warning" needs attention but does not reject them. */
  severity: 'error' | 'warning'
  count: number
  items: ReviewIssueItem[]
}

interface GroupDefinition { id: ReviewIssueGroupId; title: string; effect: string; severity: 'error' | 'warning' }

/** Fixed order: by seriousness, rejected rows first. */
const GROUPS: GroupDefinition[] = [
  { id: 'unknownReference', title: 'Referencias que no están en Biblioteca', effect: 'No se aplican. Puedes omitirlas o crearlas en Biblioteca.', severity: 'error' },
  { id: 'duplicateReference', title: 'Referencias repetidas en el archivo', effect: 'No se aplican. Deja una sola fila por referencia.', severity: 'error' },
  { id: 'ambiguousReference', title: 'Referencias que coinciden con más de un producto', effect: 'No se aplican. Usa una referencia que identifique un solo producto.', severity: 'error' },
  { id: 'invalidReference', title: 'Referencias no válidas', effect: 'No se aplican. Corrige la referencia en el archivo.', severity: 'error' },
  { id: 'invalidPrice', title: 'Precios no válidos o faltantes', effect: 'No se aplican. Corrige o completa el precio.', severity: 'error' },
  { id: 'forbidden', title: 'Sin permiso para esas referencias', effect: 'No se aplican. Pide a un administrador que las actualice.', severity: 'error' },
  { id: 'tariffUnavailable', title: 'Tarifas sin configurar', effect: 'No se aplican los precios de esas tarifas hasta que se configuren.', severity: 'error' },
  { id: 'largeChanges', title: 'Cambios grandes', effect: 'Se aplican solo si confirmas los cambios antes de aplicar.', severity: 'warning' },
  { id: 'storedMismatch', title: 'Precio guardado distinto (revisar)', effect: 'Revisa estas filas: el precio guardado no coincide con el esperado.', severity: 'warning' },
  { id: 'ignoredColumn', title: 'Columnas que se ignoran', effect: 'Se ignora la columna; no afecta a los precios.', severity: 'warning' },
  { id: 'other', title: 'Otros avisos', effect: 'Revisa el detalle de cada aviso.', severity: 'warning' },
]

const CODE_TO_GROUP: Record<string, ReviewIssueGroupId> = {
  UNKNOWN_REFERENCE: 'unknownReference',
  DUPLICATE_REFERENCE: 'duplicateReference',
  AMBIGUOUS_REFERENCE: 'ambiguousReference',
  INVALID_REFERENCE: 'invalidReference',
  INVALID_PRICE: 'invalidPrice',
  PRICE_OUT_OF_RANGE: 'invalidPrice',
  PRICE_REQUIRED: 'invalidPrice',
  LISTA_FORBIDDEN: 'forbidden',
  REFERENCE_UNAVAILABLE: 'forbidden',
  TARIFF_UNAVAILABLE: 'tariffUnavailable',
  STORED_PRICE_MISMATCH: 'storedMismatch',
  IGNORED_COLUMN: 'ignoredColumn',
}

export function issueGroupId(code: string): ReviewIssueGroupId {
  return CODE_TO_GROUP[code] ?? 'other'
}

/** "+12,5 %" with a comma decimal; "—" when the server sent no percentage. */
export function formatChangePercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return '—'
  const rounded = Math.round(number * 10) / 10
  const text = String(Math.abs(rounded)).replace('.', ',')
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${text} %`
}

function issueKey(issue: PriceImportIssue): string {
  return `${issue.row ?? ''}|${issue.code}|${issue.column ?? ''}|${issue.message}`
}

/** Groups every issue (file-level and per row, de-duplicated) plus the large price changes. Empty groups are dropped. */
export function groupReviewIssues(preview: Pick<PriceImportPreview, 'issues' | 'rows'>): ReviewIssueGroup[] {
  const skuByRow = new Map<number, string>()
  for (const row of preview.rows) skuByRow.set(row.row, row.sku)
  const buckets = new Map<ReviewIssueGroupId, ReviewIssueItem[]>()
  const push = (id: ReviewIssueGroupId, item: ReviewIssueItem) => {
    const list = buckets.get(id)
    if (list) list.push(item)
    else buckets.set(id, [item])
  }

  const seen = new Set<string>()
  const addIssue = (issue: PriceImportIssue) => {
    const key = issueKey(issue)
    if (seen.has(key)) return
    seen.add(key)
    push(issueGroupId(issue.code), {
      row: issue.row,
      reference: issue.row !== null ? skuByRow.get(issue.row) ?? '' : '',
      column: issue.column ?? '',
      detail: issue.message,
    })
  }
  for (const issue of preview.issues) addIssue(issue)
  for (const row of preview.rows) for (const issue of row.issues) addIssue(issue)

  for (const row of preview.rows) {
    for (const price of row.prices) {
      if (!price.largeChange) continue
      push('largeChanges', {
        row: row.row,
        reference: row.sku,
        column: price.code,
        detail: `Antes ${formatPreviewPesos(price.previous)}, ahora ${formatPreviewPesos(price.rounded)} (${formatChangePercent(price.changePercent)})`,
      })
    }
  }

  const sortByRow = (a: ReviewIssueItem, b: ReviewIssueItem) => (a.row ?? -1) - (b.row ?? -1)
  return GROUPS.flatMap((definition) => {
    const items = buckets.get(definition.id)
    if (!items || items.length === 0) return []
    const sorted = [...items].sort(sortByRow)
    return [{ ...definition, count: sorted.length, items: sorted }]
  })
}

// ─── Table filters ───

export type RowFilter = 'all' | 'problems' | 'changed' | 'unchanged' | 'large'

export const ROW_FILTERS: ReadonlyArray<{ id: RowFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'problems', label: 'Con problemas' },
  { id: 'changed', label: 'Cambian' },
  { id: 'unchanged', label: 'Sin cambios' },
  { id: 'large', label: 'Cambio grande' },
]

/** "Cambian" includes new prices: both write something. */
export function rowMatchesFilter(row: PriceImportRow, filter: RowFilter): boolean {
  switch (filter) {
    case 'all': return true
    case 'problems': return row.status === 'error' || row.issues.length > 0
    case 'changed': return row.prices.some((price) => price.change !== 'unchanged')
    case 'unchanged': return row.prices.length > 0 && row.prices.every((price) => price.change === 'unchanged')
    case 'large': return row.prices.some((price) => price.largeChange === true)
  }
}

export function filterRows(rows: PriceImportRow[], filter: RowFilter): PriceImportRow[] {
  return filter === 'all' ? rows : rows.filter((row) => rowMatchesFilter(row, filter))
}

export function countRowsByFilter(rows: PriceImportRow[]): Record<RowFilter, number> {
  const counts: Record<RowFilter, number> = { all: rows.length, problems: 0, changed: 0, unchanged: 0, large: 0 }
  for (const row of rows) {
    for (const filter of ['problems', 'changed', 'unchanged', 'large'] as const) if (rowMatchesFilter(row, filter)) counts[filter] += 1
  }
  return counts
}

// ─── CSV of problems ───

const CSV_SEPARATOR = ';'

/** Quotes when needed and neutralises spreadsheet formulas (=, +, -, @ at the start). */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** UTF-8 CSV with BOM and ";" separator so Excel in Spanish opens it correctly. */
export function buildProblemsCsv(groups: ReviewIssueGroup[]): string {
  const header = ['Fila Excel', 'Referencia', 'Columna', 'Tipo', 'Detalle']
  const lines = [header.map(csvCell).join(CSV_SEPARATOR)]
  for (const group of groups) {
    for (const item of group.items) {
      lines.push([item.row ?? '', item.reference, item.column, group.title, item.detail].map(csvCell).join(CSV_SEPARATOR))
    }
  }
  return `\ufeff${lines.join('\r\n')}\r\n`
}

export function problemsCsvFileName(fileName: string): string {
  const base = fileName.replace(/\.xlsx$/i, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
  return `problemas-${base || 'precios'}.csv`
}
