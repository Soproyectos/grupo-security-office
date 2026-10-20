/**
 * BASE-03 `backend-vinculos` — aceptación textual de la ficha (parte B):
 * «Conversión explícita deduplica producto+regla+revisión.»
 *
 * Regla textual del diseño (DISENO-PANEL-CATALOGO-Y-PRECIOS-2026-10-14.md:90):
 * «Los problemas de validación se muestran como pendientes; convertirlos en
 * tareas es explícito para evitar crear cientos de tareas repetidas. La clave
 * producto + regla + revisión evita duplicados.»
 *
 * Contrato §8 D6: «Conversión de incidencias en tareas (deduplicación
 * producto+regla+revisión) y su relación con TeamRequest».
 *
 * Reglas de la ficha que este spec fija:
 *  - conversión EXPLÍCITA: sólo desde el endpoint, nunca automática;
 *  - sólo `PENDING` (criterio conservador; el diseño no fija estado — ver
 *    comentario en `convertRequest`);
 *  - «historial no se borra»: la solicitud NO se borra ni cambia de estado;
 *    sólo se apunta `convertedActivityId`;
 *  - dos conversiones de la misma combinación → UNA sola actividad
 *    (idempotente, chequeo transaccional + índice único `dedupKey`);
 *  - el alta de la actividad es del ACTOR y respeta el mismo conjunto de
 *    equipo que `createActivity` (403 si el asignado está fuera).
 *
 * La prueba de aceptación con BD real (índice único en `grupo_security_tanda_t06`)
 * vive al final del archivo.
 */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { WorkflowService } from './workflow.service';
import type { ConvertDto } from './workflow.dto';

const convertDto = (productId: string, extra: Record<string, unknown> = {}): ConvertDto =>
  ({
    productId,
    ruleKey: 'precio-vencido',
    revisionKey: 'rev-2026-10',
    ...extra,
  }) as ConvertDto;

function buildPrisma() {
  const prisma: any = {
    user: {
      findMany: jest.fn().mockImplementation(async (args: any) => {
        const id = args?.where?.id?.in?.[0];
        return id ? [{ id, name: `Name of ${id}` }] : [];
      }),
    },
    teamActivity: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    teamActivityEvent: { create: jest.fn() },
    teamActivityLink: { create: jest.fn(), deleteMany: jest.fn() },
    teamRequest: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    product: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma)),
  };
  return prisma;
}

const grantsStub = () => ({ grantsForUser: jest.fn().mockResolvedValue([]) } as any);

