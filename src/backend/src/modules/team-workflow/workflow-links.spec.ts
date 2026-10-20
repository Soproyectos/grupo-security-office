/**
 * BASE-03 `backend-vinculos` — aceptación textual de la ficha (parte A):
 * «Revocación oculta detalles.»
 *
 * Contrato §6.3: «recurso enlazado cuya concesión se retiró → la actividad
 * conserva trazabilidad pero oculta el detalle del recurso».
 * Diseño (DISENO-CATALOGO:88,91): «Una tarea puede enlazar una lista,
 * producto, importación o revisión. El enlace no concede acceso al elemento.»
 * y «Si se retira acceso al recurso enlazado, se ocultan los detalles
 * internos de la tarea que lo revelen y se bloquea el enlace. Se conserva la
 * trazabilidad con acceso autorizado.»
 *
 * Reglas de la ficha que este spec fija:
 *  - «Tarea/enlace no concede acceso al recurso»: dar de alta un enlace no
 *    escribe concesiones y no cambia NINGUNA decisión de `resolveAccess`;
 *  - la revelación se decide por ACCIÓN de catálogo (`products:read`,
 *    `listas:read`, `listas:import`) con `resolveAccess`, nunca por rol;
 *  - sin concesión vigente → `revealed:false` y sólo `targetType`/`targetId`
 *    (trazabilidad), SIN nombre/estado del recurso;
 *  - Super Admin sigue siendo excepción EXPLÍCITA (data-scope.ts).
 *
 * La prueba de aceptación con concesión real (AccessGrant) vive al final del
 * archivo contra la BD desechable `grupo_security_tanda_t06`.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { WorkflowService } from './workflow.service';
import type { ActivityDto, LinkDto } from './workflow.dto';
import { getActionDefinition } from '../../common/security/access-catalog';
import { resolveAccess } from '../../common/security/data-scope';
import type { AccessIdentity } from '../../common/security/data-scope';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';

const activityDto = (assigneeId: string): ActivityDto => ({
  title: 'Llamada de seguimiento',
  kind: 'CALL',
  assigneeId,
  startsAt: '2026-10-16T15:00:00Z',
});

const linkDto = (targetId: string, targetType = 'PRODUCT'): LinkDto =>
  ({ targetType, targetId: targetId }) as LinkDto;

const identityFor = (userId: string, superAdmin = false): AccessIdentity => ({
  userId,
  jti: `jti-${userId}`,
  verified: true,
  active: true,
  sessionValid: true,
  sessionUserId: userId,
  superAdmin,
});

function buildPrisma() {
  const prisma: any = {
    user: {
      // Directorio de vendedores: devuelve el propio ID pedido.
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
    },
    teamActivityEvent: { create: jest.fn() },
    teamActivityLink: {
      create: jest.fn().mockResolvedValue({
        id: 'l1',
        activityId: 'a1',
        targetType: 'PRODUCT',
        targetId: 'p1',
        label: 'Taladro percutor',
        createdAt: new Date(),
      }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    product: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    lista: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    priceList: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    importSession: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    // Fila de concesión: jamás debe crearse desde este módulo.
    accessGrant: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    accessSource: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    userPermission: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma)),
  };
  return prisma;
}

const grantsService = () =>
  ({ grantsForUser: jest.fn().mockResolvedValue([
    ...['activities:read'].flatMap(actionId => ['own', 'team'].map(scope => ({ sourceId: 'fixture', actionId, scope }))),
    { sourceId: 'fixture', actionId: 'activities:create', scope: 'own' },
    ...['activities:complete', 'activities:assign'].flatMap(actionId => ['own', 'team'].map(scope => ({ sourceId: 'fixture', actionId, scope }))),
  ]) } as any);

describe('BASE-03 backend-vinculos — enlaces y revocación de detalle', () => {
  const seller = { userId: 'seller', roles: ['Vendedor'] };

  let prisma: any;
  let hierarchy: any;
  let grants: any;
  let service: WorkflowService;

  beforeEach(() => {
    prisma = buildPrisma();
    hierarchy = { getSubordinateIds: jest.fn().mockResolvedValue(['seller']) };
    grants = grantsService();
    service = new WorkflowService(prisma, hierarchy, grants);
  });

  describe('añadir y quitar enlace (§5: el enlace no concede acceso)', () => {
    it('devuelve 404 si la actividad no existe, sin escribir el enlace', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue(null);

      await expect(service.addLink(seller, 'a1', linkDto('p1'))).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.teamActivityLink.create).not.toHaveBeenCalled();
    });

    it('devuelve 404 si la actividad es ajena al conjunto del actor (no revela existencia)', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue({
        id: 'a1',
        assigneeId: 'outsider',
        creatorId: 'outsider',
      });

      await expect(service.addLink(seller, 'a1', linkDto('p1'))).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.teamActivityLink.create).not.toHaveBeenCalled();
    });

    it('guarda sólo la referencia y un label denormalizado; la respuesta no revela detalles del recurso', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue({ id: 'a1', assigneeId: 'seller' });
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', name: 'Taladro percutor' });
      prisma.teamActivityLink.create.mockResolvedValue({
        id: 'l1',
        activityId: 'a1',
        targetType: 'PRODUCT',
        targetId: 'p1',
        label: 'Taladro percutor',
        createdAt: new Date(),
      });

      const result: any = await service.addLink(seller, 'a1', linkDto('p1'));

      expect(prisma.teamActivityLink.create).toHaveBeenCalledTimes(1);
      expect(prisma.teamActivityLink.create.mock.calls[0][0].data).toEqual({
        activityId: 'a1',
        targetType: 'PRODUCT',
        targetId: 'p1',
        label: 'Taladro percutor',
      });
      // El alta no revela nada: ni label ni nombre/precio/estado.
      expect(result).not.toHaveProperty('label');
      expect(result).not.toHaveProperty('target');
      expect(result.revealed).toBe(false);
    });

    it('crear un enlace NO escribe ninguna concesión (AccessGrant/AccessSource/UserPermission)', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue({ id: 'a1', assigneeId: 'seller' });
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', name: 'Taladro' });

      await service.addLink(seller, 'a1', linkDto('p1'));

      expect(prisma.accessGrant.create).not.toHaveBeenCalled();
      expect(prisma.accessSource.create).not.toHaveBeenCalled();
      expect(prisma.userPermission.create).not.toHaveBeenCalled();
      expect(grants.grantsForUser).toHaveBeenCalledTimes(1);
    });

    it('un enlace duplicado (actividad+tipo+recurso) responde 409, no crea una segunda fila', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue({ id: 'a1', assigneeId: 'seller' });
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', name: 'Taladro' });
      prisma.teamActivityLink.create.mockRejectedValue(
        Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
      );

      await expect(service.addLink(seller, 'a1', linkDto('p1'))).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.teamActivityLink.create).toHaveBeenCalledTimes(1);
    });

    it('quitar un enlace de una actividad ajena responde 404', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue({
        id: 'a1',
        assigneeId: 'outsider',
      });

      await expect(service.removeLink(seller, 'a1', 'l1')).rejects.toThrow(NotFoundException);
      expect(prisma.teamActivityLink.deleteMany).not.toHaveBeenCalled();
    });

    it('quitar un enlace inexistente responde 404 y quitar uno propio responde ok', async () => {
      prisma.teamActivity.findUnique.mockResolvedValue({ id: 'a1', assigneeId: 'seller' });
      prisma.teamActivityLink.deleteMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.removeLink(seller, 'a1', 'l9')).rejects.toThrow(NotFoundException);

      prisma.teamActivityLink.deleteMany.mockResolvedValueOnce({ count: 1 });
      await expect(service.removeLink(seller, 'a1', 'l1')).resolves.toEqual({ ok: true });
      expect(prisma.teamActivityLink.deleteMany).toHaveBeenCalledWith({
        where: { id: 'l1', activityId: 'a1' },
      });
    });
  });

  describe('leer con revocación (aceptación §6.3)', () => {
    const storedLink = (extra: Record<string, unknown> = {}) => ({
      id: 'l1',
      activityId: 'a1',
      targetType: 'PRODUCT',
      targetId: 'p1',
      label: 'Taladro percutor',
      createdAt: new Date(),
      ...extra,
    });

    beforeEach(() => {
      prisma.teamActivity.findMany.mockResolvedValue([
        { id: 'a1', assigneeId: 'seller', creatorId: 'seller', links: [storedLink()] },
      ]);
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'Taladro percutor', sku: 'TAL-01', listaId: 'lista1', publishStatus: 'borrador' },
      ]);
    });

    it('incluye los enlaces en la consulta de actividades', async () => {
      await service.activities(seller);
      expect(prisma.teamActivity.findMany.mock.calls[0][0].include).toEqual(
        expect.objectContaining({ links: expect.anything() }),
      );
    });

    it('SIN concesión: revealed:false y sólo tipo+id (sin nombre, sin label, sin target)', async () => {
      const rows: any = await service.activities(seller);
      const link = rows[0].links[0];

      expect(link).toEqual({
        id: 'l1',
        targetType: 'PRODUCT',
        targetId: 'p1',
        revealed: false,
      });
      expect(link).not.toHaveProperty('label');
      expect(link).not.toHaveProperty('target');
      expect(JSON.stringify(link)).not.toContain('Taladro percutor');
    });

    it('CON concesión vigente (products:read, alcance list): revealed:true + label y detalle', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 'activity-read', actionId: 'activities:read', scope: 'own' },
        { sourceId: 'src1', actionId: 'products:read', scope: 'list', resourceId: 'lista1' },
      ]);

      const rows: any = await service.activities(seller);
      const link = rows[0].links[0];

      expect(link.revealed).toBe(true);
      expect(link.label).toBe('Taladro percutor');
      expect(link.target).toEqual(
        expect.objectContaining({ id: 'p1', name: 'Taladro percutor', sku: 'TAL-01' }),
      );
      // Detalle de recurso: nunca precios (products:read no los incluye).
      expect(link.target).not.toHaveProperty('price');
    });

    it('Super Admin (excepción explícita del resolver) ve el detalle sin concesión', async () => {
      const rows: any = await service.activities({ userId: 'seller', roles: ['Super Admin'] });
      expect(rows[0].links[0].revealed).toBe(true);
      expect(rows[0].links[0].target.name).toBe('Taladro percutor');
    });

    it('concesión de OTRA acción no revela (se evalúa por acción, ficha regla 1)', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 'activity-read', actionId: 'activities:read', scope: 'own' },
        { sourceId: 'src1', actionId: 'listas:read', scope: 'global' },
      ]);

      const rows: any = await service.activities(seller);
      expect(rows[0].links[0].revealed).toBe(false);
    });

    it('recurso PRODUCTO borrado: con concesión global sigue revelando trazabilidad sin target', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 'activity-read', actionId: 'activities:read', scope: 'own' },
        { sourceId: 'src1', actionId: 'products:read', scope: 'global' },
      ]);

      const rows: any = await service.activities(seller);
      const link = rows[0].links[0];

      expect(link.revealed).toBe(true);
      expect(link.target).toBeNull();
      expect(link.label).toBe('Taladro percutor');
    });

    it('LISTA de precios: se evalúa con listas:read (acción de catálogo)', async () => {
      prisma.teamActivity.findMany.mockResolvedValue([
        {
          id: 'a1',
          assigneeId: 'seller',
          creatorId: 'seller',
          links: [storedLink({ id: 'l2', targetType: 'PRICE_LIST', targetId: 'lista1', label: 'Lista Mayoristas' })],
        },
      ]);
      prisma.priceList.findMany.mockResolvedValue([
        { id: 'lista1', name: 'Lista Mayoristas', code: 'MAY-1', isActive: true, currency: 'COP' },
      ]);

      const oculto: any = await service.activities(seller);
      expect(oculto[0].links[0].revealed).toBe(false);

      grants.grantsForUser.mockResolvedValue([
        { sourceId: 'activity-read', actionId: 'activities:read', scope: 'own' },
        { sourceId: 'src1', actionId: 'listas:read', scope: 'list', resourceId: 'lista1' },
      ]);
      const visible: any = await service.activities(seller);
      expect(visible[0].links[0].revealed).toBe(true);
      expect(visible[0].links[0].target).toEqual(
        expect.objectContaining({ name: 'Lista Mayoristas', code: 'MAY-1' }),
      );
    });

    it('LISTA de catálogo (la única pertenencia del producto): se evalúa con listas:read', async () => {
      prisma.teamActivity.findMany.mockResolvedValue([
        {
          id: 'a1',
          assigneeId: 'seller',
          creatorId: 'seller',
          links: [storedLink({ id: 'l4', targetType: 'LISTA', targetId: 'lista-9', label: 'Lista Oro' })],
        },
      ]);
      prisma.lista.findMany.mockResolvedValue([
        { id: 'lista-9', name: 'Lista Oro', code: 'ORO', isActive: true, currency: 'COP' },
      ]);

      const oculto: any = await service.activities(seller);
      expect(oculto[0].links[0].revealed).toBe(false);

      grants.grantsForUser.mockResolvedValue([
        { sourceId: 'activity-read', actionId: 'activities:read', scope: 'own' },
        { sourceId: 'src1', actionId: 'listas:read', scope: 'list', resourceId: 'lista-9' },
      ]);
      const visible: any = await service.activities(seller);
      expect(visible[0].links[0].revealed).toBe(true);
      expect(visible[0].links[0].target).toEqual(
        expect.objectContaining({ name: 'Lista Oro', code: 'ORO' }),
      );
    });

    it('IMPORTACIÓN: se evalúa con listas:import (acción ya existente del catálogo)', async () => {
      prisma.teamActivity.findMany.mockResolvedValue([
        {
          id: 'a1',
          assigneeId: 'seller',
          creatorId: 'seller',
          links: [storedLink({ id: 'l3', targetType: 'IMPORT_SESSION', targetId: 'imp-1', label: null })],
        },
      ]);
      prisma.importSession.findMany.mockResolvedValue([
        { id: 'imp-1', userId: 'seller', createdAt: new Date('2026-10-14T10:00:00Z') },
      ]);

      const oculto: any = await service.activities(seller);
      expect(oculto[0].links[0]).toEqual({
        id: 'l3',
        targetType: 'IMPORT_SESSION',
        targetId: 'imp-1',
        revealed: false,
      });

      grants.grantsForUser.mockResolvedValue([
        { sourceId: 'activity-read', actionId: 'activities:read', scope: 'own' },
        { sourceId: 'src1', actionId: 'listas:import', scope: 'global' },
      ]);
      const visible: any = await service.activities(seller);
      expect(visible[0].links[0].revealed).toBe(true);
      expect(visible[0].links[0].target).toEqual(
        expect.objectContaining({ id: 'imp-1' }),
      );
    });

    it('las acciones usadas para revelar existen y están habilitadas en el catálogo', () => {
      // Mapeo {tipo de enlace → acción} fijado por este incremento.
      expect(getActionDefinition('products:read')?.enabled).toBe(true);
      expect(getActionDefinition('listas:read')?.enabled).toBe(true);
      expect(getActionDefinition('listas:import')?.enabled).toBe(true);
      expect(getActionDefinition('listas:read')?.allowedScopes).toEqual(['list', 'global']);
    });

    it('tener un enlace NO cambia ninguna decisión de resolveAccess', async () => {
      const input = {
        identity: identityFor('seller'),
        actionId: 'products:read',
        grants: [],
        resource: { id: 'p1', kind: 'product' as const, productId: 'p1' },
      };
      const antes = resolveAccess(input);

      prisma.teamActivity.findUnique.mockResolvedValue({ id: 'a1', assigneeId: 'seller' });
      prisma.product.findUnique.mockResolvedValue({ id: 'p1', name: 'Taladro' });
      await service.addLink(seller, 'a1', linkDto('p1'));

      const despues = resolveAccess(input);
      expect(antes.allowed).toBe(false);
      expect(despues).toEqual(antes);
      expect(despues.allowed).toBe(false);
    });
  });
});

/**
 * Aceptación real (BD desechable `grupo_security_tanda_t06`, puerto 54331).
 * NUNCA `.env` ni Neon: la URL va INLINE y sólo se crean fixtures sintéticas
 * con email `base03-vinculos-*`, borradas en `afterAll`.
 *
 * Caso textual de la ficha: «usuario con concesión → ve detalle del enlace;
 * se retira la concesión → misma lectura → revealed:false sin datos del
 * recurso» (contrato §6.3).
 */
