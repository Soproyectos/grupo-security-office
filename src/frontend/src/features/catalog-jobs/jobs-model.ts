/**
 * CAT-07 frontend — modelo PURO de trabajos del catálogo. Espejo del `JobView`
 * del servidor (nunca al revés): la UI no inventa estados ni reglas, solo los
 * explica. Los contadores son DERIVADOS en el servidor; aquí solo se muestran.
 */

export interface CatalogJobView {
  id: string
  kind: string
  state: string
  progressDone: number
  progressTotal: number
  error: string | null
  resultSummary: unknown
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  /** `false` para administradores que ven trabajos ajenos (no revelan detalles). */
  mine: boolean
}

/** Estados vivos: el trabajo aún puede avanzar (polling / cancelar). */
export const ACTIVE_STATES: ReadonlySet<string> = new Set(['QUEUED', 'RUNNING'])

export function isJobActive(job: Pick<CatalogJobView, 'state'>): boolean {
  return ACTIVE_STATES.has(job.state)
}

export function progressLabel(job: Pick<CatalogJobView, 'progressDone' | 'progressTotal'>): string {
  return `${job.progressDone}/${job.progressTotal}`
}

const STATE_LABELS: Record<string, string> = {
  QUEUED: 'En cola',
  RUNNING: 'En ejecución',
  COMPLETED: 'Completado',
  COMPLETED_WITH_ERRORS: 'Completado con errores',
  FAILED: 'Fallido',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
}

/**
 * Etiqueta honesta del estado. `permission-revoked` (revocar todas las
 * concesiones antes de ejecutar) se nombra como lo que es: el trabajo NO se
 * ejecutó por falta de permisos vigentes (enmienda 2026-10-19).
 */
export function stateLabel(job: Pick<CatalogJobView, 'state' | 'error'>): string {
  const base = STATE_LABELS[job.state] ?? job.state
  if (job.state === 'CANCELLED' && job.error === 'permission-revoked') {
    return 'Cancelado: se retiraron los permisos antes de ejecutar'
  }
  if (job.state === 'CANCELLED' && job.error === 'cancelled-by-user') {
    return 'Cancelado por el usuario'
  }
  return base
}

/** Al menos un trabajo vivo → conviene refrescar (el servidor es el progreso real). */
export function shouldPoll(jobs: readonly Pick<CatalogJobView, 'state'>[]): boolean {
  return jobs.some(isJobActive)
}

/**
 * retryKey determinista del escaneo de una lista dentro de la hora: re-pulsar
 * el botón NO duplica el trabajo (devuelve `reused: true` con el mismo id);
 * una hora distinta permite un escaneo nuevo explícito.
 */
export function scanRetryKey(listaId: string, now: number = Date.now()): string {
  return `validation-scan:${listaId}:${Math.floor(now / 3_600_000)}`
}
