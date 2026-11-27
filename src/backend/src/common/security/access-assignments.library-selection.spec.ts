import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AccessAssignmentsService } from './access-assignments.service';
import { ACCESS_CATALOG_VERSION } from './access-catalog';
import { createFakeAccessPrisma, fakeGrant as grant, fakeSource as src } from './access-fake-prisma.test-helpers';
import type { FakeAccessState, FakeGrant } from './access-fake-prisma.test-helpers';
import type { AccessIdentity } from './data-scope';
import { LIBRARY_SELECTION_ACTION_IDS, LIBRARY_SELECTION_TEMPLATE_ID, closeLibrarySelection } from './library-selection';

describe('Biblioteca: selección por casillas (replaceLibrarySelection)', () => {
  const actor: AccessIdentity = {
    userId: 'admin-fixture', verified: true, active: true, sessionValid: true,
    sessionUserId: 'admin-fixture', superAdmin: true,
  };
  const ids = (grants: FakeGrant[]) => grants.map((g) => g.actionId).sort();
  let state: FakeAccessState;
  let service: AccessAssignmentsService;

  beforeEach(() => {
    const fake = createFakeAccessPrisma();
    state = fake.state;
    service = new AccessAssignmentsService(fake.prisma as never);
  });

  const save = (actionIds: string[], expectedVersion = state.versions['recipient-fixture'] ?? 0) =>
    service.replaceLibrarySelection(actor, 'recipient-fixture', { expectedVersion, actionIds });

  it('guarda permisos y auditoría aunque una consulta por túnel tarde más de cinco segundos', async () => {
    jest.useFakeTimers();
    try {
      state.sourceReadDelayMs = 6_000;
      const saving = save(['products:write']).then(
        (receipt) => ({ receipt, error: undefined }),
        (error: unknown) => ({ receipt: undefined, error }),
      );
      await jest.advanceTimersByTimeAsync(6_000);
      const outcome = await saving;
      expect(outcome.error).toBeUndefined();
      expect(outcome.receipt).toMatchObject({ accessVersion: 1, changed: true });
      expect(ids(state.grants)).toEqual(['products:read', 'products:write']);
      expect(state.operations).toHaveLength(1);
      expect(state.audits).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('guarda UNA fuente template reservada con alcance global y solo lo marcado más sus dependencias', async () => {
    const receipt = await save(['products:write', 'prices:apply']);
    const selection = state.sources.filter((s) => s.templateId === LIBRARY_SELECTION_TEMPLATE_ID);
    expect(selection).toHaveLength(1);
    expect(selection[0]).toMatchObject({ kind: 'template' });
    expect(ids(state.grants)).toEqual(['prices:apply', 'prices:read', 'products:read', 'products:write']);
    expect(state.grants.every((g) => g.scopeKind === 'global' && g.resourceId === '')).toBe(true);
    expect(receipt).toMatchObject({ accessVersion: 1, changed: true, sourceId: selection[0].id });
  });

  it('calcula el cierre de dependencias en el servidor (cadena guardar → revisar → ver precios)', async () => {
    await save(['prices:save', 'providers:write']);
    expect(ids(state.grants)).toEqual(['prices:preview', 'prices:read', 'prices:save', 'providers:read', 'providers:write']);
    expect(closeLibrarySelection(['products:notes'])).toEqual(['products:read', 'products:notes']);
  });

  it('rechaza con 400 una acción fuera del conjunto de Biblioteca y no escribe nada', async () => {
    for (const bad of ['products:publish', 'customers:read', 'listas:read', 'libraryStats:update', 'no-existe']) {
      await expect(save(['products:read', bad])).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(state.sources).toEqual([]);
    expect(state.grants).toEqual([]);
    expect(state.versions['recipient-fixture'] ?? 0).toBe(0);
  });

  it('no escala permisos: nunca concede más que lo marcado y sus dependencias', async () => {
    await save(['prices:read']);
    expect(ids(state.grants)).toEqual(['prices:read']);
    await save(['products:read']);
    expect(ids(state.grants)).toEqual(['products:read']);
    expect(LIBRARY_SELECTION_ACTION_IDS).not.toContain('products:publish');
  });

  it('un segundo guardado reemplaza la misma fuente y quitar una casilla retira el permiso', async () => {
    await save(['products:write', 'products:delete']);
    const firstId = state.sources[0].id;
    await save(['products:write']);
    expect(state.sources.filter((s) => s.templateId === LIBRARY_SELECTION_TEMPLATE_ID).map((s) => s.id)).toEqual([firstId]);
    expect(ids(state.grants)).toEqual(['products:read', 'products:write']);
  });

  it('selección vacía retira todo Biblioteca y conserva lo comercial', async () => {
    state.sources.push(src('manual', 'manual'));
    state.grants.push(grant('manual', 'quotes:read', 'own'));
    await save(['products:read']);
    await save([]);
    expect(state.sources.some((s) => s.templateId === LIBRARY_SELECTION_TEMPLATE_ID)).toBe(false);
    expect(ids(state.grants)).toEqual(['quotes:read']);
  });

  it('solo mueve las casillas de Biblioteca fuera de la fuente manual y no borra nada más', async () => {
    state.sources.push(
      src('manual', 'manual'),
      // Leftovers of removed packages: they stay in the database and grant nothing.
      src('query', 'template', 'biblioteca-consulta'), src('fichas', 'template', 'biblioteca-fichas'),
      src('vendedor', 'template', 'vendedor'),
    );
    state.grants.push(
      grant('manual', 'products:read'), grant('manual', 'products:write'), grant('manual', 'products:publish'),
      grant('manual', 'customers:read', 'own'),
      grant('query', 'products:read'), grant('fichas', 'products:write'), grant('vendedor', 'quotes:read', 'own'),
    );
    await save(['products:read', 'products:write']);

    // Nothing from the leftovers is deleted.
    expect(state.sources.map((s) => s.id)).toEqual(expect.arrayContaining(['manual', 'query', 'fichas', 'vendedor']));
    expect(ids(state.grants.filter((g) => ['query', 'fichas', 'vendedor'].includes(g.sourceId))))
      .toEqual(['products:read', 'products:write', 'quotes:read']);
    // The Library checkboxes left the manual block; the rest of it is untouched.
    expect(ids(state.grants.filter((g) => g.sourceId === 'manual'))).toEqual(['customers:read', 'products:publish']);
    // Effective access: only manual + the selection count.
    const effective = await service.grantsForUser('recipient-fixture');
    expect(ids(effective as unknown as FakeGrant[])).toEqual([
      'customers:read', 'products:publish', 'products:read', 'products:write',
    ]);
    expect(state.audits[0].action).toBe('replaceLibrarySelection');
    expect(state.operations).toHaveLength(1);
  });

  it('Importaciones y Catálogos maestros: cierre de dependencias y approveSpecs como casilla aparte', async () => {
    expect(closeLibrarySelection(['imports:run'])).toEqual([
      'products:read', 'products:write', 'imports:read', 'imports:run',
    ]);
    expect(closeLibrarySelection(['masters:write'])).toEqual(['products:read', 'masters:read', 'masters:write']);
    expect(closeLibrarySelection(['masters:read'])).toEqual(['products:read', 'masters:read']);
    // Aprobar moldes exige editar, pero masters:write nunca lo trae consigo.
    expect(closeLibrarySelection(['products:approveSpecs'])).toEqual(['products:read', 'products:write', 'products:approveSpecs']);
    expect(closeLibrarySelection(['masters:write'])).not.toContain('products:approveSpecs');
    expect(closeLibrarySelection(['imports:read'])).not.toContain('products:write');
    await save(['masters:write', 'imports:read']);
    expect(ids(state.grants)).toEqual(['imports:read', 'masters:read', 'masters:write', 'products:read']);
    expect(state.grants.every((g) => g.scopeKind === 'global')).toBe(true);
  });

  it('agregar y quitar las casillas nuevas reemplaza la misma fuente y las retira', async () => {
    await save(['imports:run', 'masters:write', 'products:approveSpecs']);
    expect(ids(state.grants)).toEqual([
      'imports:read', 'imports:run', 'masters:read', 'masters:write',
      'products:approveSpecs', 'products:read', 'products:write',
    ]);
    const firstId = state.sources[0].id;
    await save(['masters:read']);
    expect(state.sources.map((s) => s.id)).toEqual([firstId]);
    expect(ids(state.grants)).toEqual(['masters:read', 'products:read']);
    await save([]);
    expect(state.grants).toEqual([]);
  });

  it('un paquete heredado de Biblioteca no concede nada: ni cuenta como dependencia ni se borra', async () => {
    state.sources.push(src('pub', 'template', 'biblioteca-publicacion'));
    state.grants.push(grant('pub', 'products:publish'));
    await expect(save(['products:read'])).resolves.toMatchObject({ changed: true });
    expect(state.grants).toContainEqual(grant('pub', 'products:publish'));
    const effective = await service.grantsForUser('recipient-fixture');
    expect(effective.map((g) => g.actionId)).toEqual(['products:read']);
  });

  it('conserva Publicar en tienda (manual) si la selección sigue incluyendo products:write', async () => {
    state.sources.push(src('manual', 'manual'));
    state.grants.push(grant('manual', 'products:publish'));
    await save(['products:write', 'prices:preview']);
    expect(state.grants).toContainEqual(grant('manual', 'products:publish'));
  });

  it.each([[['products:read']], [[]]])('rechaza con 400 si hay Publicar en tienda y la selección %j no edita fichas', async (actionIds) => {
    state.sources.push(src('manual', 'manual'));
    state.grants.push(grant('manual', 'products:read'), grant('manual', 'products:write'), grant('manual', 'products:publish'));
    await expect(save(actionIds)).rejects.toThrow(/Quita primero «Publicar producto»/);
    // Rolled back: nothing moved.
    expect(ids(state.grants)).toEqual(['products:publish', 'products:read', 'products:write']);
    expect(state.sources.map((s) => s.id)).toEqual(['manual']);
  });

  it('versión desactualizada → 409 y catálogo desactualizado → 409', async () => {
    await expect(save(['products:read'], 5)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.replaceLibrarySelection(actor, 'recipient-fixture', {
      expectedVersion: 0, catalogVersion: 'viejo', actionIds: ['products:read'],
    })).rejects.toBeInstanceOf(ConflictException);
    expect(ACCESS_CATALOG_VERSION).not.toBe('viejo');
  });

  it('solo Super Admin', async () => {
    await expect(service.replaceLibrarySelection({ ...actor, superAdmin: false }, 'recipient-fixture', {
      expectedVersion: 0, actionIds: ['products:read'],
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(state.sources).toEqual([]);
  });
});
