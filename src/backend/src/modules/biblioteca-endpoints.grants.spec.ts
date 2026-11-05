/**
 * Biblioteca (slice 2): los endpoints restantes autorizan SOLO por concesiones de panel (alcance global).
 * El cargo nunca concede nada y las Listas no intervienen. Contrato de metadatos + comportamiento del GrantGuard.
 */
import 'reflect-metadata';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { closeLibrarySelection } from '../common/security/library-selection';
import { GrantGuard, REQUIRED_GRANTS_KEY, RequireGrant } from '../common/security/require-grant';
import { ImportController } from './products/import/import.controller';
import { PriceImportController } from './prices/import/price-import.controller';
import { PriceImportResolutionController } from './prices/import/price-import-resolution.controller';
import { PublicationBoardController } from './products/validation/publication-board.controller';
import { PublicationBoardService } from './products/validation/publication-board.service';
import { ProductValidationController } from './products/validation/validation.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { CatalogJobsController, CatalogJobsHistoryController } from './catalog-jobs/catalog-jobs.controller';
import { AuditController } from './audit/audit.controller';
import { LibrarySpecsController } from './library-specs/library-specs.controller';
import { ProductPreviewDetailController } from './products/public-detail/product-preview-detail.controller';

const grant = (actionId: string, scope = 'global') => ({ sourceId: `s-${actionId}-${scope}`, actionId, scope });
const grantsOf = (target: object): string[] | undefined => Reflect.getMetadata(REQUIRED_GRANTS_KEY, target);
const rolesOf = (target: object): string[] | undefined => Reflect.getMetadata(ROLES_KEY, target);
const proto = (cls: any) => cls.prototype as Record<string, Function>;

const adminComercial = { sub: 'u-ac', roles: ['Admin Comercial'] };
const supervisor = { sub: 'u-sup', roles: ['Supervisor'] };
const vendedor = { sub: 'u-ven', roles: ['Vendedor'] };
const superAdmin = { sub: 'u-sa', roles: ['Super Admin'] };

