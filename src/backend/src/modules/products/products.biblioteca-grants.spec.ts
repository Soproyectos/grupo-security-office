/**
 * Biblioteca de productos: autorizacion SOLO por concesiones de panel (alcance global).
 * El cargo nunca concede nada y las Listas no intervienen (ni ACL de Lista ni "pendiente de eliminacion").
 */
import 'reflect-metadata';
import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();
mockPrisma.price.deleteMany = jest.fn();
mockPrisma.$queryRawUnsafe = jest.fn();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { BadRequestException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductChangesController } from './product-changes.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AclService } from '../../common/acl/acl.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { GrantGuard, REQUIRED_GRANTS_KEY } from '../../common/security/require-grant';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

const NOTE = 'nota interna: proveedor alterno';

const mockAcl = {
  isSuperAdmin: jest.fn().mockReturnValue(false),
  isListasAdmin: jest.fn().mockReturnValue(false),
  getAllowedListaIds: jest.fn().mockResolvedValue([]),
  assertListaAccess: jest.fn().mockResolvedValue(undefined),
  assertProductAccess: jest.fn().mockResolvedValue(undefined),
};
const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
const mockFiles = { store: jest.fn(), get: jest.fn(), deleteByUrl: jest.fn().mockResolvedValue(undefined) };
const grantsMock = { grantsForUser: jest.fn() };

const grant = (actionId: string, scope = 'global') => ({ sourceId: `s-${actionId}-${scope}`, actionId, scope });
const withGrants = (...ids: string[]) => grantsMock.grantsForUser.mockResolvedValue(ids.map((id) => grant(id)));

// Cargos que ANTES pasaban por @Roles / Lista y ahora no deben conceder nada.
const adminComercial = { userId: 'u-ac', roles: ['Admin Comercial'] };
const supervisor = { userId: 'u-sup', roles: ['Supervisor'] };
const vendedor = { userId: 'u-ven', roles: ['Vendedor'] };
const superAdmin = { userId: 'u-sa', roles: ['Super Admin'] };

const baseProduct = {
  id: 'prod-1', sku: 'CAM-001', name: 'Camara', description: 'd', categoryId: 'cat-1', brandId: 'brand-1', listaId: 'lista-1',
  lifecycleStatus: 'DRAFT', isActive: false, isVisible: false, publishStatus: 'borrador',
  publishAt: null, publishedAt: null, unpublishAt: null, unpublishReason: null, publishedById: null,
  catalogInternalNotes: NOTE, createdAt: new Date(), updatedAt: new Date(),
};