describe('BASE-03 backend-vinculos — conversión explícita de incidencias', () => {
  const supervisor = { userId: 'boss', roles: ['Supervisor'] };
  const admin = { userId: 'admin', roles: ['Super Admin'] };

  let prisma: any;
  let hierarchy: any;
  let service: WorkflowService;

  beforeEach(() => {
    prisma = buildPrisma();
    hierarchy = { getSubordinateIds: jest.fn().mockResolvedValue(['boss']) };
    service = new WorkflowService(prisma, hierarchy, grantsStub());
  });

  const pendingRequest = (extra: Record<string, unknown> = {}) => ({
    id: 'r1',
    kind: 'INCORPORATION',
    detail: 'Precio vencido en la lista mayorista',
    status: 'PENDING',
    creatorId: 'boss',
    ...extra,
  });

  describe('guardas de la conversión', () => {
    it('404 si la solicitud no existe', async () => {
      prisma.teamRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.convertRequest(admin, 'r1', convertDto('p1')),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.teamActivity.create).not.toHaveBeenCalled();
    });

    it('403 si un Supervisor intenta convertir una petición sin acción asignada', async () => {
      prisma.teamRequest.findUnique.mockResolvedValue(
        pendingRequest({ creatorId: 'other' }),
      );

      await expect(
        service.convertRequest(supervisor, 'r1', convertDto('p1')),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.teamActivity.create).not.toHaveBeenCalled();
    });

    it('409 si la solicitud ya no está PENDING (criterio conservador)', async () => {
      prisma.teamRequest.findUnique.mockResolvedValue(
        pendingRequest({ status: 'APPROVED' }),
      );

      await expect(
        service.convertRequest(admin, 'r1', convertDto('p1')),
      ).rejects.toThrow(ConflictException);
      expect(prisma.teamActivity.create).not.toHaveBeenCalled();
    });

    it('404 si el producto indicado no existe', async () => {
      prisma.teamRequest.findUnique.mockResolvedValue(pendingRequest());
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.convertRequest(admin, 'r1', convertDto('p1')),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.teamActivity.create).not.toHaveBeenCalled();
    });

    it('Super Admin puede convertir una petición para cualquier asignado con alcance global', async () => {
      prisma.teamRequest.findUnique.mockResolvedValue(pendingRequest());
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', name: 'Taladro' });

      prisma.teamActivity.create.mockResolvedValue({ id: 'act-outsider' });
      await expect(service.convertRequest(admin, 'r1', convertDto('p1', { assigneeId: 'outsider' })))
        .resolves.toEqual(expect.objectContaining({ id: 'act-outsider', conversionCreated: true }));
    });
  });

  describe('conversión y deduplicación producto+regla+revisión', () => {
    beforeEach(() => {
      prisma.teamRequest.findUnique.mockResolvedValue(pendingRequest());
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', name: 'Taladro percutor' });
      prisma.teamActivity.findUnique.mockResolvedValue(null);
      prisma.teamActivity.create.mockResolvedValue({
        id: 'act-1',
        title: 'Precio vencido en la lista mayorista',
        kind: 'TASK',
        status: 'PENDING',
        dedupKey: 'p1|precio-vencido|rev-2026-10',
        creatorId: 'boss',
        assigneeId: 'boss',
      });
    });

    it('crea UNA actividad vinculada al producto con clave de deduplicación, evento CONVERT y el rastro en la solicitud', async () => {
      const result: any = await service.convertRequest(
        admin,
        'r1',
        convertDto('p1'),
      );

      const create = prisma.teamActivity.create.mock.calls[0][0].data;
      expect(create).toEqual(
        expect.objectContaining({
          kind: 'TASK',
          assigneeId: 'admin',
          creatorId: 'admin',
          dedupKey: 'p1|precio-vencido|rev-2026-10',
        }),
      );
      expect(create.links.create).toEqual([
        { targetType: 'PRODUCT', targetId: 'p1', label: 'Taladro percutor' },
      ]);
      expect(create.events.create).toEqual({ actorId: 'admin', type: 'CONVERT' });

      // Rastro en la solicitud: sólo convertedActivityId (historial intacto).
      expect(prisma.teamRequest.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { convertedActivityId: 'act-1' },
      });
      expect(result.conversionCreated).toBe(true);
      expect(result.id).toBe('act-1');
    });

    it('la solicitud NO se borra ni cambia su estado (historial no se borra)', async () => {
      await service.convertRequest(admin, 'r1', convertDto('p1'));

      const update = prisma.teamRequest.update.mock.calls[0][0].data;
      expect(update).toEqual({ convertedActivityId: 'act-1' });
      expect(update).not.toHaveProperty('status');
      expect(prisma.teamRequest.update).toHaveBeenCalledTimes(1);
    });

    it('dos conversiones seguidas de la MISMA solicitud devuelven la misma actividad (1 sola fila)', async () => {
      const primera: any = await service.convertRequest(admin, 'r1', convertDto('p1'));

      // La solicitud ya tiene el rastro: la segunda llamada no escribe nada.
      prisma.teamRequest.findUnique.mockResolvedValue(
        pendingRequest({ convertedActivityId: 'act-1' }),
      );
      prisma.teamActivity.findUnique.mockResolvedValueOnce({
        id: 'act-1',
        kind: 'TASK',
        status: 'PENDING',
      });
      const segunda: any = await service.convertRequest(admin, 'r1', convertDto('p1'));

      expect(segunda.id).toBe(primera.id);
      expect(segunda.conversionCreated).toBe(false);
      expect(prisma.teamActivity.create).toHaveBeenCalledTimes(1);
    });

    it('dos solicitudes distintas con la MISMA combinación producto+regla+revisión → 1 sola actividad', async () => {
      await service.convertRequest(admin, 'r1', convertDto('p1'));

      // Misma combinación para otra solicitud: el chequeo por dedupKey devuelve la existente.
      prisma.teamRequest.findUnique.mockResolvedValue(pendingRequest({ id: 'r2' }));
      // La conversión anterior ya consumió el chequeo previo (fallback null);
      // ahora el mismo `dedupKey` devuelve la actividad existente.
      prisma.teamActivity.findUnique.mockResolvedValueOnce({
        id: 'act-1',
        kind: 'TASK',
        status: 'PENDING',
        dedupKey: 'p1|precio-vencido|rev-2026-10',
      });

      const segunda: any = await service.convertRequest(admin, 'r2', convertDto('p1'));

      expect(segunda.id).toBe('act-1');
      expect(segunda.conversionCreated).toBe(false);
      expect(prisma.teamActivity.create).toHaveBeenCalledTimes(1);
      expect(prisma.teamRequest.update).toHaveBeenLastCalledWith({
        where: { id: 'r2' },
        data: { convertedActivityId: 'act-1' },
      });
    });

    it('una combinación distinta (otra regla) SÍ crea una actividad nueva', async () => {
      await service.convertRequest(admin, 'r1', convertDto('p1'));
      prisma.teamRequest.findUnique.mockResolvedValue(pendingRequest({ id: 'r2' }));
      prisma.teamActivity.findUnique.mockResolvedValue(null);
      prisma.teamActivity.create.mockResolvedValue({ id: 'act-2' });

      await service.convertRequest(admin, 'r2', convertDto('p1', { ruleKey: 'otra-regla' }));

      expect(prisma.teamActivity.create).toHaveBeenCalledTimes(2);
      expect(prisma.teamActivity.create.mock.calls[1][0].data.dedupKey).toBe(
        'p1|otra-regla|rev-2026-10',
      );
    });

    it('ante una carrera (índice único violado) devuelve la actividad creada por el otro proceso', async () => {
      prisma.teamActivity.create.mockRejectedValue(
        Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
      );
      prisma.teamActivity.findUnique
        .mockResolvedValueOnce(null) // chequeo previo: no existe
        .mockResolvedValueOnce({ id: 'act-race', kind: 'TASK' }); // tras el P2002

      const result: any = await service.convertRequest(admin, 'r1', convertDto('p1'));

      expect(result.id).toBe('act-race');
      expect(result.conversionCreated).toBe(false);
    });

    it('asigna por defecto al ACTOR (separa creador, asignado y actor de la ficha)', async () => {
      await service.convertRequest(admin, 'r1', convertDto('p1'));

      const create = prisma.teamActivity.create.mock.calls[0][0].data;
      expect(create.assigneeId).toBe('admin');
      expect(create.creatorId).toBe('admin');
    });
  });
});

