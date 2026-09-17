import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SalesTargetsService } from './sales-targets.service';
import { createPrismaMock } from '../../../__test__/mocks/prisma.mock';

describe('SalesTargetsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let acl: { isListasAdmin: jest.Mock };
  let hierarchy: {
    getSubordinateIds: jest.Mock;
    assertCanViewUser: jest.Mock;
  };
  let service: SalesTargetsService;

  const adminCtx = { userId: 'admin-1', roles: ['Super Admin'] };
  const supervisorCtx = { userId: 'sup-1', roles: ['Supervisor'] };
  const operadorCtx = { userId: 'op-1', roles: ['Operador'] };

  beforeEach(() => {
    prisma = createPrismaMock();
    acl = { isListasAdmin: jest.fn().mockReturnValue(false) };
    hierarchy = {
      getSubordinateIds: jest.fn().mockResolvedValue(['op-1', 'sub-1']),
      assertCanViewUser: jest.fn().mockResolvedValue(undefined),
    };
    service = new SalesTargetsService(prisma as any, acl as any, hierarchy as any);
  });

  describe('findAll', () => {
    it('sin userId, un no-admin solo recibe las metas propias', async () => {
      prisma.salesTarget.findMany.mockResolvedValue([]);

      await service.findAll({}, operadorCtx);

      expect(prisma.salesTarget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'op-1' } }),
      );
      expect(hierarchy.assertCanViewUser).not.toHaveBeenCalled();
    });

    it('para las metas de OTRO usuario un no-admin pasa por assertCanViewUser (ancestro)', async () => {
      prisma.salesTarget.findMany.mockResolvedValue([]);

      await service.findAll({ userId: 'op-1' }, supervisorCtx);

      expect(hierarchy.assertCanViewUser).toHaveBeenCalledWith(
        supervisorCtx,
        'op-1',
      );
    });

    it('admin (Super Admin) sin userId ve todas las metas (sin filtro por usuario)', async () => {
      acl.isListasAdmin.mockReturnValue(true);
      prisma.salesTarget.findMany.mockResolvedValue([]);

      await service.findAll({}, adminCtx);

      expect(prisma.salesTarget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(hierarchy.assertCanViewUser).not.toHaveBeenCalled();
    });

    it('filtra por rango de periodos from/to (YYYY-MM, ambos inclusivos)', async () => {
      prisma.salesTarget.findMany.mockResolvedValue([]);

      await service.findAll({ from: '2026-01', to: '2026-06' }, operadorCtx);

      expect(prisma.salesTarget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            period: {
              gte: new Date(Date.UTC(2026, 0, 1)),
              lte: new Date(Date.UTC(2026, 5, 1)),
            },
          }),
        }),
      );
    });
  });

  describe('upsert', () => {
    const dto = {
      userId: 'op-1',
      period: '2026-09',
      amount: '150000000',
      currency: 'cop',
      notes: 'Meta Q3',
    };

    it('persiste con upsert por (userId, period) y period como dia 1 del mes', async () => {
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await service.upsert({ ...dto }, supervisorCtx);

      const expectedPeriod = new Date(Date.UTC(2026, 8, 1));
      expect(prisma.salesTarget.upsert).toHaveBeenCalledWith({
        where: { userId_period: { userId: 'op-1', period: expectedPeriod } },
        create: expect.objectContaining({
          userId: 'op-1',
          period: expectedPeriod,
          amount: 150000000,
          currency: 'COP',
          notes: 'Meta Q3',
          setById: 'sup-1',
        }),
        update: expect.objectContaining({
          amount: 150000000,
          currency: 'COP',
          setById: 'sup-1',
        }),
      });
    });

    it('un ancestro jerarquico (subordinado en getSubordinateIds) puede fijar la meta', async () => {
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await expect(
        service.upsert({ ...dto, userId: 'sub-1' }, supervisorCtx),
      ).resolves.toEqual({ id: 'st-1' });
      expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('sup-1');
    });

    it('un NO-ancestro recibe ForbiddenException y no persiste', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['otro-usuario']);

      await expect(service.upsert({ ...dto }, supervisorCtx)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.salesTarget.upsert).not.toHaveBeenCalled();
    });

    it('un usuario NO puede fijar su propia meta si no es admin', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue([]);

      await expect(
        service.upsert({ ...dto, userId: 'op-1' }, operadorCtx),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.salesTarget.upsert).not.toHaveBeenCalled();
    });

    it('Admin Comercial puede fijar la meta de cualquier usuario sin consultar jerarquia', async () => {
      acl.isListasAdmin.mockReturnValue(true);
      prisma.salesTarget.upsert.mockResolvedValue({ id: 'st-1' });

      await service.upsert({ ...dto }, adminCtx);

      expect(hierarchy.getSubordinateIds).not.toHaveBeenCalled();
      expect(prisma.salesTarget.upsert).toHaveBeenCalled();
    });

    it('rechaza amount negativo o no numerico con BadRequestException', async () => {
      await expect(
        service.upsert({ ...dto, amount: '-5' }, supervisorCtx),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.upsert({ ...dto, amount: 'abc' }, supervisorCtx),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.salesTarget.upsert).not.toHaveBeenCalled();
    });
  });
});
