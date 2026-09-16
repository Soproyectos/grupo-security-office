import { DashboardService } from './dashboard.service';
import { AclService } from '../../common/acl/acl.service';
import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const ADMIN = { userId: 'admin-1', roles: ['Super Admin'] };
const COMERCIAL = { userId: 'user-1', roles: ['Operador'] };

describe('DashboardService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let acl: AclService;
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
    service = new DashboardService(prisma as any, acl);

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
});
