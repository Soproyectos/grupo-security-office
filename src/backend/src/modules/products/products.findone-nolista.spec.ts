jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { ForbiddenException } from '@nestjs/common';
import { AclService } from '../../common/acl/acl.service';
import { ProductsService } from './products.service';

/**
 * Biblioteca authorizes only by panel grants of GLOBAL scope: a product WITHOUT lista (a hidden
 * draft created from a price import) opens for a global `products:read` grant; lista-scoped
 * grants or no grants answer 403. Listas never take part in the decision.
 */
const draft = { id: 'draft-1', sku: 'NEW-1', name: 'Borrador', listaId: null, lifecycleStatus: 'DRAFT', category: null, brand: null, images: [], prices: [] };
const ctx = { userId: 'catalog-user', roles: ['Catalogo'] };

function build(grantRows: Array<{ actionId: string; scope: string }>) {
  const prisma: any = {
    product: { findUnique: jest.fn(async (args: any) => (args.where.id === 'draft-1' ? draft : null)) },
    assignment: { findMany: jest.fn(async () => []) },
    stock: { findUnique: jest.fn(async () => null) },
  };
  const acl = new AclService(prisma);
  const grants = { grantsForUser: jest.fn(async () => grantRows.map((g) => ({ sourceId: 's1', ...g }))) };
  return new ProductsService(prisma, acl, { log: jest.fn() } as never, {} as never, undefined, grants as never);
}

describe('ProductsService.findOne for products without lista', () => {
  it('opens for a GLOBAL products:read grant', async () => {
    const service = build([{ actionId: 'products:read', scope: 'global' }]);
    await expect(service.findOne('draft-1', ctx)).resolves.toMatchObject({ id: 'draft-1', listaId: null });
  });

  it('answers 403 for lista-scoped grants only', async () => {
    const service = build([{ actionId: 'products:read', scope: 'list' }]);
    await expect(service.findOne('draft-1', ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers 403 without any grant', async () => {
    await expect(build([]).findOne('draft-1', ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
