import { BadRequestException } from '@nestjs/common';
import { AccessAssignmentsService } from './access-assignments.service';
import { ACCESS_CATALOG_VERSION } from './access-catalog';
import { createFakeAccessPrisma } from './access-fake-prisma.test-helpers';
import type { FakeAccessState } from './access-fake-prisma.test-helpers';
import type { AccessIdentity } from './data-scope';

/**
 * A dependent action can never reach further than the action it depends on:
 * "edit customers: team" needs "see customers: team or global".
 */
describe('Asignación: una acción dependiente no puede tener más alcance que su dependencia', () => {
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

  type Pick = { actionId: string; scope: 'own' | 'team' | 'global' };
  const versionNow = () => state.versions['recipient-fixture'] ?? 0;
  const assign = (picks: Pick[], expectedVersion = versionNow()) =>
    service.replaceSource(actor, 'recipient-fixture', {
      expectedVersion,
      catalogVersion: ACCESS_CATALOG_VERSION,
      grants: picks,
    });

  it('rechaza editar con alcance de equipo si solo se puede ver lo propio', async () => {
    await expect(assign([
      { actionId: 'customers:read', scope: 'own' },
      { actionId: 'customers:edit', scope: 'team' },
    ])).rejects.toThrow(/no puede llegar más lejos/);
    expect(state.sources).toEqual([]);
  });

  it('rechaza global sobre una dependencia de equipo', async () => {
    await expect(assign([
      { actionId: 'quotes:read', scope: 'team' },
      { actionId: 'quotes:edit', scope: 'global' },
    ])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('acepta el mismo alcance y también un alcance de lectura más amplio', async () => {
    await expect(assign([
      { actionId: 'customers:read', scope: 'team' },
      { actionId: 'customers:edit', scope: 'team' },
      { actionId: 'customers:reassign', scope: 'own' },
    ])).resolves.toMatchObject({ changed: true });
  });

  it('mide contra lo que ya tiene la persona desde otra asignación', async () => {
    await assign([{ actionId: 'customers:read', scope: 'own' }]);
    // A second source cannot widen "edit" past the "see" that was already granted.
    await expect(service.replaceSource(actor, 'recipient-fixture', {
      expectedVersion: versionNow(),
      catalogVersion: ACCESS_CATALOG_VERSION,
      grants: [{ actionId: 'customers:edit', scope: 'global' }],
    })).rejects.toThrow(/no puede llegar más lejos/);

    await expect(service.replaceSource(actor, 'recipient-fixture', {
      expectedVersion: versionNow(),
      catalogVersion: ACCESS_CATALOG_VERSION,
      grants: [{ actionId: 'customers:edit', scope: 'own' }],
    })).resolves.toMatchObject({ changed: true });
  });

  it('cadena completa: descuento depende de editar y editar depende de ver', async () => {
    await expect(assign([
      { actionId: 'quotes:read', scope: 'team' },
      { actionId: 'quotes:edit', scope: 'team' },
      { actionId: 'quotes:discount', scope: 'global' },
    ])).rejects.toThrow(/quotes:discount/);
    await expect(assign([
      { actionId: 'quotes:read', scope: 'global' },
      { actionId: 'quotes:edit', scope: 'global' },
      { actionId: 'quotes:discount', scope: 'global' },
    ])).resolves.toMatchObject({ changed: true });
  });

  it('las acciones de agenda también respetan la dependencia (asignar necesita ver)', async () => {
    await expect(assign([
      { actionId: 'activities:read', scope: 'own' },
      { actionId: 'activities:assign', scope: 'team' },
    ])).rejects.toBeInstanceOf(BadRequestException);
    await expect(assign([
      { actionId: 'activities:read', scope: 'team' },
      { actionId: 'activities:assign', scope: 'team' },
    ])).resolves.toMatchObject({ changed: true });
  });

  it('los datos compartidos globales siguen asignándose igual', async () => {
    await expect(assign([
      { actionId: 'products:read', scope: 'global' },
      { actionId: 'prices:read', scope: 'global' },
    ])).resolves.toMatchObject({ changed: true });
  });
});
