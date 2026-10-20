import { ForbiddenException } from '@nestjs/common';
import { PriceActionGuard } from './price-action.guard';

const listId = 'list-1';
const grant = (actionId: string, resourceId = listId) => ({
  sourceId: `source-${actionId}`,
  actionId,
  scope: 'list',
  resourceId,
});

describe('PriceActionGuard', () => {
  const prisma = {
    price: { findUnique: jest.fn() },
    product: { findUnique: jest.fn() },
  };
  const assignments = { grantsForUser: jest.fn() };
  const guard = new PriceActionGuard(prisma as any, assignments as any);
  const context = (method: string, overrides: Record<string, unknown> = {}) => ({
    getHandler: () => ({ [method]: () => undefined })[method],
    switchToHttp: () => ({ getRequest: () => ({
      user: { sub: 'buyer-1', roles: ['Admin Comercial'] },
      params: {}, body: { productId: 'product-1' }, ...overrides,
    }) }),
  }) as any;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.product.findUnique.mockResolvedValue({ listaId: listId });
    assignments.grantsForUser.mockResolvedValue([]);
  });

  it('does not let Admin Comercial edit prices without grants', async () => {
    await expect(guard.canActivate(context('createPrice'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires apply and its read dependencies on the same list', async () => {
    assignments.grantsForUser.mockResolvedValue([
      grant('prices:apply'), grant('prices:read'), grant('listas:read'),
    ]);
    await expect(guard.canActivate(context('createPrice'))).resolves.toBe(true);
    assignments.grantsForUser.mockResolvedValue([
      grant('prices:apply'), grant('prices:read'), grant('listas:read', 'list-2'),
    ]);
    await expect(guard.canActivate(context('createPrice'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not expose product prices on a different list', async () => {
    assignments.grantsForUser.mockResolvedValue([grant('prices:read'), grant('listas:read')]);
    await expect(guard.canActivate(context('findPricesByProduct', { params: { productId: 'product-1' }, body: {} }))).resolves.toBe(true);
    prisma.product.findUnique.mockResolvedValue({ listaId: 'list-2' });
    await expect(guard.canActivate(context('findPricesByProduct', { params: { productId: 'product-1' }, body: {} }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
