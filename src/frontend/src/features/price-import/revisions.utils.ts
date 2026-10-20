/**
 * IMP-06 §3/§4 — Reglas de VISIBILIDAD por acción (el backend revalida cada una)
 * y ayudantes de presentación puros, separados del componente para poder probarlos
 * sin DOM y mantener el lint sin avisos (patrón de `preview.utils.ts`).
 */
import { canManageListas, hasPermission } from '../../lib/rbac'
import type { PriceImportRevisionApplyResult, PriceImportRevisionHeader } from '../../services/price-import.service'

/** Revisar el historial exige `prices:read`; `canManageListas()` conserva la capa legada (transición D5). */
export function canReadRevisions(): boolean {
  return hasPermission('prices:read') || canManageListas()
}

/** Guardar/descartar una revisión exige `prices:save` (depende de `prices:preview`). */
export function canSaveRevisions(): boolean {
  return hasPermission('prices:save') || canManageListas()
}

/** Aplicar una revisión exige `prices:apply`: acción SEPARADA de guardar. */
export function canApplyRevisions(): boolean {
  return hasPermission('prices:apply') || canManageListas()
}

export const STATUS_LABEL: Record<PriceImportRevisionHeader['status'], string> = {
  GUARDADA: 'Pendiente de aplicar',
  APLICADA: 'Aplicada',
  DESCARTADA: 'Descartada',
}

/** Etiqueta legible del estado; tolera un estado inesperado sin romper la UI. */
export function revisionStatusLabel(status: string): string {
  return STATUS_LABEL[status as PriceImportRevisionHeader['status']] ?? status
}

/** El 409 del servidor trae `feedback` (lista de strings) por fila. */
export function conflictFeedback(cause: unknown): string[] {
  const data = (cause as { response?: { data?: { feedback?: unknown } } })?.response?.data
  return Array.isArray(data?.feedback) ? data.feedback.filter((f): f is string => typeof f === 'string') : []
}

/**
 * Mensaje tras aplicar. Un reintento NO se presenta como un cambio nuevo
 * (`alreadyApplied`) — evita el éxito falso.
 */
export function applyNotice(result: PriceImportRevisionApplyResult): string {
  if (result.alreadyApplied) return 'Esta revisión ya estaba aplicada; no se repitieron los cambios.'
  return `Revisión aplicada: ${result.appliedPrices} precio(s) en ${result.tariffs.join(', ') || '—'}.`
}
