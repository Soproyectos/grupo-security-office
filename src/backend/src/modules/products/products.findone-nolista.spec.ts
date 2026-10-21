jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { NotFoundException } from '@nestjs/common';
import { AclService } from '../../common/acl/acl.service';
import { ProductsService } from './products.service';

/**
 * A product WITHOUT lista (a hidden draft created from a price import) must open for the
 * catalog team: GLOBAL `products:read` covers it, lista-scoped grants still answer 404.
 * Uses the real AclService decision over the grants.
 */
const draft = { id: 'draft-1', sku: 'NEW-1', name: 'Borrador', listaId: null, lifecycleStatus: 'DRAFT', category: null, brand: null, images: [], prices: [] };
const ctx = { userId: 'catalog-user', roles: ['Catalogo'] };

function build(grantRows: Array<{ actionId: string; scopeKind: string; resourceId: string | null }>) {
  const prisma: any = {
    product: { findUnique: jest.fn(async (args: any) => (args.where.id === 'draft-1' ? draft : null)) },
    assignment: { findMany: jest.fn(async () => []) },
    accessGrant: { findMany: jest.fn(async () => grantRows.map((g) => ({ sourceId: 's1', ...g }))) },
    stock: { findUnique: jest.fn(async () => null) },
  };
  const acl = new AclService(prisma);
  return new ProductsService(prisma, acl, { log: jest.fn() } as never, {} as never);
}

describe('ProductsService.findOne for products without lista', () => {
  it('opens for a GLOBAL products:read grant', async () => {
    const service = build([{ actionId: 'products:read', scopeKind: 'global', resourceId: null }]);
    await expect(service.findOne('draft-1', ctx)).resolves.toMatchObject({ id: 'draft-1', listaId: null });
  });

  it('stays 404 for lista-scoped grants only', async () => {
    const service = build([{ actionId: 'products:read', scopeKind: 'list', resourceId: 'lista-1' }]);
    await expect(service.findOne('draft-1', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stays 404 without any grant', async () => {
    await expect(build([]).findOne('draft-1', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });
});
