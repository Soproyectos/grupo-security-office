import { BadRequestException } from '@nestjs/common';
import { AccessAssignmentsService } from './access-assignments.service';
import { ACCESS_CATALOG_VERSION } from './access-catalog';
import {
  createFakeAccessPrisma, fakeGrant as grant, fakeSource as src,
} from './access-fake-prisma.test-helpers';
import type { FakeAccessState } from './access-fake-prisma.test-helpers';
import type { AccessIdentity } from './data-scope';
import { isGrantingSource } from './granting-sources';
import { LIBRARY_SELECTION_TEMPLATE_ID } from './library-selection';

/**
 * Work packages ("paquetes") no longer exist. The Super Admin assigns every
 * action one by one, and the rows an old package left behind never grant access.
 */
describe('Paneles sin paquetes', () => {
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

  type Pick = { actionId: string; scope?: 'own' | 'team' | 'global' };
  const versionNow = () => state.versions['recipient-fixture'] ?? 0;
  const setManual = (picks: Pick[], expectedVersion = versionNow()) =>
    service.replaceManualSource(actor, 'recipient-fixture', {
      expectedVersion,
      catalogVersion: ACCESS_CATALOG_VERSION,
      grants: picks.map(({ actionId, scope }) => ({ actionId, scope: scope ?? 'global' })),
    });
  const held = async () => (await service.grantsForUser('recipient-fixture'))
    .map((row) => `${row.actionId}@${row.scope}`).sort();

  describe('asignar y quitar acciones sueltas siempre funciona', () => {
    it('agrega una acción, luego otra, y las quita una por una', async () => {
      const a = await setManual([{ actionId: 'customers:read', scope: 'own' }]);
      const b = await setManual([
        { actionId: 'customers:read', scope: 'own' }, { actionId: 'quotes:read', scope: 'team' },
      ], a.accessVersion);
      expect(await held()).toEqual(['customers:read@own', 'quotes:read@team']);

      const c = await setManual([{ actionId: 'quotes:read', scope: 'team' }], b.accessVersion);
      expect(await held()).toEqual(['quotes:read@team']);

      const d = await setManual([], c.accessVersion);
      expect(d).toMatchObject({ changed: true, grants: [] });
      expect(await held()).toEqual([]);
      expect(state.sources).toEqual([]);
    });

    it('quitar la última acción no exige nada: una lista vacía deja a la persona sin accesos', async () => {
      await setManual([{ actionId: 'activities:read', scope: 'own' }]);
      await expect(setManual([])).resolves.toMatchObject({ changed: true });
      expect(await held()).toEqual([]);
    });

    it('dejar vacío a quien no tiene nada no escribe ni cambia la versión', async () => {
      const receipt = await setManual([]);
      expect(receipt).toMatchObject({ changed: false, grants: [], accessVersion: 0 });
      expect(state.operations).toEqual([]);
      expect(state.audits).toEqual([]);
    });

    it('una acción que depende de otra solo pide esa acción, no un paquete', async () => {
      await expect(setManual([{ actionId: 'customers:edit', scope: 'own' }])).rejects.toBeInstanceOf(BadRequestException);
      await expect(setManual([
        { actionId: 'customers:edit', scope: 'own' }, { actionId: 'customers:read', scope: 'own' },
      ])).resolves.toMatchObject({ changed: true });
    });

    it('un alcance no permitido se rechaza, y todo lo demás sigue siendo asignable', async () => {
      await expect(setManual([{ actionId: 'products:read', scope: 'own' }])).rejects.toBeInstanceOf(BadRequestException);
      await expect(setManual([{ actionId: 'products:read', scope: 'global' }])).resolves.toMatchObject({ changed: true });
    });

    it('quitar acciones nunca queda bloqueado por filas heredadas de un paquete', async () => {
      state.sources.push(src('old', 'template', 'biblioteca-publicacion'));
      state.grants.push(grant('old', 'products:publish'));
      const first = await setManual([{ actionId: 'products:read' }, { actionId: 'products:write' }]);
      await expect(setManual([{ actionId: 'products:read' }], first.accessVersion)).resolves.toMatchObject({ changed: true });
      expect(await held()).toEqual(['products:read@global']);
    });
  });

  describe('una fuente de paquete heredada no concede acceso', () => {
    beforeEach(() => {
      state.sources.push(src('old-vendedor', 'template', 'vendedor'), src('old-lib', 'template', 'biblioteca-fichas'));
      state.grants.push(
        grant('old-vendedor', 'customers:read', 'own'), grant('old-vendedor', 'quotes:read', 'own'),
        grant('old-lib', 'products:read'), grant('old-lib', 'products:write'),
      );
    });

    it('grantsForUser no devuelve nada, pero las filas siguen en la base', async () => {
      expect(await service.grantsForUser('recipient-fixture')).toEqual([]);
      expect(state.sources.map((s) => s.id).sort()).toEqual(['old-lib', 'old-vendedor']);
      expect(state.grants).toHaveLength(4);
    });

    it('sourcesFor tampoco las muestra como procedencia vigente', async () => {
      expect(await service.sourcesFor('recipient-fixture')).toEqual([]);
      expect(await service.sourcesFor('recipient-fixture', 'products:write')).toEqual([]);
    });

    it('no cubren dependencias: hay que asignar la acción de la que se depende', async () => {
      await expect(setManual([{ actionId: 'quotes:create', scope: 'own' }])).rejects.toThrow(/customers:read/);
      await expect(setManual([
        { actionId: 'quotes:create', scope: 'own' }, { actionId: 'customers:read', scope: 'own' },
      ])).resolves.toMatchObject({ changed: true });
    });

    it('no se pueden editar por id para que vuelvan a conceder', async () => {
      await expect(service.replaceSource(actor, 'recipient-fixture', {
        expectedVersion: 0, catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'manual', sourceId: 'old-vendedor' },
        grants: [{ actionId: 'customers:read', scope: 'own' }],
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(await service.grantsForUser('recipient-fixture')).toEqual([]);
    });

    it('no se pueden crear de nuevo: replaceSource rechaza plantillas', async () => {
      await expect(service.replaceSource(actor, 'recipient-fixture', {
        expectedVersion: 0, catalogVersion: ACCESS_CATALOG_VERSION,
        source: { kind: 'template', templateId: 'vendedor' },
        grants: [{ actionId: 'customers:read', scope: 'own' }],
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(state.sources).toHaveLength(2);
    });

    it('la asignación nueva se suma sin tocar ni revivir las filas heredadas', async () => {
      await setManual([{ actionId: 'activities:read', scope: 'own' }]);
      expect(await held()).toEqual(['activities:read@own']);
      expect(state.grants.filter((g) => g.sourceId.startsWith('old-'))).toHaveLength(4);
    });
  });

  describe('las fuentes manuales y la selección de Biblioteca siguen concediendo', () => {
    it('manual concede', async () => {
      state.sources.push(src('man', 'manual'));
      state.grants.push(grant('man', 'targets:read', 'own'));
      expect(await held()).toEqual(['targets:read@own']);
      expect((await service.sourcesFor('recipient-fixture')).map((s) => s.id)).toEqual(['man']);
    });

    it('la selección de casillas de Biblioteca concede', async () => {
      state.sources.push(src('sel', 'template', LIBRARY_SELECTION_TEMPLATE_ID));
      state.grants.push(grant('sel', 'products:read'));
      expect(await held()).toEqual(['products:read@global']);
    });

    it('manual y paquete heredado juntos: solo cuenta lo manual', async () => {
      state.sources.push(src('man', 'manual'), src('old', 'template', 'gestion-comercial'));
      state.grants.push(grant('man', 'targets:read', 'team'), grant('old', 'targets:edit', 'team'));
      expect(await held()).toEqual(['targets:read@team']);
    });

    it('un dato de otra persona no se mezcla', async () => {
      state.sources.push(src('other', 'manual', null, 'other-user'));
      state.grants.push(grant('other', 'targets:read', 'own'));
      expect(await held()).toEqual([]);
    });

    it.each([
      [{ kind: 'manual', templateId: null }, true],
      [{ kind: 'template', templateId: LIBRARY_SELECTION_TEMPLATE_ID }, true],
      [{ kind: 'template', templateId: 'vendedor' }, false],
      [{ kind: 'template', templateId: null }, false],
      [null, false],
    ])('isGrantingSource(%j) = %s', (source, expected) => {
      expect(isGrantingSource(source)).toBe(expected);
    });
  });

  describe('el servicio ya no sabe de paquetes', () => {
    it('no expone aplicar ni retirar paquetes', () => {
      expect((service as unknown as Record<string, unknown>).applyPackage).toBeUndefined();
      expect((service as unknown as Record<string, unknown>).removePackage).toBeUndefined();
    });
  });
});
