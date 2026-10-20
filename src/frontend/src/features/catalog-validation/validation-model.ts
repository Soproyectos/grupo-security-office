/**
 * CAT-05 `frontend` — modelo puro del panel de validación (sin React: lo mismo
 * que pinta la interfaz, verificable en spec). Espejo del motor `cat05-r1`:
 * una incidencia bloqueante (`error`) impide «lista para publicar»; los
 * `warning`/`info` informativos nunca bloquean — incluido «sin ficha técnica».
 *
 * Enlaces: una incidencia solo es «reparable» (enlace a la sección de la ficha)
 * cuando la persona puede ABRIR/EDITAR la ficha; sin permiso, la incidencia se
 * muestra sin enlace y sin revelar datos internos (diseño §6 ejemplo).
 */

export type IssueSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssueView {
  code: string
  severity: IssueSeverity
  field?: string
  section: string
  message: string
  fix: string
}

export interface ValidationReportView {
  productId: string
  revisionId: string
  status: 'CON_PROBLEMAS' | 'LISTA_PARA_PUBLICAR'
  issues: ValidationIssueView[]
  rulesVersion: string
  at: string
  stale?: boolean
}

export interface ValidationSummary {
  errors: number
  warnings: number
  infos: number
  /** true cuando hay al menos un `error`: publicar estaría bloqueado (CAT-06). */
  blocking: boolean
  /** Estado a pintar en la lista/ficha: nunca «Completo» — vida y revisión son distintos (§7). */
  label: string
  /** Cadena compacta para chips de tabla. */
  chip: string
}

export function summarizeValidation(report: ValidationReportView | null | undefined): ValidationSummary {
  if (!report) return { errors: 0, warnings: 0, infos: 0, blocking: false, label: 'sin revisar', chip: '—' }
  const issues = report.issues ?? []
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length
  const infos = issues.filter((i) => i.severity === 'info').length
  const blocking = errors > 0 || report.stale === true
  const label = report.stale ? 'revisión pendiente' : blocking ? 'con problemas' : 'lista para publicar'
  const chip = report.stale ? 'obsoleta' : errors ? `${errors} error${errors > 1 ? 'es' : ''}` : warnings ? `${warnings} aviso${warnings > 1 ? 's' : ''}` : 'ok'
  return { errors, warnings, infos, blocking, label, chip }
}

/** Ancla de la ficha para una incidencia; null si la sección no tiene destino o no hay permiso. */
export function issueAnchor(issue: ValidationIssueView, canEditSheet: boolean): string | null {
  if (!canEditSheet) return null
  const map: Record<string, string> = {
    identidad: '#ficha-identidad',
    multimedia: '#ficha-fotos',
    documentos: '#ficha-documentos',
    oferta: '#ficha-oferta',
    atributos: '#ficha-atributos',
    general: '#ficha-informacion',
  }
  return map[issue.section] ?? null
}

export interface IssueRow extends ValidationIssueView {
  anchor: string | null
}

/** Ordena errores primero (lo que bloquea se atiende antes) y resuelve anclas. */
export function orderIssues(issues: ValidationIssueView[], canEditSheet: boolean): IssueRow[] {
  const rank: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 }
  return [...issues]
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .map((i) => ({ ...i, anchor: issueAnchor(i, canEditSheet) }))
}

/**
 * Resumen del batch (`POST /products/validation/batch`) tal como lo devuelve el
 * motor: `omitted` sin razones reveladoras y `failed` cuenta aparte — «un fallo
 * de procesamiento no se cuenta como producto válido».
 */
export interface BatchResultItemView {
  productId: string
  outcome: 'LISTA_PARA_PUBLICAR' | 'CON_PROBLEMAS' | 'omitted' | 'failed'
  errorCount?: number
  warningCount?: number
  reason?: string
}

export interface BatchSummaryView {
  examined: number
  valid: number
  withErrors: number
  omitted: number
  failed: number
  results: BatchResultItemView[]
}

export function describeBatch(s: BatchSummaryView): string {
  const partes = [
    `${s.examined} examinados`,
    `${s.valid} listos`,
    `${s.withErrors} con errores`,
  ]
  if (s.omitted) partes.push(`${s.omitted} fuera de tu alcance`)
  if (s.failed) partes.push(`${s.failed} fallidos (no cuentan como válidos)`)
  return partes.join(' · ')
}

/** Texto del aviso de obsoleto (caso 3: editar tras validar invalida el resultado). */
export const STALE_NOTICE =
  'El resultado se quedó obsoleto tras una edición. Vuelve a validar antes de confiar en él (el motor recalcula sobre la revisión vigente).'
