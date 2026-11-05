/**
 * Provenance of a product in the supplier lists ("Origen", doc section 4.3).
 * One product can appear in many files; each appearance is a source row.
 * Pure functions, no persistence: they mirror the future
 * `UNIQUE (sourceFile, sourceSheet, sourceRow, cutoffDate)` constraint.
 */

export interface ProductSource {
  productId: string
  sourceFile: string
  sourceSheet: string
  /** 1-based row in the original sheet. */
  sourceRow: number
  /** Cutoff date of the list, YYYY-MM-DD. */
  cutoffDate: string
  originalReference: string
  originalDescription: string | null
  originalSection: string | null
  originalBrandLabel: string | null
  classificationCriterion: string | null
  extra: Record<string, string>
}

export interface ProductSourceIssue {
  code: string
  field: keyof ProductSource
  message: string
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function isCalendarDate(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(0)
  // setUTCFullYear avoids the 0-99 => 1900-1999 mapping of Date.UTC.
  d.setUTCFullYear(year, month - 1, day)
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

export function validateProductSource(source: ProductSource): ProductSourceIssue[] {
  const issues: ProductSourceIssue[] = []
  const required = (field: 'sourceFile' | 'sourceSheet' | 'originalReference', code: string) => {
    if (!source[field]?.trim()) issues.push({ code, field, message: `${field} is required.` })
  }
  required('sourceFile', 'source_file_required')
  required('sourceSheet', 'source_sheet_required')
  required('originalReference', 'original_reference_required')

  if (!Number.isInteger(source.sourceRow) || source.sourceRow < 1) {
    issues.push({ code: 'source_row_invalid', field: 'sourceRow', message: 'sourceRow must be an integer greater than or equal to 1.' })
  }
  if (typeof source.cutoffDate !== 'string' || !isCalendarDate(source.cutoffDate)) {
    issues.push({ code: 'cutoff_date_invalid', field: 'cutoffDate', message: 'cutoffDate must be a valid calendar date in YYYY-MM-DD.' })
  }
  return issues
}

/**
 * Identity of one appearance: file + sheet + row + cutoff date. The reference
 * is NOT part of it, so the same reference in another file is another source.
 * JSON keeps the key unambiguous whatever characters the file name contains.
 */
export function sourceIdentityKey(source: ProductSource): string {
  return JSON.stringify([source.sourceFile, source.sourceSheet, source.sourceRow, source.cutoffDate])
}

export interface DedupedSources {
  kept: ProductSource[]
  dropped: ProductSource[]
}

/** Drops exact identity duplicates keeping the first; never merges different identities. */
export function dedupeSources(list: ProductSource[]): DedupedSources {
  const seen = new Set<string>()
  const kept: ProductSource[] = []
  const dropped: ProductSource[] = []
  for (const source of list) {
    const key = sourceIdentityKey(source)
    if (seen.has(key)) dropped.push(source)
    else {
      seen.add(key)
      kept.push(source)
    }
  }
  return { kept, dropped }
}
