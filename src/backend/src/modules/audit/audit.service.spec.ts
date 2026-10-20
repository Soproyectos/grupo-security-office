import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { AuditService, COMERCIAL_ENTITIES } from './audit.service';

const mockHierarchyService = {
  getSubordinateIds: jest.fn().mockResolvedValue([]),
};

const LOG = {
  id: 'log-1',
  action: 'create',
  entity: 'LISTA',
  entityId: 'list-1',
  userId: 'user-1',
  createdAt: new Date(),
  user: { id: 'user-1', name: 'Compras', email: 'compras@gruposecurity.co' },
};

describe('AuditService — scope comercial (Admin Comercial)', () => {
  let service: AuditService;

  const SUPER = { roles: ['Super Admin'] };
  const SUPERVISOR = { roles: ['Supervisor'] };
  const COMERCIAL = { roles: ['Admin Comercial'] };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new AuditService(mockPrisma as any, mockHierarchyService as any);
    mockPrisma.auditLog.findMany.mockResolvedValue([LOG]);
    mockPrisma.auditLog.count.mockResolvedValue(1);
  });

  it('exporta las 6 entidades comerciales', () => {
    expect(COMERCIAL_ENTITIES).toEqual([
      'LISTA',
      'Product',
      'Category',
      'Brand',
      'Price',
      'Stock',
    ]);
  });

  describe('findAll', () => {
    it('Super Admin no recibe filtro comercial forzado', async () => {
      await service.findAll({ entity: 'User' }, SUPER);
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.entity).toBe('User');
    });

    it('Supervisor recibe filtro comercial (no es auditor global)', async () => {
      await service.findAll({ entity: 'Assignment' }, { roles: ['Supervisor'], userId: 'sup-id' });
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.entity).toEqual({ in: [] });
    });

    it('Admin Comercial sin entity query → entity in COMERCIAL_ENTITIES', async () => {
      await service.findAll({}, COMERCIAL);
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.entity).toEqual({
        in: [...COMERCIAL_ENTITIES],
      });
    });

    it('Admin Comercial pide entity=User (no comercial) → entity in [] (0 filas, deny)', async () => {
      await service.findAll({ entity: 'User' }, COMERCIAL);
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.entity).toEqual({ in: [] });
    });

    it('Admin Comercial pide entity comercial → filtra por esa entidad exacta', async () => {
      await service.findAll({ entity: 'Product' }, COMERCIAL);
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.entity).toBe('Product');
    });

    it('Admin Comercial sin ctx roles → scope comercial (deny global)', async () => {
      await service.findAll({}, { roles: undefined });
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.entity).toEqual({
        in: [...COMERCIAL_ENTITIES],
      });
    });

    it('Admin Comercial conserva resto de filtros (entityId/userId/action) y cuenta con el mismo where', async () => {
      await service.findAll(
        { entityId: 'x', userId: 'u1', action: 'create' },
        COMERCIAL,
      );

      const where = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
      expect(where.entityId).toBe('x');
      expect(where.userId).toBe('u1');
      expect(where.action).toBe('create');
      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith(
        expect.objectContaining({ where }),
      );
    });

    it('C8: action=CREATE (mayúsculas) se normaliza a create (minúsculas)', async () => {
      await service.findAll({ action: 'CREATE' }, SUPER);
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.action).toBe(
        'create',
      );
      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'create' }),
        }),
      );
    });

    it('C8: action mixto (UpDaTe) se normaliza a update', async () => {
      await service.findAll({ action: 'UpDaTe' }, SUPER);
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.action).toBe(
        'update',
      );
    });

    it('C8: action=IMPORT_PRODUCTS conserva su forma en mayúsculas (histórico del importador)', async () => {
      await service.findAll({ action: 'IMPORT_PRODUCTS' }, SUPER);
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.action).toBe(
        'IMPORT_PRODUCTS',
      );
    });

    it('C9: entity=Lista (Super Admin) se normaliza a LISTA', async () => {
      await service.findAll({ entity: 'Lista' }, SUPER);
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.entity).toBe(
        'LISTA',
      );
    });

    it('C9: entity=Lista (Admin Comercial) filtra por LISTA (no cae en {in: []})', async () => {
      await service.findAll({ entity: 'Lista' }, COMERCIAL);
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.entity).toBe(
        'LISTA',
      );
    });

    it('C9: entity=PriceList se normaliza a su forma canónica PriceList', async () => {
      await service.findAll({ entity: 'pricelist' }, SUPER);
      expect(mockPrisma.auditLog.findMany.mock.calls[0][0].where.entity).toBe(
        'PriceList',
      );
    });
  });

  describe('findByEntity', () => {
    it('Super Admin consulta cualquier entidad', async () => {
      const res = await service.findByEntity('User', 'u1', SUPER);
      expect(res.data).toHaveLength(1);
    });

    it('Admin Comercial consulta una entidad comercial', async () => {
      const res = await service.findByEntity('Product', 'p1', COMERCIAL);
      expect(res.data).toHaveLength(1);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entity: 'Product', entityId: 'p1' } }),
      );
    });

    it('Admin Comercial pide entidad global (User) → data vacía (no revela existencia)', async () => {
      const res = await service.findByEntity('User', 'u1', COMERCIAL);
      expect(res.data).toEqual([]);
      expect(mockPrisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it('devuelve actorName (solo el nombre) y no expone el objeto user ni su email', async () => {
      const res = await service.findByEntity('Product', 'p1', COMERCIAL);
      expect(res.data[0]).toEqual(expect.objectContaining({ actorName: 'Compras', userId: 'user-1' }));
      expect(res.data[0]).not.toHaveProperty('user');
      expect(JSON.stringify(res.data)).not.toContain('compras@gruposecurity.co');
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: { user: { select: { name: true } } } }),
      );
    });

    it('actorName es null cuando el usuario ya no existe o no hay actor', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...LOG, id: 'log-2', user: null },
        { ...LOG, id: 'log-3', userId: null, user: null },
      ]);
      const res = await service.findByEntity('Product', 'p1', COMERCIAL);
      expect(res.data.map((l) => l.actorName)).toEqual([null, null]);
      expect(res.data[0].userId).toBe('user-1');
      expect(res.data[1].userId).toBeNull();
    });

    it('C9: entity=Lista se normaliza a LISTA en findByEntity', async () => {
      const res = await service.findByEntity('Lista', 'list-1', COMERCIAL);
      expect(res.data).toHaveLength(1);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entity: 'LISTA', entityId: 'list-1' } }),
      );
    });
  });
});