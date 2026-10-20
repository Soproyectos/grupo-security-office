/**
 * BASE-03 `backend-equipo` — aceptación textual de la ficha:
 * «Fuera del equipo se rechaza; asignar no concede completar ajenas.»
 *
 * Casos del contrato §6 y errores §7:
 *  - 6.1 «Usuario A no lee/completa/reasigna actividad B por ID» → 404
 *    (ocultar existencia) y ausencia de B en la lectura de A;
 *  - 6.2 «Asignar fuera del equipo se rechaza» → 403 en el DESTINO y
 *    «asignar no concede completar ajenas» → el conjunto de `complete`
 *    sigue siendo el del ACTOR, no el del destinatario;
 *  - 6.3 «Repetir completar no duplica evento» → 409 con un solo evento,
 *    aquí en contexto de dos usuarios reales;
 *  - equipo = subordinados jerárquicos + uno mismo (bug `includeSelf`
 *    de `sellers()`: un Supervisor puro no ve ni completa SUS actividades).
 *
 * Reglas de la ficha que este spec fija:
 *  - separar creador (`creatorId`), asignado (`assigneeId`) y actor
 *    (`updatedById`/evento) también al reasignar;
 *  - «historial no se borra»: la reasignación solo agrega eventos;
 *  - las acciones requieren grants vigentes; `team` se limita a integrantes
 *    de la jerarquía actual y no se hereda del cargo.
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import type { ActivityDto, AssignDto } from './workflow.dto';

const activityDto = (assigneeId: string): ActivityDto => ({
  title: 'Llamada de seguimiento',
  kind: 'CALL',
  assigneeId,
  startsAt: '2026-10-16T15:00:00Z',
});

const people = { select: { id: true, name: true } };
const grantsStub = () => ({ grantsForUser: jest.fn().mockImplementation(async (userId: string) => [
  ...['activities:read', 'activities:complete'].map(actionId => ({ sourceId: 'fixture', actionId, scope: 'own' })),
  { sourceId: 'fixture', actionId: 'activities:create', scope: 'own' },
  ...(userId === 'boss' ? [
    ...['activities:read', 'activities:complete', 'activities:assign'].map(actionId => ({ sourceId: 'fixture', actionId, scope: 'team' })),
  ] : []),
]) } as any);

describe('BASE-03 backend-equipo — consulta y asignación de equipo', () => {
  const admin = { userId: 'admin', roles: ['Super Admin'] };
  const boss = { userId: 'boss', roles: ['Supervisor'] };
  const sellerA = { userId: 'sellerA', roles: ['Vendedor'] };
  const sellerB = { userId: 'sellerB', roles: ['Vendedor'] };
  const outsider = { userId: 'outsider', roles: ['Vendedor'] };

  let prisma: any;
  let hierarchy: any;
  let service: WorkflowService;

  beforeEach(() => {
    prisma = {
      user: {
        // Directorio de vendedores: devuelve todos los IDs pedidos (todos
        // activos con rol Vendedor). Los tests que necesiten filtrar por rol
        // sobrescriben este mock.
        findMany: jest.fn().mockImplementation(async (args: any) => {
          const ids: string[] | undefined = args?.where?.id?.in;
          const pool = ['boss', 'sellerA', 'sellerB', 'outsider'];
          return (ids ?? pool)
            .filter((id) => pool.includes(id))
            .map((id) => ({ id, name: `Name of ${id}` }));
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
      // Supervisor ve su jerarquía; vendedores solo pertenecen a su propio conjunto.
      getSubordinateIds: jest
        .fn()
        .mockImplementation(async (id: string, opts?: { includeSelf?: boolean }) =>
          id === 'boss' ? (opts?.includeSelf ? [id, 'sellerA', 'sellerB'] : ['sellerA', 'sellerB']) : [id],
        ),
    };
    service = new WorkflowService(prisma, hierarchy, grantsStub());
  });

  const activityOf = (assigneeId: string, extra: Record<string, unknown> = {}) => ({
    id: `act-${assigneeId}`,
    assigneeId,
    creatorId: 'boss',
    status: 'PENDING',
    ...extra,
  });

  describe('reasignar (activities:assign, caso 6.2)', () => {
    it('reasigna una actividad del equipo: cambia assigneeId, registra actor e historial ASSIGN', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue(activityOf('sellerA'));
      prisma.teamActivity.updateMany.mockResolvedValue({ count: 1 });
      prisma.teamActivityEvent.create.mockResolvedValue({ id: 'e3' });

      const result = await service.assign(boss, 'act-sellerA', {
        assigneeId: 'sellerB',
      } as AssignDto);

      expect(result).toEqual({ ok: true });
      const update = prisma.teamActivity.updateMany.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'act-sellerA' });
      expect(update.data).toEqual(
        expect.objectContaining({ assigneeId: 'sellerB', updatedById: 'boss' }),
      );
      expect(update.data).not.toHaveProperty('creatorId');
      expect(update.data).not.toHaveProperty('status');
      expect(prisma.teamActivityEvent.create).toHaveBeenCalledTimes(1);
      expect(prisma.teamActivityEvent.create).toHaveBeenCalledWith({
        data: { activityId: 'act-sellerA', actorId: 'boss', type: 'ASSIGN' },
      });
    });

    it('responde 403 al reasignar hacia un destinatario FUERA del conjunto (fuera del equipo se rechaza)', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue(activityOf('sellerA'));

      await expect(
        service.assign(boss, 'act-sellerA', { assigneeId: 'outsider' } as AssignDto),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
      expect(prisma.teamActivityEvent.create).not.toHaveBeenCalled();
    });

    it('responde 404 al reasignar una actividad ajena por ID sin escribir nada (6.1)', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue(
        activityOf('outsider', { id: 'act-outsider' }),
      );

      await expect(
        service.assign(sellerA, 'act-outsider', { assigneeId: 'sellerA' } as AssignDto),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
      expect(prisma.teamActivityEvent.create).not.toHaveBeenCalled();
    });

    it('responde 404 cuando la actividad no existe', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue(null);

      await expect(
        service.assign(boss, 'missing', { assigneeId: 'sellerA' } as AssignDto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
    });

    it('la reasignación solo agrega historial: no borra ni reemplaza eventos previos', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue(activityOf('sellerA'));
      prisma.teamActivity.updateMany.mockResolvedValue({ count: 1 });

      await service.assign(boss, 'act-sellerA', { assigneeId: 'sellerB' } as AssignDto);

      expect(prisma.teamActivityEvent.delete).not.toHaveBeenCalled();
      expect(prisma.teamActivityEvent.deleteMany).not.toHaveBeenCalled();
      expect(prisma.teamActivity.delete).not.toHaveBeenCalled();
      expect(prisma.teamActivity.deleteMany).not.toHaveBeenCalled();
      expect(prisma.teamActivity.updateMany.mock.calls[0][0].data).not.toHaveProperty(
        'events',
      );
    });

    it('el Super Admin reasigna dentro del conjunto de equipo completo', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue(activityOf('sellerA'));
      prisma.teamActivity.updateMany.mockResolvedValue({ count: 1 });

      await service.assign(admin, 'act-sellerA', { assigneeId: 'sellerB' } as AssignDto);

      expect(prisma.teamActivity.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ assigneeId: 'sellerB', updatedById: 'admin' }),
      );
    });
  });

  describe('asignar no concede completar ajenas (caso 6.2)', () => {
    it('recibir una asignación no da capacidad sobre las demás actividades del originador', async () => {
      // El supervisor reasigna la actividad de A a B (200).
      prisma.teamActivity.findUnique.mockResolvedValueOnce(
        activityOf('sellerA', { id: 'act-1' }),
      );
      prisma.teamActivity.updateMany.mockResolvedValueOnce({ count: 1 });
      await service.assign(boss, 'act-1', { assigneeId: 'sellerB' } as AssignDto);

      // B, que ahora es asignado de act-1, NO por eso ve ni completa la
      // OTRA actividad de A: el conjunto de `complete` es el del ACTOR.
      prisma.teamActivity.findUnique.mockResolvedValueOnce(
        activityOf('sellerA', { id: 'act-2' }),
      );
      await expect(service.complete(sellerB, 'act-2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.teamActivity.updateMany).toHaveBeenCalledTimes(1);
    });

    it('tras la reasignación el originador ya no completa la actividad que dejó de estar en su conjunto', async () => {
      prisma.teamActivity.findUnique.mockResolvedValueOnce(
        activityOf('sellerA', { id: 'act-1' }),
      );
      prisma.teamActivity.updateMany.mockResolvedValueOnce({ count: 1 });
      await service.assign(boss, 'act-1', { assigneeId: 'sellerB' } as AssignDto);

      prisma.teamActivity.findUnique.mockResolvedValueOnce(
        activityOf('sellerB', { id: 'act-1' }),
      );
      await expect(service.complete(sellerA, 'act-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.teamActivity.updateMany).toHaveBeenCalledTimes(1);
    });

    it('el destinatario sí completa la actividad que ahora es suya, como actor separado', async () => {
      prisma.teamActivity.findUnique.mockResolvedValueOnce(
        activityOf('sellerA', { id: 'act-1' }),
      );
      prisma.teamActivity.updateMany.mockResolvedValueOnce({ count: 1 });
      await service.assign(boss, 'act-1', { assigneeId: 'sellerB' } as AssignDto);

      prisma.teamActivity.findUnique.mockResolvedValueOnce(
        activityOf('sellerB', { id: 'act-1' }),
      );
      prisma.teamActivity.updateMany.mockResolvedValueOnce({ count: 1 });

      await expect(service.complete(sellerB, 'act-1')).resolves.toEqual({ ok: true });
      expect(prisma.teamActivity.updateMany.mock.calls[1][0].data).toEqual(
        expect.objectContaining({ status: 'COMPLETED', updatedById: 'sellerB' }),
      );
    });
  });

  describe('caso 6.1 — A no lee/completa/reasigna la actividad de B', () => {
    beforeEach(() => {
      prisma.teamActivity.findMany.mockImplementation(async (args: any) => [
        { id: 'act-sellerA', assigneeId: 'sellerA', status: 'PENDING' },
        { id: 'act-sellerB', assigneeId: 'sellerB', status: 'PENDING' },
      ].filter((row) => args.where.assigneeId.in.includes(row.assigneeId)));
      prisma.teamActivity.findUnique.mockResolvedValue(
        activityOf('sellerB', { id: 'act-sellerB' }),
      );
    });

    it('A no ve la actividad de B en su lectura (solo el conjunto propio)', async () => {
      const rows = await service.activities(sellerA);

      expect(
        prisma.teamActivity.findMany.mock.calls[0][0].where,
      ).toEqual({ assigneeId: { in: ['sellerA'] } });
      expect(rows.map((r: any) => r.id)).toEqual(['act-sellerA']);
    });

    it('A no completa la actividad de B por ID → 404 sin escribir', async () => {
      await expect(service.complete(sellerA, 'act-sellerB')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
      expect(prisma.teamActivityEvent.create).not.toHaveBeenCalled();
    });

    it('A no reasigna la actividad de B por ID → 404 sin escribir', async () => {
      await expect(
        service.assign(sellerA, 'act-sellerB', { assigneeId: 'sellerA' } as AssignDto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
      expect(prisma.teamActivityEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('fuera del equipo se rechaza (aceptación del incremento)', () => {
    it('crear para un destinatario fuera del conjunto → 403', async () => {
      await expect(
        service.createActivity(sellerA, activityDto('outsider')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.teamActivity.create).not.toHaveBeenCalled();
    });

    it('completar una actividad fuera del conjunto → 404 (no revelar existencia)', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue(
        activityOf('outsider', { id: 'act-outsider' }),
      );

      await expect(service.complete(sellerA, 'act-outsider')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
    });

    it('crear para un miembro del equipo del supervisor sigue permitido (regresión)', async () => {
      prisma.teamActivity.create.mockResolvedValue({ id: 'a3' });

      await service.createActivity(boss, activityDto('sellerA'));

      expect(prisma.teamActivity.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ assigneeId: 'sellerA', creatorId: 'boss' }),
      );
    });
  });

  describe('caso 6.3 — reintento en contexto de dos usuarios', () => {
    it('B completa dos veces: 409 en la segunda y un solo evento COMPLETE', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue(
        activityOf('sellerB', { id: 'act-sellerB' }),
      );
      prisma.teamActivity.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await service.complete(sellerB, 'act-sellerB');
      await expect(service.complete(sellerB, 'act-sellerB')).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(prisma.teamActivityEvent.create).toHaveBeenCalledTimes(1);
      expect(prisma.teamActivityEvent.create).toHaveBeenCalledWith({
        data: { activityId: 'act-sellerB', actorId: 'sellerB', type: 'COMPLETE' },
      });
    });

    it('mientras B reintenta, A sigue sin ver ni completar esa actividad', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue(
        activityOf('sellerB', { id: 'act-sellerB' }),
      );

      await expect(service.complete(sellerA, 'act-sellerB')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.complete(sellerA, 'act-sellerB')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.teamActivity.updateMany).not.toHaveBeenCalled();
      expect(prisma.teamActivityEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('bug includeSelf — el supervisor ve y completa SUS actividades', () => {
    it('el conjunto de un supervisor incluye su propio ID además de los subordinados', async () => {
      await service.activities(boss);

      expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('boss', {
        includeSelf: true,
      });
      expect(prisma.teamActivity.findMany.mock.calls[0][0].where).toEqual({
        assigneeId: { in: ['boss', 'sellerA', 'sellerB'] },
      });
    });

    it('un Supervisor puro (sin rol Vendedor) ve sus actividades: el filtro de rol no lo excluye del alcance', async () => {
      // El rol Vendedor filtra el directorio: `boss` no aparece en sellers().
      prisma.user.findMany.mockImplementation(async (args: any) =>
        (args?.where?.id?.in ?? [])
          .filter((id: string) => id !== 'boss')
          .map((id: string) => ({ id, name: `Name of ${id}` })),
      );

      await service.activities(boss);

      expect(prisma.teamActivity.findMany.mock.calls[0][0].where).toEqual({
        assigneeId: { in: ['boss', 'sellerA', 'sellerB'] },
      });
    });

    it('un Supervisor puro completa su propia actividad y queda como actor', async () => {
      prisma.user.findMany.mockImplementation(async (args: any) =>
        (args?.where?.id?.in ?? [])
          .filter((id: string) => id !== 'boss')
          .map((id: string) => ({ id, name: `Name of ${id}` })),
      );
      prisma.teamActivity.findUnique.mockResolvedValue({
        id: 'act-boss',
        assigneeId: 'boss',
        creatorId: 'boss',
        status: 'PENDING',
      });
      prisma.teamActivity.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.complete(boss, 'act-boss')).resolves.toEqual({ ok: true });
      expect(prisma.teamActivity.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ updatedById: 'boss' }),
      );
    });

    it('un Supervisor puro puede crear una actividad consigo mismo como asignado', async () => {
      prisma.user.findMany.mockImplementation(async (args: any) =>
        (args?.where?.id?.in ?? [])
          .filter((id: string) => id !== 'boss')
          .map((id: string) => ({ id, name: `Name of ${id}` })),
      );
      prisma.teamActivity.create.mockResolvedValue({ id: 'a4' });

      await service.createActivity(boss, activityDto('boss'));

      expect(prisma.teamActivity.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ assigneeId: 'boss', creatorId: 'boss' }),
      );
    });
  });
});
