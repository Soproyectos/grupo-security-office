/**
 * Agenda: el servidor impone propio / equipo / global en lectura, creación,
 * completar y asignar. Mocks de Prisma/jerarquía/grants, sin base de datos.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { BASE_ACCESS_ROLES } from '../../common/security/base-access';

type Level = 'own' | 'team' | 'global';
const grant = (actionId: string, scope: Level) => ({ sourceId: 'fixture', actionId, scope });
const dto = (assigneeId: string) => ({ title: 'Llamar', kind: 'CALL', assigneeId, startsAt: '2026-10-16T15:00:00Z' });

describe('Agenda — alcance propio / equipo / global', () => {
  const me = { userId: 'me', roles: ['Vendedor'] };
  let prisma: any;
  let hierarchy: any;
  let grants: any;
  let service: WorkflowService;

  const as = (...rows: Array<[string, Level]>) =>
    grants.grantsForUser.mockResolvedValue(rows.map(([actionId, scope]) => grant(actionId, scope)));

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn().mockImplementation(async (a: any) => (a.where.id?.in ?? ['x']).map((id: string) => ({ id, name: `N ${id}` }))) },
      teamActivity: { create: jest.fn().mockResolvedValue({ id: 'new' }), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      teamActivityEvent: { create: jest.fn() },
      teamActivityLink: { create: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    // Role-derived team access exists only when the person has internal subordinates.
    hierarchy = { getSubordinateIds: jest.fn().mockResolvedValue([]), getActiveInternalSubordinateIds: jest.fn().mockResolvedValue([]) };
    grants = { grantsForUser: jest.fn().mockResolvedValue([]) };
    service = new WorkflowService(prisma, hierarchy, grants);
  });

  describe('lectura (activities:read)', () => {
    it('propio: solo las actividades de la persona', async () => {
      as(['activities:read', 'own']);
      await service.activities(me);
      expect(prisma.teamActivity.findMany.mock.calls[0][0].where).toEqual({ assigneeId: { in: ['me'] } });
    });

    it('equipo: la persona y su equipo, no el resto', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['ana']);
      hierarchy.getActiveInternalSubordinateIds.mockResolvedValue(['ana']);
      as(['activities:read', 'team']);
      await service.activities(me);
      expect([...prisma.teamActivity.findMany.mock.calls[0][0].where.assigneeId.in].sort()).toEqual(['ana', 'me']);
    });

    it('global: todas las actividades, sin filtrar por asignado', async () => {
      as(['activities:read', 'global']);
      await service.activities(me);
      expect(prisma.teamActivity.findMany.mock.calls[0][0].where).toEqual({ assigneeId: undefined });
    });

    it('sin la acción: 403 y no consulta actividades', async () => {
      as(['activities:create', 'own']);
      await expect(service.activities({ userId: 'nobody', roles: ['Proveedor'] })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.teamActivity.findMany).not.toHaveBeenCalled();
    });
  });

  describe('directorio de personas (sellers)', () => {
    it('global en lectura: todo el personal interno activo', async () => {
      as(['activities:read', 'global']);
      await service.sellers(me);
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
        isActive: true,
        roles: { some: { role: { name: { in: [...BASE_ACCESS_ROLES] } } } },
      });
    });

    it('solo propio: 403, no revela a nadie', async () => {
      as(['activities:read', 'own'], ['activities:assign', 'own']);
      await expect(service.sellers(me)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('crear (activities:create / activities:assign)', () => {
    it('propio: crea para sí mismo, pero no para otra persona', async () => {
      as(['activities:read', 'own'], ['activities:create', 'own'], ['activities:assign', 'own']);
      await service.createActivity(me, dto('me'));
      expect(prisma.teamActivity.create).toHaveBeenCalledTimes(1);
      await expect(service.createActivity(me, dto('ana'))).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.teamActivity.create).toHaveBeenCalledTimes(1);
    });

    it('equipo: asigna a su equipo y no a quien está fuera', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['ana']);
      hierarchy.getActiveInternalSubordinateIds.mockResolvedValue(['ana']);
      as(['activities:read', 'team'], ['activities:assign', 'team']);
      await service.createActivity(me, dto('ana'));
      await expect(service.createActivity(me, dto('stranger'))).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.teamActivity.create).toHaveBeenCalledTimes(1);
    });

    it('global: asigna a cualquier persona activa', async () => {
      as(['activities:read', 'global'], ['activities:assign', 'global']);
      await service.createActivity(me, dto('stranger'));
      expect(prisma.teamActivity.create).toHaveBeenCalledTimes(1);
    });

    it('asignar global sin la acción de asignar no alcanza: con solo crear global, a otra persona se le niega', async () => {
      as(['activities:read', 'global'], ['activities:create', 'global']);
      await expect(service.createActivity(me, dto('stranger'))).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.teamActivity.create).not.toHaveBeenCalled();
    });
  });

  describe('completar (activities:complete)', () => {
    const pending = (assigneeId: string) => ({ id: 'act', assigneeId, status: 'PENDING' });

    it('propio: completa lo suyo; lo de otra persona aparece como inexistente', async () => {
      as(['activities:read', 'own'], ['activities:complete', 'own']);
      prisma.teamActivity.findUnique.mockResolvedValue(pending('me'));
      await expect(service.complete(me, 'act')).resolves.toEqual({ ok: true });
      prisma.teamActivity.findUnique.mockResolvedValue(pending('ana'));
      await expect(service.complete(me, 'act')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('global: completa la de cualquier persona', async () => {
      as(['activities:read', 'global'], ['activities:complete', 'global']);
      prisma.teamActivity.findUnique.mockResolvedValue(pending('stranger'));
      await expect(service.complete(me, 'act')).resolves.toEqual({ ok: true });
    });

    it('leer global no concede completar lo ajeno', async () => {
      as(['activities:read', 'global'], ['activities:complete', 'own']);
      prisma.teamActivity.findUnique.mockResolvedValue(pending('stranger'));
      await expect(service.complete(me, 'act')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('reasignar (activities:assign)', () => {
    it('global: mueve una actividad ajena a otra persona activa', async () => {
      as(['activities:read', 'global'], ['activities:assign', 'global']);
      prisma.teamActivity.findUnique.mockResolvedValue({ id: 'act', assigneeId: 'ana', status: 'PENDING' });
      await expect(service.assign(me, 'act', { assigneeId: 'stranger' })).resolves.toEqual({ ok: true });
    });

    it('equipo: no mueve una actividad de fuera del equipo', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['ana']);
      hierarchy.getActiveInternalSubordinateIds.mockResolvedValue(['ana']);
      as(['activities:read', 'team'], ['activities:assign', 'team']);
      prisma.teamActivity.findUnique.mockResolvedValue({ id: 'act', assigneeId: 'stranger', status: 'PENDING' });
      await expect(service.assign(me, 'act', { assigneeId: 'ana' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
    });
  });
});
