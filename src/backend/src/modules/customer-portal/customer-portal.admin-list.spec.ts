jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

import { ForbiddenException } from '@nestjs/common';
import { CustomerPortalService } from './customer-portal.service';
import { PortalAccountAccessService } from './portal-account-access.service';

/** listAccounts / listPending / listTiersFor with the REAL scope rules (grants and hierarchy are stubbed). */
const prisma: any = { portalAccount: { findMany: jest.fn() }, portalTier: { findMany: jest.fn() } };
const grantsService: any = { grantsForUser: jest.fn() };
const hierarchy: any = { getSubordinateIds: jest.fn() };
const grant = (actionId: string, scope: string) => ({ sourceId: 's', actionId, scope });

const ROW = { id: 'a1', city: '11001', advisor: { id: 'v1', name: 'Vera' }, customer: { id: 'c1', portalTier: { id: 't1', name: 'Oro', isActive: true } } };

describe('CustomerPortalService admin lists (scoped)', () => {
  let service: CustomerPortalService;
  beforeEach(() => {
    jest.resetAllMocks();
    hierarchy.getSubordinateIds.mockResolvedValue(['v2']);
    prisma.portalAccount.findMany.mockResolvedValue([ROW]);
    const access = new PortalAccountAccessService(prisma, grantsService, hierarchy);
    service = new CustomerPortalService(prisma, {} as any, { get: jest.fn() } as any, { log: jest.fn() } as any, undefined, access);
  });

  it('own: filters by advisor or customer owner and shows advisor, resolved city and the company tier', async () => {
    grantsService.grantsForUser.mockResolvedValue([grant('portalAccounts:read', 'own')]);
    const rows = await service.listAccounts({ userId: 'v1', roles: ['Vendedor'] });
    const args = prisma.portalAccount.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ OR: [{ advisorId: { in: ['v1'] } }, { customer: { ownerId: { in: ['v1'] } } }] });
    expect(args.select).toMatchObject({
      advisor: { select: { id: true, name: true } },
      customer: { select: expect.objectContaining({ portalTierId: true, portalTier: { select: { id: true, name: true, isActive: true, priceListId: true } } }) },
      tier: { select: { id: true, name: true, isActive: true, priceListId: true } },
    });
    expect(rows[0].city).toEqual({ code: '11001', name: 'Bogotá, D.C.', departmentCode: '11', department: 'Bogotá, D.C.' });
    expect(rows[0].advisor).toEqual({ id: 'v1', name: 'Vera' });
  });

  it('team: includes the subordinates and the supervisors queue', async () => {
    grantsService.grantsForUser.mockResolvedValue([grant('portalAccounts:read', 'team'), grant('portalAccounts:assign', 'team')]);
    await service.listAccounts({ userId: 'sup', roles: ['Supervisor'] });
    expect(prisma.portalAccount.findMany.mock.calls[0][0].where.OR).toEqual([
      { advisorId: { in: ['sup', 'v2'] } },
      { customer: { ownerId: { in: ['sup', 'v2'] } } },
      { state: 'PENDING', advisorId: null },
    ]);
  });

  it('global and Super Admin: no filter', async () => {
    grantsService.grantsForUser.mockResolvedValue([grant('portalAccounts:read', 'global')]);
    await service.listAccounts({ userId: 'g', roles: [] });
    expect(prisma.portalAccount.findMany.mock.calls[0][0].where).toEqual({});
    await service.listAccounts({ userId: 'root', roles: ['Super Admin'] });
    expect(prisma.portalAccount.findMany.mock.calls[1][0].where).toEqual({});
  });

  it('without portalAccounts:read the list is a 403 and nothing is queried', async () => {
    grantsService.grantsForUser.mockResolvedValue([grant('quotes:read', 'own')]);
    await expect(service.listAccounts({ userId: 'x', roles: [] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.portalAccount.findMany).not.toHaveBeenCalled();
  });

  it('pending queue = PENDING AND the person scope', async () => {
    grantsService.grantsForUser.mockResolvedValue([grant('portalAccounts:read', 'own')]);
    await service.listPending({ userId: 'v1', roles: [] });
    expect(prisma.portalAccount.findMany.mock.calls[0][0].where).toEqual({
      AND: [{ state: 'PENDING' }, { OR: [{ advisorId: { in: ['v1'] } }, { customer: { ownerId: { in: ['v1'] } } }] }],
    });
  });

  it('tiers for advisors: only active tiers, never the price list; Super Admin keeps the full list', async () => {
    grantsService.grantsForUser.mockResolvedValue([grant('portalAccounts:read', 'own'), grant('portalAccounts:manage', 'own')]);
    prisma.portalTier.findMany.mockResolvedValue([{ id: 't1', name: 'Oro' }]);
    await service.listTiersFor({ userId: 'v1', roles: ['Vendedor'] });
    expect(prisma.portalTier.findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, description: true, isActive: true } });
    grantsService.grantsForUser.mockResolvedValue([grant('portalAccounts:read', 'own')]);
    await expect(service.listTiersFor({ userId: 'v1', roles: ['Vendedor'] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('tariff options (price lists to pick for an account)', () => {
    beforeEach(() => {
      prisma.priceList = { findMany: jest.fn().mockResolvedValue([{ id: 'pl-1', name: 'Instaladores', code: 'INST', currency: 'COP' }]) };
    });

    it('with portalAccounts:manage: active lists by name, only id, name, code and currency', async () => {
      grantsService.grantsForUser.mockResolvedValue([grant('portalAccounts:read', 'own'), grant('portalAccounts:manage', 'own')]);
      const rows = await service.listTariffOptions({ userId: 'v1', roles: ['Vendedor'] });
      expect(prisma.priceList.findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, currency: true } });
      expect(rows).toEqual([{ id: 'pl-1', name: 'Instaladores', code: 'INST', currency: 'COP' }]);
    });

    it('Super Admin passes without grants', async () => {
      await expect(service.listTariffOptions({ userId: 'root', roles: ['Super Admin'] })).resolves.toHaveLength(1);
    });

    it('without portalAccounts:manage it is a 403 and nothing is queried', async () => {
      grantsService.grantsForUser.mockResolvedValue([grant('portalAccounts:read', 'global'), grant('portalTariffs:manage', 'global')]);
      await expect(service.listTariffOptions({ userId: 'v1', roles: ['Vendedor'] })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.priceList.findMany).not.toHaveBeenCalled();
    });
  });
});
