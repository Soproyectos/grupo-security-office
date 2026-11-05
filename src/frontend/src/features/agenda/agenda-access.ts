import { AgendaServiceError, fetchAgendaSellers } from '../../services/agenda.service'

/**
 * Criterio «puede equipo» de la agenda (BASE-03 frontend-equipo; aceptación
 * «Solo Agenda propia no muestra equipo»).
 *
 * Las acciones vigentes deciden qué controles se muestran. Super Admin es la
 * única excepción explícita. El servidor comprueba otra vez cada petición.
 */
export interface AgendaAccess {
  /**
   * Ver la «Agenda del equipo» (activities:read de equipo, igual que el
   * servidor). Sin asignar es una vista de solo lectura.
   */
  canUseTeam: boolean
  /** Asignar/reasignar a otros (activities:assign de equipo, igual que el servidor). */
  canAssignOthers: boolean
  canCreateOwn?: boolean
  /** Completar actividades propias / del equipo (activities:complete). */
  canCompleteOwn?: boolean
  canCompleteTeam?: boolean
}

/**
 * Nivel 0 por rol (espejo del backend, `base-access.ts`): la agenda propia
 * llega con el rol interno. Solo informa a la pantalla; el servidor decide.
 */
export const BASE_ACCESS_ROLES = ['Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta']
const BASE_AGENDA_ACTIONS = ['activities:read', 'activities:create', 'activities:complete']

export function baseAgendaGrants(roles?: readonly string[]): { sourceId: string; actionId: string; scope: 'own' }[] {
  if (!roles?.some(role => BASE_ACCESS_ROLES.includes(role))) return []
  return BASE_AGENDA_ACTIONS.map(actionId => ({ sourceId: 'base:role', actionId, scope: 'own' as const }))
}

export function agendaAccess(user?: { roles?: string[]; grants?: readonly { actionId: string; scope: string }[]; status?: 'ready' | 'loading' | 'unavailable' } | null): AgendaAccess {
  const superAdmin = (user?.roles ?? []).includes('Super Admin')
  const grants = [...(user?.grants ?? []), ...baseAgendaGrants(user?.roles)]
  const has = (actionId: string, scope: 'own' | 'team') => superAdmin || (user?.status === 'ready' &&
    grants.some(grant => grant.actionId === actionId && (grant.scope === scope || grant.scope === 'global')))
  return {
    canUseTeam: has('activities:read', 'team'),
    canAssignOthers: has('activities:assign', 'team'),
    canCreateOwn: has('activities:create', 'own'),
    canCompleteOwn: has('activities:complete', 'own'),
    canCompleteTeam: has('activities:complete', 'team'),
  }
}

/**
 * El servidor responde 403 `TEAM_DIRECTORY_FORBIDDEN` a quien solo tiene
 * agenda propia: eso significa «sin equipo», no un fallo de carga.
 */
export function isDirectoryForbidden(error: unknown): boolean {
  return error instanceof AgendaServiceError && error.code === 'forbidden'
}

/**
 * La única query del directorio de personas del equipo. Con `enabled:false` react-query
 * no ejecuta `queryFn`, de modo que quien no puede equipo jamás llama a
 * `/team-workflow/sellers` (la aceptación del incremento).
 */
export function teamSellersQueryOptions(userId: string | undefined, access: AgendaAccess) {
  return {
    queryKey: ['workflow-sellers', userId] as const,
    queryFn: fetchAgendaSellers,
    enabled: access.canUseTeam,
    // A 403 is a final answer («sin equipo»); do not retry it.
    retry: (failureCount: number, error: unknown) => !isDirectoryForbidden(error) && failureCount < 2,
  }
}

/**
 * Criterio para GESTIONAR los enlaces de una actividad (frontend-vinculos).
 *
 * La actividad propia exige `activities:create`; una actividad del equipo
 * exige `activities:assign`. Sólo decide si se OFRECE el formulario: añadir o
 * quitar un vínculo no concede acceso a ningún recurso (ficha BASE-03 §1),
 * y el servidor vuelve a comprobar su propio conjunto en cada petición.
 */
export function canManageAgendaLinks(
  access: AgendaAccess,
  activity: { assigneeId: string },
  userId: string | undefined,
): boolean {
  if (!userId) return false
  return activity.assigneeId === userId ? Boolean(access.canCreateOwn) : access.canAssignOthers
}
