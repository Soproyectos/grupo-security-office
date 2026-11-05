import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccessAssignmentsService } from './access-assignments.service';
import { ACCESS_CATALOG_VERSION, getActionDefinition, getPackageTemplate, isAssignableAction } from './access-catalog';
import type { AccessIdentity } from './data-scope';

describe('Biblioteca: asignaciones vigentes y retirada de accesos anteriores', () => {
  const actor: AccessIdentity = {
    userId: 'admin-fixture', verified: true, active: true, sessionValid: true,
    sessionUserId: 'admin-fixture', superAdmin: true,
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    accessSource: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: AccessAssignmentsService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 'recipient-fixture' });
    service = new AccessAssignmentsService(prisma as never);
  });

  it.each(['biblioteca-actualizacion', 'gestion-listas-precios', 'biblioteca-productos', 'publicacion-catalogo'])(
    'no permite aplicar el paquete anterior %s', async (packageId) => {
      expect(getPackageTemplate(packageId)?.assignable).toBe(false);
      await expect(service.applyPackage(actor, 'recipient-fixture', packageId, { expectedVersion: 0 }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['listas:read', 'listas:update', 'listas:unlink', 'assignments:manage'])(
    'rechaza concesiones nuevas de %s incluso mediante asignación manual', async (actionId) => {
      expect(isAssignableAction(actionId)).toBe(false);
      await expect(service.replaceSource(actor, 'recipient-fixture', {
        expectedVersion: 0, catalogVersion: ACCESS_CATALOG_VERSION,
        grants: [{ actionId, scope: 'global' }],
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('no permite recrear una plantilla retirada por replaceSource', async () => {
    await expect(service.replaceSource(actor, 'recipient-fixture', {
      expectedVersion: 0, catalogVersion: ACCESS_CATALOG_VERSION,
      source: { kind: 'template', templateId: 'biblioteca-productos' },
      grants: [{ actionId: 'products:read', scope: 'global' }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['list', 'product'] as const)('rechaza el alcance %s para nuevas concesiones de Biblioteca', async (scope) => {
    await expect(service.replaceSource(actor, 'recipient-fixture', {
      expectedVersion: 0, catalogVersion: ACCESS_CATALOG_VERSION,
      grants: [{ actionId: 'products:read', scope, resourceId: 'resource-fixture' }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('puede retirar una fuente anterior sin volver a validar sus permisos retirados', async () => {
    prisma.accessSource.findFirst.mockResolvedValue({ id: 'legacy-source' });
    const receipt = { userId: 'recipient-fixture', sourceId: 'legacy-source', accessVersion: 2, changed: true, grants: [] };
    const remove = jest.spyOn(service, 'removeSource').mockResolvedValue(receipt);
    await expect(service.removePackage(actor, 'recipient-fixture', 'gestion-listas-precios', { expectedVersion: 1 }))
      .resolves.toEqual(receipt);
    expect(remove).toHaveBeenCalledWith(actor, 'recipient-fixture', 'legacy-source', { expectedVersion: 1 });
  });

  it('no concede administración de paquetes a quien no es Super Admin', async () => {
    await expect(service.applyPackage({ ...actor, superAdmin: false }, 'recipient-fixture', 'biblioteca-consulta', { expectedVersion: 0 }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Importaciones y Catálogos maestros no conceden acciones a los paquetes comerciales ni a Fichas/Precios', () => {
    for (const packageId of ['vendedor', 'supervisor-comercial', 'jefe-de-equipo', 'gestion-comercial', 'biblioteca-fichas', 'biblioteca-precios', 'biblioteca-consulta']) {
      expect(getPackageTemplate(packageId)!.selections.some((grant) => /^(imports|masters):/.test(grant.actionId))).toBe(false);
    }
    expect(getPackageTemplate('biblioteca-importaciones')!.selections.some((grant) => grant.actionId === 'products:write')).toBe(false);
  });

  it.each(['biblioteca-consulta', 'biblioteca-fichas', 'biblioteca-precios', 'biblioteca-publicacion', 'biblioteca-importaciones', 'biblioteca-maestros'])(
    'el paquete %s sí es asignable', (packageId) => {
      expect(getPackageTemplate(packageId)?.assignable).toBe(true);
    },
  );

  it('Fichas y Precios no se mezclan: cada pestaña concede solo lo suyo', () => {
    const fichas = getPackageTemplate('biblioteca-fichas')!.selections.map((grant) => grant.actionId);
    const precios = getPackageTemplate('biblioteca-precios')!.selections.map((grant) => grant.actionId);
    expect(fichas).toEqual(expect.arrayContaining(['products:write', 'products:delete', 'products:validate', 'products:notes', 'prices:read']));
    expect(fichas.some((actionId) => /^(prices:(preview|save|apply)|providers:)/.test(actionId))).toBe(false);
    expect(precios).toEqual(expect.arrayContaining(['prices:preview', 'prices:save', 'prices:apply', 'providers:read', 'providers:write']));
    expect(precios.some((actionId) => /^products:(write|delete|validate|notes|publish)$/.test(actionId))).toBe(false);
  });

  it('Biblioteca solo permite alcance global y el paquete anterior Actualización conserva notas sin publicación', () => {
    for (const actionId of ['products:read', 'products:write', 'products:publish', 'products:notes', 'prices:read', 'prices:apply']) {
      expect(getActionDefinition(actionId)?.allowedScopes).toEqual(['global']);
    }
    const update = getPackageTemplate('biblioteca-actualizacion')!;
    expect(update.selections).toContainEqual({ actionId: 'products:notes', scope: 'global' });
    expect(update.selections.some((grant) => grant.actionId === 'products:publish')).toBe(false);
    expect(getPackageTemplate('biblioteca-publicacion')!.selections.some((grant) => grant.actionId === 'products:write')).toBe(false);
    expect(getPackageTemplate('biblioteca-publicacion')!.selections).toContainEqual({ actionId: 'prices:read', scope: 'global' });
    for (const packageId of ['vendedor', 'supervisor-comercial', 'gestion-comercial']) {
      expect(getPackageTemplate(packageId)!.selections.some((grant) => /^(products|prices|providers):/.test(grant.actionId))).toBe(false);
    }
  });

  describe('limpieza transaccional de grants históricos', () => {
    function statefulTransaction() {
      const sources = [
        { id: 'manual', kind: 'manual', templateId: null },
        { id: 'legacy', kind: 'template', templateId: 'biblioteca-productos' },
        { id: 'query', kind: 'template', templateId: 'biblioteca-consulta' },
        { id: 'fichas', kind: 'template', templateId: 'biblioteca-fichas' },
        { id: 'precios', kind: 'template', templateId: 'biblioteca-precios' },
        { id: 'update', kind: 'template', templateId: 'biblioteca-actualizacion' },
        { id: 'commercial', kind: 'template', templateId: 'vendedor' },
      ];
      const grants = [
        { sourceId: 'manual', actionId: 'products:read', scopeKind: 'global', resourceId: '' },
        { sourceId: 'manual', actionId: 'products:publish', scopeKind: 'global', resourceId: '' },
        { sourceId: 'manual', actionId: 'listas:read', scopeKind: 'global', resourceId: '' },
        { sourceId: 'manual', actionId: 'providers:write', scopeKind: 'global', resourceId: '' },
        { sourceId: 'manual', actionId: 'customers:read', scopeKind: 'own', resourceId: '' },
        { sourceId: 'legacy', actionId: 'prices:apply', scopeKind: 'global', resourceId: '' },
        { sourceId: 'query', actionId: 'products:read', scopeKind: 'global', resourceId: '' },
        { sourceId: 'fichas', actionId: 'products:write', scopeKind: 'global', resourceId: '' },
        { sourceId: 'precios', actionId: 'prices:apply', scopeKind: 'global', resourceId: '' },
        { sourceId: 'update', actionId: 'prices:preview', scopeKind: 'global', resourceId: '' },
        { sourceId: 'commercial', actionId: 'quotes:read', scopeKind: 'own', resourceId: '' },
      ];
      const tx = {
        accessSource: { findMany: jest.fn().mockResolvedValue(sources) },
        accessGrant: {
          findMany: jest.fn().mockImplementation(({ where }: { where: { sourceId: { in: string[] }; OR: { actionId: { startsWith: string } }[] } }) => Promise.resolve(
            grants.filter((grant) => where.sourceId.in.includes(grant.sourceId) && where.OR.some(({ actionId }) => grant.actionId.startsWith(actionId.startsWith))),
          )),
          deleteMany: jest.fn().mockImplementation(({ where }: { where: { sourceId: { in: string[] }; OR: { actionId: { startsWith: string } }[] } }) => {
            const matched = grants.filter((grant) => where.sourceId.in.includes(grant.sourceId) && where.OR.some(({ actionId }) => grant.actionId.startsWith(actionId.startsWith)));
            for (const grant of matched) grants.splice(grants.indexOf(grant), 1);
            return Promise.resolve({ count: matched.length });
          }),
        },
      };
      return { tx, grants, sources };
    }

    it('elimina productos, precios, proveedores y listas de manuales/plantillas viejas', async () => {
      const { tx, grants } = statefulTransaction();
      const removed = await (service as any).removeHistoricalLibraryGrants(tx, 'recipient-fixture');

      expect(removed.map((grant: { actionId: string }) => grant.actionId).sort()).toEqual([
        'listas:read', 'prices:apply', 'products:publish', 'products:read', 'providers:write',
      ]);
      expect(grants.some((grant) => grant.sourceId === 'manual' && grant.actionId === 'customers:read')).toBe(true);
      expect(grants.some((grant) => grant.actionId === 'quotes:read')).toBe(true);
    });

    it('conserva grants de otros paquetes vigentes de Biblioteca', async () => {
      const { tx, grants } = statefulTransaction();
      await (service as any).removeHistoricalLibraryGrants(tx, 'recipient-fixture');

      expect(grants.some((grant) => grant.sourceId === 'query' && grant.actionId === 'products:read')).toBe(true);
    });

    it('conserva Fichas, Precios y el paquete anterior Actualización al aplicar otro paquete vigente', async () => {
      const { tx, grants } = statefulTransaction();
      await (service as any).removeHistoricalLibraryGrants(tx, 'recipient-fixture');

      expect(grants).toContainEqual({ sourceId: 'fichas', actionId: 'products:write', scopeKind: 'global', resourceId: '' });
      expect(grants).toContainEqual({ sourceId: 'precios', actionId: 'prices:apply', scopeKind: 'global', resourceId: '' });
      expect(grants).toContainEqual({ sourceId: 'update', actionId: 'prices:preview', scopeKind: 'global', resourceId: '' });
    });

    it('mantiene sin cambios una fuente manual cuyo único grant pertenece a Comercial', async () => {
      const { tx, grants } = statefulTransaction();
      await (service as any).removeHistoricalLibraryGrants(tx, 'recipient-fixture');

      expect(grants).toContainEqual({ sourceId: 'manual', actionId: 'customers:read', scopeKind: 'own', resourceId: '' });
      expect(tx.accessGrant.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('no ejecuta deleteMany si no hay concesiones históricas de Biblioteca', async () => {
      const tx = {
        accessSource: { findMany: jest.fn().mockResolvedValue([{ id: 'manual', kind: 'manual', templateId: null }]) },
        accessGrant: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn(),
        },
      };
      await expect((service as any).removeHistoricalLibraryGrants(tx, 'recipient-fixture')).resolves.toEqual([]);
      expect(tx.accessGrant.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('dependencias frente a la purga de Biblioteca', () => {
    function dependencyPrisma(rows: unknown[]) {
      return { accessGrant: { findMany: jest.fn().mockResolvedValue(rows) } };
    }
    const publishGrants = [
      { actionId: 'products:read' }, { actionId: 'products:publish' },
    ];
    const manualWrite = { actionId: 'products:write', source: { kind: 'manual', templateId: null } };
    const legacyWrite = { actionId: 'products:write', source: { kind: 'template', templateId: 'biblioteca-productos' } };
    const fichasWrite = { actionId: 'products:write', source: { kind: 'template', templateId: 'biblioteca-fichas' } };
    const legacyUpdateWrite = { actionId: 'products:write', source: { kind: 'template', templateId: 'biblioteca-actualizacion' } };

    it.each([manualWrite, legacyWrite])('un paquete vigente no cuenta products:write de una fuente que va a purgar', async (row) => {
      const svc = new AccessAssignmentsService(dependencyPrisma([row]) as never);
      await expect((svc as any).assertDependencies('recipient-fixture', undefined, publishGrants, true))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('sin purga (asignación manual) la dependencia de otra fuente sí cuenta', async () => {
      const svc = new AccessAssignmentsService(dependencyPrisma([manualWrite]) as never);
      await expect((svc as any).assertDependencies('recipient-fixture', undefined, publishGrants, false)).resolves.toBeUndefined();
    });

    it.each([fichasWrite, legacyUpdateWrite])('products:write de Fichas o del paquete anterior Actualización sí cubre Publicar en tienda', async (row) => {
      const svc = new AccessAssignmentsService(dependencyPrisma([row]) as never);
      await expect((svc as any).assertDependencies('recipient-fixture', undefined, publishGrants, true)).resolves.toBeUndefined();
    });

    it('aplicar Publicar en tienda pide al servidor el origen de cada concesión y rechaza la dependencia que se purgaría', async () => {
      const findMany = jest.fn().mockResolvedValue([manualWrite]);
      const svc = new AccessAssignmentsService({ ...prisma, accessGrant: { findMany } } as never);
      await expect(svc.applyPackage(actor, 'recipient-fixture', 'biblioteca-publicacion', { expectedVersion: 0 }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
        select: { actionId: true, source: { select: { kind: true, templateId: true } } },
      }));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  it('retirar el paquete anterior Actualización pasa por el retiro vigente de Biblioteca (una sola transacción OCC)', async () => {
    const removedGrant = { sourceId: 'update', actionId: 'prices:apply', scopeKind: 'global', resourceId: '' };
    const tx = {
      accessSource: {
        findFirst: jest.fn().mockResolvedValue({ id: 'update' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'update', kind: 'template', templateId: 'biblioteca-actualizacion' }]),
        delete: jest.fn().mockResolvedValue({ id: 'update' }),
      },
      accessGrant: {
        findMany: jest.fn().mockResolvedValue([removedGrant]),
        deleteMany: jest.fn(),
      },
      accessState: { upsert: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      accessOperation: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) => callback(tx));

    const receipt = await service.removePackage(actor, 'recipient-fixture', 'biblioteca-actualizacion', { expectedVersion: 3 });

    expect(receipt).toMatchObject({ sourceId: 'update', accessVersion: 4, changed: true });
    expect(tx.accessSource.delete).toHaveBeenCalledWith({ where: { id: 'update' } });
    expect(tx.accessGrant.deleteMany).not.toHaveBeenCalled();
    expect(tx.accessOperation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ result: expect.objectContaining({ removedGrants: [removedGrant] }) }),
    }));
  });

  it('replay de paquete vigente vuelve antes de abrir transacción o limpiar grants', async () => {
    prisma.accessSource.findFirst.mockResolvedValue({ id: 'query-source' });
    const receipt = { userId: 'recipient-fixture', sourceId: 'query-source', accessVersion: 3, changed: true, grants: [], replayed: true };
    jest.spyOn(service as any, 'replayOperation').mockResolvedValue(receipt);

    await expect(service.applyPackage(actor, 'recipient-fixture', 'biblioteca-consulta', {
      expectedVersion: 2,
      idempotencyKey: 'library-replay',
    })).resolves.toMatchObject({ replayed: true, accessVersion: 3 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('remove vigente agrupa OCC, retiro, limpieza y auditoría en una sola transacción', async () => {
    const removedManualGrant = { sourceId: 'manual', actionId: 'products:publish', scopeKind: 'global', resourceId: '' }
    const removedPackageGrant = { sourceId: 'query', actionId: 'products:read', scopeKind: 'global', resourceId: '' }
    const tx = {
      accessSource: {
        findFirst: jest.fn().mockResolvedValue({ id: 'query' }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'manual', kind: 'manual', templateId: null },
          { id: 'update', kind: 'template', templateId: 'biblioteca-actualizacion' },
        ]),
        delete: jest.fn().mockResolvedValue({ id: 'query' }),
      },
      accessGrant: {
        findMany: jest.fn()
          .mockResolvedValueOnce([removedManualGrant])
          .mockResolvedValueOnce([removedPackageGrant]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      accessState: {
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      accessOperation: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    }
    prisma.$transaction.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) => callback(tx))

    const receipt = await service.removePackage(actor, 'recipient-fixture', 'biblioteca-consulta', { expectedVersion: 4 })

    expect(receipt).toMatchObject({ accessVersion: 5, changed: true, grants: [] })
    expect(tx.accessState.updateMany).toHaveBeenCalledTimes(1)
    expect(tx.accessSource.delete).toHaveBeenCalledWith({ where: { id: 'query' } })
    expect(tx.accessGrant.deleteMany).toHaveBeenCalledTimes(1)
    expect(tx.accessOperation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        result: expect.objectContaining({ removedGrants: [removedPackageGrant, removedManualGrant] }),
      }),
    }))
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        oldValues: { sourceId: 'query', removedGrants: [removedPackageGrant, removedManualGrant] },
        newValues: { sourceId: null, grants: [], cleanedHistoricalLibraryGrants: 1 },
      }),
    }))
  })

  it('remove de paquete ausente limpia un grant anterior bajo un único bump OCC', async () => {
    const historicalGrant = { sourceId: 'manual', actionId: 'listas:read', scopeKind: 'global', resourceId: '' }
    const tx = {
      accessSource: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ id: 'manual', kind: 'manual', templateId: null }]),
      },
      accessGrant: {
        findMany: jest.fn().mockResolvedValue([historicalGrant]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      accessState: {
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      accessOperation: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    }
    prisma.$transaction.mockImplementation((callback: (transaction: unknown) => Promise<unknown>) => callback(tx))

    const receipt = await service.removePackage(actor, 'recipient-fixture', 'biblioteca-publicacion', { expectedVersion: 8 })

    expect(receipt).toMatchObject({ sourceId: '', accessVersion: 9, changed: true })
    expect(tx.accessState.updateMany).toHaveBeenCalledTimes(1)
    expect(tx.accessGrant.deleteMany).toHaveBeenCalledTimes(1)
    expect(tx.accessOperation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ result: expect.objectContaining({ removedGrants: [historicalGrant] }) }),
    }))
  })
});
