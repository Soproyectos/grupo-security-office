import type { ScopedGrant } from './data-scope';

/**
 * Nivel 0 por rol: la agenda propia llega con el rol interno, sin asignación.
 *
 * Solo `own` (cada persona ve y completa lo suyo). Ver al equipo o asignar a
 * otros sigue exigiendo un paquete asignado. Quien no tenga un rol interno
 * (clientes del portal, cuentas sin rol) no recibe nada.
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