/**
 * Aceptación real (BD desechable `grupo_security_tanda_t06`, puerto 54331).
 * URL INLINE, nunca `.env` ni Neon; fixtures sintéticas `base03-convert-*`
 * borradas en `afterAll`. Demuestra que el ÍNDICE ÚNICO de `dedupKey`
 * (no sólo el chequeo transaccional) impide la segunda actividad.
 */
jest.setTimeout(60_000);

const TANDA_T06_URL =
  'postgresql://postgres:tanda-test-2026@localhost:54331/grupo_security_tanda_t06?schema=public';

describe('BASE-03 backend-vinculos — conversión con BD real (t06)', () => {
  const db = new PrismaClient({ datasources: { db: { url: TANDA_T06_URL } } });
  const hierarchy = { getSubordinateIds: jest.fn(async (id: string) => [id]) } as any;
  const grants = { grantsForUser: jest.fn(async () => []) } as any;
  const service = new WorkflowService(db as never, hierarchy, grants);

  const stamp = Date.now();
  const email = `base03-convert-${stamp}@test.local`;
  const ctx = { userId: '', roles: ['Super Admin'] };
  const dedupKey = '';
  let productId: string;
  let requestA: string;
  let requestB: string;

  beforeAll(async () => {
    const author = await db.user.create({
      data: { email, name: 'BASE-03 conversor', password: 'x'.repeat(20), isActive: true },
      select: { id: true },
    });
    ctx.userId = author.id;

    const brand = await db.brand.create({ data: { name: `b03c-${stamp}`, slug: `b03c-${stamp}` } });
    const category = await db.category.create({
      data: { name: `b03c-${stamp}`, slug: `b03c-${stamp}` },
    });
    const product = await db.product.create({
      data: {
        sku: `B03C-${stamp}`,
        name: 'Sierra de banco T06',
        categoryId: category.id,
        brandId: brand.id,
      },
      select: { id: true },
    });
    productId = product.id;

    const a = await db.teamRequest.create({
      data: { kind: 'INCORPORATION', detail: 'Precio vencido en lista', creatorId: ctx.userId },
      select: { id: true },
    });
    const b = await db.teamRequest.create({
      data: { kind: 'INCORPORATION', detail: 'Otra vez el mismo problema', creatorId: ctx.userId },
      select: { id: true },
    });
    requestA = a.id;
    requestB = b.id;
  });

  afterAll(async () => {
    // Limpieza ESCOPADA a las actividades de conversión de este spec:
    // `deleteMany({})` a bulto borraba también los enlaces de
    // `workflow-links.spec.ts` (suites en paralelo) y lo tiraba al azar.
    const own = await db.teamActivity.findMany({
      where: { dedupKey: { not: null } },
      select: { id: true },
    });
    const ownIds = own.map((row) => row.id);
    await db.teamActivityLink.deleteMany({ where: { activityId: { in: ownIds } } });
    await db.teamActivityEvent.deleteMany({ where: { activityId: { in: ownIds } } });
    await db.teamActivity.deleteMany({ where: { id: { in: ownIds } } });
    await db.teamRequest.deleteMany({ where: { id: { in: [requestA, requestB] } } });
    await db.product.deleteMany({ where: { sku: `B03C-${stamp}` } });
    await db.brand.deleteMany({ where: { slug: `b03c-${stamp}` } });
    await db.category.deleteMany({ where: { slug: `b03c-${stamp}` } });
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  });

  const convert = (requestId: string) =>
    service.convertRequest(ctx, requestId, {
      productId,
      ruleKey: 'precio-vencido',
      revisionKey: `rev-${stamp}`,
    } as any);

  it('dos conversiones seguidas de la misma combinación → UNA sola actividad', async () => {
    const primera: any = await convert(requestA);
    const segunda: any = await convert(requestA);

    expect(primera.conversionCreated).toBe(true);
    expect(segunda.conversionCreated).toBe(false);
    expect(segunda.id).toBe(primera.id);

    const key = `${productId}|precio-vencido|rev-${stamp}`;
    expect(primera.dedupKey).toBe(key);
    expect(await db.teamActivity.count({ where: { dedupKey: key } })).toBe(1);
  });

  it('una SEGUNDA solicitud con la misma combinación reutiliza la actividad y conserva ambas', async () => {
    const primera = await db.teamActivity.findFirst({
      where: { dedupKey: `${productId}|precio-vencido|rev-${stamp}` },
      select: { id: true },
    });
    const otra: any = await convert(requestB);

    expect(otra.id).toBe(primera!.id);
    expect(otra.conversionCreated).toBe(false);
    expect(
      await db.teamActivity.count({ where: { dedupKey: `${productId}|precio-vencido|rev-${stamp}` } }),
    ).toBe(1);

    // «Historial no se borra»: ambas solicitudes siguen existiendo y apuntan
    // a la misma actividad.
    const requests = await db.teamRequest.findMany({
      where: { id: { in: [requestA, requestB] } },
      select: { id: true, status: true, convertedActivityId: true },
    });
    expect(requests).toHaveLength(2);
    expect(requests.every((row) => row.status === 'PENDING')).toBe(true);
    expect(requests.every((row) => row.convertedActivityId === otra.id)).toBe(true);
  });

  it('el índice único de dedupKey rechaza en BD una tercera fila con la misma clave', async () => {
    const key = `${productId}|precio-vencido|rev-${stamp}`;
    await expect(
      db.teamActivity.create({
        data: {
          title: 'Duplicado forzado',
          kind: 'TASK',
          startsAt: new Date(),
          assigneeId: ctx.userId,
          creatorId: ctx.userId,
          dedupKey: key,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.teamActivity.count({ where: { dedupKey: key } })).toBe(1);
  });
});
