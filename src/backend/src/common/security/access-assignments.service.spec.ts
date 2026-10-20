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
import * as catalogModule from './access-catalog';
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
        source: { kind: 'template', templateId: 'plantilla-vendedor', reason: 'plantilla' },
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
        source: { kind: 'template', templateId: 'tpl-1', reason: 'plantilla' },
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
        source: { kind: 'template', templateId: 'tpl-2', reason: 'plantilla' },
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
        source: { kind: 'template', templateId: 'tpl-3', reason: 'plantilla' },
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
   * COM-01 §3/§3.1 — paquetes como fuente template idempotente (E2 resuelta
   * con mapa en catálogo, writePath de esta ficha). Aplicar = replaceSource
   * con `kind:'template'`+`templateId`; retirar = removeSource de ESA fuente
   * conservando las demás. Sin migración automática de cuentas existentes.
   */
  describe('paquetes COM-01 §3.1 (applyPackage / removePackage)', () => {
    // El cleanup exterior (afterEach del describe raíz) borra usuarios por
    // prefijo de email; las filas de user_roles/roles creadas como fixture
    // deben irse ANTES (Jest ejecuta afterEach del interior hacia el exterior)
    // o la FK `user_roles_userId_fkey` rompe la limpieza de todo el suite.
    afterEach(async () => {
      await prisma.userRole.deleteMany({
        where: { user: { email: { startsWith: 'base04-spec-' } } },
      });
      await prisma.role.deleteMany({ where: { name: 'Vendedor fixture COM-01' } });
    });

    it('aplicar paquete vendedor crea fuente template con los grants del paquete', async () => {
      const receipt = await service.applyPackage(actor, recipientId, 'vendedor', {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
      });

      expect(receipt.accessVersion).toBe(1);
      expect(receipt.changed).toBe(true);
      expect(await sourceCount(recipientId)).toBe(1);

      const sources = await service.sourcesFor(recipientId);
      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({
        id: receipt.sourceId,
        kind: 'template',
        templateId: 'vendedor',
        catalogVersion: ACCESS_CATALOG_VERSION,
        grantedById: actorId,
        reason: 'template-applied',
      });

      const grants = await service.grantsForUser(recipientId);
      expect(grants).toHaveLength(14); // selección literal §3.1 Vendedor
      expect(grants.every((g) => g.sourceId === receipt.sourceId)).toBe(true);
      expect(grants.map((g) => `${g.actionId}:${g.scope}`).sort()).toEqual(
        [
          'customers:read:own', 'customers:create:own', 'customers:edit:own',
          'quotes:read:own', 'quotes:create:own', 'quotes:edit:own', 'quotes:status:own',
          'products:read:global', 'listas:read:global',
          'activities:read:own', 'activities:create:own', 'activities:complete:own',
          'targets:read:own', 'commercialPromotions:read:own',
        ].sort(),
      );
    });

    it('aceptación 1 — dos vendedores mismo rol con paquetes y acciones distintas; nadie migra por silencio', async () => {
      // Fixtures ficticias: rol "Vendedor" único, compartido por A y B.
      const role = await prisma.role.upsert({
        where: { name: 'Vendedor fixture COM-01' },
        create: { name: 'Vendedor fixture COM-01', description: 'fixture t10' },
        update: {},
        select: { id: true },
      });
      const vendedoraA = await createUser('vendedora-a');
      const vendedoraB = await createUser('vendedora-b');
      const sinPaquetes = await createUser('sin-paquetes');
      await prisma.userRole.createMany({
        data: [
          { userId: vendedoraA, roleId: role.id },
          { userId: vendedoraB, roleId: role.id },
        ],
      });

      await service.applyPackage(actor, vendedoraA, 'vendedor', { expectedVersion: 0 });
      await service.applyPackage(actor, vendedoraB, 'gestion-comercial', { expectedVersion: 0 });

      const grantsA = await service.grantsForUser(vendedoraA);
      const grantsB = await service.grantsForUser(vendedoraB);
      expect(grantsA).not.toEqual(grantsB);
      // A edita sus clientes; B gestiona cartera del equipo pero no edita la propia.
      expect(grantsA.some((g) => g.actionId === 'customers:edit' && g.scope === 'own')).toBe(true);
      expect(grantsB.some((g) => g.actionId === 'customers:edit')).toBe(false);
      expect(grantsB.some((g) => g.actionId === 'customers:reassign' && g.scope === 'team')).toBe(true);

      const decisionA = resolveAccess({
        identity: identityFor(vendedoraA, false),
        actionId: 'customers:edit',
        grants: grantsA,
        resource: { id: 'c-1', ownerId: vendedoraA },
      });
      const decisionB = resolveAccess({
        identity: identityFor(vendedoraB, false),
        actionId: 'customers:edit',
        grants: grantsB,
        resource: { id: 'c-1', ownerId: vendedoraB },
      });
      expect(decisionA.allowed).toBe(true);
      expect(decisionB.allowed).toBe(false);
      expect(decisionB.reason).toBe('no-covering-grant');

      // Sin migración automática (regla 1): una cuenta sin operaciones queda
      // sin fuentes ni grants, pese a existir paquetes aplicados a otras.
      expect(await service.grantsForUser(sinPaquetes)).toHaveLength(0);
      expect(await service.sourcesFor(sinPaquetes)).toHaveLength(0);
    });

    it('doble aplicación versionada: reutiliza la fuente template y solo cambia la versión (OCC)', async () => {
      const primera = await service.applyPackage(actor, recipientId, 'vendedor', {
        expectedVersion: 0,
      });
      // Misma versión → 409 access-version-conflict sin tocar nada.
      await expect(
        service.applyPackage(actor, recipientId, 'vendedor', { expectedVersion: 0 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await versionOf(recipientId)).toBe(1);

      // Versión vigente → reemplaza la MISMA fuente (no acumula fuentes).
      const segunda = await service.applyPackage(actor, recipientId, 'vendedor', {
        expectedVersion: primera.accessVersion,
      });
      expect(segunda.sourceId).toBe(primera.sourceId);
      expect(segunda.accessVersion).toBe(2);
      expect(await sourceCount(recipientId)).toBe(1);
      expect(await grantCount(recipientId)).toBe(14);
    });

    it('doble aplicación con idempotencyKey devuelve el recibo grabado (replay)', async () => {
      const input = { expectedVersion: 0, idempotencyKey: 'com01-apply-vendedor' };
      const primera = await service.applyPackage(actor, recipientId, 'vendedor', input);
      const replay = await service.applyPackage(actor, recipientId, 'vendedor', input);
      expect(replay.replayed).toBe(true);
      expect(replay.accessVersion).toBe(primera.accessVersion);
      expect(await sourceCount(recipientId)).toBe(1);
      expect(await prisma.accessOperation.count({ where: { targetId: recipientId } })).toBe(1);
    });

    it('aceptación 3 — removePackage retira SOLO la fuente template y conserva la manual', async () => {
      const manual = await service.replaceSource(actor, recipientId, {
        expectedVersion: 0,
        catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', reason: 'ajuste personal del Super Admin' },
        grants: [{ actionId: 'customers:read', scope: 'global' }],
      });
      const paquete = await service.applyPackage(actor, recipientId, 'vendedor', {
        expectedVersion: manual.accessVersion,
      });

      const retiro = await service.removePackage(actor, recipientId, 'vendedor', {
        expectedVersion: paquete.accessVersion,
      });
      expect(retiro.accessVersion).toBe(paquete.accessVersion + 1);

      const sources = await service.sourcesFor(recipientId);
      expect(sources).toHaveLength(1);
      expect(sources[0].kind).toBe('manual');

      const grants = await service.grantsForUser(recipientId);
      expect(grants).toHaveLength(1);
      expect(grants[0].sourceId).toBe(manual.sourceId);
      expect(grants[0]).toMatchObject({ actionId: 'customers:read', scope: 'global' });

      // La lectura viva refleja el retiro en la siguiente consulta (el
      // frontend hará refetch de concesiones; E6 pendiente para revalidar
      // AccessGrant por petición en el JWT).
      const decision = resolveAccess({
        identity: identityFor(recipientId, false),
        actionId: 'customers:edit',
        grants: await service.grantsForUser(recipientId),
        resource: { id: 'c-1', ownerId: recipientId },
      });
      expect(decision.allowed).toBe(false);
    });

    it('removePackage de un paquete no aplicado → 404 sin escrituras', async () => {
      await expect(
        service.removePackage(actor, recipientId, 'supervisor-comercial', {
          expectedVersion: 0,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(await versionOf(recipientId)).toBe(0);
    });

    it('paquete desconocido → 400 sin escrituras', async () => {
      await expect(
        service.applyPackage(actor, recipientId, 'paquete-inexistente', {
          expectedVersion: 0,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await versionOf(recipientId)).toBe(0);
      expect(await sourceCount(recipientId)).toBe(0);
    });

    it('catalogVersion desactualizado al aplicar → 409 catalog-version-conflict', async () => {
      let error: unknown;
      try {
        await service.applyPackage(actor, recipientId, 'vendedor', {
          expectedVersion: 0,
          catalogVersion: 'base02-0',
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ConflictException);
      expect(conflictCode(error)).toBe('catalog-version-conflict');
      expect(await versionOf(recipientId)).toBe(0);
    });

    it('defensa: una acción deshabilitada dentro de un paquete rechina con 400 y no escribe', async () => {
      // Los PACKAGE_TEMPLATES reales solo contienen acciones habilitadas
      // (spec de catálogo); aquí se inyecta una definición tóxica para
      // probar la guarda de applyPackage/validateGrants (COM-01 §11).
      const spy = jest.spyOn(catalogModule, 'getPackageTemplate').mockReturnValue({
        id: 'paquete-toxico',
        name: 'Tóxico',
        catalogVersion: ACCESS_CATALOG_VERSION,
        selections: [{ actionId: 'stockRequests:read', scope: 'team' }],
      });
      try {
        await expect(
          service.applyPackage(actor, recipientId, 'paquete-toxico', { expectedVersion: 0 }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(await versionOf(recipientId)).toBe(0);
        expect(await sourceCount(recipientId)).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });

    it('no-SuperAdmin no puede aplicar ni retirar paquetes (403)', async () => {
      await expect(
        service.applyPackage(recipient, recipientId, 'vendedor', { expectedVersion: 0 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.removePackage(recipient, recipientId, 'vendedor', { expectedVersion: 0 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

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
      await service.applyPackage(actor, recipientId, 'vendedor', { expectedVersion: 0 });
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
