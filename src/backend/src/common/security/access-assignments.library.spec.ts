import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccessAssignmentsService } from './access-assignments.service';
import { ACCESS_CATALOG_VERSION, getActionDefinition, isAssignableAction } from './access-catalog';
import { createFakeAccessPrisma } from './access-fake-prisma.test-helpers';
import type { FakeAccessState } from './access-fake-prisma.test-helpers';
import type { AccessIdentity } from './data-scope';

describe('Biblioteca: asignación acción por acción', () => {
  const actor: AccessIdentity = {
    userId: 'admin-fixture', verified: true, active: true, sessionValid: true,
    sessionUserId: 'admin-fixture', superAdmin: true,
  };
  let state: FakeAccessState;
  let service: AccessAssignmentsService;

  beforeEach(() => {
    const fake = createFakeAccessPrisma();
    state = fake.state;
    service = new AccessAssignmentsService(fake.prisma as never);
  });

  const assign = (actionIds: string[], expectedVersion = state.versions['recipient-fixture'] ?? 0) =>
    service.replaceManualSource(actor, 'recipient-fixture', {
      expectedVersion,
      catalogVersion: ACCESS_CATALOG_VERSION,
      grants: actionIds.map((actionId) => ({ actionId, scope: 'global' as const })),
    });
  const held = async () => (await service.grantsForUser('recipient-fixture')).map((grant) => grant.actionId).sort();

  it.each(['listas:read', 'listas:update', 'listas:unlink', 'assignments:manage'])(
    'rechaza concesiones nuevas de %s incluso mediante asignación manual', async (actionId) => {
      expect(isAssignableAction(actionId)).toBe(false);
      await expect(assign([actionId])).rejects.toBeInstanceOf(BadRequestException);
      expect(state.sources).toEqual([]);
    },
  );

  it.each(['list', 'product'] as const)('rechaza el alcance %s para nuevas concesiones de Biblioteca', async (scope) => {
    await expect(service.replaceSource(actor, 'recipient-fixture', {
      expectedVersion: 0, catalogVersion: ACCESS_CATALOG_VERSION,
      grants: [{ actionId: 'products:read', scope, resourceId: 'resource-fixture' }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(state.sources).toEqual([]);
  });

  it('Biblioteca solo permite alcance global', () => {
    for (const actionId of ['products:read', 'products:write', 'products:publish', 'products:notes', 'prices:read', 'prices:apply']) {
      expect(getActionDefinition(actionId)?.allowedScopes).toEqual(['global']);
    }
  });

  it('no concede administración de accesos a quien no es Super Admin', async () => {
    await expect(service.replaceManualSource({ ...actor, superAdmin: false }, 'recipient-fixture', {
      expectedVersion: 0, catalogVersion: ACCESS_CATALOG_VERSION,
      grants: [{ actionId: 'products:read', scope: 'global' }],
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(state.sources).toEqual([]);
  });

  it('«Biblioteca solo Productos» se asigna acción por acción y no trae nada más', async () => {
    await assign(['products:read', 'prices:read']);
    expect(await held()).toEqual(['prices:read', 'products:read']);
  });

  it('cada acción de Biblioteca se agrega o se quita sin arrastrar las demás', async () => {
    const first = await assign(['products:read']);
    const second = await assign(['products:read', 'products:write'], first.accessVersion);
    expect(await held()).toEqual(['products:read', 'products:write']);
    await assign(['products:read'], second.accessVersion);
    expect(await held()).toEqual(['products:read']);
  });

  it('las acciones complementarias piden la acción de la que dependen, no un paquete', async () => {
    await expect(assign(['products:read', 'imports:run'])).rejects.toThrow(/imports:read/);
    await expect(assign(['products:read', 'products:publish'])).rejects.toThrow(/products:write/);
    await expect(assign(['products:read', 'products:write', 'products:publish'])).resolves.toMatchObject({ changed: true });
    expect(await held()).toEqual(['products:publish', 'products:read', 'products:write']);
  });
});
