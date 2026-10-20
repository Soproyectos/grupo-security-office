/**
 * BASE-03 `backend-propias` — aceptación textual de la ficha:
 * «Leer/crear/completar propias; ID ajeno denegado; reintento no duplica.»
 *
 * Reglas de la ficha que este spec fija:
 *  - separar creador (`creatorId`), asignado (`assigneeId`) y actor (`updatedBy`);
 *  - «historial no se borra al completar» (los eventos solo acumulan);
 *  - ID ajeno → 404 (no revelar existencia, contrato §6.1);
 *  - asignar fuera del conjunto → 403 (contrato §6.2, se conserva);
 *  - reintento de completar → 409 sin segundo evento.
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import type { ActivityDto } from './workflow.dto';

const activityDto = (assigneeId: string): ActivityDto => ({
  title: 'Llamada de seguimiento',
  kind: 'CALL',
  assigneeId,
  startsAt: '2026-10-16T15:00:00Z',
});

const people = { select: { id: true, name: true } };
const grantsStub = () => ({ grantsForUser: jest.fn().mockResolvedValue([
  ...['activities:read'].flatMap(actionId => ['own', 'team'].map(scope => ({ sourceId: 'fixture', actionId, scope }))),
  { sourceId: 'fixture', actionId: 'activities:create', scope: 'own' },
  ...['activities:complete', 'activities:assign'].flatMap(actionId => ['own', 'team'].map(scope => ({ sourceId: 'fixture', actionId, scope }))),
]) } as any);

describe('BASE-03 backend-propias — agenda propia e historial', () => {
  const seller = { userId: 'seller', roles: ['Vendedor'] };
  const otherSeller = { userId: 'other', roles: ['Vendedor'] };
  const supervisor = { userId: 'boss', roles: ['Supervisor'] };

  let prisma: any;
  let hierarchy: any;
  let service: WorkflowService;

  beforeEach(() => {
    prisma = {
      user: {
        // Devuelve el conjunto de sellers que el service pidió filtrar: el
        // propio userId para un vendedor, los subordinados para un supervisor.
        findMany: jest.fn().mockImplementation(async (args: any) => {
          const id = args?.where?.id?.in?.[0];
          return id ? [{ id, name: `Name of ${id}` }] : [];
        }),
      },
      teamActivity: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      teamActivityEvent: {
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    hierarchy = {
      getSubordinateIds: jest.fn().mockImplementation(async (id: string) => id === 'boss' ? ['subordinate'] : []),
    };
    service = new WorkflowService(prisma, hierarchy, grantsStub());
  });

  describe('leer propias', () => {
    it('limita la lectura del vendedor a assigneeId = yo y expone creador, asignado, actor e historial', async () => {
      await service.activities(seller);

      const call = prisma.teamActivity.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ assigneeId: { in: ['seller'] } });
      expect(call.include).toEqual(
        expect.objectContaining({
          assignee: people,
          creator: people,
          updatedBy: people,
          events: { orderBy: { at: 'asc' } },
        }),
      );
    });

    it('el conjunto de lectura de un supervisor es su equipo jerárquico MÁS él mismo (bug includeSelf)', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'subordinate', name: 'Sub' },
      ]);

      await service.activities(supervisor);

      expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('boss', {
        includeSelf: true,
      });
      // El alcance efectivo viene de la concesión de equipo intersectada con
      // la jerarquía vigente; el usuario propio también forma parte del conjunto.
      expect(prisma.teamActivity.findMany.mock.calls[0][0].where).toEqual({
        assigneeId: { in: ['boss', 'subordinate'] },
      });
    });
  });

  describe('crear propias', () => {
    it('crea la actividad propia fijando creador, asignado y evento CREATE con actor propio', async () => {
      prisma.teamActivity.create.mockResolvedValue({ id: 'a1' });

      await service.createActivity(seller, activityDto('seller'));

      expect(prisma.teamActivity.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.teamActivity.create.mock.calls[0][0];
      expect(data).toEqual(
        expect.objectContaining({
          assigneeId: 'seller',
          creatorId: 'seller',
          startsAt: new Date('2026-10-16T15:00:00Z'),
          events: { create: { actorId: 'seller', type: 'CREATE' } },
        }),
      );
      expect(data).not.toHaveProperty('updatedById');
    });

    it('deniega con 403 asignar a un usuario fuera del conjunto (no concede equipo)', async () => {
      await expect(
        service.createActivity(seller, activityDto('outsider')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.teamActivity.create).not.toHaveBeenCalled();
    });

    it('permite al supervisor crear para un subordinado concreto', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'subordinate', name: 'Sub' },
      ]);
      prisma.teamActivity.create.mockResolvedValue({ id: 'a2' });

      await service.createActivity(supervisor, activityDto('subordinate'));

      expect(prisma.teamActivity.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          assigneeId: 'subordinate',
          creatorId: 'boss',
        }),
      );
    });
  });

  describe('completar propias con actor separado', () => {
    it('completa la propia registrando actor distinto de creador y asignado', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue({
        id: 'a1',
        assigneeId: 'seller',
        creatorId: 'someone-else',
        status: 'PENDING',
      });
      prisma.teamActivity.updateMany.mockResolvedValue({ count: 1 });
      prisma.teamActivityEvent.create.mockResolvedValue({ id: 'e2' });

      const result = await service.complete(seller, 'a1');

      expect(result).toEqual({ ok: true });
      const update = prisma.teamActivity.updateMany.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'a1', status: 'PENDING' });
      expect(update.data).toEqual(
        expect.objectContaining({
          status: 'COMPLETED',
          completedAt: expect.any(Date),
          updatedById: 'seller',
        }),
      );
      expect(update.data).not.toHaveProperty('creatorId');
      expect(update.data).not.toHaveProperty('assigneeId');
      expect(prisma.teamActivityEvent.create).toHaveBeenCalledTimes(1);
      expect(prisma.teamActivityEvent.create).toHaveBeenCalledWith({
        data: { activityId: 'a1', actorId: 'seller', type: 'COMPLETE' },
      });
    });

    it('permite completar la de un subordinado y deja al supervisor como actor', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'subordinate', name: 'Sub' },
      ]);
      prisma.teamActivity.findUnique.mockResolvedValue({
        id: 'a1',
        assigneeId: 'subordinate',
        creatorId: 'boss',
        status: 'PENDING',
      });
      prisma.teamActivity.updateMany.mockResolvedValue({ count: 1 });

      await service.complete(supervisor, 'a1');

      expect(prisma.teamActivity.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ updatedById: 'boss' }),
      );
    });
  });

  describe('ID ajeno denegado', () => {
    it('responde 404 sin revelar existencia y sin escribir nada para una actividad ajena', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue({
        id: 'foreign',
        assigneeId: 'other',
        status: 'PENDING',
      });

      await expect(service.complete(seller, 'foreign')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
      expect(prisma.teamActivityEvent.create).not.toHaveBeenCalled();
    });

    it('responde 404 cuando la actividad no existe', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue(null);

      await expect(service.complete(seller, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('reintento no duplica', () => {
    it('el segundo completado responde 409 y no crea un segundo evento', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue({
        id: 'a1',
        assigneeId: 'seller',
        status: 'PENDING',
      });
      prisma.teamActivity.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await service.complete(seller, 'a1');
      await expect(service.complete(seller, 'a1')).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(prisma.teamActivity.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.teamActivityEvent.create).toHaveBeenCalledTimes(1);
      expect(prisma.teamActivityEvent.create).toHaveBeenCalledWith({
        data: { activityId: 'a1', actorId: 'seller', type: 'COMPLETE' },
      });
    });

    it('el evento solo se escribe cuando la actualización afectó exactamente una fila', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue({
        id: 'a1',
        assigneeId: 'seller',
        status: 'COMPLETED',
      });
      prisma.teamActivity.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.complete(seller, 'a1')).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(prisma.teamActivityEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('historial no destructivo', () => {
    it('completar no borra ni reemplaza eventos previos', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue({
        id: 'a1',
        assigneeId: 'seller',
        status: 'PENDING',
      });
      prisma.teamActivity.updateMany.mockResolvedValue({ count: 1 });

      await service.complete(seller, 'a1');
      await service.activities(seller);

      expect(prisma.teamActivityEvent.delete).not.toHaveBeenCalled();
      expect(prisma.teamActivityEvent.deleteMany).not.toHaveBeenCalled();
      expect(prisma.teamActivity.delete).not.toHaveBeenCalled();
      expect(prisma.teamActivity.deleteMany).not.toHaveBeenCalled();
      expect(prisma.teamActivity.updateMany.mock.calls[0][0].data).not.toHaveProperty(
        'events',
      );
      const read = prisma.teamActivity.findMany.mock.calls.at(-1)[0];
      expect(read.include.events).toEqual({ orderBy: { at: 'asc' } });
    });

    it('una actividad completada conserva creador, asignado y actor en la lectura', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'seller', name: 'S' }]);
      prisma.teamActivity.findMany.mockResolvedValue([
        {
          id: 'a1',
          status: 'COMPLETED',
          creatorId: 'seller',
          assigneeId: 'seller',
          updatedById: 'seller',
          events: [
            { id: 'e1', type: 'CREATE' },
            { id: 'e2', type: 'COMPLETE' },
          ],
        },
      ]);

      const rows = await service.activities(seller);

      expect(rows).toHaveLength(1);
      expect(rows[0].events).toHaveLength(2);
      expect(rows[0].events.map((e: any) => e.type)).toEqual([
        'CREATE',
        'COMPLETE',
      ]);
    });

    it('otro vendedor no ve la actividad ajena en la lectura', async () => {
      await service.activities(otherSeller);

      expect(prisma.teamActivity.findMany.mock.calls[0][0].where).toEqual({
        assigneeId: { in: ['other'] },
      });
    });
  });
});
