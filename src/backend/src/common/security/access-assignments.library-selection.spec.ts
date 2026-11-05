import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AccessAssignmentsService } from './access-assignments.service';
import { ACCESS_CATALOG_VERSION } from './access-catalog';
import type { AccessIdentity } from './data-scope';
import { LIBRARY_SELECTION_ACTION_IDS, LIBRARY_SELECTION_TEMPLATE_ID, closeLibrarySelection } from './library-selection';

type Source = { id: string; userId: string; kind: string; templateId: string | null };
type Grant = { sourceId: string; actionId: string; scopeKind: string; resourceId: string };

describe('Biblioteca: selección por casillas (replaceLibrarySelection)', () => {
  const actor: AccessIdentity = {
    userId: 'admin-fixture', verified: true, active: true, sessionValid: true,
    sessionUserId: 'admin-fixture', superAdmin: true,
  };
  const ids = (grants: Grant[]) => grants.map((g) => g.actionId).sort();
  let sources: Source[];
  let grants: Grant[];
  let operations: unknown[];
  let audits: { action: string; newValues: { replacedPackageIds: unknown[] } }[];
  let version: number;
  let nextId: number;
  let sourceReadDelayMs: number;
  let service: AccessAssignmentsService;

  const src = (id: string, kind: string, templateId: string | null = null): Source => ({ id, userId: 'recipient-fixture', kind, templateId });
  const grant = (sourceId: string, actionId: string, scopeKind = 'global'): Grant => ({ sourceId, actionId, scopeKind, resourceId: '' });

  function buildPrisma() {
    const inSet = (where: { sourceId?: string | { in: string[] }; OR?: { actionId: { startsWith: string } }[] }, g: Grant) =>
      (!where.sourceId || (typeof where.sourceId === 'string' ? where.sourceId === g.sourceId : where.sourceId.in.includes(g.sourceId)))
      && (!where.OR || where.OR.some(({ actionId }) => g.actionId.startsWith(actionId.startsWith)));
    const tx = {
      accessState: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockImplementation(({ where }: { where: { version: number } }) => {
          if (where.version !== version) return Promise.resolve({ count: 0 });
          version += 1;
          return Promise.resolve({ count: 1 });
        }),
        findUnique: jest.fn().mockImplementation(() => Promise.resolve({ version })),
      },
      accessSource: {
        findMany: jest.fn().mockImplementation(async () => {
          const delay = sourceReadDelayMs;
          sourceReadDelayMs = 0;
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          return sources.map((s) => ({ ...s }));
        }),
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(sources.find((s) => s.id === where.id) ?? null)),
        create: jest.fn().mockImplementation(({ data }: { data: Omit<Source, 'id'> }) => {
          const created = { ...data, id: `sel-${(nextId += 1)}` } as Source;
          sources.push(created);
          return Promise.resolve({ id: created.id });
        }),
        update: jest.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Partial<Source> }) => {
          Object.assign(sources.find((s) => s.id === where.id)!, data);
          return Promise.resolve({ id: where.id });
        }),
        delete: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          sources = sources.filter((s) => s.id !== where.id);
          grants = grants.filter((g) => g.sourceId !== where.id);
          return Promise.resolve({});
        }),
        deleteMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) => {
          sources = sources.filter((s) => !where.id.in.includes(s.id));
          grants = grants.filter((g) => !where.id.in.includes(g.sourceId));
          return Promise.resolve({});
        }),
      },
      accessGrant: {
        findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(grants.filter((g) => inSet(where, g)).map((g) => ({ ...g })))),
        deleteMany: jest.fn().mockImplementation(({ where }) => {
          const hit = grants.filter((g) => inSet(where, g));
          grants = grants.filter((g) => !hit.includes(g));
          return Promise.resolve({ count: hit.length });
        }),
        createMany: jest.fn().mockImplementation(({ data }: { data: Grant[] }) => {
          grants.push(...data.map((d) => ({ ...d })));
          return Promise.resolve({ count: data.length });
        }),
      },
      accessOperation: { create: jest.fn().mockImplementation(({ data }) => { operations.push(data); return Promise.resolve({}); }) },
      auditLog: { create: jest.fn().mockImplementation(({ data }) => { audits.push(data); return Promise.resolve({}); }) },
    };
    return {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'recipient-fixture' }) },
      accessOperation: { findUnique: jest.fn().mockResolvedValue(null) },
      // Sin rollback real: las pruebas de rechazo comprueban que nada cambió antes de lanzar.
      $transaction: jest.fn().mockImplementation(async (
        fn: (t: typeof tx) => Promise<unknown>,
        options?: { timeout?: number },
      ) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            fn(tx),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('Transaction expired')), options?.timeout ?? 5_000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }),
    };
  }

  beforeEach(() => {
    sources = []; grants = []; operations = []; audits = []; version = 0; nextId = 0; sourceReadDelayMs = 0;
    service = new AccessAssignmentsService(buildPrisma() as never);
  });

  const save = (actionIds: string[], expectedVersion = version) =>
    service.replaceLibrarySelection(actor, 'recipient-fixture', { expectedVersion, actionIds });

  it('guarda permisos y auditoría aunque una consulta por túnel tarde más de cinco segundos', async () => {
    jest.useFakeTimers();
    try {
      sourceReadDelayMs = 6_000;
      const result = save(['products:write']).then(
        (receipt) => ({ receipt, error: undefined }),
        (error: unknown) => ({ receipt: undefined, error }),
      );
      await jest.advanceTimersByTimeAsync(6_000);
      const outcome = await result;
      expect(outcome.error).toBeUndefined();
      expect(outcome.receipt).toMatchObject({ accessVersion: 1, changed: true });
      expect(ids(grants)).toEqual(['products:read', 'products:write']);
      expect(operations).toHaveLength(1);
      expect(audits).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });
  it('guarda UNA fuente template reservada con alcance global y solo lo marcado más sus dependencias', async () => {
    const receipt = await save(['products:write', 'prices:apply']);
    const selection = sources.filter((s) => s.templateId === LIBRARY_SELECTION_TEMPLATE_ID);
    expect(selection).toHaveLength(1);
    expect(selection[0]).toMatchObject({ kind: 'template' });
    expect(ids(grants)).toEqual(['prices:apply', 'prices:read', 'products:read', 'products:write']);
    expect(grants.every((g) => g.scopeKind === 'global' && g.resourceId === '')).toBe(true);
    expect(receipt).toMatchObject({ accessVersion: 1, changed: true, sourceId: selection[0].id });
  });

  it('calcula el cierre de dependencias en el servidor (cadena guardar → revisar → ver precios)', async () => {
    await save(['prices:save', 'providers:write']);
    expect(ids(grants)).toEqual(['prices:preview', 'prices:read', 'prices:save', 'providers:read', 'providers:write']);
    expect(closeLibrarySelection(['products:notes'])).toEqual(['products:read', 'products:notes']);
  });

  it('rechaza con 400 una acción fuera del conjunto de Biblioteca y no escribe nada', async () => {
    for (const bad of ['products:publish', 'customers:read', 'listas:read', 'libraryStats:update', 'no-existe']) {
      await expect(save(['products:read', bad])).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(sources).toEqual([]);
    expect(grants).toEqual([]);
    expect(version).toBe(0);
  });

  it('no escala permisos: nunca concede más que lo marcado y sus dependencias', async () => {
    await save(['prices:read']);
    expect(ids(grants)).toEqual(['prices:read']);
    await save(['products:read']);
    expect(ids(grants)).toEqual(['products:read']);
    expect(LIBRARY_SELECTION_ACTION_IDS).not.toContain('products:publish');
  });

  it('un segundo guardado reemplaza la misma fuente y quitar una casilla retira el permiso', async () => {
    await save(['products:write', 'products:delete']);
    const firstId = sources[0].id;
    await save(['products:write']);
    expect(sources.filter((s) => s.templateId === LIBRARY_SELECTION_TEMPLATE_ID).map((s) => s.id)).toEqual([firstId]);
    expect(ids(grants)).toEqual(['products:read', 'products:write']);
  });

  it('selección vacía retira todo Biblioteca y conserva lo comercial', async () => {
    sources.push(src('manual', 'manual'), src('vendedor', 'template', 'vendedor'));
    grants.push(grant('manual', 'quotes:read', 'own'), grant('vendedor', 'customers:read', 'own'));
    await save(['products:read']);
    await save([]);
    expect(sources.some((s) => s.templateId === LIBRARY_SELECTION_TEMPLATE_ID)).toBe(false);
    expect(ids(grants)).toEqual(['customers:read', 'quotes:read']);
  });

  it('purga en la misma operación los paquetes de Biblioteca y los permisos de Biblioteca de fuentes manuales', async () => {
    sources.push(
      src('manual', 'manual'), src('query', 'template', 'biblioteca-consulta'), src('fichas', 'template', 'biblioteca-fichas'),
      src('precios', 'template', 'biblioteca-precios'), src('old', 'template', 'biblioteca-actualizacion'),
      src('listas', 'template', 'gestion-listas-precios'), src('vendedor', 'template', 'vendedor'),
    );
    grants.push(
      grant('manual', 'products:publish'), grant('manual', 'customers:read', 'own'), grant('query', 'products:read'),
      grant('fichas', 'products:write'), grant('precios', 'prices:apply'), grant('old', 'providers:write'),
      grant('listas', 'prices:save'), grant('vendedor', 'quotes:read', 'own'),
    );
    await save(['products:read']);
    expect(sources.map((s) => s.id).filter((id) => !id.startsWith('sel-')).sort()).toEqual(['listas', 'manual', 'vendedor']);
    expect(grants.filter((g) => /^(products|prices|providers):/.test(g.actionId)).map((g) => g.actionId)).toEqual(['products:read']);
    expect(ids(grants.filter((g) => g.sourceId === 'manual' || g.sourceId === 'vendedor'))).toEqual(['customers:read', 'quotes:read']);
    expect(audits[0].action).toBe('replaceLibrarySelection');
    expect(audits[0].newValues.replacedPackageIds).toEqual(expect.arrayContaining(['biblioteca-consulta', 'biblioteca-fichas', 'biblioteca-precios', 'biblioteca-actualizacion']));
    expect(operations).toHaveLength(1);
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
    expect(ids(grants)).toEqual(['imports:read', 'masters:read', 'masters:write', 'products:read']);
    expect(grants.every((g) => g.scopeKind === 'global')).toBe(true);
  });

  it('agregar y quitar las casillas nuevas reemplaza la misma fuente y las retira', async () => {
    await save(['imports:run', 'masters:write', 'products:approveSpecs']);
    expect(ids(grants)).toEqual([
      'imports:read', 'imports:run', 'masters:read', 'masters:write',
      'products:approveSpecs', 'products:read', 'products:write',
    ]);
    const firstId = sources[0].id;
    await save(['masters:read']);
    expect(sources.map((s) => s.id)).toEqual([firstId]);
    expect(ids(grants)).toEqual(['masters:read', 'products:read']);
    await save([]);
    expect(grants).toEqual([]);
  });

  it('los paquetes Importaciones/Maestros y sus permisos manuales se reemplazan por la selección', async () => {
    sources.push(
      src('imp', 'template', 'biblioteca-importaciones'), src('mas', 'template', 'biblioteca-maestros'),
      src('manual', 'manual'), src('vendedor', 'template', 'vendedor'),
    );
    grants.push(
      grant('imp', 'imports:run'), grant('mas', 'masters:write'), grant('manual', 'masters:read'),
      grant('vendedor', 'quotes:read', 'own'),
    );
    await save(['products:read']);
    expect(sources.map((s) => s.id).filter((id) => !id.startsWith('sel-')).sort()).toEqual(['manual', 'vendedor']);
    expect(ids(grants)).toEqual(['products:read', 'quotes:read']);
  });

  it('conserva Publicar en tienda si la selección sigue incluyendo products:write', async () => {
    sources.push(src('pub', 'template', 'biblioteca-publicacion'), src('fichas', 'template', 'biblioteca-fichas'));
    grants.push(grant('pub', 'products:publish'), grant('fichas', 'products:write'));
    await save(['products:write', 'prices:preview']);
    expect(sources.some((s) => s.id === 'pub')).toBe(true);
    expect(grants).toContainEqual(grant('pub', 'products:publish'));
    expect(sources.some((s) => s.id === 'fichas')).toBe(false);
  });

  it.each([[['products:read']], [[]]])('rechaza con 400 si hay Publicar en tienda y la selección %j no edita fichas', async (actionIds) => {
    sources.push(src('pub', 'template', 'biblioteca-publicacion'));
    grants.push(grant('pub', 'products:publish'));
    await expect(save(actionIds)).rejects.toThrow('Quita primero Publicar en tienda');
    expect(sources.map((s) => s.id)).toEqual(['pub']);
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
    expect(sources).toEqual([]);
  });
});
