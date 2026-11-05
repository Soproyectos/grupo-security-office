import { describe, expect, it } from 'vitest'
import {
  BASE_ACCESS_ROLES,
  agendaAccess,
  baseAgendaGrants,
  canManageAgendaLinks,
  isDirectoryForbidden,
  teamSellersQueryOptions,
} from './agenda-access'
import { AgendaServiceError, fetchAgendaSellers } from '../../services/agenda.service'

const grant = (actionId: string, scope: string) => ({ actionId, scope })

describe('controles de agenda por concesiones vigentes', () => {
  it('el cargo Supervisor sin grants tiene agenda propia, pero no equipo ni asignar', () => {
    const access = agendaAccess({ roles: ['Supervisor'], grants: [], status: 'ready' })
    expect(access).toEqual({
      canUseTeam: false, canAssignOthers: false, canCreateOwn: true, canCompleteOwn: true, canCompleteTeam: false,
    })
    expect(teamSellersQueryOptions('supervisor-1', access).enabled).toBe(false)
  })

  it('sin rol interno no hay agenda propia', () => {
    expect(agendaAccess({ roles: ['Cliente'], grants: [], status: 'ready' }).canCreateOwn).toBe(false)
    expect(baseAgendaGrants(['Cliente'])).toEqual([])
  })

  it('leer equipo y asignar son permisos independientes', () => {
    const read = agendaAccess({ roles: ['Vendedor'], grants: [grant('activities:read', 'team')], status: 'ready' })
    expect(read.canUseTeam).toBe(true)
    expect(read.canAssignOthers).toBe(false)
    expect(teamSellersQueryOptions('user-1', read)).toEqual({
      queryKey: ['workflow-sellers', 'user-1'], queryFn: fetchAgendaSellers, enabled: true, retry: expect.any(Function),
    })

    const assign = agendaAccess({ roles: ['Vendedor'], grants: [grant('activities:assign', 'team')], status: 'ready' })
    expect(assign.canUseTeam).toBe(false)
    expect(assign.canAssignOthers).toBe(true)
  })

  it('durante carga o fallo no recupera permisos por cargo', () => {
    for (const status of ['loading', 'unavailable'] as const) {
      expect(agendaAccess({ roles: ['Supervisor'], grants: [grant('activities:assign', 'team')], status }).canAssignOthers).toBe(false)
    }
  })

  it('Super Admin conserva la excepción explícita', () => {
    expect(agendaAccess({ roles: ['Super Admin'], grants: [], status: 'ready' })).toEqual({
      canUseTeam: true, canAssignOthers: true, canCreateOwn: true, canCompleteOwn: true, canCompleteTeam: true,
    })
  })

  it('los enlaces propios exigen crear; los ajenos exigen asignar', () => {
    const own = { assigneeId: 'user-1' }
    const other = { assigneeId: 'seller-9' }
    const readOnly = agendaAccess({ grants: [grant('activities:read', 'team')], status: 'ready' })
    expect(canManageAgendaLinks(readOnly, own, 'user-1')).toBe(false)
    expect(canManageAgendaLinks(readOnly, other, 'user-1')).toBe(false)
    const createOwn = agendaAccess({ grants: [grant('activities:create', 'own')], status: 'ready' })
    expect(canManageAgendaLinks(createOwn, own, 'user-1')).toBe(true)
    expect(canManageAgendaLinks(createOwn, other, 'user-1')).toBe(false)
    const assign = agendaAccess({ grants: [grant('activities:assign', 'team')], status: 'ready' })
    expect(canManageAgendaLinks(assign, other, 'user-1')).toBe(true)
    expect(canManageAgendaLinks(assign, own, undefined)).toBe(false)
  })
})

describe('paridad con el servidor (nivel 0 por rol y equipo)', () => {
  it('exporta los mismos roles base que el backend (base-access.ts)', () => {
    expect([...BASE_ACCESS_ROLES]).toEqual(['Super Admin', 'Supervisor', 'Admin Comercial', 'Vendedor', 'Operador', 'Consulta'])
  })

  it('cada rol base tiene agenda propia (leer, crear y completar) y ningún equipo', () => {
    for (const role of BASE_ACCESS_ROLES.filter(item => item !== 'Super Admin')) {
      expect(agendaAccess({ roles: [role], grants: [], status: 'ready' })).toEqual({
        canUseTeam: false, canAssignOthers: false, canCreateOwn: true, canCompleteOwn: true, canCompleteTeam: false,
      })
    }
  })

  it('el paquete jefe de equipo (leer + asignar + completar de equipo) habilita todo el equipo', () => {
    const grants = [grant('activities:read', 'team'), grant('activities:assign', 'team'), grant('activities:complete', 'team')]
    expect(agendaAccess({ roles: ['Operador'], grants, status: 'ready' })).toMatchObject({
      canUseTeam: true, canAssignOthers: true, canCompleteTeam: true,
    })
  })

  it('solo ver equipo es lectura: no asigna ni completa las ajenas', () => {
    const access = agendaAccess({ roles: ['Consulta'], grants: [grant('activities:read', 'team')], status: 'ready' })
    expect(access).toMatchObject({ canUseTeam: true, canAssignOthers: false, canCompleteTeam: false })
  })

  it('un 403 del directorio es «sin equipo»; otros fallos no lo son', () => {
    expect(isDirectoryForbidden(new AgendaServiceError('forbidden', 'x', 403, 'TEAM_DIRECTORY_FORBIDDEN'))).toBe(true)
    expect(isDirectoryForbidden(new AgendaServiceError('unknown', 'x', 500))).toBe(false)
    expect(isDirectoryForbidden(new Error('Network Error'))).toBe(false)
  })

  it('no reintenta un 403 del directorio y reintenta poco otros fallos', () => {
    const access = agendaAccess({ roles: ['Vendedor'], grants: [grant('activities:read', 'team')], status: 'ready' })
    const retry = teamSellersQueryOptions('user-1', access).retry
    expect(retry(0, new AgendaServiceError('forbidden', 'x', 403))).toBe(false)
    expect(retry(0, new Error('Network Error'))).toBe(true)
    expect(retry(2, new Error('Network Error'))).toBe(false)
  })
})
