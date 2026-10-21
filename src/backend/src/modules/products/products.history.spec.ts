/**
 * T7 — per-product history written by the product mutators (create, update,
 * lifecycle transitions, scheduling). Rows are recorded through the SAME
 * transaction client as the mutation; nothing is recorded when nothing changed.
 */
import { Prisma } from '@prisma/client';
import { ProductsService } from './products.service';
import { PRODUCT_HISTORY_COVERAGE } from './product-change.service';

const ctx = { userId: 'actor-1', roles: ['Super Admin'] };

const baseProduct = (over: Record<string, unknown> = {}) => ({
  id: 'p-1', sku: 'SKU-1', name: 'Camara', description: 'Desc', categoryId: 'c-1', brandId: 'b-1', listaId: 'L-1',
  lifecycleStatus: 'DRAFT', publishStatus: 'borrador', isActive: false, isVisible: false,
  publishAt: null, publishedAt: null, unpublishAt: null, publicRevisionId: null, scheduledRevisionId: null, ...over,
});

function build(product = baseProduct()) {
  const written: Array<Record<string, unknown>> = [];
  const tx = {
    product: { update: jest.fn(), create: jest.fn() },
    productChange: { createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => { written.push(...data); return { count: data.length }; }) },
    priceList: { findMany: jest.fn(async () => [{ id: 'pl-1', code: 'DPP_ORO_IVA' }]) },
    price: { findMany: jest.fn(async () => []), upsert: jest.fn(async () => ({})) },
  };
  const prisma: any = {
    product: { findUnique: jest.fn(async () => product) },
    category: { findUnique: jest.fn(async () => ({ id: 'c-1' })) },
    brand: { findUnique: jest.fn(async () => ({ id: 'b-1' })) },
    lista: { findUnique: jest.fn(async () => ({ id: 'L-1', defaultVisibility: false, deletionStatus: null })) },
    priceList: { findMany: jest.fn(async () => [{ id: 'pl-1' }]) },
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => {
      const snapshot = written.length;
      try { return await cb(tx); } catch (error) { written.splice(snapshot); throw error; }
    }),
  };
  const acl: any = { isListasAdmin: jest.fn(() => true), assertProductAccess: jest.fn(), assertListaAccess: jest.fn(), getAllowedListaIds: jest.fn() };
  const audit: any = { log: jest.fn(async () => undefined) };
  const service = new ProductsService(prisma, acl, audit, {} as never);
  return { service, prisma, tx, written, product };
}

describe('product history: create', () => {
  it('records the initial values (MANUAL, actor, product id as sourceRef)', async () => {
    const { service, tx, written } = build();
    tx.product.create.mockResolvedValue(baseProduct({ id: 'p-new', sku: 'NEW-1', name: 'Nuevo', description: null }));
    await service.create({ sku: 'NEW-1', name: 'Nuevo', categoryId: 'c-1', brandId: 'b-1', listaId: 'L-1' } as never, ctx);
    const byField = Object.fromEntries(written.map((r) => [r.field, r]));
    expect(Object.keys(byField).sort()).toEqual(['brandId', 'categoryId', 'lifecycleStatus', 'listaId', 'name', 'sku']);
    expect(byField.name).toMatchObject({ productId: 'p-new', sku: 'NEW-1', source: 'MANUAL', actorId: 'actor-1', sourceRef: 'p-new' });
    expect(byField.name.oldValue).toBe(Prisma.DbNull);
    expect(byField.name.newValue).toBe('Nuevo');
  });

  it('records price:<TARIFF> rows for the initial prices in the same transaction', async () => {
    const { service, tx, written, prisma } = build();
    tx.product.create.mockResolvedValue(baseProduct({ id: 'p-new', sku: 'NEW-1' }));
    await service.create({ sku: 'NEW-1', name: 'Nuevo', categoryId: 'c-1', brandId: 'b-1', listaId: 'L-1', prices: [{ priceListId: 'pl-1', value: 1500 }] } as never, ctx);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(written.find((r) => r.field === 'price:DPP_ORO_IVA')).toMatchObject({ oldValue: Prisma.DbNull, newValue: '1500', source: 'MANUAL' });
  });

  it('records nothing when the insert fails', async () => {
    const { service, tx, written } = build();
    tx.product.create.mockRejectedValue(new Error('insert failed'));
    await expect(service.create({ sku: 'NEW-1', name: 'N', categoryId: 'c-1', brandId: 'b-1', listaId: 'L-1' } as never, ctx)).rejects.toThrow('insert failed');
    expect(written).toHaveLength(0);
    expect(tx.productChange.createMany).not.toHaveBeenCalled();
  });
});

