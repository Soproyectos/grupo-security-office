import { describe, expect, it } from 'vitest'
import { agendaAccess, canManageAgendaLinks, teamSellersQueryOptions } from './agenda-access'
import { fetchAgendaSellers } from '../../services/agenda.service'

const grant = (actionId: string, scope: string) => ({ actionId, scope })

describe('controles de agenda por concesiones vigentes', () => {
  it('el cargo Supervisor sin grants no muestra equipo ni permite asignar', () => {
    const access = agendaAccess({ roles: ['Supervisor'], grants: [], status: 'ready' })
    expect(access).toEqual({ canUseTeam: false, canAssignOthers: false, canCreateOwn: false })
    expect(teamSellersQueryOptions('supervisor-1', access).enabled).toBe(false)
  })

  it('leer equipo y asignar son permisos independientes', () => {
    const read = agendaAccess({ roles: ['Vendedor'], grants: [grant('activities:read', 'team')], status: 'ready' })
    expect(read.canUseTeam).toBe(true)
    expect(read.canAssignOthers).toBe(false)
    expect(teamSellersQueryOptions('user-1', read)).toEqual({
      queryKey: ['workflow-sellers', 'user-1'], queryFn: fetchAgendaSellers, enabled: true,
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
      canUseTeam: true, canAssignOthers: true, canCreateOwn: true,
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
