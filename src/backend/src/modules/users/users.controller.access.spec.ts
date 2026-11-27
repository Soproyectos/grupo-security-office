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
  getActiveInternalSubordinateIds: jest.fn().mockResolvedValue([]),
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
  replaceLibrarySelection: jest.fn(),
  removeSource: jest.fn(),
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
    mockAccessAssignments.replaceLibrarySelection.mockResolvedValue({
      userId: 'user-1', sourceId: 'sel-1', accessVersion: 1, changed: true, grants: [],
    });
    mockAccessAssignments.removeSource.mockResolvedValue({
      userId: 'user-1', sourceId: 'manual-1', accessVersion: 2, changed: true, grants: [],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/users/:id/access', () => {
    it('Super Admin recibe grants, fuentes, versión y acciones; ya no hay paquetes', async () => {
      mockAccessAssignments.grantsForUser.mockResolvedValue([
        { sourceId: 'src-man', actionId: 'customers:read', scope: 'own' },
      ]);
      mockAccessAssignments.sourcesFor.mockResolvedValue([
        {
          id: 'src-man', kind: 'manual', templateId: null,
          catalogVersion: ACCESS_CATALOG_VERSION, grantedById: 'admin-1', reason: 'manual-assignment',
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
      expect(res.body).not.toHaveProperty('packages');
      expect(res.body.actions.some((action: { id: string }) => action.id.startsWith('listas:') || action.id === 'assignments:manage')).toBe(false);
      expect(res.body.actions.filter((action: { id: string }) => action.id.startsWith('marketing:')).map((action: { id: string }) => action.id)).toEqual([
        'marketing:read', 'marketing:create', 'marketing:edit', 'marketing:publish', 'marketing:delete',
      ]);
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

  describe('PUT /api/users/:id/access — acciones una por una (manual)', () => {
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

    it('una lista vacía es válida: deja al usuario sin concesiones manuales', async () => {
      await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send({ grants: [], expectedCatalogVersion: ACCESS_CATALOG_VERSION, expectedVersion: 2 })
        .expect(200);
      expect(mockAccessAssignments.replaceManualSource).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-1' }),
        'user-1',
        expect.objectContaining({ expectedVersion: 2, grants: [] }),
      );
    });

    it('no-SuperAdmin → 403 (RolesGuard)', async () => {
      sessionUser = { sub: 'user-1', roles: ['Operador'], permissions: [] };
      await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send(validBody)
        .expect(403);
    });
  });

  describe('PUT /api/users/:id/access/library — casillas de Biblioteca', () => {
    it('delega en replaceLibrarySelection con las acciones marcadas y la versión', async () => {
      await request(app.getHttpServer())
        .put('/api/users/user-1/access/library')
        .send({ actionIds: ['products:read', 'products:write'], expectedVersion: 4 })
        .expect(200);
      expect(mockAccessAssignments.replaceLibrarySelection).toHaveBeenCalledWith(
        expect.objectContaining({ superAdmin: true }), 'user-1',
        { expectedVersion: 4, actionIds: ['products:read', 'products:write'] },
      );
    });

    it('selección vacía es válida (retira todo Biblioteca)', async () => {
      await request(app.getHttpServer())
        .put('/api/users/user-1/access/library')
        .send({ actionIds: [], expectedVersion: 0 })
        .expect(200);
    });

    it('cuerpo inválido → 400 sin llegar al servicio', async () => {
      await request(app.getHttpServer()).put('/api/users/user-1/access/library')
        .send({ expectedVersion: 0 }).expect(400);
      await request(app.getHttpServer()).put('/api/users/user-1/access/library')
        .send({ actionIds: ['products:read'], expectedVersion: -1 }).expect(400);
      expect(mockAccessAssignments.replaceLibrarySelection).not.toHaveBeenCalled();
    });

    it('propaga el 400 del servicio (acción fuera del conjunto)', async () => {
      mockAccessAssignments.replaceLibrarySelection.mockRejectedValueOnce(
        new BadRequestException('La selección incluye permisos que no pertenecen a las pestañas de Biblioteca.'),
      );
      await request(app.getHttpServer()).put('/api/users/user-1/access/library')
        .send({ actionIds: ['products:publish'], expectedVersion: 0 }).expect(400);
    });

    it('no-SuperAdmin → 403 (RolesGuard)', async () => {
      sessionUser = { sub: 'user-1', roles: ['Operador'], permissions: [] };
      await request(app.getHttpServer()).put('/api/users/user-1/access/library')
        .send({ actionIds: ['products:read'], expectedVersion: 0 }).expect(403);
      expect(mockAccessAssignments.replaceLibrarySelection).not.toHaveBeenCalled();
    });
  });

  describe('los paquetes de paneles ya no existen', () => {
    it('PUT con packageId → 400 y no aplica nada, ni siquiera las acciones del cuerpo', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/users/user-1/access')
        .send({
          packageId: 'vendedor',
          grants: [],
          expectedCatalogVersion: ACCESS_CATALOG_VERSION,
          expectedVersion: 2,
        })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Los paquetes de paneles ya no existen');
      expect(mockAccessAssignments.replaceManualSource).not.toHaveBeenCalled();
    });

    it('DELETE access/packages/:packageId ya no es una ruta', async () => {
      await request(app.getHttpServer())
        .delete('/api/users/user-1/access/packages/vendedor?expectedVersion=4')
        .expect(404);
      expect(mockAccessAssignments.removeSource).not.toHaveBeenCalled();
    });

    it('el controlador no tiene operaciones de paquete', () => {
      expect((UsersController.prototype as unknown as Record<string, unknown>).deleteUserPackage).toBeUndefined();
      const routes = Object.getOwnPropertyNames(UsersController.prototype)
        .map((name) => (UsersController.prototype as any)[name])
        .filter((handler) => typeof handler === 'function')
        .map((handler) => String(Reflect.getMetadata('path', handler) ?? ''));
      expect(routes.some((path) => path.includes('packages'))).toBe(false);
    });
  });

  describe('GET /api/users/me/access-events', () => {
    it('emite al destinatario después de cada recibo exitoso y no filtra a otros usuarios', async () => {
      const controller = app.get(UsersController);
      const targetEvents: unknown[] = [];
      const otherEvents: unknown[] = [];
      const targetSub = controller.accessEvents({ user: { sub: 'user-1' } as any }).subscribe((event) => targetEvents.push(event.data));
      const otherSub = controller.accessEvents({ user: { sub: 'other-user' } as any }).subscribe((event) => otherEvents.push(event.data));
      expect(targetEvents).toEqual([{ type: 'access-changed' }]);
      expect(otherEvents).toEqual([{ type: 'access-changed' }]);

      await controller.setUserAccess('user-1', { grants: [{ actionId: 'customers:read', scope: 'team' }], expectedVersion: 0 } as any, { user: sessionUser as any });
      await controller.setUserAccess('user-1', { grants: [], expectedVersion: 1 } as any, { user: sessionUser as any });
      mockAccessAssignments.sourcesFor.mockResolvedValue([{ id: 'manual-1', kind: 'manual' }]);
      await controller.deleteManualAccess('user-1', 'manual-1', '3', { user: sessionUser as any });

      expect(targetEvents).toHaveLength(4);
      expect(otherEvents).toHaveLength(1);
      targetSub.unsubscribe();
      otherSub.unsubscribe();
      expect((controller as any).accessEventStreams.size).toBe(0);
    });

    it('no emite cuando falla el cambio antes del recibo', async () => {
      const controller = app.get(UsersController);
      const events: unknown[] = [];
      const sub = controller.accessEvents({ user: { sub: 'user-1' } as any }).subscribe((event) => events.push(event.data));
      mockAccessAssignments.replaceManualSource.mockRejectedValueOnce(new Error('commit failed'));

      await expect(controller.setUserAccess('user-1', { grants: [{ actionId: 'customers:read', scope: 'team' }], expectedVersion: 0 } as any, { user: sessionUser as any }))
        .rejects.toThrow('commit failed');
      expect(events).toEqual([{ type: 'access-changed' }]);
      sub.unsubscribe();
    });

    it('la ruta queda detrás de autenticación y no puede elegir otro destinatario', async () => {
      const method = UsersController.prototype.accessEvents;
      expect(Reflect.getMetadata('path', method)).toBe('me/access-events');
      const guards = Reflect.getMetadata('__guards__', UsersController).map((guard: any) => guard.name);
      expect(guards).toContain('JwtAuthGuard');
      expect(guards).toContain('RolesGuard');
      shouldGuardThrow = true;
      await request(app.getHttpServer()).get('/api/users/me/access-events').expect(401);
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
