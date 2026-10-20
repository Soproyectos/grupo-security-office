/**
 * BASE-04 unidad 2 — frontera de permisos concedibles (§4) y deuda de
 * procedencia de UserPermission (las concesiones legacy no tienen
 * sourceId/grantedById de sistema: AccessSource es quien lleva procedencia).
 *
 * RED observado: estos specs deben fallar mientras `isConcessionPermission`
 * no se exporte de `./user-permissions.service`.
 */
import { BadRequestException } from '@nestjs/common';
import {
  UserPermissionsService,
  isConcessionPermission,
} from './user-permissions.service';

function buildService(overrides: {
  userPermission?: Partial<Record<string, jest.Mock>>;
  user?: Partial<Record<string, jest.Mock>>;
} = {}) {
  const prisma = {
    userPermission: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      ...overrides.userPermission,
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u-1', email: 'u@x.test' }),
      ...overrides.user,
    },
    $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return {
    prisma,
    audit,
    service: new UserPermissionsService(prisma as never, audit as never),
  };
}

describe('isConcessionPermission (BASE-04 §4 frontera de concesión)', () => {
  it('reconoce los paquetes y bloques de dashboard como clase concesible', () => {
    expect(isConcessionPermission('dashboard:pack:ventas')).toBe(true);
    expect(isConcessionPermission('dashboard:block:ranking-equipo')).toBe(true);
  });

  it('NO reconoce acciones del catálogo ni capacidades como concesión', () => {
    expect(isConcessionPermission('customers:read')).toBe(false);
    expect(isConcessionPermission('users:manage')).toBe(false);
    expect(isConcessionPermission('listas:delete')).toBe(false);
    expect(isConcessionPermission('dashboard:other')).toBe(false);
    expect(isConcessionPermission('not-dashboard:pack:x')).toBe(false);
  });
});

describe('UserPermissionsService (frontera y procedencia)', () => {
  describe('sólo dashboard es concedible (anti-escalada)', () => {
    it('replaceForUser rechaza permisos fuera de la frontera con 400', async () => {
      const { service } = buildService();
      await expect(
        service.replaceForUser('u-1', ['customers:read'], 'actor-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('replaceForUser rechaza paquetes de dashboard inexistentes', async () => {
      const { service } = buildService();
      await expect(
        service.replaceForUser('u-1', ['dashboard:pack:inexistente'], 'actor-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('procedencia limitada (deuda: AccessSource es quien la trae)', () => {
    it('listForUser expone grantedById/reason pero NO sourceId (deuda documentada)', async () => {
      const { service, prisma } = buildService({
        userPermission: {
          findMany: jest.fn().mockResolvedValue([
            {
              permission: 'dashboard:pack:ventas',
              effect: 'GRANT',
              reason: 'alta inicial',
              grantedById: 'admin-1',
              createdAt: new Date('2026-01-01'),
            },
          ]),
        },
      });

      const rows = await service.listForUser('u-1');

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        permission: 'dashboard:pack:ventas',
        effect: 'GRANT',
        grantedById: 'admin-1',
        reason: 'alta inicial',
      });
      // Deuda de procedencia: la fila legacy no sabe de qué fuente (plantilla,
      // manual, migración) vino; sólo quién la aplicó. Esa procedencia vive
      // ahora en AccessSource/AccessGrant (BASE-04 §5).
      expect(Object.keys(rows[0])).not.toContain('sourceId');
      expect(Object.keys(rows[0])).not.toContain('sourceKind');
      expect(prisma.userPermission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u-1' } }),
      );
    });

    it('effectivePermissionsFor sólo lee UserPermission GRANT, jamás AccessGrant', async () => {
      const { service, prisma } = buildService({
        userPermission: {
          findMany: jest.fn().mockResolvedValue([
            { permission: 'dashboard:pack:ventas' },
            { permission: 'dashboard:block:ranking-equipo' },
          ]),
        },
      });

      const effective = await service.effectivePermissionsFor('u-1');

      expect(effective).toEqual([
        'dashboard:pack:ventas',
        'dashboard:block:ranking-equipo',
      ]);
      expect(prisma.userPermission.findMany).toHaveBeenCalledWith({
        where: { userId: 'u-1', effect: 'GRANT' },
        select: { permission: true },
      });
      // Las concesiones por acción (AccessGrant) se resuelven aparte, en el
      // resolver data-scope; aquí no se filtran ni se suman.
      expect((prisma as Record<string, unknown>).accessGrant).toBeUndefined();
    });
  });

  describe('sustitución en bloque (COM-01)', () => {
    it('reescribe el conjunto completo, valida la frontera y audita', async () => {
      const { service, prisma, audit } = buildService({
        userPermission: {
          findMany: jest.fn().mockResolvedValueOnce([
            { permission: 'dashboard:pack:ventas', effect: 'GRANT', reason: null, grantedById: null, createdAt: new Date() },
          ]).mockResolvedValueOnce([]),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      });

      const result = await service.replaceForUser(
        'u-1',
        ['dashboard:pack:listas', 'dashboard:block:ranking-equipo'],
        'admin-1',
        'reasignación trimestral',
      );

      expect(result).toEqual([]);
      expect(prisma.userPermission.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u-1' },
      });
      expect(prisma.userPermission.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: 'u-1',
            permission: 'dashboard:pack:listas',
            effect: 'GRANT',
            grantedById: 'admin-1',
            reason: 'reasignación trimestral',
          }),
          expect.objectContaining({
            permission: 'dashboard:block:ranking-equipo',
          }),
        ]),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'grant-dashboard-permissions',
          entityId: 'u-1',
        }),
      );
    });

    it('destino inexistente → 400 y no escribe nada', async () => {
      const { service, prisma } = buildService({
        user: { findUnique: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.replaceForUser('u-missing', ['dashboard:pack:ventas'], 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.userPermission.deleteMany).not.toHaveBeenCalled();
      expect(prisma.userPermission.createMany).not.toHaveBeenCalled();
    });
  });

  it('availablePacks lista los paquetes con su permiso canónico', () => {
    const { service } = buildService();
    const packs = service.availablePacks();
    expect(packs.length).toBeGreaterThan(0);
    expect(packs[0]).toEqual({
      id: expect.any(String),
      permission: expect.stringMatching(/^dashboard:pack:/),
    });
  });
});
