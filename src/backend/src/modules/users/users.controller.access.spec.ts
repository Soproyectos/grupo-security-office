/**
 * COM-01 backend (E1) — superficie HTTP de concesiones por acción+alcance.
 *
 * DESVIACIÓN AUTORIZADA: el writePath de COM-01 `backend` no incluye
 * controller; el endpoint vive en `users.controller.ts` reutilizando el DTO
 * `assign-access.dto.ts` de BASE-04 y los guards existentes del módulo.
 * Prueba de ruta/validación con servicios mockeados; el comportamiento sobre
 * PostgreSQL desechable está en `access-assignments.service.spec.ts` (t10) y
 * el e2e con token real en el reporte de la entrega.
 *
 * Nota E6 (COM-01 §8, pendiente): la revalidación de AccessGrant por petición
 * (extender D3 más allá de `dashboard:pack:`) NO está implementada; el último
 * describe documenta el comportamiento ACTUAL sin maquillarlo.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import * as request from 'supertest';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { HierarchyService } from '../../common/hierarchy/hierarchy.service';
import { AuditService } from '../audit/audit.service';
import { UserPermissionsService } from '../../common/security/user-permissions.service';
import { AccountLockoutService } from '../../common/security/account-lockout.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { LiveAdminIdentityService } from '../../common/security/live-admin-identity.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ACCESS_CATALOG_VERSION } from '../../common/security/access-catalog';

jest.setTimeout(30_000);

const mockUsersService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};
const mockHierarchyService = {
  assertCanSetSupervisor: jest.fn(),
  getTeamTree: jest.fn(),
};
const mockAuditService = { log: jest.fn() };
const mockUserPermissions = {
  listForUser: jest.fn(),
  availablePacks: jest.fn(),
  replaceForUser: jest.fn(),
};
const mockLockout = { unlock: jest.fn() };
const mockAccessAssignments = {
  grantsForUser: jest.fn(),
  sourcesFor: jest.fn(),
  accessVersionFor: jest.fn(),
  replaceManualSource: jest.fn(),
  applyPackage: jest.fn(),
  removePackage: jest.fn(),
};
const mockLiveIdentity = { fromRequest: jest.fn() };

/** Sonda @Permissions para documentar el comportamiento actual sin E6. */
@Controller('probe/users-insights')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
class ProbeUsersInsightsController {
  @Get()
  @Permissions('users:read')
  read() {
    return { ok: true };
  }
}

