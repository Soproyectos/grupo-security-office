jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

import { ForbiddenException } from '@nestjs/common';
import { CustomerPortalService } from './customer-portal.service';
import { PortalAccountAccessService } from './portal-account-access.service';

/** listAdvisors with the REAL scope rules (grants and hierarchy are stubbed). */
const prisma: any = { user: { findMany: jest.fn() } };
const grantsService: any = { grantsForUser: jest.fn() };
const hierarchy: any = { getSubordinateIds: jest.fn() };
const assignment: any = { canManage: jest.fn() };
const grant = (actionId: string, scope: string) => ({ sourceId: 's', actionId, scope });
const user = (id: string, name: string, zone: string | null, role = 'Vendedor') => ({ id, name, zone: zone ? { name: zone } : null, roles: [{ role: { name: role } }] });

describe('CustomerPortalService.listAdvisors', () => {
  let service: CustomerPortalService;
  beforeEach(() => {
    jest.resetAllMocks();
    hierarchy.getSubordinateIds.mockResolvedValue(['v2']);
    assignment.canManage.mockImplementation(async (id: string) => id !== 'nope');
    const access = new PortalAccountAccessService(prisma, grantsService, hierarchy);
    service = new CustomerPortalService(prisma, {} as any, { get: jest.fn() } as any, { log: jest.fn() } as any, undefined, access, assignment);
  });

  it('team scope: only me and my team, active, with zone name; skips users who cannot manage accounts', async () => {
    grantsService.grantsForUser.mockResolvedValue([grant('portalAccounts:read', 'team'), grant('portalAccounts:assign', 'team')]);
    prisma.user.findMany.mockResolvedValue([user('sup', 'Sara', 'Eje Cafetero'), user('v2', 'Vera', null), user('nope', 'Nadie', null)]);
    const rows = await service.listAdvisors({ userId: 'sup', roles: ['Supervisor'] });
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ isActive: true, id: { in: ['sup', 'v2'] } });
    expect(rows).toEqual([{ id: 'sup', name: 'Sara', zone: 'Eje Cafetero' }, { id: 'v2', name: 'Vera', zone: null }]);
  });

  it('own scope: same candidates as team (me and my team), never the whole staff', async () => {
    grantsService.grantsForUser.mockResolvedValue([grant('portalAccounts:read', 'own'), grant('portalAccounts:assign', 'own')]);
    prisma.user.findMany.mockResolvedValue([user('v1', 'Vera', null)]);
    await service.listAdvisors({ userId: 'v1', roles: ['Vendedor'] });
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ isActive: true, id: { in: ['v1', 'v2'] } });
  });

  it('global scope and Super Admin: every active user is a candidate (no id filter)', async () => {
    grantsService.grantsForUser.mockResolvedValue([grant('portalAccounts:read', 'global'), grant('portalAccounts:assign', 'global')]);
    prisma.user.findMany.mockResolvedValue([user('a', 'Ana', 'Norte')]);
    await service.listAdvisors({ userId: 'g', roles: [] });
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
    await service.listAdvisors({ userId: 'root', roles: ['Super Admin'] });
    expect(prisma.user.findMany.mock.calls[1][0].where).toEqual({ isActive: true });
  });

  it('without portalAccounts:assign it is a 403 and nothing is queried', async () => {
    grantsService.grantsForUser.mockResolvedValue([grant('portalAccounts:manage', 'own')]);
    await expect(service.listAdvisors({ userId: 'v1', roles: ['Vendedor'] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
