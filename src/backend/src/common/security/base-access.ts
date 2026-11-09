import type { ScopedGrant } from './data-scope';

/**
 * Nivel 0 por rol: la agenda propia llega con el rol interno, sin asignación.
 *
 * Solo `own` (cada persona ve y completa lo suyo). El acceso al equipo se
 * deriva aparte de la jerarquía interna vigente; otros roles no reciben nada.
 */
export const BASE_ACCESS_ROLES: readonly string[] = Object.freeze([
  'Super Admin',
  'Supervisor',
  'Admin Comercial',
  'Vendedor',
  'Operador',
  'Consulta',
]);

const BASE_ACTIONS: readonly string[] = Object.freeze([
  'activities:read',
  'activities:create',
  'activities:complete',
]);

export function baseGrantsForRoles(roles: readonly string[] | undefined): ScopedGrant[] {
  if (!roles?.some((role) => BASE_ACCESS_ROLES.includes(role))) return [];
  return BASE_ACTIONS.map((actionId) => ({ sourceId: 'base:role', actionId, scope: 'own' as const }));
}

/** Permisos derivados en tiempo real para agenda del equipo. Nunca se persisten. */
export function teamAgendaGrantsForRoles(roles: readonly string[] | undefined, hasActiveInternalSubordinates: boolean): ScopedGrant[] {
  if (!hasActiveInternalSubordinates || !roles?.some((role) => BASE_ACCESS_ROLES.includes(role))) return [];
  return ['activities:read', 'activities:assign'].map((actionId) => ({
    sourceId: 'derived:team-hierarchy', actionId, scope: 'team' as const,
  }));
}