describe('product history: update', () => {
  it('records only the fields that changed, with old and new value', async () => {
    const { service, tx, written, product } = build();
    tx.product.update.mockResolvedValue({ ...product, name: 'Renombrada', description: 'Desc' });
    await service.update('p-1', { name: 'Renombrada', description: 'Desc' } as never, ctx);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ field: 'name', oldValue: 'Camara', newValue: 'Renombrada', source: 'MANUAL', actorId: 'actor-1', productId: 'p-1' });
  });

  it('records brand, category and lista moves', async () => {
    const { service, tx, written, product } = build();
    tx.product.update.mockResolvedValue({ ...product, brandId: 'b-2', categoryId: 'c-2', listaId: 'L-2' });
    await service.update('p-1', { brandId: 'b-2', categoryId: 'c-2', listaId: 'L-2' } as never, ctx);
    expect(written.map((r) => r.field).sort()).toEqual(['brandId', 'categoryId', 'listaId']);
  });

  it('records nothing when the save changes nothing', async () => {
    const { service, tx, written, product } = build();
    tx.product.update.mockResolvedValue({ ...product });
    await service.update('p-1', { name: 'Camara' } as never, ctx);
    expect(written).toHaveLength(0);
  });

  it('rolls the history back with the mutation when the price upsert fails', async () => {
    const { service, tx, written, product } = build();
    tx.product.update.mockResolvedValue({ ...product, name: 'Otra' });
    tx.price.upsert.mockRejectedValue(new Error('price failed'));
    await expect(service.update('p-1', { name: 'Otra', prices: [{ priceListId: 'pl-1', value: 10 }] } as never, ctx)).rejects.toThrow('price failed');
    expect(written).toHaveLength(0);
  });

  it('records nothing when the update itself fails', async () => {
    const { service, tx } = build();
    tx.product.update.mockRejectedValue(new Error('update failed'));
    await expect(service.update('p-1', { name: 'Otra' } as never, ctx)).rejects.toThrow('update failed');
    expect(tx.productChange.createMany).not.toHaveBeenCalled();
  });
});

describe('product history: lifecycle', () => {
  it('records the state columns of a transition (source LIFECYCLE) and the scheduler has no actor', async () => {
    const { service, tx, written, product } = build(baseProduct({ lifecycleStatus: 'PUBLISHED', publishStatus: 'publicado', isActive: true, isVisible: true }));
    tx.product.update.mockResolvedValue({ ...product, lifecycleStatus: 'ARCHIVED', publishStatus: 'archivado', isActive: false, isVisible: false });
    await service.transition('p-1', { event: 'ARCHIVE', reason: 'fin de vida', confirm: true } as never, ctx);
    expect(written.map((r) => r.field).sort()).toEqual(['isActive', 'isVisible', 'lifecycleStatus', 'publishStatus']);
    expect(written.find((r) => r.field === 'lifecycleStatus')).toMatchObject({ oldValue: 'PUBLISHED', newValue: 'ARCHIVED', source: 'LIFECYCLE', actorId: 'actor-1' });
  });

  it('records nothing when the transition fails', async () => {
    const { service, tx } = build();
    tx.product.update.mockRejectedValue(new Error('boom'));
    await expect(service.transition('p-1', { event: 'ARCHIVE', reason: 'x', confirm: true } as never, ctx)).rejects.toThrow('boom');
    expect(tx.productChange.createMany).not.toHaveBeenCalled();
  });

  it('records publishAt when a publication is scheduled and when it is cancelled', async () => {
    const future = new Date(Date.now() + 86_400_000);
    const first = build();
    first.tx.product.update.mockResolvedValue({ ...first.product, publishAt: future });
    await first.service.schedulePublication('p-1', { publishAt: future.toISOString() } as never, ctx);
    expect(first.written).toEqual([expect.objectContaining({ field: 'publishAt', oldValue: Prisma.DbNull, newValue: future.toISOString(), source: 'LIFECYCLE' })]);

    const second = build(baseProduct({ publishAt: future }));
    second.tx.product.update.mockResolvedValue({ ...second.product, publishAt: null });
    await second.service.cancelScheduledPublication('p-1', ctx);
    expect(second.written).toEqual([expect.objectContaining({ field: 'publishAt', oldValue: future.toISOString(), newValue: Prisma.DbNull })]);
  });
});

describe('history coverage', () => {
  it('still lists exactly the sources that are not recorded', () => {
    expect(PRODUCT_HISTORY_COVERAGE.notRecorded.map((s) => s.source)).toEqual([
      'IMAGES', 'VITRINA_SHEET', 'LEGACY_PRODUCT_IMPORT', 'BIBLIOTECA_IMPORT', 'HARD_DELETE', 'LISTA_UNLINK',
    ]);
  });
});
