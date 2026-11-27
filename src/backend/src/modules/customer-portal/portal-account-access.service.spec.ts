import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PortalAccountAccessService, type PortalAdminContext } from './portal-account-access.service';

const prisma: any = { portalAccount: { findUnique: jest.fn() } };
const grantsService: any = { grantsForUser: jest.fn() };
const hierarchy: any = { getSubordinateIds: jest.fn() };

const grant = (actionId: string, scope: string) => ({ sourceId: 's1', actionId, scope });
const VENDEDOR_GRANTS = [grant('portalAccounts:read', 'own'), grant('portalAccounts:manage', 'own')];
const SUPERVISOR_GRANTS = [
  grant('portalAccounts:read', 'team'), grant('portalAccounts:manage', 'team'), grant('portalAccounts:assign', 'team'),
];
const SUPER: PortalAdminContext = { userId: 'root', roles: ['Super Admin'] };
const VENDEDOR: PortalAdminContext = { userId: 'v1', roles: ['Vendedor'] };
const SUPERVISOR: PortalAdminContext = { userId: 'sup', roles: ['Supervisor'] };

const account = (over: any = {}) => ({ id: 'a1', state: 'ACTIVE', advisorId: null, customerId: null, customer: null, ...over });

describe('PortalAccountAccessService', () => {
  let access: PortalAccountAccessService;
  beforeEach(() => {
    jest.resetAllMocks();
    hierarchy.getSubordinateIds.mockResolvedValue(['v1', 'v2']);
    access = new PortalAccountAccessService(prisma, grantsService, hierarchy);
  });
  const as = (grants: any[]) => grantsService.grantsForUser.mockResolvedValue(grants);

  describe('scope of the action', () => {
    it('Super Admin is global without reading grants', async () => {
      expect(await access.scopeOf('portalAccounts:manage', SUPER)).toBe('global');
      expect(grantsService.grantsForUser).not.toHaveBeenCalled();
    });
    it('no grants means no scope and a Spanish 403 when required', async () => {
      as([]);
      expect(await access.scopeOf('portalAccounts:read', VENDEDOR)).toBeNull();
      await expect(access.requireScope('portalAccounts:read', VENDEDOR)).rejects.toThrow(ForbiddenException);
    });
    it('manage without read is denied (dependency)', async () => {
      as([grant('portalAccounts:manage', 'own')]);
      expect(await access.scopeOf('portalAccounts:manage', VENDEDOR)).toBeNull();
    });
    it('assign admits own, team and global scope', async () => {
      as([grant('portalAccounts:read', 'own'), grant('portalAccounts:assign', 'own')]);
      expect(await access.scopeOf('portalAccounts:assign', VENDEDOR)).toBe('own');
      as([grant('portalAccounts:read', 'team'), grant('portalAccounts:assign', 'team')]);
      expect(await access.scopeOf('portalAccounts:assign', SUPERVISOR)).toBe('team');
    });
    it('assign with own scope does not work the supervisor queue and reaches only its own accounts', async () => {
      as([grant('portalAccounts:read', 'own'), grant('portalAccounts:assign', 'own')]);
      expect(await access.readWhere(VENDEDOR)).toEqual({ OR: [{ advisorId: { in: ['v1'] } }, { customer: { ownerId: { in: ['v1'] } } }] });
      expect(await access.canReach('portalAccounts:assign', VENDEDOR, account({ advisorId: 'v1' }))).toBe(true);
      expect(await access.canReach('portalAccounts:assign', VENDEDOR, account({ advisorId: 'v2' }))).toBe(false);
      expect(await access.canReach('portalAccounts:assign', VENDEDOR, account({ state: 'PENDING', advisorId: null }))).toBe(false);
    });
    it('a wider assign than read cannot be used: the dependency is evaluated per account', async () => {
      as([grant('portalAccounts:read', 'own'), grant('portalAccounts:assign', 'global')]);
      expect(await access.canReach('portalAccounts:assign', VENDEDOR, account({ advisorId: 'v1' }))).toBe(true);
      expect(await access.readWhere(VENDEDOR)).toEqual({ OR: expect.any(Array) });
    });
  });

  describe('readWhere: own / team / global', () => {
    it('global: no filter', async () => {
      as([grant('portalAccounts:read', 'global')]);
      expect(await access.readWhere(VENDEDOR)).toEqual({});
      expect(await access.readWhere(SUPER)).toEqual({});
    });
    it('own: advisor is me or the linked customer is mine; never the queue', async () => {
      as(VENDEDOR_GRANTS);
      expect(await access.readWhere(VENDEDOR)).toEqual({ OR: [{ advisorId: { in: ['v1'] } }, { customer: { ownerId: { in: ['v1'] } } }] });
      expect(hierarchy.getSubordinateIds).not.toHaveBeenCalled();
    });
    it('team: me and my subordinates, plus the unassigned PENDING queue for assign holders', async () => {
      as(SUPERVISOR_GRANTS);
      expect(await access.readWhere(SUPERVISOR)).toEqual({
        OR: [
          { advisorId: { in: ['sup', 'v1', 'v2'] } },
          { customer: { ownerId: { in: ['sup', 'v1', 'v2'] } } },
          { state: 'PENDING', advisorId: null },
        ],
      });
    });
    it('team read without assign does not see the queue', async () => {
      as([grant('portalAccounts:read', 'team')]);
      const where: any = await access.readWhere(SUPERVISOR);
      expect(where.OR).toHaveLength(2);
    });
    it('without portalAccounts:read it is a 403', async () => {
      as([grant('quotes:read', 'own')]);
      await expect(access.readWhere(VENDEDOR)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('canReach for one account', () => {
    it('own: reaches accounts where I am the advisor or the owner of the linked customer', async () => {
      as(VENDEDOR_GRANTS);
      expect(await access.canReach('portalAccounts:manage', VENDEDOR, account({ advisorId: 'v1' }))).toBe(true);
      expect(await access.canReach('portalAccounts:manage', VENDEDOR, account({ advisorId: 'other', customerId: 'c', customer: { ownerId: 'v1' } }))).toBe(true);
      expect(await access.canReach('portalAccounts:manage', VENDEDOR, account({ advisorId: 'other', customerId: 'c', customer: { ownerId: 'other' } }))).toBe(false);
    });
    it('own cannot reach a colleague even from my team, nor the queue', async () => {
      as(VENDEDOR_GRANTS);
      expect(await access.canReach('portalAccounts:read', VENDEDOR, account({ advisorId: 'v2' }))).toBe(false);
      expect(await access.canReach('portalAccounts:read', VENDEDOR, account({ state: 'PENDING' }))).toBe(false);
    });
    it('team reaches subordinates and the unassigned PENDING queue, not accounts of outsiders', async () => {
      as(SUPERVISOR_GRANTS);
      expect(await access.canReach('portalAccounts:manage', SUPERVISOR, account({ advisorId: 'v2' }))).toBe(true);
      expect(await access.canReach('portalAccounts:manage', SUPERVISOR, account({ advisorId: 'outsider' }))).toBe(false);
      expect(await access.canReach('portalAccounts:manage', SUPERVISOR, account({ state: 'PENDING' }))).toBe(true);
      // The queue is PENDING without advisor, whether or not a customer is already linked.
      expect(await access.canReach('portalAccounts:manage', SUPERVISOR, account({ state: 'PENDING', customerId: 'c', customer: { ownerId: null } }))).toBe(true);
      // An ACTIVE unassigned account is not queue either.
      expect(await access.canReach('portalAccounts:manage', SUPERVISOR, account({ state: 'ACTIVE' }))).toBe(false);
    });
    it('global reaches everything; Super Admin too', async () => {
      as([grant('portalAccounts:read', 'global'), grant('portalAccounts:manage', 'global')]);
      expect(await access.canReach('portalAccounts:manage', VENDEDOR, account({ advisorId: 'zzz' }))).toBe(true);
      expect(await access.canReach('portalAccounts:manage', SUPER, account({ advisorId: 'zzz' }))).toBe(true);
    });
    it('an action the person does not hold is never reachable', async () => {
      as(VENDEDOR_GRANTS);
      expect(await access.canReach('portalAccounts:assign', VENDEDOR, account({ advisorId: 'v1' }))).toBe(false);
    });
  });

  describe('assertAccount', () => {
    it('404 when the account does not exist', async () => {
      as(VENDEDOR_GRANTS);
      prisma.portalAccount.findUnique.mockResolvedValue(null);
      await expect(access.assertAccount('portalAccounts:manage', VENDEDOR, 'x')).rejects.toThrow(NotFoundException);
    });
    it('403 with a simple message when the account is out of scope', async () => {
      as(VENDEDOR_GRANTS);
      prisma.portalAccount.findUnique.mockResolvedValue(account({ advisorId: 'other' }));
      await expect(access.assertAccount('portalAccounts:manage', VENDEDOR, 'a1')).rejects.toThrow('Esta cuenta no está en tu alcance');
    });
    it('returns the account when it is in scope', async () => {
      as(VENDEDOR_GRANTS);
      prisma.portalAccount.findUnique.mockResolvedValue(account({ advisorId: 'v1' }));
      await expect(access.assertAccount('portalAccounts:manage', VENDEDOR, 'a1')).resolves.toMatchObject({ id: 'a1' });
    });
  });

  describe('ownerInScope and assertCustomerLinkable', () => {
    const CUSTOMERS_READ_OWN = [grant('customers:read', 'own')];
    it('ownerInScope: own = me, team = my team, global = any, nothing for an unowned customer below global', async () => {
      as(VENDEDOR_GRANTS);
      expect(await access.ownerInScope('portalAccounts:manage', VENDEDOR, 'v1')).toBe(true);
      expect(await access.ownerInScope('portalAccounts:manage', VENDEDOR, 'v2')).toBe(false);
      expect(await access.ownerInScope('portalAccounts:manage', VENDEDOR, null)).toBe(false);
      as(SUPERVISOR_GRANTS);
      expect(await access.ownerInScope('portalAccounts:manage', SUPERVISOR, 'v2')).toBe(true);
      expect(await access.ownerInScope('portalAccounts:manage', SUPERVISOR, 'outsider')).toBe(false);
      as([grant('portalAccounts:read', 'global'), grant('portalAccounts:manage', 'global')]);
      expect(await access.ownerInScope('portalAccounts:manage', VENDEDOR, null)).toBe(true);
    });
    it('own customers:read: only my own customers can be linked', async () => {
      as([...VENDEDOR_GRANTS, ...CUSTOMERS_READ_OWN]);
      await expect(access.assertCustomerLinkable(VENDEDOR, { ownerId: 'v1' })).resolves.toBeUndefined();
      await expect(access.assertCustomerLinkable(VENDEDOR, { ownerId: 'v2' })).rejects.toThrow('Este cliente no está en tu alcance');
    });
    it('team customers:read: my team customers; outsiders are refused', async () => {
      as([...SUPERVISOR_GRANTS, grant('customers:read', 'team')]);
      await expect(access.assertCustomerLinkable(SUPERVISOR, { ownerId: 'v2' })).resolves.toBeUndefined();
      await expect(access.assertCustomerLinkable(SUPERVISOR, { ownerId: 'outsider' })).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('without customers:read nobody links an owned customer', async () => {
      as(VENDEDOR_GRANTS);
      await expect(access.assertCustomerLinkable(VENDEDOR, { ownerId: 'v1' })).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('an unowned customer: own-scope advisors are told to ask their supervisor', async () => {
      as([...VENDEDOR_GRANTS, ...CUSTOMERS_READ_OWN]);
      await expect(access.assertCustomerLinkable(VENDEDOR, { ownerId: null })).rejects.toThrow('Este cliente no tiene asesor; pide a tu supervisor que lo asigne');
    });
    it('an unowned customer: assign team/global or customers:read global may link it', async () => {
      as(SUPERVISOR_GRANTS);
      await expect(access.assertCustomerLinkable(SUPERVISOR, { ownerId: null })).resolves.toBeUndefined();
      as([...VENDEDOR_GRANTS, grant('customers:read', 'global')]);
      await expect(access.assertCustomerLinkable(VENDEDOR, { ownerId: null })).resolves.toBeUndefined();
    });
    it('Super Admin bypasses', async () => {
      await expect(access.assertCustomerLinkable(SUPER, { ownerId: 'anyone' })).resolves.toBeUndefined();
      await expect(access.assertCustomerLinkable(SUPER, { ownerId: null })).resolves.toBeUndefined();
    });
  });
});
