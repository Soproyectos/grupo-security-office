/**
 * BASE-04 unidad 2 — concesiones por acción+alcance con procedencia
 * (BASE-04 §7.2, §8; BASE-02 §5.2). Ejecuta contra la base desechable
 * `grupo_security_tanda_t05` con DATABASE_URL INLINE (nunca `.env` ni Neon):
 * sólo fixtures sintéticas creadas por este spec, nunca usuarios reales y
 * nunca la base viva de la API (3001).
 *
 * RED observado: estos specs deben fallar mientras `./access-assignments.service`
 * no exista (Cannot find module).
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ACCESS_CATALOG_VERSION } from './access-catalog';
import { resolveAccess } from './data-scope';
import type { AccessIdentity } from './data-scope';
import { AccessAssignmentsService } from './access-assignments.service';

jest.setTimeout(60_000);

const DATABASE_URL =
  'postgresql://postgres:tanda-test-2026@localhost:54331/grupo_security_tanda_t05?schema=public';

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
const service = new AccessAssignmentsService(prisma as never);

const created: string[] = [];

async function createUser(label: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `base04-spec-${label}-${created.length}-${Date.now()}@example.test`,
      name: `BASE-04 fixture ${label}`,
      password: 'x'.repeat(20),
      isActive: true,
    },
    select: { id: true },
  });
  created.push(user.id);
  return user.id;
}

function identityFor(userId: string, superAdmin = true): AccessIdentity {
  return {
    userId,
    jti: `jti-${userId}`,
    verified: true,
    active: true,
    sessionValid: true,
    sessionUserId: userId,
    superAdmin,
  };
}

async function versionOf(userId: string): Promise<number> {
  const state = await prisma.accessState.findUnique({ where: { userId } });
  return state?.version ?? 0;
}

async function sourceCount(userId: string): Promise<number> {
  return prisma.accessSource.count({ where: { userId } });
}

async function grantCount(userId: string): Promise<number> {
  return prisma.accessGrant.count({ where: { source: { userId } } });
}

function conflictCode(error: unknown): string | undefined {
  const body = (error as { response?: { code?: string } })?.response;
  return body?.code;
}

async function cleanup() {
  await prisma.auditLog.deleteMany({
    where: { entity: 'UserAccess', entityId: { in: created } },
  });
  await prisma.accessOperation.deleteMany({
    where: { OR: created.map((id) => ({ actorId: id })), },
  });
  await prisma.accessOperation.deleteMany({
    where: { OR: created.map((id) => ({ targetId: id })) },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'base04-spec-' } } });
}

describe('AccessAssignmentsService (BASE-04 §7.2, §8)', () => {
  let actorId: string;
  let actor: AccessIdentity;
  let recipientId: string;
  let recipient: AccessIdentity;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    actorId = await createUser('actor');
    actor = identityFor(actorId, true);
    recipientId = await createUser('recipient');
    recipient = identityFor(recipientId, false);
  });

  afterEach(async () => {
    await cleanup();
    created.length = 0;
  });

  describe('alta de una fuente con procedencia', () => {
    it('registra alta y retiro aunque el cliente no envíe clave de idempotencia', async () => {
      const added = await service.replaceSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'tarea comercial' },
        grants: [{ actionId: 'customers:read', scope: 'team' }],
      });
      await service.removeSource(actor, recipientId, added.sourceId, {
        expectedVersion: added.accessVersion,
      });
      const operations = await prisma.accessOperation.findMany({
        where: { targetId: recipientId }, orderBy: { createdAt: 'asc' },
      });
      expect(operations).toHaveLength(2);
      expect(operations.map((operation) => operation.actionId)).toEqual(['replaceSource', 'removeSource']);
      expect(operations.every((operation) => operation.actorId === actorId)).toBe(true);
      expect(operations[1]?.result).toMatchObject({
        removedGrants: [{ actionId: 'customers:read', scopeKind: 'team', resourceId: '' }],
      });
      const audit = await prisma.auditLog.findMany({
        where: { entity: 'UserAccess', entityId: recipientId }, orderBy: { createdAt: 'asc' },
      });
      expect(audit).toHaveLength(2);
      expect(audit.map((entry) => entry.action)).toEqual(['replaceSource', 'removeSource']);
      expect(audit[1]?.oldValues).toMatchObject({
        grants: [{ actionId: 'customers:read', scopeKind: 'team', resourceId: '' }],
      });
    });

    it('repetir el retiro con la misma clave devuelve el recibo sin exigir la fuente borrada', async () => {
      const added = await service.replaceSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        grants: [{ actionId: 'customers:read', scope: 'team' }],
      });
      const options = { expectedVersion: added.accessVersion, idempotencyKey: 'remove-retry-1' };
      const first = await service.removeSource(actor, recipientId, added.sourceId, options);
      const replay = await service.removeSource(actor, recipientId, added.sourceId, options);
      expect(replay.replayed).toBe(true);
      expect(replay.accessVersion).toBe(first.accessVersion);
      expect(await versionOf(recipientId)).toBe(first.accessVersion);
      expect(await prisma.accessOperation.count({ where: { targetId: recipientId } })).toBe(2);
    });

    it('crea la fuente, sus grants y versiona el estado del usuario', async () => {
      const receipt = await service.replaceSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'alta inicial' },
        grants: [{ actionId: 'customers:read', scope: 'team' }],
      });

      expect(receipt.accessVersion).toBe(1);
      expect(receipt.changed).toBe(true);
      expect(receipt.sourceId).toBeTruthy();
      expect(await versionOf(recipientId)).toBe(1);
      expect(await sourceCount(recipientId)).toBe(1);
      expect(await grantCount(recipientId)).toBe(1);

      const grants = await service.grantsForUser(recipientId);
      expect(grants).toEqual([
        {
          sourceId: receipt.sourceId,
          actionId: 'customers:read',
          scope: 'team',
        },
      ]);
    });

    it('expone las fuentes vigentes con su procedencia (§4 sources(actionId))', async () => {
      const receipt = await service.replaceSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'paquete vendedor' },
        grants: [{ actionId: 'customers:read', scope: 'team' }],
      });

      const sources = await service.sourcesFor(recipientId, 'customers:read');
      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({
        id: receipt.sourceId,
        kind: 'manual',
        catalogVersion: ACCESS_CATALOG_VERSION,
        grantedById: actorId,
        reason: 'paquete vendedor',
      });
      expect(await service.sourcesFor(recipientId, 'customers:edit')).toHaveLength(0);
    });
  });

  describe('caso 7.2 — retirar una concesión conserva otra vigente', () => {
    it('retirar UNA fuente conserva los grants de la otra fuente del mismo permiso', async () => {
      const fuenteA = await service.replaceSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'paquete de equipo' },
        grants: [{ actionId: 'customers:read', scope: 'team' }],
      });
      const fuenteB = await service.replaceSource(actor, recipientId, {
        expectedVersion: fuenteA.accessVersion,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'segunda asignación' },
        grants: [{ actionId: 'customers:read', scope: 'own' }],
      });

      await service.removeSource(actor, recipientId, fuenteA.sourceId!, {
        expectedVersion: fuenteB.accessVersion,
        catalogVersion: ACCESS_CATALOG_VERSION,
      });

      expect(await sourceCount(recipientId)).toBe(1);
      const grants = await service.grantsForUser(recipientId);
      expect(grants).toHaveLength(1);
      expect(grants[0].sourceId).toBe(fuenteB.sourceId);

      const decision = resolveAccess({
        identity: recipient,
        actionId: 'customers:read',
        grants,
        resource: { id: 'c-1', ownerId: recipientId },
      });
      expect(decision.allowed).toBe(true);
      expect(decision.scope).toBe('own');
      expect(decision.sources).toEqual([fuenteB.sourceId]);
    });

    it('conserva la otra fuente aunque ambas concedan exactamente la misma acción+alcance', async () => {
      const manual = await service.replaceSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'manual' },
        grants: [{ actionId: 'targets:read', scope: 'team' }],
      });
      const plantilla = await service.replaceSource(actor, recipientId, {
        expectedVersion: manual.accessVersion,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'segunda asignación' },
        grants: [{ actionId: 'targets:read', scope: 'team' }],
      });

      await service.removeSource(actor, recipientId, manual.sourceId!, {
        expectedVersion: plantilla.accessVersion,
        catalogVersion: ACCESS_CATALOG_VERSION,
      });

      const grants = await service.grantsForUser(recipientId);
      expect(grants).toHaveLength(1);
      expect(grants[0].sourceId).toBe(plantilla.sourceId);
      expect(grants[0]).toMatchObject({ actionId: 'targets:read', scope: 'team' });

      const decision = resolveAccess({
        identity: recipient,
        actionId: 'targets:read',
        grants,
      });
      expect(decision.allowed).toBe(true);
    });
  });

  describe('caso 7.2 — el retiro total deniega con el JWT anterior', () => {
    it('sin grants restantes el resolver deniega sin revocar la sesión', async () => {
      const fuenteA = await service.replaceSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'manual' },
        grants: [{ actionId: 'customers:read', scope: 'team' }],
      });
      const fuenteB = await service.replaceSource(actor, recipientId, {
        expectedVersion: fuenteA.accessVersion,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'segunda asignación' },
        grants: [{ actionId: 'customers:read', scope: 'own' }],
      });

      await service.removeSource(actor, recipientId, fuenteA.sourceId!, {
        expectedVersion: fuenteB.accessVersion,
        catalogVersion: ACCESS_CATALOG_VERSION,
      });
      const trasRetiroParcial = await service.grantsForUser(recipientId);
      expect(trasRetiroParcial).toHaveLength(1);

      const ultima = await service.removeSource(actor, recipientId, fuenteB.sourceId!, {
        expectedVersion: fuenteB.accessVersion + 1,
        catalogVersion: ACCESS_CATALOG_VERSION,
      });
      expect(ultima.accessVersion).toBe(fuenteB.accessVersion + 2);
      expect(await grantCount(recipientId)).toBe(0);

      // La identidad construida desde el JWT anterior sigue siendo de sesión
      // viva (COM-01 exige revocar sin cerrar sesión), pero ya no concede nada.
      const identityDelTokenAntiguo = identityFor(recipientId, false);
      expect(identityDelTokenAntiguo.sessionValid).toBe(true);
      const decision = resolveAccess({
        identity: identityDelTokenAntiguo,
        actionId: 'customers:read',
        grants: await service.grantsForUser(recipientId),
        resource: { id: 'c-1', ownerId: recipientId },
        clientDeclaredScope: 'global',
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('no-covering-grant');
    });
  });

  describe('conflictos → 409 (§8)', () => {
    it('versión desactualizada → 409 access-version-conflict sin escribir nada', async () => {
      const primera = await service.replaceSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'manual' },
        grants: [{ actionId: 'customers:read', scope: 'team' }],
      });

      let error: unknown;
      try {
        await service.replaceSource(actor, recipientId, {
          expectedVersion: 0, // desactualizado a propósito
          catalogVersion: ACCESS_CATALOG_VERSION,
          source: { kind: 'manual', reason: 'manual' },
          grants: [{ actionId: 'customers:read', scope: 'global' }],
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(ConflictException);
      expect(conflictCode(error)).toBe('access-version-conflict');
      expect((error as ConflictException).getResponse()).toMatchObject({ currentVersion: 1 });
      // Transaccional: la versión y los grants no avanzaron.
      expect(await versionOf(recipientId)).toBe(1);
      expect(await grantCount(recipientId)).toBe(1);
      expect((await service.grantsForUser(recipientId))[0]).toEqual({
        sourceId: primera.sourceId,
        actionId: 'customers:read',
        scope: 'team',
      });
    });

    it('catálogo desactualizado → 409 catalog-version-conflict', async () => {
      let error: unknown;
      try {
        await service.replaceSource(actor, recipientId, {
          expectedVersion: 0,
          catalogVersion: 'base02-0',
          source: { kind: 'manual', reason: 'manual' },
          grants: [{ actionId: 'customers:read', scope: 'team' }],
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ConflictException);
      expect(conflictCode(error)).toBe('catalog-version-conflict');
      expect((error as ConflictException).getResponse()).toMatchObject({
        currentCatalogVersion: ACCESS_CATALOG_VERSION,
      });
      expect(await versionOf(recipientId)).toBe(0);
    });

    it('idempotencia: el mismo key+payload no duplica y el mismo key con otro payload da 409', async () => {
      const input = {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        idempotencyKey: 'op-revocable-1',
        source: { kind: 'manual' as const, reason: 'manual' },
        grants: [{ actionId: 'customers:read', scope: 'team' as const }],
      };
      const primera = await service.replaceSource(actor, recipientId, input);
      const replay = await service.replaceSource(actor, recipientId, input);

      expect(replay.replayed).toBe(true);
      expect(replay.accessVersion).toBe(primera.accessVersion);
      expect(await sourceCount(recipientId)).toBe(1);
      expect(await grantCount(recipientId)).toBe(1);
      expect(await prisma.accessOperation.count({ where: { targetId: recipientId } })).toBe(1);

      let error: unknown;
      try {
        await service.replaceSource(actor, recipientId, {
          ...input,
          grants: [{ actionId: 'customers:read', scope: 'global' }],
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ConflictException);
      expect(conflictCode(error)).toBe('idempotency-conflict');
      expect(await grantCount(recipientId)).toBe(1);
    });
  });

  describe('sin autoconcesión: sólo Super Admin asigna (ficha regla 3)', () => {
    it('un identidad no-Super Admin recibe 403, también hacia su propia cuenta', async () => {
      await expect(
        service.replaceSource(recipient, recipientId, {
          expectedVersion: 0,
          catalogVersion: ACCESS_CATALOG_VERSION,
          source: { kind: 'manual', reason: 'auto' },
          grants: [{ actionId: 'customers:read', scope: 'global' }],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      await expect(
        service.replaceSource(recipient, actorId, {
          expectedVersion: 0,
          catalogVersion: ACCESS_CATALOG_VERSION,
          source: { kind: 'manual', reason: 'escalada' },
          grants: [{ actionId: 'customers:read', scope: 'global' }],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(await sourceCount(recipientId)).toBe(0);
      expect(await sourceCount(actorId)).toBe(0);
    });

    it('la excepción explícita de Super Admin permite conceder a su propia cuenta', async () => {
      const receipt = await service.replaceSource(actor, actorId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'super admin sobre sí mismo' },
        grants: [{ actionId: 'customers:read', scope: 'team' }],
      });
      expect(receipt.accessVersion).toBe(1);
      expect(await grantCount(actorId)).toBe(1);
    });

    it('identidad de sesión inválida → 401', async () => {
      const invalida: AccessIdentity = { ...actor, sessionValid: false };
      await expect(
        service.replaceSource(invalida, recipientId, {
          expectedVersion: 0,
          catalogVersion: ACCESS_CATALOG_VERSION,
          source: { kind: 'manual', reason: 'x' },
          grants: [{ actionId: 'customers:read', scope: 'team' }],
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('entrada inválida → 400 sin escrituras (§8)', () => {
    const base = (grants: Array<Record<string, unknown>>) => ({
      expectedVersion: 0,
      catalogVersion: ACCESS_CATALOG_VERSION,
      source: { kind: 'manual' as const, reason: 'manual' },
      grants,
    });

    it.each([
      ['acción desconocida', [{ actionId: 'customers:export', scope: 'team' }]],
      ['formato legacy', [{ actionId: 'dashboard:pack:ventas', scope: 'team' }]],
      ['acción deshabilitada', [{ actionId: 'stockRequests:read', scope: 'team' }]],
      ['alcance no permitido', [{ actionId: 'products:read', scope: 'own', resourceId: 'L1' }]],
      ['alcance desconocido', [{ actionId: 'customers:read', scope: 'teame' }]],
      ['falta resourceId en alcance list', [{ actionId: 'products:read', scope: 'list' }]],
    ])('%s → 400', async (_label, grants) => {
      await expect(service.replaceSource(actor, recipientId, base(grants) as never))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(await sourceCount(recipientId)).toBe(0);
      expect(await versionOf(recipientId)).toBe(0);
    });

    it('destino inexistente → 404', async () => {
      await expect(
        service.replaceSource(actor, 'usuario-inexistente', base([
          { actionId: 'customers:read', scope: 'team' },
        ]) as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('dependencias se comprueban en servidor (BASE-02 §5.3)', () => {
    it('conceder customers:edit sin customers:read → 400', async () => {
      await expect(
        service.replaceSource(actor, recipientId, {
          expectedVersion: 0,
          catalogVersion: ACCESS_CATALOG_VERSION,
          source: { kind: 'manual', reason: 'manual' },
          grants: [{ actionId: 'customers:edit', scope: 'own' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await versionOf(recipientId)).toBe(0);
    });

    it('conceder products:publish sin products:write → 400 (Publicar en tienda es complemento de Fichas)', async () => {
      await expect(
        service.replaceSource(actor, recipientId, {
          expectedVersion: 0,
          catalogVersion: ACCESS_CATALOG_VERSION,
          source: { kind: 'manual', reason: 'manual' },
          grants: [{ actionId: 'products:read', scope: 'global' }, { actionId: 'products:publish', scope: 'global' }],
        }),
      ).rejects.toThrow(/products:write/);
      expect(await versionOf(recipientId)).toBe(0);
    });

    it('Publicar en tienda se puede asignar cuando otra asignación ya concede products:write', async () => {
      const update = await service.replaceSource(actor, recipientId, {
        expectedVersion: 0, catalogVersion: ACCESS_CATALOG_VERSION, source: { kind: 'manual', reason: 'fichas' },
        grants: [{ actionId: 'products:read', scope: 'global' }, { actionId: 'products:write', scope: 'global' }],
      });
      const publish = await service.replaceSource(actor, recipientId, {
        expectedVersion: update.accessVersion, catalogVersion: ACCESS_CATALOG_VERSION, source: { kind: 'manual', reason: 'publicar' },
        grants: [{ actionId: 'products:publish', scope: 'global' }],
      });
      expect(publish.accessVersion).toBe(update.accessVersion + 1);
      const grants = await service.grantsForUser(recipientId);
      expect(grants.some((grant) => grant.sourceId === publish.sourceId && grant.actionId === 'products:publish')).toBe(true);
      expect(grants.some((grant) => grant.sourceId === update.sourceId && grant.actionId === 'products:write')).toBe(true);
    });

    it('la dependencia satisfecha por OTRA fuente vigente sí permite el alta', async () => {
      const read = await service.replaceSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'manual' },
        grants: [{ actionId: 'customers:read', scope: 'team' }],
      });
      const edit = await service.replaceSource(actor, recipientId, {
        expectedVersion: read.accessVersion,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'segunda asignación' },
        grants: [{ actionId: 'customers:edit', scope: 'own' }],
      });
      expect(edit.accessVersion).toBe(2);
      expect(await grantCount(recipientId)).toBe(2);
    });

    it('un retiro nunca queda bloqueado por una dependencia y es transaccional', async () => {
      const fuente = await service.replaceSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'manual' },
        grants: [
          { actionId: 'customers:read', scope: 'team' },
          { actionId: 'customers:edit', scope: 'own' },
        ],
      });

      // Sustituir read+edit por edit sólo rompe la dependencia → 400 y TODO se
      // revierte (ni la versión ni los grants avanzan).
      await expect(
        service.replaceSource(actor, recipientId, {
          expectedVersion: fuente.accessVersion,
          catalogVersion: ACCESS_CATALOG_VERSION,
          source: { sourceId: fuente.sourceId, kind: 'manual', reason: 'manual' },
          grants: [{ actionId: 'customers:edit', scope: 'own' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(await versionOf(recipientId)).toBe(fuente.accessVersion);
      expect(await grantCount(recipientId)).toBe(2);

      // El retiro completo de la fuente sí está permitido.
      const retiro = await service.removeSource(actor, recipientId, fuente.sourceId!, {
        expectedVersion: fuente.accessVersion,
        catalogVersion: ACCESS_CATALOG_VERSION,
      });
      expect(retiro.accessVersion).toBe(fuente.accessVersion + 1);
      expect(await grantCount(recipientId)).toBe(0);
    });
  });

  describe('convivencia con UserPermission legacy (deuda de procedencia)', () => {
    it('nunca migra ni toca las filas de concesiones legacy del usuario', async () => {
      await prisma.userPermission.create({
        data: {
          userId: recipientId,
          permission: 'dashboard:pack:ventas',
          effect: 'GRANT',
          grantedById: actorId,
          reason: 'fixture legacy',
        },
      });

      await service.replaceSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'manual' },
        grants: [{ actionId: 'customers:read', scope: 'team' }],
      });

      const legacy = await prisma.userPermission.findMany({ where: { userId: recipientId } });
      expect(legacy).toHaveLength(1);
      expect(legacy[0]).toMatchObject({
        permission: 'dashboard:pack:ventas',
        effect: 'GRANT',
        reason: 'fixture legacy',
      });

      await prisma.userPermission.deleteMany({ where: { userId: recipientId } });
    });
  });

  /**
   * Los paquetes de paneles ya no existen: todo se asigna acción por acción
   * (fuente manual). Las pruebas de comportamiento sin base de datos están en
   * access-assignments.no-packages.spec.ts.
   */
  describe('asignación manual sin paquetes', () => {
    it('aceptación 2 (capa servicio) — sin fuentes no hay grants; la cuenta propia sigue disponible', async () => {
      expect(await service.grantsForUser(recipientId)).toHaveLength(0);
      const denegado = resolveAccess({
        identity: identityFor(recipientId, false),
        actionId: 'customers:read',
        grants: await service.grantsForUser(recipientId),
        resource: { id: 'c-1', ownerId: recipientId },
      });
      expect(denegado.allowed).toBe(false);
      expect(denegado.reason).toBe('no-covering-grant');
      // Excepción self-account del resolver (data-scope): la propia cuenta no
      // requiere concesiones. El 403 HTTP de endpoints @Roles/@Permissions y
      // el 200 de /api/auth/profile se acreditan en el spec del controller y
      // en el e2e; la cobertura TOTAL de URL/API queda hasta D5 (COM-01 §4).
      const propia = resolveAccess({
        identity: identityFor(recipientId, false),
        actionId: 'customers:read',
        grants: [],
        resource: { kind: 'account', id: recipientId },
      });
      expect(propia.allowed).toBe(true);
      expect(propia.sources).toEqual(['self-account']);
    });

    it('accessVersionFor refleja la versión vigente (0 sin estado previo)', async () => {
      expect(await service.accessVersionFor(recipientId)).toBe(0);
      await service.replaceManualSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        grants: [{ actionId: 'customers:read', scope: 'own' }],
      });
      expect(await service.accessVersionFor(recipientId)).toBe(1);
    });

    it('replaceManualSource reutiliza la fuente manual: el segundo PUT reemplaza, no acumula', async () => {
      const primero = await service.replaceManualSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        reason: 'ajuste inicial',
        grants: [{ actionId: 'customers:read', scope: 'team' }],
      });
      const segundo = await service.replaceManualSource(actor, recipientId, {
        expectedVersion: primero.accessVersion,
        catalogVersion: ACCESS_CATALOG_VERSION,
        reason: 'ajuste corregido',
        grants: [
          { actionId: 'customers:read', scope: 'team' },
          { actionId: 'targets:read', scope: 'own' },
        ],
      });

      expect(segundo.sourceId).toBe(primero.sourceId);
      expect(await sourceCount(recipientId)).toBe(1);
      const grants = await service.grantsForUser(recipientId);
      expect(grants).toHaveLength(2);
      expect(grants.every((g) => g.sourceId === primero.sourceId)).toBe(true);
      const sources = await service.sourcesFor(recipientId);
      expect(sources[0]).toMatchObject({ kind: 'manual', reason: 'ajuste corregido' });
    });
  });
});