jest.setTimeout(60_000);

const TANDA_T06_URL =
  'postgresql://postgres:tanda-test-2026@localhost:54331/grupo_security_tanda_t06?schema=public';

describe('BASE-03 backend-vinculos — aceptación con concesión real (t06)', () => {
  const db = new PrismaClient({ datasources: { db: { url: TANDA_T06_URL } } });
  const grants = new AccessAssignmentsService(db as never);
  const hierarchy = { getSubordinateIds: jest.fn(async (id: string) => [id]) } as any;
  const service = new WorkflowService(db as never, hierarchy, grants);

  const stamp = Date.now();
  const email = `base03-vinculos-reader-${stamp}@test.local`;
  const ctx = { userId: '', roles: ['Vendedor'] };
  let activityId: string;
  let productId: string;
  let listaId: string;
  let sourceId: string;
  let activitySourceId: string;
  let grantId: string;

  beforeAll(async () => {
    const reader = await db.user.create({
      data: { email, name: 'BASE-03 lector', password: 'x'.repeat(20), isActive: true },
      select: { id: true },
    });
    ctx.userId = reader.id;
    await db.accessState.upsert({ where: { userId: ctx.userId }, create: { userId: ctx.userId }, update: {} });
    const activitySource = await db.accessSource.create({
      data: { userId: ctx.userId, kind: 'manual', catalogVersion: 'panels-20261019-3',
        grantedById: ctx.userId, reason: 'fixture agenda BASE-03' },
    });
    activitySourceId = activitySource.id;
    await db.accessGrant.createMany({ data: [
      { sourceId: activitySourceId, actionId: 'activities:read', scopeKind: 'own', resourceId: '' },
      { sourceId: activitySourceId, actionId: 'activities:create', scopeKind: 'own', resourceId: '' },
    ] });

    const brand = await db.brand.create({
      data: { name: `base03-${stamp}`, slug: `base03-${stamp}` },
    });
    const category = await db.category.create({
      data: { name: `base03-${stamp}`, slug: `base03-${stamp}` },
    });
    // El producto pertenece a una `Lista` de catálogo (ADR-20261014:
    // `Product.listaId` es la única pertenencia), no a un `PriceList`.
    const lista = await db.lista.create({
      data: { name: `base03-${stamp}`, code: `B03-${stamp}` },
    });
    listaId = lista.id;
    const product = await db.product.create({
      data: {
        sku: `BASE03-${stamp}`,
        name: 'Taladro percutor T06',
        categoryId: category.id,
        brandId: brand.id,
        listaId: lista.id,
      },
      select: { id: true },
    });
    productId = product.id;

    // La fixture de lector no recibe activities:create: la actividad de
    // prueba se prepara con la excepción explícita de Super Admin.
    const activity = await service.createActivity({ userId: ctx.userId, roles: ['Super Admin'] }, {
      title: 'Revisar incidencia del producto',
      kind: 'CALL',
      assigneeId: ctx.userId,
      startsAt: '2026-10-16T15:00:00Z',
    } as ActivityDto);
    activityId = activity.id;
  });

  afterAll(async () => {
    await db.teamActivityLink.deleteMany({ where: { activityId } });
    await db.teamActivityEvent.deleteMany({ where: { activityId } });
    await db.teamActivity.deleteMany({ where: { id: activityId } });
    await db.accessGrant.deleteMany({ where: { source: { userId: ctx.userId } } });
    await db.accessSource.deleteMany({ where: { userId: ctx.userId } });
    await db.accessState.deleteMany({ where: { userId: ctx.userId } });
    await db.product.deleteMany({ where: { sku: `BASE03-${stamp}` } });
    await db.lista.deleteMany({ where: { code: `B03-${stamp}` } });
    await db.brand.deleteMany({ where: { slug: `base03-${stamp}` } });
    await db.category.deleteMany({ where: { slug: `base03-${stamp}` } });
    await db.user.deleteMany({ where: { email } });
    await db.$disconnect();
  });

  it('dar de alta el enlace no crea ninguna concesión y la lectura oculta el detalle', async () => {
    const link: any = await service.addLink(ctx, activityId, {
      targetType: 'PRODUCT',
      targetId: productId,
    } as LinkDto);

    expect(link).not.toHaveProperty('label');
    expect(await db.accessGrant.count({ where: { source: { userId: ctx.userId }, actionId: 'products:read' } })).toBe(0);

    const rows: any = await service.activities(ctx);
    const target = rows.find((row: any) => row.id === activityId);
    expect(target.links).toHaveLength(1);
    expect(target.links[0]).toEqual({
      id: link.id,
      targetType: 'PRODUCT',
      targetId: productId,
      revealed: false,
    });
    expect(JSON.stringify(target.links[0])).not.toContain('Taladro percutor');
  });

  it('con AccessGrant vigente (products:read, alcance list) la MISMA lectura revela label y detalle', async () => {
    // `AccessSource.userId` apunta a `access_states`, no a `users`: el estado
    // de versión (OCC) lo crea el alta de concesiones y aquí se replica a mano.
    await db.accessState.upsert({ where: { userId: ctx.userId }, create: { userId: ctx.userId }, update: {} });
    const source = await db.accessSource.create({
      data: {
        userId: ctx.userId,
        kind: 'manual',
        catalogVersion: 'base02-1',
        grantedById: ctx.userId,
        reason: 'fixture BASE-03 backend-vinculos',
      },
    });
    sourceId = source.id;
    const grant = await db.accessGrant.create({
      data: {
        sourceId: source.id,
        actionId: 'products:read',
        scopeKind: 'list',
        resourceId: listaId,
      },
    });
    grantId = grant.id;

    const rows: any = await service.activities(ctx);
    const target = rows.find((row: any) => row.id === activityId);
    expect(target.links[0].revealed).toBe(true);
    expect(target.links[0].label).toBe('Taladro percutor T06');
    expect(target.links[0].target).toEqual(
      expect.objectContaining({ id: productId, name: 'Taladro percutor T06', listaId }),
    );
  });

  it('retirar la fila AccessGrant → la MISMA lectura devuelve revealed:false sin datos del recurso', async () => {
    await db.accessGrant.delete({ where: { id: grantId } });

    const rows: any = await service.activities(ctx);
    const target = rows.find((row: any) => row.id === activityId);

    // La actividad conserva trazabilidad…
    expect(target.id).toBe(activityId);
    expect(target.links).toHaveLength(1);
    expect(target.links[0].targetId).toBe(productId);
    // …pero oculta el detalle del recurso revocado (§6.3).
    expect(target.links[0]).toEqual({
      id: target.links[0].id,
      targetType: 'PRODUCT',
      targetId: productId,
      revealed: false,
    });
    expect(target.links[0]).not.toHaveProperty('label');
    expect(target.links[0]).not.toHaveProperty('target');
    expect(JSON.stringify(target)).not.toContain('Taladro percutor');

    await db.accessSource.delete({ where: { id: sourceId } });
  });

  it('Super Admin (excepción explícita) revela el detalle aunque no haya concesión', async () => {
    const rows: any = await service.activities({ userId: ctx.userId, roles: ['Super Admin'] });
    const target = rows.find((row: any) => row.id === activityId);

    expect(target.links[0].revealed).toBe(true);
    expect(target.links[0].target.name).toBe('Taladro percutor T06');
  });
});
