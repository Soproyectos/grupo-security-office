import 'reflect-metadata';
jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BrandsController } from '../brands/brands.controller';
import { CategoriesController } from '../categories/categories.controller';
import { LibrarySpecsController } from '../library-specs/library-specs.controller';
import { PriceActionGuard } from '../prices/price-action.guard';
import { PricesController } from '../prices/prices.controller';
import { GrantOrMastersWriteGuard, MASTERS_WRITE_KEY } from './masters-write';
import { GrantGuard, REQUIRED_GRANTS_KEY } from '../../common/security/require-grant';

const grant = (actionId: string) => ({ sourceId: `s-${actionId}`, actionId, scope: 'global' });
const grants = (...ids: string[]) => ({ grantsForUser: jest.fn().mockResolvedValue(ids.map(grant)) }) as any;
const ctx = (cls: any, handler: string, user: any): ExecutionContext =>
  ({ getHandler: () => cls.prototype[handler], getClass: () => cls, switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;
const user = (roles: string[] = []) => ({ sub: 'u1', roles });
// A grant only counts together with its catalog dependencies (masters:write needs masters:read and products:read).
const WRITER = ['products:read', 'masters:read', 'masters:write'];
const READER = ['products:read', 'masters:read'];
const PRODUCT_WRITER = ['products:read', 'products:write'];
const ok = (p: Promise<boolean>) => p.then((v) => v, () => false);

describe('masters:write as an additional path on master-catalog writes', () => {
  const reflector = new Reflector();
  const roleHandlers: [any, string][] = [
    [CategoriesController, 'create'], [CategoriesController, 'update'], [CategoriesController, 'remove'],
    [BrandsController, 'create'], [BrandsController, 'update'], [BrandsController, 'toggleActive'], [BrandsController, 'uploadLogo'], [BrandsController, 'remove'],
  ];

  // The write routes of brands and categories are protected ONLY by the assigned action `masters:write`
  // (global): the role decides nothing. Super Admin keeps its exception.
  const required = (cls: any, name: string) => Reflect.getMetadata(REQUIRED_GRANTS_KEY, cls.prototype[name])

  it.each(roleHandlers)('%p.%s requires masters:write and carries no role list', (cls, name) => {
    expect(required(cls, name)).toEqual(['masters:write'])
    expect(Reflect.getMetadata('roles', cls.prototype[name])).toBeUndefined()
  });

  it.each(roleHandlers)('%p.%s: only masters:write opens it; the role does not; Super Admin keeps its exception', async (cls, name) => {
    const guard = (g: any) => new GrantGuard(reflector, g);
    expect(await ok(guard(grants(...WRITER)).canActivate(ctx(cls, name, user())))).toBe(true);
    expect(await ok(guard(grants(...WRITER)).canActivate(ctx(cls, name, user(['Vendedor']))))).toBe(true);
    expect(await ok(guard(grants(...READER)).canActivate(ctx(cls, name, user())))).toBe(false);
    expect(await ok(guard(grants()).canActivate(ctx(cls, name, user(['Admin Comercial']))))).toBe(false);
    expect(await ok(guard(grants()).canActivate(ctx(cls, name, user(['Super Admin']))))).toBe(true);
  });

  it('reads stay open to any signed-in session and never need masters:write', () => {
    expect(required(CategoriesController, 'findAll')).toBeUndefined();
    expect(Reflect.getMetadata('roles', CategoriesController.prototype.findAll)).toBeUndefined();
  });

  describe('dictionary and molds', () => {
    const handlers = ['createDefinition', 'updateDefinition', 'putTemplate'];
    it.each(handlers)('%s accepts products:write or masters:write, nothing else', async (name) => {
      const g = (...ids: string[]) => new GrantOrMastersWriteGuard(reflector, grants(...ids));
      expect(await ok(g(...WRITER).canActivate(ctx(LibrarySpecsController, name, user())))).toBe(true);
      expect(await ok(g(...PRODUCT_WRITER).canActivate(ctx(LibrarySpecsController, name, user())))).toBe(true);
      expect(await ok(g(...READER).canActivate(ctx(LibrarySpecsController, name, user())))).toBe(false);
      expect(await ok(g().canActivate(ctx(LibrarySpecsController, name, user(['Admin Comercial']))))).toBe(false);
    });

    it('approving a mold row stays exclusively products:write + products:approveSpecs', async () => {
      const approve = ctx(LibrarySpecsController, 'approve', user());
      expect(Reflect.getMetadata(MASTERS_WRITE_KEY, LibrarySpecsController.prototype.approve)).toBeUndefined();
      const g = new GrantOrMastersWriteGuard(reflector, grants(...WRITER, 'products:write'));
      await expect(g.canActivate(approve)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('tariffs', () => {
    const write = ['createPriceList', 'updatePriceList', 'togglePriceListActive', 'removePriceList'];
    const guard = (...ids: string[]) => new PriceActionGuard(grants(...ids));
    it.each(write)('%s accepts masters:write; masters:read-only is refused; products:write keeps working', async (name) => {
      expect(await ok(guard(...WRITER).canActivate(ctx(PricesController, name, user())))).toBe(true);
      expect(await ok(guard(...PRODUCT_WRITER).canActivate(ctx(PricesController, name, user())))).toBe(true);
      expect(await ok(guard(...READER).canActivate(ctx(PricesController, name, user())))).toBe(false);
      expect(await ok(guard().canActivate(ctx(PricesController, name, user(['Admin Comercial']))))).toBe(false);
    });

    it('masters:write never opens prices (read or apply)', async () => {
      for (const name of ['findPricesByProduct', 'createPrice', 'updatePrice', 'removePrice', 'findOnePriceList']) {
        expect(await ok(guard(...WRITER).canActivate(ctx(PricesController, name, user())))).toBe(false);
      }
    });
  });
});
