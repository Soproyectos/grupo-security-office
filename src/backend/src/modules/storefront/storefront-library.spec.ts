import { StorefrontService } from './storefront.service';

const token = 'a'.repeat(64); // Synthetic cookie; never a real session.
const account = { id: 'customer-fixture', status: 'APPROVED', emailVerifiedAt: new Date(), priceListId: 'private-fixture' };
const input = [{ id: 'product-fixture', name: 'Ficha fixture', price: { value: 777, currency: 'COP' } }];

export function storefrontFixture() {
  const operational = {
    customerSession: { findUnique: jest.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000), account }) },
    storefrontSettings: { findUnique: jest.fn().mockResolvedValue({ id: 'default', data: { publicPriceListId: 'public-fixture' } }) },
    price: { findMany: jest.fn(() => { throw new Error('Operational prices must not be read'); }) },
    product: { findMany: jest.fn(() => { throw new Error('Operational products must not be read'); }) },
  };
  const catalog = {
    brand: { findMany: jest.fn().mockResolvedValue([]) },
    price: { findMany: jest.fn().mockResolvedValue([
      { productId: 'product-fixture', priceListId: 'public-fixture', value: '100', currency: 'COP' },
      { productId: 'product-fixture', priceListId: 'private-fixture', value: '90', currency: 'COP' },
    ]) },
    product: {
      findMany: jest.fn().mockResolvedValue([{ id: 'product-fixture', name: 'Ficha fixture', prices: [{ value: '100', currency: 'COP', priceListId: 'public-fixture' }] }]),
      count: jest.fn().mockResolvedValue(1),
    },
    $transaction: jest.fn(async (queries) => Promise.all(queries)),
  };
  const service = new StorefrontService(operational as never, {} as never, {} as never, {} as never, { client: catalog } as never);
  return { service, operational, catalog };
}

describe('Storefront catalog library routing and registration requirement', () => {
  it.each([undefined, 'invalid'])('hides prices without a valid session (%s), including a legacy price', async (cookie) => {
    const { service, catalog, operational } = storefrontFixture();
    expect(await service.applyCustomerPrices(input, cookie)).toEqual([{ ...input[0], price: null }]);
    expect(catalog.price.findMany).not.toHaveBeenCalled();
    expect(operational.storefrontSettings.findUnique).not.toHaveBeenCalled();
    expect(input[0].price?.value).toBe(777);
  });

  it.each(['expired', 'unverified', 'suspended', 'missing'])('hides prices for an %s customer session', async (kind) => {
    const { service, operational, catalog } = storefrontFixture();
    operational.customerSession.findUnique.mockResolvedValue(kind === 'missing' ? null : {
      expiresAt: new Date(Date.now() + (kind === 'expired' ? -60_000 : 60_000)),
      account: { ...account, emailVerifiedAt: kind === 'unverified' ? null : account.emailVerifiedAt, status: kind === 'suspended' ? 'SUSPENDED' : 'APPROVED' },
    });
    expect((await service.applyCustomerPrices(input, token))[0].price).toBeNull();
    expect(catalog.price.findMany).not.toHaveBeenCalled();
  });

  it('uses the selected library for an approved customer price and keeps session/settings operational', async () => {
    const { service, operational, catalog } = storefrontFixture();
    expect((await service.applyCustomerPrices(input, token))[0].price).toEqual({ value: 90, currency: 'COP' });
    expect(operational.customerSession.findUnique).toHaveBeenCalledTimes(1);
    expect(operational.storefrontSettings.findUnique).toHaveBeenCalled();
    expect(catalog.price.findMany.mock.calls[0][0].where.priceListId.in).toEqual(['public-fixture', 'private-fixture']);
    expect(operational.price.findMany).not.toHaveBeenCalled();
  });

  it('does not give the professional tariff to a verified customer awaiting approval', async () => {
    const { service, operational } = storefrontFixture();
    operational.customerSession.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000), account: { ...account, status: 'PENDING' } });
    expect((await service.applyCustomerPrices(input, token))[0].price).toEqual({ value: 100, currency: 'COP' });
  });

  it('keeps registered legacy fallback, but never grants it to a visitor', async () => {
    const { service, operational, catalog } = storefrontFixture();
    operational.storefrontSettings.findUnique.mockResolvedValue(null);
    catalog.price.findMany.mockResolvedValue([]);
    const registered = await service.applyCustomerPrices(input, token);
    expect(registered[0].price).toEqual(input[0].price);
    expect((await service.applyCustomerPrices(input))[0].price).toBeNull();
  });

  it('reads the customer catalog from library and masks both prices without registration', async () => {
    const { service, catalog, operational } = storefrontFixture();
    const result = await service.catalog({});
    expect('products' in result && result.products[0]).toMatchObject({ publicPrice: null, professionalPrice: null });
    expect(catalog.product.findMany.mock.calls[0][0].select.prices.where.priceListId.in).toEqual([]);
    expect(operational.product.findMany).not.toHaveBeenCalled();
  });

  it('serves the pinned revision from library while prices remain live', async () => {
    const { service, catalog } = storefrontFixture();
    catalog.product.findMany.mockResolvedValue([{ id: 'product-fixture', name: 'Editable live name', publicRevisionId: 'revision-fixture', prices: [{ value: '100', currency: 'COP', priceListId: 'public-fixture' }] }]);
    Object.assign(catalog, { productRevision: { findMany: jest.fn().mockResolvedValue([{ id: 'revision-fixture', content: { name: 'Pinned name', prices: [{ value: '1', currency: 'COP' }] } }]) } });
    const result = await service.catalog({}, token);
    expect('products' in result && result.products[0]).toMatchObject({ name: 'Pinned name', publicPrice: { value: '100', currency: 'COP' } });
  });
});
