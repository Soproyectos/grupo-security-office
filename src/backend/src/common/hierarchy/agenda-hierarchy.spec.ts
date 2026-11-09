import { HierarchyService } from './hierarchy.service';
import { BASE_ACCESS_ROLES, teamAgendaGrantsForRoles } from '../security/base-access';

describe('agenda derivada de la jerarquía actual', () => {
  it.each(BASE_ACCESS_ROLES)('%s con subordinados obtiene solo lectura y asignación de equipo', (role) => {
    expect(teamAgendaGrantsForRoles([role], true)).toEqual([
      { sourceId: 'derived:team-hierarchy', actionId: 'activities:read', scope: 'team' },
      { sourceId: 'derived:team-hierarchy', actionId: 'activities:assign', scope: 'team' },
    ]);
  });

  it('sin subordinados o sin rol interno no deriva permisos', () => {
    expect(teamAgendaGrantsForRoles(['Supervisor'], false)).toEqual([]);
    expect(teamAgendaGrantsForRoles(['Cliente'], true)).toEqual([]);
    expect(teamAgendaGrantsForRoles(undefined, true)).toEqual([]);
  });

  it('busca solo descendientes internos activos, incluyendo niveles indirectos', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'direct', depth: 1 }, { id: 'indirect', depth: 2 }]),
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'indirect' }]) },
    };
    const hierarchy = new HierarchyService(prisma as never);
    expect(await hierarchy.getActiveInternalSubordinateIds('boss')).toEqual(['indirect']);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['direct', 'indirect'] }, isActive: true, roles: { some: { role: { name: { in: [...BASE_ACCESS_ROLES] } } } } },
      select: { id: true },
    });
  });

  it('al retirar subordinados vuelve a consultar y deja de conceder equipo', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 'report', depth: 1 }]).mockResolvedValueOnce([]),
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'report' }]) },
    };
    const hierarchy = new HierarchyService(prisma as never);
    expect(teamAgendaGrantsForRoles(['Operador'], (await hierarchy.getActiveInternalSubordinateIds('boss')).length > 0)).toHaveLength(2);
    expect(teamAgendaGrantsForRoles(['Operador'], (await hierarchy.getActiveInternalSubordinateIds('boss')).length > 0)).toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('si solo quedan descendientes inactivos o externos no concede equipo', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'inactive', depth: 1 }]),
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const ids = await new HierarchyService(prisma as never).getActiveInternalSubordinateIds('boss');
    expect(teamAgendaGrantsForRoles(['Consulta'], ids.length > 0)).toEqual([]);
  });
});
