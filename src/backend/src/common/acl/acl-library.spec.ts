import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AclService } from './acl.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';

describe('AclService separated catalog reads', () => {
  const ctx = { userId: 'actor', roles: ['Admin Comercial'] };
  let operational: any;
  let catalog: any;
  let acl: AclService;
  const grant = (actionId: string, scopeKind: 'list' | 'product' | 'global' = 'global', resourceId: string | null = null) => ({ sourceId: actionId, actionId, scopeKind, resourceId });
  beforeEach(() => {
    operational = { accessGrant: { findMany: jest.fn().mockResolvedValue([grant('products:read'), grant('products:write'), grant('prices:read'), grant('listas:read', 'list', 'library-list')]) }, assignment: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findUnique: jest.fn(() => { throw new Error('operational catalog must not be used'); }) }, lista: { findUnique: jest.fn(() => { throw new Error('operational catalog must not be used'); }) }, price: { findUnique: jest.fn(() => { throw new Error('operational catalog must not be used'); }) } };
    catalog = { product: { findUnique: jest.fn().mockResolvedValue({ listaId: 'library-list' }) }, lista: { findUnique: jest.fn().mockResolvedValue({ isActive: true, archivedAt: null }) }, price: { findUnique: jest.fn().mockResolvedValue({ product: { listaId: 'library-list' } }) } };
    acl = new AclService(operational as PrismaService, { client: catalog } as BibliotecaPrismaService);
  });
  it('reads catalog only in library and authorization only in operational', async () => {
    await expect(acl.assertProductAccess('p', ctx, 'edit_products')).resolves.toEqual({ listaId: 'library-list' });
    await expect(acl.assertPriceAccess('price', ctx)).resolves.toEqual({ listaId: 'library-list' });
    expect(catalog.product.findUnique).toHaveBeenCalled();
    expect(catalog.lista.findUnique).toHaveBeenCalled();
    expect(catalog.price.findUnique).toHaveBeenCalled();
    expect(operational.assignment.findMany).toHaveBeenCalled();
    expect(operational.accessGrant.findMany).toHaveBeenCalled();
  });
  it('Admin Comercial without grants is denied; role is not a bypass', async () => {
    operational.accessGrant.findMany.mockResolvedValue([]);
    await expect(acl.assertProductAccess('p', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('explicit operational restriction prevails over valid library product and grants', async () => {
    operational.assignment.findMany.mockResolvedValue([{ isActive: false, level: 'view' }]);
    await expect(acl.assertProductAccess('p', ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects list- and product-scoped grants for Biblioteca resources', async () => {
    operational.accessGrant.findMany.mockResolvedValue([grant('products:read', 'list', 'library-list')]);
    await expect(acl.assertProductAccess('p', ctx)).rejects.toBeInstanceOf(NotFoundException);
    operational.accessGrant.findMany.mockResolvedValue([grant('products:read', 'product', 'p')]);
    await expect(acl.assertProductAccess('p', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('rechecks revocation for each request', async () => {
    await expect(acl.assertProductAccess('p', ctx)).resolves.toBeDefined();
    operational.accessGrant.findMany.mockResolvedValue([]);
    await expect(acl.assertProductAccess('p', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('does not read legacy catalog when the selected library lacks a product', async () => {
    catalog.product.findUnique.mockResolvedValue(null);
    await expect(acl.assertProductAccess('p', ctx)).rejects.toBeInstanceOf(NotFoundException);
    expect(operational.product.findUnique).not.toHaveBeenCalled();
  });
  it('direct construction cannot silently select legacy in dedicated mode', () => {
    const previous = process.env.LIBRARY_DATABASE_MODE;
    try {
      process.env.LIBRARY_DATABASE_MODE = 'dedicated';
      expect(() => new AclService(operational as PrismaService)).toThrow('requires the library provider');
    } finally {
      if (previous === undefined) delete process.env.LIBRARY_DATABASE_MODE;
      else process.env.LIBRARY_DATABASE_MODE = previous;
    }
  });
});
