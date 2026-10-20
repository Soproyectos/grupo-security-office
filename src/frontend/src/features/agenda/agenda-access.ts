import { fetchAgendaSellers } from '../../services/agenda.service'

/**
 * Criterio «puede equipo» de la agenda (BASE-03 frontend-equipo; aceptación
 * «Solo Agenda propia no muestra equipo»).
 *
 * Las acciones vigentes deciden qué controles se muestran. Super Admin es la
 * única excepción explícita. El servidor comprueba otra vez cada petición.
 */
export interface AgendaAccess {
  /** Ver la sección «Agenda del equipo» y montar su query de vendedores. */
  canUseTeam: boolean
  /** Asignar/reasignar a otros (crear para un vendedor, botón Reasignar). */
  canAssignOthers: boolean
  canCreateOwn?: boolean
}

export function agendaAccess(user?: { roles?: string[]; grants?: readonly { actionId: string; scope: string }[]; status?: 'ready' | 'loading' | 'unavailable' } | null): AgendaAccess {
  const superAdmin = (user?.roles ?? []).includes('Super Admin')
  const has = (actionId: string, scope: 'own' | 'team') => superAdmin || (user?.status === 'ready' &&
    (user.grants ?? []).some(grant => grant.actionId === actionId && (grant.scope === scope || grant.scope === 'global')))
  return {
    canUseTeam: has('activities:read', 'team'),
    canAssignOthers: has('activities:assign', 'team'),
    canCreateOwn: has('activities:create', 'own'),
  }
}

/**
 * La única query del directorio de vendedores. Con `enabled:false` react-query
 * no ejecuta `queryFn`, de modo que quien no puede equipo jamás llama a
 * `/team-workflow/sellers` (la aceptación del incremento).
 */
export function teamSellersQueryOptions(userId: string | undefined, access: AgendaAccess) {
  return {
    queryKey: ['workflow-sellers', userId] as const,
    queryFn: fetchAgendaSellers,
    enabled: access.canUseTeam,
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
