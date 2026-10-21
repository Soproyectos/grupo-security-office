/**
 * T7 — manual price create/update/delete write `price:<TARIFF>` history (source MANUAL)
 * in the same transaction as the mutation, and set productId in the audit entry.
 */
import { Prisma } from '@prisma/client';
import { PricesService } from './prices.service';

const ctx = { userId: 'actor-1', roles: ['Super Admin'] };
const priceList = { id: 'pl-1', code: 'DPP_ORO_IVA', name: 'Oro', currency: 'COP', isActive: true, validFrom: null, validUntil: null };

function build() {
  const written: Array<Record<string, any>> = [];
  const tx = {
    price: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    productChange: { createMany: jest.fn(async ({ data }: { data: any[] }) => { written.push(...data); return { count: data.length }; }) },
  };
  const prisma: any = {
    product: { findUnique: jest.fn(async () => ({ id: 'p-1', sku: 'SKU-1', listaId: 'L-1' })) },
    priceList: { findUnique: jest.fn(async () => priceList) },
    price: { findUnique: jest.fn(), findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => {
      const mark = written.length;
      try { return await cb(tx); } catch (error) { written.splice(mark); throw error; }
    }),
  };
  const acl: any = { assertListaAccess: jest.fn(), assertProductAccess: jest.fn() };
  const audit: any = { log: jest.fn(async () => undefined) };
  return { service: new PricesService(prisma, acl, audit), prisma, tx, written, audit };
}

const stored = (value: number) => ({
  id: 'price-1', productId: 'p-1', priceListId: 'pl-1', value: new Prisma.Decimal(value), currency: 'COP',
  listaId: 'L-1', validFrom: null, validUntil: null,
});

describe('manual price history', () => {
  it('create records old null -> new value and links the audit entry to the product', async () => {
    const { service, prisma, tx, written, audit } = build();
    prisma.price.findUnique.mockResolvedValue(null);
    tx.price.create.mockResolvedValue({ ...stored(1500), product: { id: 'p-1', sku: 'SKU-1', name: 'N' }, priceList });
    await service.createPrice({ productId: 'p-1', priceListId: 'pl-1', value: 1500 } as never, ctx);
    expect(written).toEqual([expect.objectContaining({
      productId: 'p-1', sku: 'SKU-1', field: 'price:DPP_ORO_IVA', oldValue: Prisma.DbNull, newValue: '1500', source: 'MANUAL', sourceRef: 'price-1', actorId: 'actor-1',
    })]);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', productId: 'p-1' }));
  });

  it('create records nothing when the insert fails', async () => {
    const { service, prisma, tx, written } = build();
    prisma.price.findUnique.mockResolvedValue(null);
    tx.price.create.mockRejectedValue(new Error('insert failed'));
    await expect(service.createPrice({ productId: 'p-1', priceListId: 'pl-1', value: 1500 } as never, ctx)).rejects.toThrow('insert failed');
    expect(written).toHaveLength(0);
  });

  it('update records old and new value', async () => {
    const { service, prisma, tx, written, audit } = build();
    prisma.price.findUnique.mockResolvedValue(stored(1000));
    prisma.priceList.findUnique.mockResolvedValue(priceList);
    tx.price.update.mockResolvedValue({ ...stored(1200), product: { id: 'p-1', sku: 'SKU-1', name: 'N' }, priceList });
    await service.updatePrice('price-1', { value: 1200 } as never, ctx);
    expect(written).toEqual([expect.objectContaining({ field: 'price:DPP_ORO_IVA', oldValue: '1000', newValue: '1200', source: 'MANUAL', actorId: 'actor-1' })]);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'update', productId: 'p-1' }));
  });

  it('update records nothing when the value did not change (only dates)', async () => {
    const { service, prisma, tx, written } = build();
    prisma.price.findUnique.mockResolvedValue(stored(1000));
    prisma.priceList.findUnique.mockResolvedValue(priceList);
    tx.price.update.mockResolvedValue({ ...stored(1000), product: { id: 'p-1', sku: 'SKU-1', name: 'N' }, priceList });
    await service.updatePrice('price-1', { validFrom: '2026-01-01' } as never, ctx);
    expect(written).toHaveLength(0);
  });

  it('delete records old value -> null and rolls back with a failed delete', async () => {
    const { service, prisma, tx, written, audit } = build();
    prisma.price.findUnique.mockResolvedValue(stored(900));
    tx.price.delete.mockResolvedValue({});
    await service.removePrice('price-1', ctx);
    expect(written).toEqual([expect.objectContaining({ field: 'price:DPP_ORO_IVA', oldValue: '900', newValue: Prisma.DbNull, source: 'MANUAL' })]);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete', productId: 'p-1' }));

    written.length = 0;
    tx.price.delete.mockRejectedValue(new Error('delete failed'));
    await expect(service.removePrice('price-1', ctx)).rejects.toThrow('delete failed');
    expect(written).toHaveLength(0);
  });
});
