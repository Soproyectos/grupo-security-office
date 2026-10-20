/**
 * CAT-06 `frontend` — modelo puro de la publicación. Espejo del contrato de
 * servidor (bandeja §10 del contrato CAT-06): aquí NO se re-definen reglas —
 * solo se presentan los estados que el servidor ya calculó (revisión de trabajo,
 * pin, congelado) y se traduce el 409 del motor a texto legible.
 */

export type BoardView = 'pendientes' | 'problemas' | 'publicados' | 'historial'

export const BOARD_VIEWS: { id: BoardView; label: string }[] = [
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'problemas', label: 'Con problemas' },
  { id: 'publicados', label: 'Publicados' },
  { id: 'historial', label: 'Historial' },
]

/** Badge por vista/estado (clases Tailwind del panel). */
export function viewBadge(view: BoardView): { label: string; tone: string } {
  switch (view) {
    case 'problemas':
      return { label: 'con problemas', tone: 'text-red-700' }
    case 'publicados':
      return { label: 'publicado', tone: 'text-emerald-700' }
    case 'historial':
      return { label: 'historial', tone: 'text-neutral-500' }
    default:
      return { label: 'pendiente', tone: 'text-amber-700' }
  }
}

export interface WorkingRevisionInfo {
  id: string
  version: number
  status: string
  rulesVersion: string | null
  validatedAt: string | null
  errorCount: number
  warningCount: number
}

export interface BoardItem {
  id: string
  sku: string
  name: string
  category: string | null
  lifecycleStatus: string
  publishAt: string | null
  scheduledRevisionId: string | null
  publicRevisionId: string | null
  workingRevision: WorkingRevisionInfo | null
}

/**
 * Avisos del ítem: qué verá el scheduler al vencer y si hay pin publicado.
 * Solo describe lo que el servidor afirmó (no inventa comprobaciones).
 */
export function describeBoardItem(item: BoardItem): { schedule: string | null; published: string | null; validation: string | null } {
  const schedule =
    item.publishAt && item.scheduledRevisionId
      ? `Programado para ${new Date(item.publishAt).toLocaleString('es-CO')}: se publicará la revisión congelada v${item.scheduledRevisionId.slice(0, 8)}…, no los cambios posteriores.`
      : item.publishAt
        ? `Programado para ${new Date(item.publishAt).toLocaleString('es-CO')} (sin revisión congelada: se congelará al disparar).`
        : null
  const published = item.publicRevisionId
    ? `En la tienda: revisión ${item.publicRevisionId.slice(0, 8)}…`
    : null
  const rev = item.workingRevision
  const validation = rev
    ? rev.errorCount
      ? `${rev.errorCount} ${rev.errorCount === 1 ? 'error' : 'errores'} de validación (bloquean publicar)`
      : rev.validatedAt
        ? `Validada sin errores (${rev.rulesVersion ?? 'reglas ?'})${rev.warningCount ? ` · ${rev.warningCount} aviso${rev.warningCount > 1 ? 's' : ''}` : ''}`
        : 'Sin validar'
    : 'Sin validar'
  return { schedule, published, validation }
}

/** Acción que la UI ofrece según estado (la autorización real la decide el servidor). */
export function offeredAction(lifecycleStatus: string): 'publicar' | 'retirar' | null {
  if (lifecycleStatus === 'DRAFT') return 'publicar'
  if (lifecycleStatus === 'PUBLISHED') return 'retirar'
  return null
}

/**
 * Traduce el 409 `publication-not-ready` (los `error` viajan en `feedback`,
 * único canal que reenvía el filtro global) a líneas legibles.
 */
export function publicationBlockLines(error: unknown): string[] | null {
  const data = (error as { response?: { status?: number; data?: { message?: unknown; feedback?: unknown } } })?.response?.data
  const status = (error as { response?: { status?: number } })?.response?.status
  if (status !== 409 || !data) return null
  const feedback = Array.isArray(data.feedback) ? data.feedback.filter((f): f is string => typeof f === 'string') : []
  const isPublication = feedback.some((f) => /^[a-z]+\.[a-z_]+ \(/.test(f)) || String(data.message ?? '').includes('Publicación bloqueada')
  if (!isPublication) return null
  return feedback.length ? feedback : [String(data.message ?? 'Publicación bloqueada.')]
}

export interface PublicationEventView {
  action: string
  result: 'ok' | 'blocked' | 'failed' | string
  revisionId: string | null
  actorId: string | null
  createdAt: string
}

const ACTION_LABELS: Record<string, string> = {
  PUBLISH: 'Publicación',
  UNPUBLISH: 'Retirada',
  SCHEDULE: 'Programación',
  UNSCHEDULE: 'Cancelación de programación',
  SCHEDULE_PUBLISHED: 'Disparo del scheduler',
  SCHEDULE_BLOCKED: 'Disparo bloqueado',
}

/** Línea del historial: quién/qué revisión/cuándo/resultado — legible, sin revelar ids largos. */
export function describePublicationEvent(ev: PublicationEventView): string {
  const label = ACTION_LABELS[ev.action] ?? ev.action
  const quien = ev.actorId ? `actor ${ev.actorId.slice(0, 8)}…` : 'scheduler'
  const rev = ev.revisionId ? ` · revisión ${ev.revisionId.slice(0, 8)}…` : ''
  return `${label} (${ev.result}) · ${new Date(ev.createdAt).toLocaleString('es-CO')} · ${quien}${rev}`
}
