import 'reflect-metadata';
jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { ConflictException } from '@nestjs/common';
import { PRICE_HANDLER_GRANTS } from './price-action.guard';
import { PricesService } from './prices.service';

/** Tariff master-catalog rules with explicit doubles (no database). */
function setup(usage: { prices?: number; quotes?: number; accounts?: number; tiers?: number; mappings?: number } = {}) {
  const list = { id: 'pl-1', name: 'Mayorista', code: 'MAY', currency: 'COP', isActive: true, validFrom: null, validUntil: null };
  const db: any = {
    priceList: {
      findUnique: jest.fn(async ({ where }: any) => (where.id === 'pl-1' ? list : null)),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(async ({ data }: any) => ({ ...list, ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    price: { count: jest.fn().mockResolvedValue(usage.prices ?? 0) },
    quote: { count: jest.fn().mockResolvedValue(usage.quotes ?? 0) },
    customerAccount: { count: jest.fn().mockResolvedValue(usage.accounts ?? 0) },
    portalTier: { count: jest.fn().mockResolvedValue(usage.tiers ?? 0) },
    portalPriceListMapping: { count: jest.fn().mockResolvedValue(usage.mappings ?? 0) },
  };
  const library: any = {
    config: { mode: 'legacy', writesFrozen: false },
    client: db,
    assertWritesAllowed: () => undefined,
    writeTransaction: async (work: any) => work(db),
  };
  const audit = { log: jest.fn().mockResolvedValue({}) };
  const service = new PricesService(db, {} as never, audit as never, undefined, library, { append: jest.fn() } as never);
  return { service, db };
}

describe('PricesService master-catalog rules', () => {
  it('usage lists every dependency and blocks the delete when any exists', async () => {
    const { service } = setup({ quotes: 2, accounts: 1, tiers: 3 });
    const usage = await service.priceListUsage('pl-1');
    expect(usage.canDelete).toBe(false);
    expect(usage.counts).toMatchObject({ prices: 0, quotes: 2, customerAccounts: 1, portalTiers: 3 });
    expect(usage.reasons.map((r) => r.code)).toEqual(['HAS_QUOTES', 'HAS_CUSTOMER_ACCOUNTS', 'HAS_PORTAL_TIERS']);
  });

  it.each([
    ['quotes', { quotes: 1 }],
    ['customer accounts', { accounts: 1 }],
    ['portal tiers', { tiers: 1 }],
    ['portal mappings', { mappings: 1 }],
  ])('refuses to delete a tariff used by %s', async (_name, usage) => {
    const { service, db } = setup(usage);
    const err = await service.removePriceList('pl-1').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'DELETE_BLOCKED', usage: { canDelete: false } });
    expect(db.priceList.delete).not.toHaveBeenCalled();
  });

  it('keeps refusing a delete when the tariff has prices', async () => {
    const { service } = setup({ prices: 5 });
    await expect(service.removePriceList('pl-1')).rejects.toThrow('No se puede eliminar una lista con precios asociados');
  });

  it('deletes an unused tariff', async () => {
    const { service, db } = setup();
    await service.removePriceList('pl-1');
    expect(db.priceList.delete).toHaveBeenCalledWith({ where: { id: 'pl-1' } });
  });

  it('a currency change with prices needs confirmImpact and reports the price count', async () => {
    const { service, db } = setup({ prices: 12 });
    const err = await service.updatePriceList('pl-1', { currency: 'USD' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'IMPACT_CONFIRMATION_REQUIRED', impact: { priceCount: 12, fromCurrency: 'COP', toCurrency: 'USD' } });
    expect(db.priceList.update).not.toHaveBeenCalled();

    await service.updatePriceList('pl-1', { currency: 'USD', confirmImpact: true });
    expect(db.priceList.update).toHaveBeenCalled();
  });

  it('a currency change on a tariff without prices needs no confirmation', async () => {
    const { service, db } = setup({ prices: 0 });
    await service.updatePriceList('pl-1', { currency: 'USD' });
    expect(db.priceList.update).toHaveBeenCalled();
  });

  it('a rename never counts prices nor touches them', async () => {
    const { service, db } = setup({ prices: 12 });
    await service.updatePriceList('pl-1', { name: 'Mayorista Plus' });
    expect(db.price.count).not.toHaveBeenCalled();
    expect(db.priceList.update).toHaveBeenCalled();
  });

  it('the usage endpoint is guarded by masters:read', () => {
    expect(PRICE_HANDLER_GRANTS.priceListUsage).toEqual(['masters:read']);
  });
});