describe('UsersController — concesiones por acción (COM-01 E1)', () => {
  let app: INestApplication;
  let shouldGuardThrow: boolean;
  let sessionUser: Record<string, unknown>;

  const mockGuard = {
    canActivate: jest.fn().mockImplementation((context: any) => {
      if (shouldGuardThrow) {
        throw new UnauthorizedException();
      }
      const req = context.switchToHttp().getRequest();
      req.user = sessionUser;
      return true;
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController, ProbeUsersInsightsController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: HierarchyService, useValue: mockHierarchyService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: UserPermissionsService, useValue: mockUserPermissions },
        { provide: AccountLockoutService, useValue: mockLockout },
        { provide: AccessAssignmentsService, useValue: mockAccessAssignments },
        { provide: LiveAdminIdentityService, useValue: mockLiveIdentity },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    shouldGuardThrow = false;
    sessionUser = { sub: 'admin-1', roles: ['Super Admin'], permissions: [] };
    mockLiveIdentity.fromRequest.mockResolvedValue({
      userId: 'admin-1',
      jti: 'jti-admin-1',
      verified: true,
      active: true,
      sessionValid: true,
      sessionUserId: 'admin-1',
      superAdmin: true,
    });
    mockUsersService.findOne.mockResolvedValue({ id: 'user-1' });
    mockAccessAssignments.grantsForUser.mockResolvedValue([]);
    mockAccessAssignments.sourcesFor.mockResolvedValue([]);
    mockAccessAssignments.accessVersionFor.mockResolvedValue(0);
    mockAccessAssignments.replaceManualSource.mockResolvedValue({
      userId: 'user-1', sourceId: 'src-1', accessVersion: 1, changed: true, grants: [],
    });
    mockAccessAssignments.applyPackage.mockResolvedValue({
      userId: 'user-1', sourceId: 'src-1', accessVersion: 1, changed: true, grants: [],
    });
    mockAccessAssignments.removePackage.mockResolvedValue({
      userId: 'user-1', sourceId: 'src-1', accessVersion: 2, changed: true, grants: [],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/users/:id/access', () => {
    it('Super Admin recibe grants, fuentes, versión y los 3 paquetes con su estado', async () => {
      mockAccessAssignments.grantsForUser.mockResolvedValue([
        { sourceId: 'src-tpl', actionId: 'customers:read', scope: 'own' },
      ]);
      mockAccessAssignments.sourcesFor.mockResolvedValue([
        {
          id: 'src-tpl', kind: 'template', templateId: 'vendedor',
          catalogVersion: ACCESS_CATALOG_VERSION, grantedById: 'admin-1', reason: 'template-applied',
        },
      ]);
      mockAccessAssignments.accessVersionFor.mockResolvedValue(3);

      const res = await request(app.getHttpServer())
        .get('/api/users/user-1/access')
        .expect(200);

      expect(res.body.catalogVersion).toBe(ACCESS_CATALOG_VERSION);
      expect(res.body.accessVersion).toBe(3);
      expect(res.body.grants).toHaveLength(1);
      expect(res.body.sources).toHaveLength(1);
      expect(res.body.packages.map((p: { id: string }) => p.id)).toEqual([
        'gestion-listas-precios', 'biblioteca-productos', 'publicacion-catalogo',
        'vendedor', 'supervisor-comercial', 'gestion-comercial',
      ]);
      const vendedor = res.body.packages.find((p: { id: string }) => p.id === 'vendedor');
      expect(vendedor.applied).toBe(true);
      expect(vendedor.sourceId).toBe('src-tpl');
      expect(vendedor.selections.length).toBeGreaterThan(0);
      const supervisor = res.body.packages.find((p: { id: string }) => p.id === 'supervisor-comercial');
      expect(supervisor.applied).toBe(false);
    });

    it('cualquier usuario ve su propio acceso, pero no el de otro', async () => {
      sessionUser = { sub: 'user-1', roles: ['Operador'], permissions: [] };
      await request(app.getHttpServer()).get('/api/users/user-1/access').expect(200);
      await request(app.getHttpServer()).get('/api/users/other-user/access').expect(404);
      expect(mockAccessAssignments.grantsForUser).toHaveBeenCalledWith('user-1');
    });

    it('sin sesión → 401', async () => {
      shouldGuardThrow = true;
      await request(app.getHttpServer()).get('/api/users/user-1/access').expect(401);
    });

    it('destino inexistente → 404 (findOne)', async () => {
      mockUsersService.findOne.mockRejectedValue(new NotFoundException('Usuario no encontrado'));
      await request(app.getHttpServer()).get('/api/users/desconocido/access').expect(404);
    });
  });

  describe('PUT /api/users/:id/access — modo grants (manual)', () => {
    const validBody = {
      grants: [{ actionId: 'customers:read', scope: 'team' }],
      expectedCatalogVersion: ACCESS_CATALOG_VERSION,
      expectedVersion: 0,
      reason: 'ajuste manual',
    };

    it('delega en replaceManualSource con los grants y devuelve el recibo', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send(validBody)
        .expect(200);

      expect(mockAccessAssignments.replaceManualSource).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-1', superAdmin: true }),
        'user-1',
        expect.objectContaining({
          expectedVersion: 0,
          catalogVersion: ACCESS_CATALOG_VERSION,
          reason: 'ajuste manual',
          grants: [{ actionId: 'customers:read', scope: 'team' }],
        }),
      );
      expect(res.body).toMatchObject({ sourceId: 'src-1', accessVersion: 1 });
      expect(mockAccessAssignments.applyPackage).not.toHaveBeenCalled();
    });

    it('acción deshabilitada → 400 (DTO BASE-04) sin llegar al servicio', async () => {
      await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send({
          ...validBody,
          grants: [{ actionId: 'stockRequests:read', scope: 'team' }],
        })
        .expect(400);
      expect(mockAccessAssignments.replaceManualSource).not.toHaveBeenCalled();
    });

    it('expectedCatalogVersion desactualizado → 400 (DTO) sin llegar al servicio', async () => {
      await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send({ ...validBody, expectedCatalogVersion: 'base02-0' })
        .expect(400);
      expect(mockAccessAssignments.replaceManualSource).not.toHaveBeenCalled();
    });

    it('expectedVersion ausente o negativa → 400 (DTO)', async () => {
      const { expectedVersion: _omit, ...sinVersion } = validBody;
      await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send(sinVersion)
        .expect(400);
      await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send({ ...validBody, expectedVersion: -1 })
        .expect(400);
    });

    it('sin packageId ni grants → 400', async () => {
      await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send({
          grants: [],
          expectedCatalogVersion: ACCESS_CATALOG_VERSION,
          expectedVersion: 0,
        })
        .expect(400);
      expect(mockAccessAssignments.replaceManualSource).not.toHaveBeenCalled();
    });

    it('no-SuperAdmin → 403 (RolesGuard)', async () => {
      sessionUser = { sub: 'user-1', roles: ['Operador'], permissions: [] };
      await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send(validBody)
        .expect(403);
    });
  });

  describe('PUT /api/users/:id/access — modo paquete', () => {
    it('delega en applyPackage con templateId y versión', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send({
          packageId: 'vendedor',
          grants: [], // el DTO padre exige el array; en modo paquete va vacío
          expectedCatalogVersion: ACCESS_CATALOG_VERSION,
          expectedVersion: 2,
        })
        .expect(200);

      expect(mockAccessAssignments.applyPackage).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-1', superAdmin: true }),
        'user-1',
        'vendedor',
        expect.objectContaining({ expectedVersion: 2, catalogVersion: ACCESS_CATALOG_VERSION }),
      );
      expect(res.body).toMatchObject({ sourceId: 'src-1' });
      expect(mockAccessAssignments.replaceManualSource).not.toHaveBeenCalled();
    });

    it('packageId y grants a la vez → 400 (ambiguo)', async () => {
      await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send({
          packageId: 'vendedor',
          grants: [{ actionId: 'customers:read', scope: 'team' }],
          expectedCatalogVersion: ACCESS_CATALOG_VERSION,
          expectedVersion: 0,
        })
        .expect(400);
      expect(mockAccessAssignments.applyPackage).not.toHaveBeenCalled();
      expect(mockAccessAssignments.replaceManualSource).not.toHaveBeenCalled();
    });

    it('paquete desconocido al servicio → 400 propagada', async () => {
      mockAccessAssignments.applyPackage.mockRejectedValue(
        new BadRequestException('El paquete "no-existe" no existe.'),
      );
      await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send({
          packageId: 'no-existe',
          grants: [],
          expectedCatalogVersion: ACCESS_CATALOG_VERSION,
          expectedVersion: 0,
        })
        .expect(400);
    });
  });

  describe('DELETE /api/users/:id/access/packages/:packageId', () => {
    it('delega en removePackage con la versión de la query', async () => {
      const res = await request(app.getHttpServer())
        .delete('/api/users/user-1/access/packages/vendedor?expectedVersion=4')
        .expect(200);

      expect(mockAccessAssignments.removePackage).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-1', superAdmin: true }),
        'user-1',
        'vendedor',
        expect.objectContaining({ expectedVersion: 4 }),
      );
      expect(res.body).toMatchObject({ accessVersion: 2 });
    });

    it('paquete no aplicado → 404 propagada; no-SuperAdmin → 403', async () => {
      mockAccessAssignments.removePackage.mockRejectedValue(
        new NotFoundException('El usuario user-1 no tiene aplicado el paquete "vendedor".'),
      );
      await request(app.getHttpServer())
        .delete('/api/users/user-1/access/packages/vendedor?expectedVersion=4')
        .expect(404);

      sessionUser = { sub: 'user-1', roles: ['Operador'], permissions: [] };
      await request(app.getHttpServer())
        .delete('/api/users/user-1/access/packages/vendedor?expectedVersion=4')
        .expect(403);
    });
  });

  describe('aceptación 2 — «sin paquetes no hay datos internos por URL/API» (alcance actual)', () => {
    it('usuario autenticado sin panel no ve el directorio, pero sí sus concesiones propias', async () => {
      sessionUser = { sub: 'user-1', roles: [], permissions: [] };
      await request(app.getHttpServer()).get('/api/users').expect(403);
      await request(app.getHttpServer()).get('/api/users/user-1/access').expect(200);
    });
    // La cobertura TOTAL de URL/API (endpoints todavía sin @Permissions,
    // permissions.guard.ts:46-50) queda hasta D5 según COM-01 §4: aquí se
    // acredita lo garantizado hoy, no se promete cubrir lo pendiente.
  });

  describe('E6 pendiente — comportamiento ACTUAL de un endpoint @Permissions tras retirar grants', () => {
    it('el permiso de rol en el JWT sigue abriendo el endpoint aunque el usuario no tenga AccessGrant (sin E6)', async () => {
      // Usuario SIN concesiones por acción (grantsForUser vacío — el retiro del
      // paquete ya ocurrió), pero su rol de seed le otorga users:read en el
      // JWT. PermissionsGuard decide por permisos del token (y rol Super
      // Admin), no por AccessGrant: hoy responde 200. Con E6 (revalidar
      // AccessGrant por petición) esto cambiaría; hasta entonces es el
      // comportamiento conocido, no un cubierto.
      sessionUser = { sub: 'user-1', roles: ['Operador'], permissions: ['users:read'] };
      mockAccessAssignments.grantsForUser.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/probe/users-insights')
        .expect(200);
      expect(res.body).toEqual({ ok: true });
    });
  });
});
