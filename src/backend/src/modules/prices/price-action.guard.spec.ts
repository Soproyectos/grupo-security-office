import { ForbiddenException } from '@nestjs/common';
import { PRICE_HANDLER_GRANTS, PriceActionGuard } from './price-action.guard';

const grant = (actionId: string, scope: 'global' | 'list' | 'product' = 'global', resourceId?: string) => ({
  sourceId: `source-${actionId}`,
  actionId,
  scope,
  resourceId,
});

/** Grants the action plus its catalog dependencies, the way the assignment screen stores them. */
const full = (...actionIds: string[]) => actionIds.map((id) => grant(id));

describe('PriceActionGuard (panel grants only, global scope)', () => {
  const assignments = { grantsForUser: jest.fn() };
  const guard = new PriceActionGuard(assignments as any);
  const context = (method: string, roles: string[] = ['Vendedor'], user: Record<string, unknown> = {}) => ({
    getHandler: () => ({ [method]: () => undefined })[method],
    switchToHttp: () => ({ getRequest: () => ({
      user: { sub: 'user-1', roles, ...user },
      params: {}, body: { productId: 'product-1' },
    }) }),
  }) as any;

  beforeEach(() => {
    jest.resetAllMocks();
    assignments.grantsForUser.mockResolvedValue([]);
  });

  it('maps every handler of PricesController to explicit grants (no handler is open by omission)', () => {
    expect(PRICE_HANDLER_GRANTS).toEqual({
      findAllPriceLists: ['products:read'],
      findOnePriceList: ['products:read', 'prices:read'],
      priceListUsage: ['masters:read'],
      createPriceList: ['products:write'],
      updatePriceList: ['products:write'],
      togglePriceListActive: ['products:write'],
      removePriceList: ['products:write'],
      findPricesByProduct: ['prices:read'],
      findPricesByPriceList: ['prices:read'],
      createPrice: ['prices:apply'],
      updatePrice: ['prices:apply'],
      removePrice: ['prices:apply'],
    });
  });

  it.each(['createPrice', 'updatePrice', 'removePrice', 'createPriceList', 'removePriceList', 'findPricesByProduct', 'findAllPriceLists'])(
    '%s: a role that used to pass (Admin Comercial / Supervisor) gets 403 with zero grants',
    async (method) => {
      for (const roles of [['Admin Comercial'], ['Supervisor'], ['Operador']]) {
        await expect(guard.canActivate(context(method, roles))).rejects.toBeInstanceOf(ForbiddenException);
      }
    },
  );

  it('rejects a handler that is not configured and a request without a session', async () => {
    await expect(guard.canActivate(context('somethingNew', ['Super Admin']))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(context('createPrice', [], { sub: undefined }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a Vendedor with the global grants (and its read dependency) apply prices', async () => {
    assignments.grantsForUser.mockResolvedValue(full('prices:apply', 'prices:read', 'listas:read'));
    await expect(guard.canActivate(context('createPrice', ['Vendedor']))).resolves.toBe(true);
    await expect(guard.canActivate(context('updatePrice', ['Vendedor']))).resolves.toBe(true);
    await expect(guard.canActivate(context('removePrice', ['Vendedor']))).resolves.toBe(true);
  });

  it('manages tariffs only with products:write; products:read alone only reads them', async () => {
    assignments.grantsForUser.mockResolvedValue(full('products:read'));
    await expect(guard.canActivate(context('findAllPriceLists', ['Vendedor']))).resolves.toBe(true);
    for (const method of ['createPriceList', 'updatePriceList', 'togglePriceListActive', 'removePriceList']) {
      await expect(guard.canActivate(context(method, ['Vendedor']))).rejects.toBeInstanceOf(ForbiddenException);
    }
    assignments.grantsForUser.mockResolvedValue(full('products:read', 'products:write'));
    for (const method of ['createPriceList', 'updatePriceList', 'togglePriceListActive', 'removePriceList']) {
      await expect(guard.canActivate(context(method, ['Vendedor']))).resolves.toBe(true);
    }
  });

  it('the tariff detail embeds prices, so it also needs prices:read', async () => {
    assignments.grantsForUser.mockResolvedValue(full('products:read'));
    await expect(guard.canActivate(context('findOnePriceList', ['Vendedor']))).rejects.toBeInstanceOf(ForbiddenException);
    assignments.grantsForUser.mockResolvedValue(full('products:read', 'prices:read', 'listas:read'));
    await expect(guard.canActivate(context('findOnePriceList', ['Vendedor']))).resolves.toBe(true);
  });

  it('a grant tied to a lista or to one product never opens these endpoints', async () => {
    assignments.grantsForUser.mockResolvedValue([
      grant('prices:apply', 'list', 'list-1'), grant('prices:read', 'list', 'list-1'), grant('listas:read', 'list', 'list-1'),
      grant('products:write', 'product', 'product-1'), grant('products:read', 'product', 'product-1'),
    ]);
    for (const method of ['createPrice', 'findPricesByProduct', 'createPriceList', 'findAllPriceLists']) {
      await expect(guard.canActivate(context(method, ['Admin Comercial']))).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('never reads a lista or a product row to decide', async () => {
    assignments.grantsForUser.mockResolvedValue(full('prices:read', 'listas:read'));
    await guard.canActivate(context('findPricesByProduct'));
    expect(assignments.grantsForUser).toHaveBeenCalledWith('user-1');
  });

  it('keeps the Super Admin exception without grants', async () => {
    for (const method of Object.keys(PRICE_HANDLER_GRANTS)) {
      await expect(guard.canActivate(context(method, ['Super Admin']))).resolves.toBe(true);
    }
  });
});