async function runGuard(cls: any, handlerName: string | null, user: any, rows: any[]): Promise<boolean> {
  const guard = new GrantGuard(new Reflector(), { grantsForUser: jest.fn().mockResolvedValue(rows) } as any);
  const context = {
    getHandler: () => (handlerName ? proto(cls)[handlerName] : (() => undefined)),
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return guard.canActivate(context);
}

describe('Importación masiva de productos y consulta de precio por SKU (ImportController)', () => {
  const expected: Record<string, string[]> = {
    preview: ['products:write'],
    execute: ['products:write'],
    getProgress: ['products:write'],
    getCurrentPrice: ['products:write', 'prices:read'],
    getCurrentPrices: ['products:write', 'prices:read'],
    listPresets: ['products:write'],
    savePreset: ['products:write'],
    deletePreset: ['products:write'],
  };

  it.each(Object.entries(expected))('%s exige %j y no declara @Roles', (name, grants) => {
    expect(grantsOf(proto(ImportController)[name])).toEqual(grants);
    expect(rolesOf(proto(ImportController)[name])).toBeUndefined();
  });

  it('no queda ningún handler sin concesión declarada', () => {
    const names = Object.getOwnPropertyNames(ImportController.prototype).filter((n) => n !== 'constructor' && n !== 'userId');
    expect(names.sort()).toEqual(Object.keys(expected).sort());
  });

  it('403 con cero concesiones para los cargos que antes pasaban (Admin Comercial / Supervisor / cualquier cargo en current-price)', async () => {
    for (const user of [adminComercial, supervisor, vendedor]) {
      for (const handler of Object.keys(expected)) {
        await expect(runGuard(ImportController, handler, user, [])).rejects.toBeInstanceOf(ForbiddenException);
      }
    }
  });

  it('el precio por SKU exige además prices:read; un Vendedor con ambas concesiones pasa', async () => {
    const onlyWrite = [grant('products:read'), grant('products:write')];
    await expect(runGuard(ImportController, 'getCurrentPrices', vendedor, onlyWrite)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runGuard(ImportController, 'preview', vendedor, onlyWrite)).resolves.toBe(true);
    const both = [...onlyWrite, grant('prices:read'), grant('listas:read')];
    await expect(runGuard(ImportController, 'getCurrentPrice', vendedor, both)).resolves.toBe(true);
  });

  it('una concesión ligada a una Lista no basta; Super Admin conserva su excepción', async () => {
    await expect(runGuard(ImportController, 'execute', vendedor, [grant('products:write', 'list'), grant('products:read', 'list')])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runGuard(ImportController, 'execute', superAdmin, [])).resolves.toBe(true);
  });
});

describe('Importación de precios (PriceImportController y resolución de referencias)', () => {
  const expected: Record<string, string[]> = {
    downloadOfficialTemplate: ['prices:preview'],
    exportLista: ['prices:read'],
    preview: ['prices:preview', 'prices:read'],
    saveRevision: ['prices:save', 'prices:preview', 'prices:read'],
    listRevisions: ['prices:read'],
    getRevision: ['prices:read'],
    getRevisionFile: ['prices:read'],
    applyRevision: ['prices:apply', 'prices:read'],
    discardRevision: ['prices:save', 'prices:read'],
    listProfiles: ['providers:read'],
    getProfile: ['providers:read'],
    createProfile: ['providers:write', 'providers:read'],
    recognizeProfile: ['providers:read'],
    updateProfile: ['providers:write', 'providers:read'],
    setEquivalences: ['providers:write', 'providers:read'],
    resolveReferences: ['providers:read'],
    deleteProfile: ['providers:write', 'providers:read'],
  };

  it.each(Object.entries(expected))('PriceImportController.%s exige %j', (name, grants) => {
    expect(grantsOf(proto(PriceImportController)[name])).toEqual(grants);
  });

  it('la plantilla por modo (downloadTemplate) decide en el servicio: vacías prices:preview, con referencias prices:read', () => {
    expect(grantsOf(proto(PriceImportController).downloadTemplate)).toBeUndefined(); // decisión explícita en el servicio (probada en price-template-download.spec)
  });

  it('el controlador ya no declara @Roles ni a nivel de clase ni de handler', () => {
    expect(rolesOf(PriceImportController)).toBeUndefined();
    for (const name of Object.getOwnPropertyNames(PriceImportController.prototype).filter((n) => n !== 'constructor')) {
      expect(rolesOf(proto(PriceImportController)[name])).toBeUndefined();
    }
  });

  it.each(['list', 'resolve'])('PriceImportResolutionController.%s exige prices:read (el servicio añade products:write + prices:apply para CREATE)', (name) => {
    expect(grantsOf(proto(PriceImportResolutionController)[name])).toEqual(['prices:read']);
  });

  it('403 con cero concesiones para Admin Comercial y Supervisor en todos los handlers con guard', async () => {
    for (const user of [adminComercial, supervisor]) {
      for (const handler of Object.keys(expected)) {
        await expect(runGuard(PriceImportController, handler, user, [])).rejects.toBeInstanceOf(ForbiddenException);
      }
      for (const handler of ['list', 'resolve']) {
        await expect(runGuard(PriceImportResolutionController, handler, user, [])).rejects.toBeInstanceOf(ForbiddenException);
      }
    }
  });

  it('un Vendedor con las concesiones globales pasa; una concesión de Lista no; Super Admin sí', async () => {
    const rows = ['prices:save', 'prices:preview', 'prices:read', 'prices:apply', 'listas:read'].map((a) => grant(a));
    await expect(runGuard(PriceImportController, 'saveRevision', vendedor, rows)).resolves.toBe(true);
    await expect(runGuard(PriceImportController, 'applyRevision', vendedor, rows)).resolves.toBe(true);
    await expect(runGuard(PriceImportController, 'discardRevision', vendedor, rows)).resolves.toBe(true);
    const lista = rows.map((r) => ({ ...r, scope: 'list' }));
    await expect(runGuard(PriceImportController, 'applyRevision', vendedor, lista)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runGuard(PriceImportController, 'applyRevision', superAdmin, [])).resolves.toBe(true);
  });

  it('perfiles de proveedor: leer no escribe; escribir exige providers:write global', async () => {
    const read = [grant('providers:read')];
    await expect(runGuard(PriceImportController, 'listProfiles', vendedor, read)).resolves.toBe(true);
    await expect(runGuard(PriceImportController, 'createProfile', vendedor, read)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runGuard(PriceImportController, 'createProfile', vendedor, [...read, grant('providers:write')])).resolves.toBe(true);
  });
});

describe('Tablero de publicación, historial por producto y bloque del tablero inicial', () => {
  it('GET /catalog/publication-board exige products:read y no declara @Roles', async () => {
    const handler = proto(PublicationBoardController).board;
    expect(grantsOf(handler)).toEqual(['products:read']);
    expect(rolesOf(PublicationBoardController)).toBeUndefined();
    expect(rolesOf(handler)).toBeUndefined();
    for (const user of [adminComercial, supervisor]) {
      await expect(runGuard(PublicationBoardController, 'board', user, [])).rejects.toBeInstanceOf(ForbiddenException);
    }
    await expect(runGuard(PublicationBoardController, 'board', vendedor, [grant('products:read')])).resolves.toBe(true);
    await expect(runGuard(PublicationBoardController, 'board', superAdmin, [])).resolves.toBe(true);
  });

  it('GET /products/:id/publication-history conserva products:read (sin Lista en el servicio)', () => {
    const names = Object.getOwnPropertyNames(ProductValidationController.prototype).filter((n) => n !== 'constructor');
    const history = names.find((n) => grantsOf(proto(ProductValidationController)[n])?.join() === 'products:read');
    expect(history).toBeDefined();
  });

  it('GET /dashboard/insights/catalog exige products:read en lugar de ALL_ROLES', async () => {
    const handler = proto(DashboardController).getCatalogInsights;
    expect(grantsOf(handler)).toEqual(['products:read']);
    expect(rolesOf(handler)).toBeUndefined();
    await expect(runGuard(DashboardController, 'getCatalogInsights', adminComercial, [])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runGuard(DashboardController, 'getCatalogInsights', vendedor, [grant('products:read')])).resolves.toBe(true);
  });

  it('los trabajos del catálogo (encolar, leer, cancelar, historial de un producto) exigen products:read', async () => {
    for (const cls of [CatalogJobsController, CatalogJobsHistoryController]) {
      expect(grantsOf(cls)).toEqual(['products:read']);
      expect(rolesOf(cls)).toBeUndefined();
    }
    await expect(runGuard(CatalogJobsController, 'enqueue', supervisor, [])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runGuard(CatalogJobsHistoryController, 'history', adminComercial, [])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runGuard(CatalogJobsController, 'list', vendedor, [grant('products:read')])).resolves.toBe(true);
  });
});

describe('PublicationBoardService sin Listas', () => {
  const build = () => {
    const client = {
      product: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([{ id: 'p1', sku: 'S', name: 'N', catalogName: null, lifecycleStatus: 'DRAFT', category: null }]) },
      productRevision: { findMany: jest.fn().mockResolvedValue([]) },
      publicationEvent: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    };
    const acl = { getAllowedListaIds: jest.fn().mockResolvedValue([]), assertProductAccess: jest.fn() };
    const service = new PublicationBoardService({} as any, acl as any, { client } as any);
    return { client, acl, service };
  };
  const ctx = { userId: 'u-1', roles: ['Vendedor'] };

  it.each(['pendientes', 'problemas', 'publicados'])('la vista %s no filtra por Lista ni consulta el ACL de Lista', async (view) => {
    const { service, client, acl } = build();
    const result = await service.board(view, ctx);
    expect(result.total).toBe(1);
    expect(JSON.stringify(client.product.count.mock.calls[0][0])).not.toContain('listaId');
    expect(acl.getAllowedListaIds).not.toHaveBeenCalled();
  });

  it('historial: todos los eventos, sin acotar a productos de Listas', async () => {
    const { service, client, acl } = build();
    await service.board('historial', ctx);
    expect(client.publicationEvent.count).toHaveBeenCalledWith({ where: {} });
    expect(client.product.findMany).not.toHaveBeenCalled();
    expect(acl.getAllowedListaIds).not.toHaveBeenCalled();
  });

  it('historial de un producto: no consulta el ACL de Lista (la concesión la exige el controlador)', async () => {
    const { service, client, acl } = build();
    client.publicationEvent.findMany.mockResolvedValue([{ id: 'e1' }]);
    await expect(service.productHistory('p1', ctx)).resolves.toEqual([{ id: 'e1' }]);
    expect(acl.assertProductAccess).not.toHaveBeenCalled();
  });

  it('sin identidad sigue negando', async () => {
    const { service } = build();
    await expect(service.board('pendientes', { userId: undefined, roles: [] } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Historial por producto GET /audit/:entity/:entityId', () => {
  const build = (rows: any[]) => {
    const auditService = { findByEntity: jest.fn().mockResolvedValue({ data: [{ id: 'log-1' }] }), findAll: jest.fn() };
    const controller = new AuditController(auditService as any, { grantsForUser: jest.fn().mockResolvedValue(rows) } as any);
    return { controller, auditService };
  };

  it('Product: exige products:write global; Admin Comercial y Supervisor sin concesiones reciben 403', async () => {
    for (const user of [adminComercial, supervisor]) {
      const { controller, auditService } = build([]);
      await expect(controller.findByEntity('Product', 'p-1', user)).rejects.toBeInstanceOf(ForbiddenException);
      expect(auditService.findByEntity).not.toHaveBeenCalled();
    }
  });

  it('Product: Fichas con notas lo lee, también con la entidad en minúsculas', async () => {
    const rows = [grant('products:read'), grant('products:write'), grant('products:notes')];
    const { controller, auditService } = build(rows);
    await expect(controller.findByEntity('Product', 'p-1', vendedor)).resolves.toEqual({ data: [{ id: 'log-1' }] });
    await expect(controller.findByEntity('product', 'p-1', vendedor)).resolves.toBeDefined();
    expect(auditService.findByEntity).toHaveBeenCalledWith('Product', 'p-1', { roles: ['Vendedor'] });
  });

  it('Product: products:read solo, o products:write ligado a una Lista, no bastan', async () => {
    await expect(build([grant('products:read')]).controller.findByEntity('Product', 'p-1', vendedor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build([grant('products:read', 'list'), grant('products:write', 'list')]).controller.findByEntity('Product', 'p-1', vendedor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Product: Super Admin conserva su excepción', async () => {
    const { controller } = build([]);
    await expect(controller.findByEntity('Product', 'p-1', superAdmin)).resolves.toBeDefined();
  });

  it('no entrega valores históricos de notas con solo products:write', async () => {
    const { controller, auditService } = build([grant('products:read'), grant('products:write')]);
    await expect(controller.findByEntity('Product', 'p-1', vendedor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditService.findByEntity).not.toHaveBeenCalled();
  });

  it('el feed general no habilita auditoría de Biblioteca por cargo', async () => {
    const denied = build([]);
    await denied.controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, adminComercial);
    expect(denied.auditService.findAll).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ libraryWrite: false }));
    const allowed = build([grant('products:read'), grant('products:write'), grant('products:notes')]);
    await allowed.controller.findAll(undefined, undefined, undefined, undefined, undefined, undefined, adminComercial);
    expect(allowed.auditService.findAll).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ libraryWrite: true }));
  });

  it.each(['Price', 'Category', 'Brand', 'Lista'])('la auditoría de %s también exige Fichas', async (entity) => {
    const { controller, auditService } = build([]);
    await expect(controller.findByEntity(entity, 'x-1', adminComercial)).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditService.findByEntity).not.toHaveBeenCalled();
  });

  it('las demás entidades conservan su protección: solo Super Admin y Admin Comercial; products:write no las abre', async () => {
    for (const entity of ['User', 'Assignment']) {
      const denied = build([grant('products:read'), grant('products:write')]);
      await expect(denied.controller.findByEntity(entity, 'x-1', vendedor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(denied.controller.findByEntity(entity, 'x-1', supervisor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(denied.auditService.findByEntity).not.toHaveBeenCalled();
      const allowed = build([]);
      await expect(allowed.controller.findByEntity(entity, 'x-1', adminComercial)).resolves.toBeDefined();
      await expect(allowed.controller.findByEntity(entity, 'x-1', superAdmin)).resolves.toBeDefined();
    }
  });

  it('el listado general GET /audit conserva @Roles(Super Admin, Admin Comercial)', () => {
    expect(rolesOf(proto(AuditController).findAll)).toEqual(['Super Admin', 'Admin Comercial']);
  });
});

describe('Datos clave de Biblioteca (LibrarySpecsController y vista previa)', () => {
  const expected: Record<string, string[]> = {
    listDefinitions: ['products:read'],
    getDefinition: ['products:read'],
    createDefinition: ['products:write'],
    updateDefinition: ['products:write'],
    getTemplate: ['products:read'],
    putTemplate: ['products:write'],
    approve: ['products:write', 'products:approveSpecs'],
    getValues: ['products:read'],
    putValues: ['products:write'],
    publish: ['products:write', 'products:publish'],
    getMissing: ['products:read'],
    preview: ['products:read'],
    projection: ['products:read'],
    definitionUsage: ['masters:read'],
    templateUsage: ['masters:read'],
  };

  it.each(Object.entries(expected))('LibrarySpecsController.%s exige %j y no declara @Roles', (name, grants) => {
    expect(grantsOf(proto(LibrarySpecsController)[name])).toEqual(grants);
    expect(rolesOf(proto(LibrarySpecsController)[name])).toBeUndefined();
  });

  it('no queda ningún handler sin concesión declarada', () => {
    const names = Object.getOwnPropertyNames(LibrarySpecsController.prototype).filter((n) => n !== 'constructor' && n !== 'actor');
    expect(names.sort()).toEqual(Object.keys(expected).sort());
  });

  it('la vista previa de la ficha pública exige products:read', () => {
    expect(grantsOf(proto(ProductPreviewDetailController).preview)).toEqual(['products:read']);
  });

  it('aprobar exige la concesión propia: products:write solo no basta; con ella pasa; Super Admin conserva su excepción', async () => {
    const write = [grant('products:read'), grant('products:write')];
    await expect(runGuard(LibrarySpecsController, 'approve', vendedor, write)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runGuard(LibrarySpecsController, 'putTemplate', vendedor, write)).resolves.toBe(true);
    await expect(runGuard(LibrarySpecsController, 'approve', vendedor, [...write, grant('products:approveSpecs')])).resolves.toBe(true);
    await expect(runGuard(LibrarySpecsController, 'approve', vendedor, [...write, grant('products:approveSpecs', 'list')])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runGuard(LibrarySpecsController, 'approve', superAdmin, [])).resolves.toBe(true);
  });

  it('403 con cero concesiones en todos los handlers, sea cual sea el cargo', async () => {
    for (const user of [adminComercial, supervisor, vendedor]) {
      for (const handler of Object.keys(expected)) {
        await expect(runGuard(LibrarySpecsController, handler, user, [])).rejects.toBeInstanceOf(ForbiddenException);
      }
    }
  });
});

describe('Pestañas Importaciones y Catálogos maestros: ids listos para el guard', () => {
  class PanelProbe {
    @RequireGrant('imports:read') importsRead() { return undefined; }
    @RequireGrant('products:write', 'imports:run') importsRun() { return undefined; }
    @RequireGrant('masters:read') mastersRead() { return undefined; }
    @RequireGrant('masters:write') mastersWrite() { return undefined; }
  }
  const handlers: Record<string, string> = {
    importsRead: 'imports:read', importsRun: 'imports:run', mastersRead: 'masters:read', mastersWrite: 'masters:write',
  };

  it.each(Object.entries(handlers))('%s: sin concesión 403 para cualquier cargo; con %s pasa; Super Admin conserva su excepción', async (handler, actionId) => {
    for (const user of [adminComercial, supervisor, vendedor]) {
      await expect(runGuard(PanelProbe, handler, user, [])).rejects.toBeInstanceOf(ForbiddenException);
      // Otras acciones de Biblioteca no abren las pestañas nuevas.
      await expect(runGuard(PanelProbe, handler, user, [grant('products:read'), grant('products:write'), grant('products:approveSpecs')]))
        .rejects.toBeInstanceOf(ForbiddenException);
    }
    // Con la acción y su cierre de dependencias (lo que guarda la selección) pasa; sin la acción no.
    const closure = closeLibrarySelection([actionId]).map((id) => grant(id));
    await expect(runGuard(PanelProbe, handler, vendedor, closure)).resolves.toBe(true);
    await expect(runGuard(PanelProbe, handler, vendedor, closure.filter((row) => row.actionId !== actionId))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runGuard(PanelProbe, handler, vendedor, closure.map((row) => (row.actionId === actionId ? grant(actionId, 'list') : row)))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(runGuard(PanelProbe, handler, superAdmin, [])).resolves.toBe(true);
  });
});
