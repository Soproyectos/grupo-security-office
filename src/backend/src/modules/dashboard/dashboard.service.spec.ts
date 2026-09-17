import { DashboardService } from './dashboard.service';
import { AclService } from '../../common/acl/acl.service';
import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const ADMIN = { userId: 'admin-1', roles: ['Super Admin'] };
const COMERCIAL = { userId: 'user-1', roles: ['Operador'] };

describe('DashboardService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let acl: AclService;
  let hierarchy: {
    getSubordinateIds: jest.Mock;
    assertCanViewUser: jest.Mock;
  };
  let service: DashboardService;

  const listaRow = {
    id: 'lista-1',
    code: 'L-001',
    name: 'Hikvision',
    currency: 'COP',
    responsibleId: 'user-1',
    updatedAt: new Date('2026-09-10T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    acl = new AclService(prisma as any);
    hierarchy = {
      getSubordinateIds: jest.fn().mockResolvedValue([]),
      assertCanViewUser: jest.fn().mockResolvedValue(undefined),
    };
    service = new DashboardService(prisma as any, acl, hierarchy as any);

    prisma.lista.count.mockResolvedValue(1);
    prisma.lista.findMany.mockResolvedValue([listaRow]);
    prisma.product.count.mockResolvedValue(0);
    prisma.product.groupBy.mockResolvedValue([
      { listaId: 'lista-1', _count: { _all: 7 } },
    ]);
    prisma.auditLog.count.mockResolvedValue(3);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.assignment.findMany.mockResolvedValue([]);
    // Bloque comercial (issue #26): valores vacios por defecto.
    prisma.salesTarget.findUnique.mockResolvedValue(null);
    prisma.salesOrder.findMany.mockResolvedValue([]);
    prisma.quote.findMany.mockResolvedValue([]);
    prisma.customer.groupBy.mockResolvedValue([]);
    prisma.quote.groupBy.mockResolvedValue([]);
    // Bloque team (issue #27): valores vacios por defecto.
    prisma.user.findMany.mockResolvedValue([]);
    prisma.salesTarget.findMany.mockResolvedValue([]);
  });

  const assignedScope = () => {
    jest.spyOn(acl, 'getAllowedListaIds').mockResolvedValue(['lista-1']);
  };

  describe('getMyWorkspace', () => {
    it('scope GLOBAL para admin de Listas y sin filtro por id', async () => {
      const res = await service.getMyWorkspace(ADMIN);

      expect(res.scope).toBe('GLOBAL');
      const where = prisma.lista.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ isActive: true, archivedAt: null });
      expect(where.id).toBeUndefined();
    });

    it('admin de Listas obtiene nivel manage_access sin consultar assignments', async () => {
      const res = await service.getMyWorkspace(ADMIN);

      expect(res.listas[0].level).toBe('manage_access');
      expect(prisma.assignment.findMany).not.toHaveBeenCalled();
    });

    it('scope ASSIGNED restringe las Listas a las asignadas', async () => {
      jest.spyOn(acl, 'getAllowedListaIds').mockResolvedValue(['lista-1']);

      const res = await service.getMyWorkspace(COMERCIAL);

      expect(res.scope).toBe('ASSIGNED');
      expect(prisma.lista.findMany.mock.calls[0][0].where).toEqual({
        isActive: true,
        archivedAt: null,
        id: { in: ['lista-1'] },
      });
    });

    it('solo cuenta Listas activas y no archivadas', async () => {
      jest.spyOn(acl, 'getAllowedListaIds').mockResolvedValue(['lista-1']);

      await service.getMyWorkspace(COMERCIAL);

      for (const call of prisma.lista.count.mock.calls) {
        expect(call[0].where).toEqual(
          expect.objectContaining({ isActive: true, archivedAt: null }),
        );
      }
      // Los productos se cuentan a traves de la relacion lista, con el mismo filtro.
      for (const call of prisma.product.count.mock.calls) {
        expect(call[0].where.lista).toEqual(
          expect.objectContaining({ isActive: true, archivedAt: null }),
        );
      }
    });

    it('usuario sin Listas asignadas obtiene un workspace vacio sin consultar productos', async () => {
      jest.spyOn(acl, 'getAllowedListaIds').mockResolvedValue([]);

      const res = await service.getMyWorkspace(COMERCIAL);

      expect(res.scope).toBe('ASSIGNED');
      expect(res.listas).toEqual([]);
      expect(res.kpis).toEqual({
        listas: 0,
        products: 0,
        pendingPublication: 0,
        // La actividad NO se anula por no tener Listas: son dimensiones distintas.
        recentActivity: 3,
      });
      expect(prisma.product.count).not.toHaveBeenCalled();
      expect(prisma.lista.findMany).not.toHaveBeenCalled();
      // La actividad del usuario sigue siendo suya, exista o no una Lista accesible.
      expect(prisma.auditLog.findMany).toHaveBeenCalled();
    });

    it('resuelve productCount por Lista desde el groupBy', async () => {
      const res = await service.getMyWorkspace(ADMIN);

      expect(res.listas[0].productCount).toBe(7);
    });

    it('productCount es 0 para una Lista sin filas en el groupBy', async () => {
      prisma.product.groupBy.mockResolvedValue([]);

      const res = await service.getMyWorkspace(ADMIN);

      expect(res.listas[0].productCount).toBe(0);
    });

    it('marca isResponsible comparando contra el usuario autenticado', async () => {
      const asOwner = await service.getMyWorkspace({
        userId: 'user-1',
        roles: ['Super Admin'],
      });
      expect(asOwner.listas[0].isResponsible).toBe(true);

      const asOther = await service.getMyWorkspace(ADMIN);
      expect(asOther.listas[0].isResponsible).toBe(false);
    });

    it('toma el mejor nivel cuando hay varios assignments sobre la misma Lista', async () => {
      jest.spyOn(acl, 'getAllowedListaIds').mockResolvedValue(['lista-1']);
      prisma.assignment.findMany.mockResolvedValue([
        { resourceId: 'lista-1', level: 'view' },
        { resourceId: 'lista-1', level: 'manage' },
        { resourceId: 'lista-1', level: 'edit_prices' },
      ]);

      const res = await service.getMyWorkspace(COMERCIAL);

      expect(res.listas[0].level).toBe('manage');
    });

    it('normaliza el alias legacy edit a edit_products', async () => {
      jest.spyOn(acl, 'getAllowedListaIds').mockResolvedValue(['lista-1']);
      prisma.assignment.findMany.mockResolvedValue([
        { resourceId: 'lista-1', level: 'edit' },
      ]);

      const res = await service.getMyWorkspace(COMERCIAL);

      expect(res.listas[0].level).toBe('edit_products');
    });

    it('un grant por rol eleva el nivel de todas las Listas accesibles', async () => {
      jest.spyOn(acl, 'getAllowedListaIds').mockResolvedValue(['lista-1']);
      prisma.assignment.findMany.mockResolvedValue([
        { resourceId: 'lista-1', level: 'view' },
        { resourceId: 'ROLE:Operador', level: 'edit_prices' },
      ]);

      const res = await service.getMyWorkspace(COMERCIAL);

      expect(res.listas[0].level).toBe('edit_prices');
    });

    it('un grant por rol no degrada un nivel directo superior', async () => {
      jest.spyOn(acl, 'getAllowedListaIds').mockResolvedValue(['lista-1']);
      prisma.assignment.findMany.mockResolvedValue([
        { resourceId: 'lista-1', level: 'manage' },
        { resourceId: 'ROLE:Operador', level: 'view' },
      ]);

      const res = await service.getMyWorkspace(COMERCIAL);

      expect(res.listas[0].level).toBe('manage');
    });

    it('limita la actividad reciente al usuario autenticado', async () => {
      jest.spyOn(acl, 'getAllowedListaIds').mockResolvedValue(['lista-1']);

      await service.getMyWorkspace(COMERCIAL);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(prisma.auditLog.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1' }),
        }),
      );
    });

    it('respeta el take recibido para el listado de Listas', async () => {
      await service.getMyWorkspace(ADMIN, { take: 3 });

      expect(prisma.lista.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 3 }),
      );
    });
  });

  describe('commercial block (issue #26)', () => {
    it('mes CON meta: calcula target, invoiced y remaining', async () => {
      assignedScope();
      prisma.salesTarget.findUnique.mockResolvedValue({
        amount: '1000000',
        currency: 'COP',
      });
      prisma.salesOrder.findMany.mockResolvedValue([
        { total: '400000', currency: 'COP' },
        { total: '100000', currency: 'COP' },
      ]);

      const res = await service.getMyWorkspace(COMERCIAL);

      expect(res.commercial).toBeDefined();
      expect(res.commercial!.target).toEqual({
        amount: '1000000',
        currency: 'COP',
      });
      expect(res.commercial!.invoiced).toEqual({
        amount: '500000.00',
        currency: 'COP',
        mixedCurrency: false,
      });
      expect(res.commercial!.remaining).toEqual({
        amount: '500000.00',
        currency: 'COP',
      });
    });

    it('mes SIN meta: target null y remaining null, invoiced igualmente calculado', async () => {
      assignedScope();
      prisma.salesOrder.findMany.mockResolvedValue([
        { total: '250000', currency: 'COP' },
      ]);

      const res = await service.getMyWorkspace(COMERCIAL);

      expect(res.commercial).toBeDefined();
      expect(res.commercial!.target).toBeNull();
      expect(res.commercial!.remaining).toBeNull();
      expect(res.commercial!.invoiced.amount).toBe('250000.00');
    });

    it('pedidos en monedas distintas marcan mixedCurrency y no se suman', async () => {
      assignedScope();
      prisma.salesTarget.findUnique.mockResolvedValue({
        amount: '1000000',
        currency: 'COP',
      });
      prisma.salesOrder.findMany.mockResolvedValue([
        { total: '400000', currency: 'COP' },
        { total: '700', currency: 'USD' },
      ]);

      const res = await service.getMyWorkspace(COMERCIAL);

      expect(res.commercial!.invoiced).toEqual({
        amount: '400000.00',
        currency: 'COP',
        mixedCurrency: true,
      });
      // remaining sigue calculado solo sobre montos en la moneda de la meta.
      expect(res.commercial!.remaining!.amount).toBe('600000.00');
    });

    it('admin GLOBAL (Super Admin/Admin Comercial) NO recibe el bloque comercial', async () => {
      const res = await service.getMyWorkspace(ADMIN);

      expect(res.scope).toBe('GLOBAL');
      expect(res.commercial).toBeUndefined();
      expect(prisma.salesTarget.findUnique).not.toHaveBeenCalled();
      expect(prisma.salesOrder.findMany).not.toHaveBeenCalled();
    });
  });

  describe('team block (issue #27)', () => {
    const SUPERVISOR = { userId: 'sup-1', roles: ['Supervisor'] };

    const withTwoSubordinates = () => {
      assignedScope();
      hierarchy.getSubordinateIds.mockResolvedValue(['com-1', 'com-2']);
      prisma.user.findMany.mockResolvedValue([
        { id: 'com-1', name: 'Ana Comercial' },
        { id: 'com-2', name: 'Beto Comercial' },
      ]);
    };

    it('usuario SIN subordinados no recibe bloque team ni consulta datos de equipo', async () => {
      assignedScope();
      hierarchy.getSubordinateIds.mockResolvedValue([]);

      const res = await service.getMyWorkspace(SUPERVISOR);

      expect(res.team).toBeUndefined();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.salesTarget.findMany).not.toHaveBeenCalled();
    });

    it('agrega metas y facturado por miembro con las mismas formulas del commercial', async () => {
      withTwoSubordinates();
      prisma.salesTarget.findMany.mockResolvedValue([
        { userId: 'com-1', amount: '1000000', currency: 'COP' },
        { userId: 'com-2', amount: '500000', currency: 'COP' },
      ]);
      prisma.salesOrder.findMany.mockResolvedValue([
        { ownerId: 'com-1', total: '600000', currency: 'COP' },
        { ownerId: 'com-2', total: '100000', currency: 'COP' },
      ]);
      prisma.quote.findMany.mockResolvedValue([
        { ownerId: 'com-1', total: '200000', currency: 'COP' },
      ]);
      prisma.customer.groupBy.mockResolvedValue([
        { ownerId: 'com-1', status: 'LEAD', _count: { _all: 2 } },
        { ownerId: 'com-1', status: 'CLIENTE', _count: { _all: 3 } },
        { ownerId: 'com-2', status: 'CLIENTE', _count: { _all: 1 } },
      ]);
      prisma.quote.groupBy.mockResolvedValue([
        { ownerId: 'com-1', status: 'enviada', _count: { _all: 4 } },
        { ownerId: 'com-2', status: 'ganada', _count: { _all: 2 } },
      ]);

      const res = await service.getMyWorkspace(SUPERVISOR);

      expect(res.team).toBeDefined();
      const members = res.team!.members;
      expect(members).toHaveLength(2);

      const ana = members.find((m) => m.userId === 'com-1')!;
      expect(ana.name).toBe('Ana Comercial');
      expect(ana.target).toEqual({ amount: '1000000', currency: 'COP' });
      expect(ana.invoiced).toEqual({
        amount: '600000.00',
        currency: 'COP',
        mixedCurrency: false,
      });
      expect(ana.remaining).toEqual({ amount: '400000.00', currency: 'COP' });
      expect(ana.pipeline).toEqual({ amount: '200000.00', count: 1 });
      expect(ana.customers).toEqual({ total: 5, leads: 2, clientes: 3 });
      expect(ana.quotesByStatus).toEqual({ enviada: 4 });

      const beto = members.find((m) => m.userId === 'com-2')!;
      expect(beto.invoiced.amount).toBe('100000.00');
      expect(beto.customers).toEqual({ total: 1, leads: 0, clientes: 1 });
      expect(beto.quotesByStatus).toEqual({ ganada: 2 });

      expect(res.team!.totals).toEqual({
        target: { amount: '1500000.00', currency: 'COP', mixedCurrency: false },
        invoiced: {
          amount: '700000.00',
          currency: 'COP',
          mixedCurrency: false,
        },
      });
    });

    it('miembro sin meta tiene target/remaining null pero sigue en members', async () => {
      withTwoSubordinates();
      prisma.salesTarget.findMany.mockResolvedValue([
        { userId: 'com-1', amount: '1000000', currency: 'COP' },
      ]);

      const res = await service.getMyWorkspace(SUPERVISOR);

      const beto = res.team!.members.find((m) => m.userId === 'com-2')!;
      expect(beto.target).toBeNull();
      expect(beto.remaining).toBeNull();
      expect(beto.invoiced.amount).toBe('0.00');
      // Totales excluyen el miembro sin meta del sumando de target.
      expect(res.team!.totals.target).toEqual({
        amount: '1000000.00',
        currency: 'COP',
        mixedCurrency: false,
      });
    });

    it('monedas distintas entre miembros no se suman en totals y marcan mixedCurrency', async () => {
      withTwoSubordinates();
      prisma.salesTarget.findMany.mockResolvedValue([
        { userId: 'com-1', amount: '1000000', currency: 'COP' },
        { userId: 'com-2', amount: '500', currency: 'USD' },
      ]);
      prisma.salesOrder.findMany.mockResolvedValue([
        { ownerId: 'com-1', total: '600000', currency: 'COP' },
        { ownerId: 'com-2', total: '200', currency: 'USD' },
      ]);

      const res = await service.getMyWorkspace(SUPERVISOR);

      // 1 meta por moneda → empate; la primera observada (COP) gana por orden.
      // Los montos en la otra moneda NO se suman.
      expect(res.team!.totals.target).toEqual({
        amount: '1000000.00',
        currency: 'COP',
        mixedCurrency: true,
      });
      expect(res.team!.totals.invoiced).toEqual({
        amount: '600000.00',
        currency: 'COP',
        mixedCurrency: true,
      });
    });

    it('SIN N+1: numero FIJO de queries sin importar cuantos subordinados haya', async () => {
      withTwoSubordinates();
      await service.getMyWorkspace(SUPERVISOR);

      // Referencia con 2 subordinados.
      const countAt2 = {
        getSubordinateIds: hierarchy.getSubordinateIds.mock.calls.length,
        userFindMany: prisma.user.findMany.mock.calls.length,
        salesTargetFindMany: prisma.salesTarget.findMany.mock.calls.length,
        salesOrderFindMany: prisma.salesOrder.findMany.mock.calls.length,
        quoteFindMany: prisma.quote.findMany.mock.calls.length,
        customerGroupBy: prisma.customer.groupBy.mock.calls.length,
        quoteGroupBy: prisma.quote.groupBy.mock.calls.length,
      };
      // Una pasada por el comercial propio + una agregada para el equipo = 2.
      expect(countAt2).toEqual({
        getSubordinateIds: 1,
        userFindMany: 1,
        salesTargetFindMany: 1,
        salesOrderFindMany: 2,
        quoteFindMany: 2,
        customerGroupBy: 2,
        quoteGroupBy: 2,
      });

      jest.clearAllMocks();
      hierarchy.getSubordinateIds.mockResolvedValue([
        'c1',
        'c2',
        'c3',
        'c4',
        'c5',
      ]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.salesTarget.findMany.mockResolvedValue([]);
      prisma.salesOrder.findMany.mockResolvedValue([]);
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.customer.groupBy.mockResolvedValue([]);
      prisma.quote.groupBy.mockResolvedValue([]);

      await service.getMyWorkspace(SUPERVISOR);

      // Con 5 subordinados, los conteos son EXACTAMENTE los mismos.
      expect(hierarchy.getSubordinateIds.mock.calls.length).toBe(1);
      expect(prisma.user.findMany.mock.calls.length).toBe(1);
      expect(prisma.salesTarget.findMany.mock.calls.length).toBe(1);
      expect(prisma.salesOrder.findMany.mock.calls.length).toBe(2);
      expect(prisma.quote.findMany.mock.calls.length).toBe(2);
      expect(prisma.customer.groupBy.mock.calls.length).toBe(2);
      expect(prisma.quote.groupBy.mock.calls.length).toBe(2);
      // La query del equipo usa el conjunto completo, no un loop por miembro.
      expect(prisma.salesTarget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: { in: ['c1', 'c2', 'c3', 'c4', 'c5'] },
          }),
        }),
      );
    });

    it('un subordinado indirecto tambien aparece (los ids vienen resueltos por jerarquia)', async () => {
      assignedScope();
      hierarchy.getSubordinateIds.mockResolvedValue(['direct', 'indirect']);
      prisma.user.findMany.mockResolvedValue([
        { id: 'direct', name: 'Directo' },
        { id: 'indirect', name: 'Indirecto' },
      ]);

      const res = await service.getMyWorkspace(SUPERVISOR);

      expect(res.team!.members.map((m) => m.userId).sort()).toEqual([
        'direct',
        'indirect',
      ]);
      // El servicio confía en getSubordinateIds: no re-resuelve la jerarquía.
      expect(hierarchy.getSubordinateIds).toHaveBeenCalledTimes(1);
      expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('sup-1');
    });
  });

  describe('getTeamMemberCommercial (drill-down, issue #27)', () => {
    const SUPERVISOR = { userId: 'sup-1', roles: ['Supervisor'] };

    it('devuelve el bloque commercial del objetivo cuando la jerarquia lo permite', async () => {
      prisma.salesTarget.findUnique.mockResolvedValue({
        amount: '800000',
        currency: 'COP',
      });
      prisma.salesOrder.findMany.mockResolvedValue([
        { total: '300000', currency: 'COP' },
      ]);

      const res = await service.getTeamMemberCommercial(SUPERVISOR, 'com-1');

      expect(hierarchy.assertCanViewUser).toHaveBeenCalledWith(
        SUPERVISOR,
        'com-1',
      );
      expect(res.target).toEqual({ amount: '800000', currency: 'COP' });
      expect(res.invoiced.amount).toBe('300000.00');
      expect(res.remaining).toEqual({ amount: '500000.00', currency: 'COP' });
    });

    it('propaga el rechazo de assertCanViewUser sin consultar datos del objetivo', async () => {
      hierarchy.assertCanViewUser.mockRejectedValue(
        new Error('ForbiddenException'),
      );

      await expect(
        service.getTeamMemberCommercial(SUPERVISOR, 'otro-ramal'),
      ).rejects.toThrow('ForbiddenException');
      expect(prisma.salesTarget.findUnique).not.toHaveBeenCalled();
      expect(prisma.salesOrder.findMany).not.toHaveBeenCalled();
    });
  });
});
