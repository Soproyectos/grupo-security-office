/**
 * Server-side permissions of the personal dashboard endpoints:
 *  - GET /dashboard/sales-goal  -> targets:read
 *  - GET /dashboard/me          -> any commercial action; `commercial` needs quotes:read
 * Grants are evaluated with the real strict model (no DB, all fictitious data).
 */
import { ForbiddenException } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService, DASHBOARD_ERRORS } from './dashboard.service';
import { AclService } from '../../common/acl/acl.service';
import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const COMPRAS = { userId: 'compras-1', roles: ['Operador'] };
const SUPER = { userId: 'admin-1', roles: ['Super Admin'] };

const grant = (actionId: string, scope = 'own') => ({ sourceId: `s-${actionId}`, actionId, scope });

describe('Dashboard personal endpoints - permissions', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let acl: AclService;
  let hierarchy: { getSubordinateIds: jest.Mock; assertCanViewUser: jest.Mock };
  let grants: { grantsForUser: jest.Mock };
  let service: DashboardService;
  let controller: DashboardController;

  const asUser = (ctx: { userId: string; roles: string[] }) => ({ sub: ctx.userId, roles: ctx.roles });

  beforeEach(() => {
    prisma = createPrismaMock();
    acl = new AclService(prisma as any);
    hierarchy = {
      getSubordinateIds: jest.fn().mockResolvedValue([]),
      assertCanViewUser: jest.fn().mockResolvedValue(undefined),
    };
    grants = { grantsForUser: jest.fn().mockResolvedValue([]) };
    service = new DashboardService(prisma as any, acl, hierarchy as any, grants as any);
    controller = new DashboardController(service, {} as any, {} as any);

    jest.spyOn(acl, 'getAllowedListaIds').mockResolvedValue(['lista-1']);
    prisma.lista.count.mockResolvedValue(1);
    prisma.lista.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);
    prisma.product.groupBy.mockResolvedValue([]);
    prisma.assignment.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(2);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.salesTarget.findUnique.mockResolvedValue(null);
    prisma.salesOrder.findMany.mockResolvedValue([]);
    prisma.quote.findMany.mockResolvedValue([]);
    prisma.customer.groupBy.mockResolvedValue([]);
    prisma.quote.groupBy.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.salesTarget.findMany.mockResolvedValue([]);
  });

  async function forbidden(promise: Promise<unknown>) {
    const err = await promise.then(() => null, (e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    return (err as ForbiddenException).getResponse() as { code: string; message: string };
  }

  describe('Compras-like user (only products:read)', () => {
    beforeEach(() => grants.grantsForUser.mockResolvedValue([grant('products:read', 'global')]));

    it('gets 403 with stable code on sales-goal and reads no commercial data', async () => {
      const body = await forbidden(controller.getPersonalSalesGoal(asUser(COMPRAS)));
      expect(body.code).toBe(DASHBOARD_ERRORS.salesGoalForbidden);
      expect(body.message).toBe('No tienes permiso para ver la meta de ventas.');
      expect(prisma.salesTarget.findUnique).not.toHaveBeenCalled();
      expect(prisma.salesOrder.findMany).not.toHaveBeenCalled();
    });

    it('gets 403 with stable code on me and reads nothing', async () => {
      const body = await forbidden(controller.getMyWorkspace(asUser(COMPRAS)));
      expect(body.code).toBe(DASHBOARD_ERRORS.workspaceForbidden);
      expect(body.message).toBe('No tienes permiso para ver tu resumen comercial.');
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
      expect(prisma.quote.groupBy).not.toHaveBeenCalled();
    });
  });

  it('user without any grant gets 403 on both (no role fallback)', async () => {
    await forbidden(controller.getPersonalSalesGoal(asUser(COMPRAS)));
    await forbidden(controller.getMyWorkspace(asUser(COMPRAS)));
  });

  describe('user with only quotes:read', () => {
    beforeEach(() => grants.grantsForUser.mockResolvedValue([grant('quotes:read')]));

    it('gets me with commercial but sales-goal is 403', async () => {
      const res = await controller.getMyWorkspace(asUser(COMPRAS));
      expect(res.commercial).toBeDefined();
      expect(res.kpis.recentActivity).toBe(2);
      await forbidden(controller.getPersonalSalesGoal(asUser(COMPRAS)));
    });
  });

  describe('user with only targets:read', () => {
    beforeEach(() => grants.grantsForUser.mockResolvedValue([grant('targets:read')]));

    it('gets the goal and me WITHOUT commercial (key omitted)', async () => {
      const goal = await controller.getPersonalSalesGoal(asUser(COMPRAS));
      expect(goal.period).toMatch(/^\d{4}-\d{2}$/);
      const res = await controller.getMyWorkspace(asUser(COMPRAS));
      expect(res).not.toHaveProperty('commercial');
      expect(res.kpis).toBeDefined();
      expect(res.recentActivity).toEqual([]);
      expect(prisma.quote.groupBy).not.toHaveBeenCalled();
      expect(prisma.customer.groupBy).not.toHaveBeenCalled();
    });
  });

  it.each([
    'customers:read',
    'teamInsights:read',
    'commercialPromotions:read',
  ])('%s alone is enough for me (without commercial) but not for sales-goal', async (actionId) => {
    grants.grantsForUser.mockResolvedValue([grant(actionId, actionId === 'teamInsights:read' ? 'team' : 'own')]);
    const res = await controller.getMyWorkspace(asUser(COMPRAS));
    expect(res).not.toHaveProperty('commercial');
    await forbidden(controller.getPersonalSalesGoal(asUser(COMPRAS)));
  });

  it('commercialPromotions:create needs its dependency commercialPromotions:read (strict model)', async () => {
    grants.grantsForUser.mockResolvedValue([grant('commercialPromotions:create'), grant('commercialPromotions:read')]);
    const res = await controller.getMyWorkspace(asUser(COMPRAS));
    expect(res).not.toHaveProperty('commercial');
  });

  it('Super Admin passes both without grants', async () => {
    const goal = await controller.getPersonalSalesGoal(asUser(SUPER));
    expect(goal.invoiced.amount).toBe('0.00');
    const res = await controller.getMyWorkspace(asUser(SUPER));
    expect(res.scope).toBe('ASSIGNED'); // lista ACL mocked as restricted; shape only
    expect(res.commercial).toBeDefined();
  });

  describe('team block is unchanged', () => {
    it('quotes:read without teamInsights:read: team omitted, no team queries', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['sub-1']);
      grants.grantsForUser.mockResolvedValue([grant('quotes:read')]);
      const res = await controller.getMyWorkspace(asUser(COMPRAS));
      expect(res.team).toBeUndefined();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('quotes:read + teamInsights:read: team delivered', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['sub-1']);
      grants.grantsForUser.mockResolvedValue([grant('quotes:read'), grant('teamInsights:read', 'team')]);
      prisma.user.findMany.mockResolvedValue([{ id: 'sub-1', name: 'Persona Uno' }]);
      const res = await controller.getMyWorkspace(asUser(COMPRAS));
      expect(res.team?.members.map((m) => m.userId)).toEqual(['sub-1']);
      expect(res.commercial).toBeDefined();
    });
  });
});