describe('Biblioteca de productos autoriza solo por concesiones de panel', () => {
  let service: ProductsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.productChange.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', code: 'LISTA-GENERAL', defaultVisibility: false });
    mockPrisma.assignment.findMany.mockResolvedValue([]);
    mockPrisma.stock.findMany.mockResolvedValue([]);
    mockPrisma.stock.findUnique.mockResolvedValue(null);
    mockAcl.isListasAdmin.mockReturnValue(false);
    grantsMock.grantsForUser.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AclService, useValue: mockAcl },
        { provide: AuditService, useValue: mockAudit },
        { provide: FilesService, useValue: mockFiles },
        { provide: AccessAssignmentsService, useValue: grantsMock },
      ],
    }).compile();
    service = module.get(ProductsService);
  });

  const noListaChecks = () => {
    expect(mockAcl.assertListaAccess).not.toHaveBeenCalled();
    expect(mockAcl.assertProductAccess).not.toHaveBeenCalled();
    expect(mockAcl.getAllowedListaIds).not.toHaveBeenCalled();
  };

  describe('lectura: products:read', () => {
    it('GET /products: 403 (no lista vacia) sin la concesion, aunque el cargo antes pasaba', async () => {
      mockPrisma.product.findMany.mockResolvedValue([baseProduct]);
      mockPrisma.product.count.mockResolvedValue(1);
      await expect(service.findAll({}, adminComercial)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.findAll({}, supervisor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
    });

    it('una concesion ligada a una Lista (no global) no habilita el listado', async () => {
      grantsMock.grantsForUser.mockResolvedValue([grant('products:read', 'list')]);
      await expect(service.findAll({}, vendedor)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('con products:read global lista y detalla sin ninguna concesion listas:* ni ACL de Lista (Vendedor)', async () => {
      withGrants('products:read');
      mockPrisma.product.findMany.mockResolvedValue([baseProduct]);
      mockPrisma.product.count.mockResolvedValue(1);
      const list = await service.findAll({}, vendedor);
      expect(list.data).toHaveLength(1);
      mockPrisma.product.findUnique.mockResolvedValue({ ...baseProduct, category: {}, brand: {}, images: [], prices: [] });
      const one = await service.findOne('prod-1', vendedor);
      expect(one.id).toBe('prod-1');
      noListaChecks();
    });

    it('GET /products/:id: 403 sin la concesion (antes de leer el producto)', async () => {
      await expect(service.findOne('prod-1', adminComercial)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.product.findUnique).not.toHaveBeenCalled();
    });

    it('Super Admin conserva su excepcion sin concesiones', async () => {
      mockPrisma.product.findMany.mockResolvedValue([baseProduct]);
      mockPrisma.product.count.mockResolvedValue(1);
      await expect(service.findAll({}, superAdmin)).resolves.toBeDefined();
    });

    it('la lista no filtra por asignaciones de producto ni por Lista', async () => {
      withGrants('products:read');
      mockPrisma.assignment.findMany.mockResolvedValue([{ resourceId: 'prod-1', level: 'view', isActive: false }]);
      mockPrisma.product.findMany.mockResolvedValue([baseProduct]);
      mockPrisma.product.count.mockResolvedValue(1);
      const list = await service.findAll({}, vendedor);
      expect(list.data).toHaveLength(1);
      expect(mockPrisma.assignment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('notas internas: solo con products:notes', () => {
    it('lista (Prisma): se quitan sin products:notes y se conservan con ella', async () => {
      mockPrisma.product.findMany.mockResolvedValue([{ ...baseProduct }]);
      mockPrisma.product.count.mockResolvedValue(1);
      withGrants('products:read');
      const without = await service.findAll({}, vendedor);
      expect(without.data[0]).not.toHaveProperty('catalogInternalNotes');
      expect(JSON.stringify(without)).not.toContain(NOTE);

      withGrants('products:read', 'products:notes');
      const withNotes = await service.findAll({}, vendedor);
      expect(withNotes.data[0].catalogInternalNotes).toBe(NOTE);
    });

    it('busqueda difusa (SQL crudo p.*): tampoco las entrega sin products:notes', async () => {
      withGrants('products:read');
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: BigInt(1) }])
        .mockResolvedValueOnce([{ ...baseProduct, _similarity: 0.9 }]);
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.brand.findMany.mockResolvedValue([]);
      mockPrisma.productImage.findMany.mockResolvedValue([]);
      mockPrisma.price.findMany.mockResolvedValue([]);
      const res = await service.findAll({ search: 'camara' }, vendedor);
      expect(res.data).toHaveLength(1);
      expect(res.data[0]).not.toHaveProperty('catalogInternalNotes');
      expect(JSON.stringify(res)).not.toContain(NOTE);
    });

    it('detalle: se quitan sin products:notes y se conservan con ella (Super Admin tambien)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ ...baseProduct, category: {}, brand: {}, images: [], prices: [] });
      withGrants('products:read');
      expect(await service.findOne('prod-1', vendedor)).not.toHaveProperty('catalogInternalNotes');
      withGrants('products:read', 'products:notes');
      expect((await service.findOne('prod-1', vendedor)).catalogInternalNotes).toBe(NOTE);
      grantsMock.grantsForUser.mockResolvedValue([]);
      expect((await service.findOne('prod-1', superAdmin)).catalogInternalNotes).toBe(NOTE);
    });

    it('tendencias: quita las notas por llamada sin contaminar la cache compartida', async () => {
      mockPrisma.product.findMany.mockResolvedValue([{ ...baseProduct, category: {}, brand: {}, images: [], prices: [] }]);
      mockPrisma.product.count.mockResolvedValue(1);
      withGrants('products:read');
      const a = await service.findTrending({ take: 5, forceReload: true }, vendedor);
      expect(JSON.stringify(a)).not.toContain(NOTE);
      withGrants('products:read', 'products:notes');
      const b = await service.findTrending({ take: 5 }, vendedor);
      expect(b.data[0].catalogInternalNotes).toBe(NOTE);
    });
  });

  describe('edicion: products:write (el cargo no concede nada)', () => {
    const dto = { sku: 'NEW-1', name: 'Nuevo', categoryId: 'cat-1', brandId: 'brand-1' };

    it('POST /products: 403 con cargo Admin Comercial sin concesiones; 201 con products:write para un Vendedor', async () => {
      await expect(service.create(dto, adminComercial)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.product.create).not.toHaveBeenCalled();

      withGrants('products:read', 'products:write');
      mockPrisma.product.findUnique.mockResolvedValue(null);
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1' });
      mockPrisma.product.create.mockResolvedValue({ ...baseProduct, sku: 'NEW-1' });
      const created = await service.create(dto, vendedor);
      expect(created.sku).toBe('NEW-1');
      noListaChecks();
    });

    it('PUT /products/:id: 403 sin products:write (Supervisor); permitido con la concesion sin tocar la Lista', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(baseProduct);
      await expect(service.update('prod-1', { name: 'X' }, supervisor)).rejects.toBeInstanceOf(ForbiddenException);
      withGrants('products:read', 'products:write');
      mockPrisma.product.update.mockResolvedValue({ ...baseProduct, name: 'X' });
      await expect(service.update('prod-1', { name: 'X' }, vendedor)).resolves.toBeDefined();
      noListaChecks();
    });

    it('una Lista pendiente de eliminacion ya no bloquea la edicion', async () => {
      withGrants('products:read', 'products:write');
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', deletionStatus: 'PENDING_DELETION' });
      mockPrisma.product.findUnique.mockResolvedValue(baseProduct);
      mockPrisma.product.update.mockResolvedValue(baseProduct);
      await expect(service.update('prod-1', { name: 'X' }, vendedor)).resolves.toBeDefined();
    });

    it.each([
      ['POST', (c: any) => service.create({ sku: 'N-2', name: 'n', categoryId: 'cat-1', brandId: 'brand-1', prices: [{ priceListId: 'pl', value: 1 }] } as any, c)],
      ['PUT', (c: any) => service.update('prod-1', { prices: [{ priceListId: 'pl', value: 1 }] } as any, c)],
    ])('%s con prices[] se rechaza con 400 y no escribe nada', async (_m, call) => {
      withGrants('products:read', 'products:write');
      mockPrisma.product.findUnique.mockResolvedValue(baseProduct);
      await expect(call(vendedor)).rejects.toThrow(BadRequestException);
      await expect(call(vendedor)).rejects.toThrow('Los precios solo se cambian por carga masiva o desde la ficha del producto.');
      expect(mockPrisma.price.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    it('imagenes/activos: 403 sin products:write; permitido con la concesion (sin ACL de producto)', async () => {
      mockPrisma.productImage.findUnique.mockResolvedValue({ id: 'img-1', productId: 'prod-1', url: '/api/files/img-1' });
      await expect(service.deleteImage('img-1', adminComercial)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.updateImage('img-1', { alt: 'a' }, adminComercial)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.uploadImage('prod-1', {} as any, false, adminComercial)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.uploadAsset('prod-1', 'DOCUMENT', {} as any, adminComercial)).rejects.toBeInstanceOf(ForbiddenException);

      withGrants('products:read', 'products:write');
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      mockFiles.deleteByUrl.mockResolvedValue(undefined);
      await expect(service.uploadImage('prod-1', undefined as any, false, vendedor)).rejects.toThrow(/Archivo requerido/);
      noListaChecks();
    });
  });

  describe('borrado fisico: products:delete', () => {
    beforeEach(() => {
      mockPrisma.product.findUnique.mockResolvedValue(baseProduct);
      mockPrisma.price.count.mockResolvedValue(0);
      mockPrisma.productImage.count.mockResolvedValue(0);
      mockPrisma.productImage.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);
      mockPrisma.price.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.productImage.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.product.delete.mockResolvedValue(baseProduct);
    });

    it('403 con products:write pero sin products:delete, y con cargo Admin Comercial sin concesiones', async () => {
      withGrants('products:read', 'products:write');
      await expect(service.remove('prod-1', { confirm: true }, vendedor)).rejects.toBeInstanceOf(ForbiddenException);
      grantsMock.grantsForUser.mockResolvedValue([]);
      await expect(service.remove('prod-1', { confirm: true }, adminComercial)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.product.delete).not.toHaveBeenCalled();
    });

    it('borra con products:delete (Vendedor) y con Super Admin, sin tocar Listas', async () => {
      withGrants('products:read', 'products:delete');
      await expect(service.remove('prod-1', { confirm: true }, vendedor)).resolves.toEqual({ message: 'Producto eliminado exitosamente' });
      grantsMock.grantsForUser.mockResolvedValue([]);
      await expect(service.remove('prod-1', { confirm: true }, superAdmin)).resolves.toBeDefined();
      noListaChecks();
    });
  });

  describe('archivar/restaurar: products:write; publicar/despublicar/programar: products:publish', () => {
    const published = { ...baseProduct, lifecycleStatus: 'PUBLISHED', isActive: true, isVisible: true, publishStatus: 'publicado' };

    it('ARCHIVE exige products:write y no basta products:publish', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(baseProduct);
      mockPrisma.product.update.mockResolvedValue({ ...baseProduct, lifecycleStatus: 'ARCHIVED' });
      const dto = { event: 'ARCHIVE', reason: 'obsoleto', confirm: true } as any;
      withGrants('products:read', 'products:publish');
      await expect(service.transition('prod-1', dto, adminComercial)).rejects.toBeInstanceOf(ForbiddenException);
      withGrants('products:read', 'products:write');
      const out = await service.transition('prod-1', dto, vendedor);
      expect(out.lifecycleStatus).toBe('ARCHIVED');
      noListaChecks();
    });

    it('RESTORE exige products:write', async () => {
      const archived = { ...baseProduct, lifecycleStatus: 'ARCHIVED', publishStatus: 'archivado' };
      mockPrisma.product.findUnique.mockResolvedValue(archived);
      mockPrisma.product.update.mockResolvedValue({ ...archived, lifecycleStatus: 'DRAFT' });
      const dto = { event: 'RESTORE', reason: 'volver', confirm: true } as any;
      grantsMock.grantsForUser.mockResolvedValue([]);
      await expect(service.transition('prod-1', dto, supervisor)).rejects.toBeInstanceOf(ForbiddenException);
      withGrants('products:read', 'products:write');
      await expect(service.transition('prod-1', dto, vendedor)).resolves.toBeDefined();
    });

    it('UNPUBLISH y PUBLISH exigen products:publish (products:write no basta)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(published);
      withGrants('products:read', 'products:write');
      await expect(service.transition('prod-1', { event: 'UNPUBLISH', reason: 'x' } as any, vendedor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.transition('prod-1', { event: 'PUBLISH' } as any, vendedor)).rejects.toBeInstanceOf(ForbiddenException);
      mockPrisma.product.update.mockResolvedValue({ ...published, lifecycleStatus: 'DRAFT' });
      withGrants('products:read', 'products:publish');
      await expect(service.transition('prod-1', { event: 'UNPUBLISH', reason: 'x' } as any, vendedor)).rejects.toBeInstanceOf(ForbiddenException);
      withGrants('products:read', 'products:write', 'products:publish');
      await expect(service.transition('prod-1', { event: 'UNPUBLISH', reason: 'x' } as any, vendedor)).resolves.toBeDefined();
      noListaChecks();
    });

    it('programar y cancelar programacion exigen products:publish', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(baseProduct);
      const future = new Date(Date.now() + 86_400_000).toISOString();
      withGrants('products:read', 'products:write');
      await expect(service.schedulePublication('prod-1', { publishAt: future } as any, vendedor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.cancelScheduledPublication('prod-1', vendedor)).rejects.toBeInstanceOf(ForbiddenException);
      grantsMock.grantsForUser.mockResolvedValue([]);
      await expect(service.schedulePublication('prod-1', { publishAt: future } as any, adminComercial)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allowedActions refleja solo las concesiones (no el cargo)', async () => {
      grantsMock.grantsForUser.mockResolvedValue([]);
      expect(await service.allowedActions(baseProduct, adminComercial)).toEqual([]);
      withGrants('products:read', 'products:publish');
      expect(await service.allowedActions(baseProduct, vendedor)).toEqual([]);
      withGrants('products:read', 'products:write', 'products:publish');
      expect(await service.allowedActions(baseProduct, vendedor)).toEqual(['PUBLISH', 'ARCHIVE']);
      withGrants('products:read', 'products:write');
      expect(await service.allowedActions(baseProduct, vendedor)).toEqual(['ARCHIVE']);
    });
  });
});

describe('Contrato de controladores de productos: concesion de panel declarada, sin cargos', () => {
  const protoOf = (cls: any) => cls.prototype as Record<string, Function>;
  const grantsOf = (fn: Function): string[] | undefined => Reflect.getMetadata(REQUIRED_GRANTS_KEY, fn);
  const rolesOf = (fn: Function): string[] | undefined => Reflect.getMetadata(ROLES_KEY, fn);

  const expected: Record<string, string[]> = {
    findTrending: ['products:read'],
    findPublishScheduled: ['products:read'],
    findAll: ['products:read'],
    findOne: ['products:read'],
    create: ['products:write'],
    update: ['products:write'],
    listRevisions: ['products:read'],
    saveDraft: ['products:write'],
    toggleVisibility: ['products:publish'],
    toggleActive: ['products:write'],
    publish: ['products:publish'],
    unpublish: ['products:publish'],
    transition: ['products:read'], // base; el servicio exige publish/write segun el evento
    bulkTransition: ['products:read'],
    remove: ['products:delete'],
    importExcel: ['products:write'],
    uploadImage: ['products:write'],
    uploadAsset: ['products:write'],
    removeImage: ['products:write'],
    updateImage: ['products:write'],
    schedulePublication: ['products:publish'],
    cancelScheduledPublication: ['products:publish'],
    schedulePublicationBulk: ['products:publish'],
    cancelPublicationBulk: ['products:publish'],
  };

  it.each(Object.entries(expected))('ProductsController.%s exige %j y no declara @Roles', (name, grants) => {
    const handler = protoOf(ProductsController)[name];
    expect(handler).toBeDefined();
    expect(grantsOf(handler)).toEqual(grants);
    expect(rolesOf(handler)).toBeUndefined();
  });

  it('todo handler HTTP de ProductsController declara una concesion y ninguno es publico', () => {
    const names = Object.getOwnPropertyNames(ProductsController.prototype).filter(
      (n) => n !== 'constructor' && typeof protoOf(ProductsController)[n] === 'function' && !['ctx'].includes(n),
    );
    for (const n of names) {
      expect(grantsOf(protoOf(ProductsController)[n])?.length).toBeGreaterThan(0);
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, protoOf(ProductsController)[n])).toBeUndefined();
    }
  });

  it('GET /products/:id/changes exige Fichas con notas, además de consulta', () => {
    expect(grantsOf(protoOf(ProductChangesController).list ?? protoOf(ProductChangesController)[Object.getOwnPropertyNames(ProductChangesController.prototype).find((n) => n !== 'constructor' && n !== 'ctx')!])).toEqual(['products:read', 'products:write', 'products:notes']);
  });

  describe('GrantGuard (deny-by-default)', () => {
    const run = async (handlerName: string, user: any, rows: any[]) => {
      const handler = protoOf(ProductsController)[handlerName];
      const guard = new GrantGuard(new Reflector(), { grantsForUser: jest.fn().mockResolvedValue(rows) } as any);
      const context = {
        getHandler: () => handler,
        getClass: () => ProductsController,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      } as unknown as ExecutionContext;
      return guard.canActivate(context);
    };

    it('Admin Comercial y Supervisor sin concesiones reciben 403 en listar, editar, eliminar y publicar', async () => {
      for (const user of [{ sub: 'a', roles: ['Admin Comercial'] }, { sub: 'b', roles: ['Supervisor'] }]) {
        for (const h of ['findAll', 'findOne', 'create', 'update', 'remove', 'publish', 'uploadImage']) {
          await expect(run(h, user, [])).rejects.toBeInstanceOf(ForbiddenException);
        }
      }
    });

    it('un Vendedor con products:read + products:write puede editar pero no eliminar ni publicar', async () => {
      const rows = [grant('products:read'), grant('products:write')];
      const vend = { sub: 'v', roles: ['Vendedor'] };
      await expect(run('update', vend, rows)).resolves.toBe(true);
      await expect(run('remove', vend, rows)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(run('publish', vend, rows)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('Super Admin conserva su excepcion', async () => {
      await expect(run('remove', { sub: 's', roles: ['Super Admin'] }, [])).resolves.toBe(true);
    });
  });
});
