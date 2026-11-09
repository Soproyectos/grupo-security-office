/**
 * Agenda de equipos (T2/T3): directorio por tipo de actor, validación del
 * asignado, bloqueo de actividades completadas y aviso de tope de lectura.
 * Mocks de Prisma/jerarquía/grants, sin base de datos.
 */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ACTIVITIES_LIMIT, WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { BASE_ACCESS_ROLES } from '../../common/security/base-access';

const grant = (actionId: string, scope: 'own' | 'team') => ({ sourceId: 'fixture', actionId, scope });
const TEAM = ['boss', 'ana', 'luis'];
const dto = (assigneeId: string) => ({ title: 'Llamar', kind: 'CALL', assigneeId, startsAt: '2026-10-16T15:00:00Z' });

describe('Agenda de equipos — backend', () => {
  const superAdmin = { userId: 'root', roles: ['Super Admin'] };
  const boss = { userId: 'boss', roles: ['Operador'] }; // jefe de equipo con un rol que NO es Vendedor
  let prisma: any;
  let hierarchy: any;
  let grants: any;
  let service: WorkflowService;

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn().mockImplementation(async (a: any) => (a.where.id?.in ?? []).map((id: string) => ({ id, name: `N ${id}` }))) },
      teamActivity: { create: jest.fn().mockResolvedValue({ id: 'new' }), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), updateMany: jest.fn() },
      teamActivityEvent: { create: jest.fn() },
      teamActivityLink: { create: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    hierarchy = { getSubordinateIds: jest.fn().mockResolvedValue(TEAM), getActiveInternalSubordinateIds: jest.fn().mockResolvedValue(['ana', 'luis']) };
    grants = { grantsForUser: jest.fn().mockResolvedValue([]) };
    service = new WorkflowService(prisma, hierarchy, grants);
  });

  describe('sellers (directorio del equipo)', () => {
    it('Super Admin: todo el personal interno activo, sin filtrar por Vendedor', async () => {
      await service.sellers(superAdmin);
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        isActive: true,
        roles: { some: { role: { name: { in: [...BASE_ACCESS_ROLES] } } } },
      });
    });

    it('con assign de equipo: personas activas de su equipo (y él), sin filtro de rol', async () => {
      grants.grantsForUser.mockResolvedValue([grant('activities:read', 'team'), grant('activities:assign', 'team')]);
      const result = await service.sellers(boss);
      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBe(true);
      expect(where).not.toHaveProperty('roles');
      expect([...where.id.in].sort()).toEqual([...TEAM].sort());
      expect(prisma.user.findMany.mock.calls[0][0].select).toEqual({ id: true, name: true });
      expect(result).toHaveLength(TEAM.length);
    });

    it('solo lectura de equipo: recibe la lista (solo id y nombre), sin 403', async () => {
      grants.grantsForUser.mockResolvedValue([grant('activities:read', 'team')]);
      const result = await service.sellers(boss);
      expect([...prisma.user.findMany.mock.calls[0][0].where.id.in].sort()).toEqual([...TEAM].sort());
      expect(Object.keys(result[0]).sort()).toEqual(['id', 'name']);
    });

    it('jefe de equipo sin subordinados: recibe la lista con solo él, no 403', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['boss']);
      hierarchy.getActiveInternalSubordinateIds.mockResolvedValue([]);
      grants.grantsForUser.mockResolvedValue([grant('activities:read', 'team')]);
      await service.sellers(boss);
      expect(prisma.user.findMany.mock.calls[0][0].where.id.in).toEqual(['boss']);
    });

    it('solo agenda propia (nivel 0): 403 con código estable y no consulta personas', async () => {
      hierarchy.getActiveInternalSubordinateIds.mockResolvedValue([]);
      await expect(service.sellers(boss)).rejects.toMatchObject({ response: { code: 'TEAM_DIRECTORY_FORBIDDEN' } });
      await expect(service.sellers(boss)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('createActivity (asignado válido)', () => {
    beforeEach(() => {
      grants.grantsForUser.mockResolvedValue([grant('activities:read', 'team'), grant('activities:assign', 'team')]);
    });

    it('crea para alguien activo de su equipo', async () => {
      await service.createActivity(boss, dto('ana'));
      expect(prisma.teamActivity.create).toHaveBeenCalledTimes(1);
    });

    it('rechaza con código ASSIGNEE_NOT_ACTIVE si no existe o está inactivo', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await expect(service.createActivity(boss, dto('ana'))).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.createActivity(boss, dto('ana'))).rejects.toMatchObject({ response: { code: 'ASSIGNEE_NOT_ACTIVE' } });
      expect(prisma.teamActivity.create).not.toHaveBeenCalled();
    });

    it('rechaza (403) a quien no es de su equipo', async () => {
      await expect(service.createActivity(boss, dto('stranger'))).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.teamActivity.create).not.toHaveBeenCalled();
    });

    it('Super Admin también exige asignado activo', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await expect(service.createActivity(superAdmin, dto('ghost'))).rejects.toMatchObject({ response: { code: 'ASSIGNEE_NOT_ACTIVE' } });
    });
  });

  describe('actividad completada = bloqueada', () => {
    const done = { id: 'act', assigneeId: 'ana', status: 'COMPLETED' };
    beforeEach(() => {
      grants.grantsForUser.mockResolvedValue([grant('activities:read', 'team'), grant('activities:assign', 'team'), grant('activities:complete', 'team')]);
      prisma.teamActivity.findUnique.mockResolvedValue(done);
    });

    it('assign: 409 ACTIVITY_ALREADY_COMPLETED y no escribe', async () => {
      await expect(service.assign(boss, 'act', { assigneeId: 'luis' })).rejects.toBeInstanceOf(ConflictException);
      await expect(service.assign(boss, 'act', { assigneeId: 'luis' })).rejects.toMatchObject({ response: { code: 'ACTIVITY_ALREADY_COMPLETED' } });
      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
    });

    it('assign: si se completa en carrera (0 filas), responde ACTIVITY_ALREADY_COMPLETED', async () => {
      prisma.teamActivity.findUnique.mockResolvedValueOnce({ ...done, status: 'PENDING' }).mockResolvedValueOnce(done);
      prisma.teamActivity.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.assign(boss, 'act', { assigneeId: 'luis' })).rejects.toMatchObject({ response: { code: 'ACTIVITY_ALREADY_COMPLETED' } });
    });

    it('assign: reasignar exige destino activo', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue({ ...done, status: 'PENDING' });
      prisma.user.findMany.mockResolvedValue([]);
      await expect(service.assign(boss, 'act', { assigneeId: 'luis' })).rejects.toMatchObject({ response: { code: 'ASSIGNEE_NOT_ACTIVE' } });
      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
    });

    it('addLink y removeLink: rechazan con el mismo código', async () => {
      const target = '550e8400-e29b-41d4-a716-446655440000';
      await expect(service.addLink(boss, 'act', { targetType: 'PRODUCT', targetId: target })).rejects.toMatchObject({ response: { code: 'ACTIVITY_ALREADY_COMPLETED' } });
      await expect(service.removeLink(boss, 'act', 'link')).rejects.toMatchObject({ response: { code: 'ACTIVITY_ALREADY_COMPLETED' } });
      expect(prisma.teamActivityLink.create).not.toHaveBeenCalled();
      expect(prisma.teamActivityLink.deleteMany).not.toHaveBeenCalled();
    });

    it('complete: la segunda vez devuelve 409 con código estable', async () => {
      prisma.teamActivity.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.complete(boss, 'act')).rejects.toMatchObject({ response: { code: 'ACTIVITY_ALREADY_COMPLETED' } });
    });
  });

  describe('tope de lectura (T3)', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, links: [] }));

    beforeEach(() => {
      grants.grantsForUser.mockResolvedValue([grant('activities:read', 'team')]);
    });

    it('pide limit+1 filas y no avisa si hay menos del tope', async () => {
      prisma.teamActivity.findMany.mockResolvedValue(rows(3));
      const page = await service.activitiesPage(boss);
      expect(prisma.teamActivity.findMany.mock.calls[0][0].take).toBe(ACTIVITIES_LIMIT + 1);
      expect(page).toMatchObject({ truncated: false, limit: 1000 });
      expect(page.items).toHaveLength(3);
    });

    it('con exactamente el tope no hay truncado', async () => {
      prisma.teamActivity.findMany.mockResolvedValue(rows(ACTIVITIES_LIMIT));
      expect((await service.activitiesPage(boss)).truncated).toBe(false);
    });

    it('con más del tope entrega solo el tope y marca truncated', async () => {
      prisma.teamActivity.findMany.mockResolvedValue(rows(ACTIVITIES_LIMIT + 1));
      const page = await service.activitiesPage(boss);
      expect(page.truncated).toBe(true);
      expect(page.items).toHaveLength(ACTIVITIES_LIMIT);
    });

    it('activities() mantiene el contrato anterior: solo el arreglo', async () => {
      prisma.teamActivity.findMany.mockResolvedValue(rows(ACTIVITIES_LIMIT + 1));
      const result = await service.activities(boss);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(ACTIVITIES_LIMIT);
    });

    it('el controlador deja el cuerpo igual y añade encabezados', async () => {
      const controller = new WorkflowController({
        activitiesPage: jest.fn().mockResolvedValue({ items: [{ id: 'x' }], truncated: true, limit: 1000 }),
      } as any);
      const res = { setHeader: jest.fn() };
      const body = await controller.activities({ sub: 'boss', roles: [] }, res);
      expect(body).toEqual([{ id: 'x' }]);
      expect(res.setHeader).toHaveBeenCalledWith('X-Total-Truncated', 'true');
      expect(res.setHeader).toHaveBeenCalledWith('X-Activities-Limit', '1000');
    });
  });
});
