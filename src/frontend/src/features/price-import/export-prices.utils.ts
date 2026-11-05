/**
 * IMP-07 (07A) — Visibilidad de la exportación de la lista.
 * El servidor exige `prices:read` y el acceso a la lista; aquí solo se decide
 * si el botón se muestra. Solo cuenta el permiso asignado, nunca el cargo.
 */
import { hasPermission } from '../../lib/rbac'

export function canExportPrices(): boolean {
  return hasPermission('prices:read')
}
