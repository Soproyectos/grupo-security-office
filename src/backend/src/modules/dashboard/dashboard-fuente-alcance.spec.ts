/**
 * COM-05 backend — fuente visible de facturación y alcance de equipo
 * (contrato COM-05 §3-§5; ficha: acceptance 1/2/3).
 *
 * RED observado: este spec se escribe ANTES de la implementación y debe fallar
 * mientras `dashboard.service.ts` no exponga `source`/`sourceStatus` ni aplique
 * la comprobación de `teamInsights:read` sobre concesiones vigentes.
 *
 * Nota (H3): usuarios LEGADOS sin concesiones conservan el bloque de equipo por
 * la capa rol+jerarquía vigente (transición BASE-01 §8). La capa de concesiones
 * se activa cuando el usuario YA tiene grants en el sistema.
 */
import { ForbiddenException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { AclService } from '../../common/acl/acl.service';
import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const VENDEDOR = { userId: 'v-1', roles: ['Operador'] };
const SUPER = { userId: 'admin-1', roles: ['Super Admin'] };

const INVOICE_SOURCE = 'invoice-reference-manual';
const INVOICE_SOURCE_STATUS = 'erp-not-connected';

describe('COM-05 backend — fuente visible y alcance de equipo', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let acl: AclService;
  let hierarchy: {
    getSubordinateIds: jest.Mock;
    assertCanViewUser: jest.Mock;
  };
  let grants: { grantsForUser: jest.Mock };
  let service: DashboardService;

  const listaRow = {
    id: 'lista-1',
    code: 'L-001',
    name: 'Lista',
    currency: 'COP',
    responsibleId: 'v-1',
    updatedAt: new Date('2026-09-10T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    acl = new AclService(prisma as any);
    hierarchy = {
      getSubordinateIds: jest.fn().mockResolvedValue([]),
      assertCanViewUser: jest.fn().mockResolvedValue(undefined),
    };
    grants = { grantsForUser: jest.fn().mockResolvedValue([]) };
    service = new DashboardService(prisma as any, acl, hierarchy as any, grants as any);

    jest.spyOn(acl, 'getAllowedListaIds').mockResolvedValue(['lista-1']);
    prisma.assignment.findMany.mockResolvedValue([]);
    prisma.lista.count.mockResolvedValue(1);
    prisma.lista.findMany.mockResolvedValue([listaRow]);
    prisma.product.count.mockResolvedValue(0);
    prisma.product.groupBy.mockResolvedValue([
      { listaId: 'lista-1', _count: { _all: 7 } },
    ]);
    prisma.auditLog.count.mockResolvedValue(0);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.salesTarget.findUnique.mockResolvedValue(null);
    prisma.salesOrder.findMany.mockResolvedValue([]);
    prisma.quote.findMany.mockResolvedValue([]);
    prisma.customer.groupBy.mockResolvedValue([]);
    prisma.quote.groupBy.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.salesTarget.findMany.mockResolvedValue([]);
  });

  describe('A1 — ganada sin factura no sube facturación real', () => {
    it('sales-goal solo consulta pedidos con externalInvoiceNumber no nulo', async () => {
      await service.getPersonalSalesGoal(VENDEDOR);
      expect(prisma.salesOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            externalInvoiceNumber: { not: null },
          }),
        }),
      );
    });

    it('workspace: TODAS las consultas de facturación filtran factura registrada', async () => {
      await service.getMyWorkspace(VENDEDOR);
      const orderCalls = prisma.salesOrder.findMany.mock.calls.map(
        (c: any[]) => c[0]?.where,
      );
      expect(orderCalls.length).toBeGreaterThan(0);
      for (const where of orderCalls) {
        expect(where.externalInvoiceNumber).toEqual({ not: null });
      }
    });

    it('workspace: myQuotes.ganada es contador separado y NO suma al invoiced', async () => {
      prisma.quote.groupBy.mockResolvedValue([
        { status: 'ganada', _count: { _all: 3 } },
      ]);
      prisma.salesOrder.findMany.mockResolvedValue([
        { total: '100.00', currency: 'COP' },
      ]);
      const res = await service.getMyWorkspace(VENDEDOR);
      expect(res.commercial).toBeDefined();
      expect(res.commercial!.myQuotes.ganada).toBe(3);
      expect(res.commercial!.invoiced.amount).toBe('100.00');
    });
  });

  describe('A3 — sin fuente no aparece un cero que simule consulta ERP exitosa', () => {
    it('sales-goal en cero expone source y sourceStatus', async () => {
      const goal = await service.getPersonalSalesGoal(VENDEDOR);
      expect(goal.invoiced).toEqual({
        amount: '0.00',
        currency: 'COP',
        mixedCurrency: false,
        source: INVOICE_SOURCE,
        sourceStatus: INVOICE_SOURCE_STATUS,
      });
    });

    it('bloque comercial del workspace expone la fuente (también en cero)', async () => {
      const res = await service.getMyWorkspace(VENDEDOR);
      expect(res.commercial!.invoiced).toEqual(
        expect.objectContaining({
          amount: '0.00',
          source: INVOICE_SOURCE,
          sourceStatus: INVOICE_SOURCE_STATUS,
        }),
      );
    });

    it('totales del equipo exponen la fuente (cero de miembros incluido)', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['com-1']);
      prisma.user.findMany.mockResolvedValue([{ id: 'com-1', name: 'Com 1' }]);
      const res = await service.getMyWorkspace(VENDEDOR);
      expect(res.team).toBeDefined();
      expect(res.team!.totals.invoiced).toEqual(
        expect.objectContaining({
          amount: '0.00',
          source: INVOICE_SOURCE,
          sourceStatus: INVOICE_SOURCE_STATUS,
        }),
      );
    });
  });

  describe('A2 — equipo no mezcla datos ajenos (teamInsights:read por concesión)', () => {
    it('con grants SIN teamInsights:read: bloque team omitido y SIN consulta de datos de equipo', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['com-1', 'com-2']);
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's1', actionId: 'customers:read', scope: 'own' },
      ]);
      const res = await service.getMyWorkspace(VENDEDOR);
      expect(res.team).toBeUndefined();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      // el resumen propio sigue completo
      expect(res.commercial).toBeDefined();
    });

    it('con grant teamInsights:read (team): el bloque team se entrega', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['com-1']);
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's1', actionId: 'teamInsights:read', scope: 'team' },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'com-1', name: 'Com 1' }]);
      const res = await service.getMyWorkspace(VENDEDOR);
      expect(res.team).toBeDefined();
      expect(res.team!.members.map((m) => m.userId)).toEqual(['com-1']);
    });

    it('legado SIN grants: conserva el bloque por capa rol+jerarquía (transición D5)', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['com-1']);
      grants.grantsForUser.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([{ id: 'com-1', name: 'Com 1' }]);
      const res = await service.getMyWorkspace(VENDEDOR);
      expect(res.team).toBeDefined();
    });

    it('members SOLO contiene subordinateIds: un usuario ajeno jamás entra', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['com-1']);
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's1', actionId: 'teamInsights:read', scope: 'team' },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: 'com-1', name: 'Com 1' }]);
      await service.getMyWorkspace(VENDEDOR);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['com-1'] } },
        }),
      );
    });

    it('drill-down team/:userId con grants SIN teamInsights:read → 403 (no Super Admin)', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's1', actionId: 'customers:read', scope: 'own' },
      ]);
      await expect(
        service.getTeamMemberCommercial(VENDEDOR, 'com-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.salesTarget.findUnique).not.toHaveBeenCalled();
    });

    it('drill-down Super Admin: excepción explícita permite incluso sin grants de equipo', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's1', actionId: 'customers:read', scope: 'own' },
      ]);
      prisma.salesTarget.findUnique.mockResolvedValue(null);
      const block = await service.getTeamMemberCommercial(SUPER, 'com-1');
      expect(block).toBeDefined();
      expect(hierarchy.assertCanViewUser).toHaveBeenCalledWith(
        expect.anything(),
        'com-1',
      );
    });

    it('drill-down con grant teamInsights:read → devuelve el bloque del objetivo', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's1', actionId: 'teamInsights:read', scope: 'team' },
      ]);
      prisma.salesTarget.findUnique.mockResolvedValue(null);
      const block = await service.getTeamMemberCommercial(VENDEDOR, 'com-1');
      expect(block).toBeDefined();
    });
  });
});
