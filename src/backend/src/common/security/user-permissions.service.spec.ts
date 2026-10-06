import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UserPermissionsService } from './user-permissions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';

const mockPrisma = createPrismaMock();
const mockAudit = { log: jest.fn() };

const USER_ID = 'user-1';
const ACTOR_ID = 'super-admin';

const granted = (permissions: string[]) =>
  permissions.map((permission) => ({
    permission,
    effect: 'GRANT',
    reason: null,
    grantedById: ACTOR_ID,
    createdAt: new Date('2026-10-05T00:00:00.000Z'),
  }));

/** Permisos que acaban siendo filas: lo que se envió al `createMany`. */
const savedPermissions = (): string[] =>
  mockPrisma.userPermission.createMany.mock.calls[0][0].data.map(
    (row: { permission: string }) => row.permission,
  );

describe('UserPermissionsService', () => {
  let service: UserPermissionsService;

  beforeEach(async () => {
    jest.resetAllMocks();

    mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, email: 'a@b.example' });
    mockPrisma.userPermission.findMany.mockResolvedValue([]);
    mockAudit.log.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPermissionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<UserPermissionsService>(UserPermissionsService);
  });

  // --- Blindaje: qué se puede conceder por usuario ---------------------------
  describe('assertGrantable', () => {
    it('admite storefront:read', async () => {
      await service.replaceForUser(USER_ID, ['storefront:read'], ACTOR_ID);

      expect(savedPermissions()).toEqual(['storefront:read']);
    });

    it('admite storefront:write, la capacidad que abre la excepción', async () => {
      await service.replaceForUser(USER_ID, ['storefront:write'], ACTOR_ID);

      expect(savedPermissions()).toEqual(['storefront:write']);
    });

    it('guarda a la vez paneles y configuración de tienda', async () => {
      await service.replaceForUser(
        USER_ID,
        ['dashboard:pack:ventas', 'storefront:read', 'storefront:write'],
        ACTOR_ID,
      );

      expect(savedPermissions()).toEqual([
        'dashboard:pack:ventas',
        'storefront:read',
        'storefront:write',
      ]);
    });

    it('sigue admitiendo paquetes y bloques de dashboard', async () => {
      await service.replaceForUser(
        USER_ID,
        ['dashboard:pack:ventas', 'dashboard:block:kpi-ventas-mes'],
        ACTOR_ID,
      );

      expect(savedPermissions()).toEqual([
        'dashboard:pack:ventas',
        'dashboard:block:kpi-ventas-mes',
      ]);
    });

    it('rechaza un prefijo fuera de la lista', async () => {
      await expect(
        service.replaceForUser(USER_ID, ['users:manage'], ACTOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockPrisma.userPermission.createMany).not.toHaveBeenCalled();
    });

    it('el rechazo nombra los dos ámbitos concedibles, no sólo el dashboard', async () => {
      await expect(
        service.replaceForUser(USER_ID, ['listas:delete'], ACTOR_ID),
      ).rejects.toThrow(
        'Sólo pueden concederse permisos de dashboard o de configuración de tienda. Recibido: "listas:delete".',
      );
    });

    it('rechaza un paquete que no existe', async () => {
      await expect(
        service.replaceForUser(USER_ID, ['dashboard:pack:inventado'], ACTOR_ID),
      ).rejects.toThrow('El paquete "inventado" no existe.');
    });
  });

  // --- Reemplazo en bloque y auditoría ---------------------------------------
  describe('replaceForUser', () => {
    it('audita el antes y el después de la concesión', async () => {
      mockPrisma.userPermission.findMany.mockResolvedValue(
        granted(['dashboard:pack:ventas']),
      );

      await service.replaceForUser(USER_ID, ['storefront:write'], ACTOR_ID, 'ajuste');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ACTOR_ID,
          action: 'grant-dashboard-permissions',
          entity: 'UserPermission',
          entityId: USER_ID,
          oldValues: { permissions: ['dashboard:pack:ventas'] },
          newValues: { permissions: ['storefront:write'], reason: 'ajuste' },
          result: 'SUCCESS',
        }),
      );
    });

    it('sustituye el conjunto completo, de modo que lo no enviado se retira', async () => {
      mockPrisma.userPermission.findMany.mockResolvedValue(
        granted(['dashboard:pack:ventas', 'storefront:write']),
      );

      await service.replaceForUser(USER_ID, ['storefront:write'], ACTOR_ID);

      expect(mockPrisma.userPermission.deleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
      expect(savedPermissions()).toEqual(['storefront:write']);
    });
  });
});