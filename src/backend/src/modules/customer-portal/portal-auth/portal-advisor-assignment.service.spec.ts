import { PortalAdvisorAssignmentService } from './portal-advisor-assignment.service';

const prisma: any = { user: { findMany: jest.fn() }, portalAccount: { findUnique: jest.fn(), updateMany: jest.fn() } };
const grantsService: any = { grantsForUser: jest.fn() };
const notifications: any = { create: jest.fn() };

const MANAGE = [{ sourceId: 's', actionId: 'portalAccounts:read', scope: 'own' }, { sourceId: 's', actionId: 'portalAccounts:manage', scope: 'own' }];
const staff = (id: string, role = 'Vendedor') => ({ id, roles: [{ role: { name: role } }] });

describe('PortalAdvisorAssignmentService', () => {
  let service: PortalAdvisorAssignmentService;
  beforeEach(() => {
    jest.resetAllMocks();
    notifications.create.mockResolvedValue({});
    service = new PortalAdvisorAssignmentService(prisma, grantsService, notifications);
  });
  afterEach(() => jest.restoreAllMocks());

  const account = (over: any = {}) => ({ id: 'a1', city: '05001', advisorId: null, contactName: 'Ana', companyName: 'Acme', ...over });

  it('asks only for active staff whose ACTIVE zone covers the city', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await service.candidatesForCity('05001');
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isActive: true, zone: { isActive: true, cities: { some: { cityCode: '05001' } } } },
    }));
  });

  it('match: assigns one of the eligible advisors and notifies them', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue(account());
    prisma.user.findMany.mockResolvedValue([staff('adv-1'), staff('adv-2')]);
    grantsService.grantsForUser.mockResolvedValue(MANAGE);
    prisma.portalAccount.updateMany.mockResolvedValue({ count: 1 });
    jest.spyOn(Math, 'random').mockReturnValue(0.99); // picks the last candidate
    expect(await service.assignForAccount('a1')).toBe('adv-2');
    expect(prisma.portalAccount.updateMany).toHaveBeenCalledWith({ where: { id: 'a1', advisorId: null }, data: { advisorId: 'adv-2' } });
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'adv-2', type: 'LEAD_ASSIGNED', data: { portalAccountId: 'a1', city: '05001' },
    }));
    expect(notifications.create.mock.calls[0][0].message).toContain('Medellín');
  });

  it('draws uniformly among the eligible ones (first and last both possible)', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue(account());
    prisma.user.findMany.mockResolvedValue([staff('adv-1'), staff('adv-2'), staff('adv-3')]);
    grantsService.grantsForUser.mockResolvedValue(MANAGE);
    prisma.portalAccount.updateMany.mockResolvedValue({ count: 1 });
    const random = jest.spyOn(Math, 'random');
    random.mockReturnValue(0);
    expect(await service.assignForAccount('a1')).toBe('adv-1');
    random.mockReturnValue(0.4);
    expect(await service.assignForAccount('a1')).toBe('adv-2');
  });

  it('skips staff in the zone who cannot manage portal accounts', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue(account());
    prisma.user.findMany.mockResolvedValue([staff('no-grant'), staff('read-only'), staff('adv-1')]);
    grantsService.grantsForUser.mockImplementation(async (id: string) => {
      if (id === 'read-only') return [MANAGE[0]];
      if (id === 'adv-1') return MANAGE;
      return [];
    });
    prisma.portalAccount.updateMany.mockResolvedValue({ count: 1 });
    expect(await service.candidatesForCity('05001')).toEqual(['adv-1']);
  });

  it('a Super Admin with the zone is eligible without grants', async () => {
    prisma.user.findMany.mockResolvedValue([staff('root', 'Super Admin')]);
    expect(await service.candidatesForCity('05001')).toEqual(['root']);
    expect(grantsService.grantsForUser).not.toHaveBeenCalled();
  });

  it('no match: leaves the account unassigned (supervisors queue) and notifies nobody', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue(account());
    prisma.user.findMany.mockResolvedValue([]);
    expect(await service.assignForAccount('a1')).toBeNull();
    expect(prisma.portalAccount.updateMany).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('inactive zone or inactive user never reaches the candidates (filtered by the query), so nobody is assigned', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue(account());
    prisma.user.findMany.mockResolvedValue([]); // the where clause excludes inactive zones/users
    expect(await service.assignForAccount('a1')).toBeNull();
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ isActive: true, zone: { isActive: true } });
  });

  it('does nothing without a city or when the account already has an advisor', async () => {
    prisma.portalAccount.findUnique.mockResolvedValueOnce(account({ city: null }));
    expect(await service.assignForAccount('a1')).toBeNull();
    prisma.portalAccount.findUnique.mockResolvedValueOnce(account({ advisorId: 'adv-9' }));
    expect(await service.assignForAccount('a1')).toBeNull();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('a concurrent assignment wins: no notification when the guarded write changed nothing', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue(account());
    prisma.user.findMany.mockResolvedValue([staff('adv-1')]);
    grantsService.grantsForUser.mockResolvedValue(MANAGE);
    prisma.portalAccount.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.assignForAccount('a1')).toBeNull();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('never throws to the registration flow', async () => {
    prisma.portalAccount.findUnique.mockRejectedValue(new Error('db down'));
    await expect(service.assignForAccount('a1')).resolves.toBeNull();
  });

  it('canManage: needs portalAccounts:manage (any scope); Super Admin always', async () => {
    grantsService.grantsForUser.mockResolvedValueOnce(MANAGE);
    expect(await service.canManage('adv-1', false)).toBe(true);
    grantsService.grantsForUser.mockResolvedValueOnce([MANAGE[0]]);
    expect(await service.canManage('read-only', false)).toBe(false);
    grantsService.grantsForUser.mockResolvedValueOnce([]);
    expect(await service.canManage('nobody', false)).toBe(false);
    expect(await service.canManage('root', true)).toBe(true);
  });
});
