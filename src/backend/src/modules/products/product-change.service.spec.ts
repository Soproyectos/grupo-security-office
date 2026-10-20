import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  decodeCursor, diffFields, encodeCursor, newBatchId, normalizeChangeValue,
  PRODUCT_CHANGES_MAX_LIMIT, PRODUCT_HISTORY_COVERAGE, ProductChangeService,
} from './product-change.service';

const meta = { productId: 'p1', sku: 'SKU-1', source: 'MANUAL' as const, actorId: 'u1', sourceRef: 'ref-1', batchId: 'b1' };

describe('diffFields', () => {
  it('emits one row per changed field and ignores equal values', () => {
    const rows = diffFields(
      { name: 'A', description: 'same', brandId: null },
      { name: 'B', description: 'same', brandId: 'br1' },
      ['name', 'description', 'brandId'],
      meta,
    );
    expect(rows.map((r) => r.field)).toEqual(['name', 'brandId']);
    expect(rows[0]).toMatchObject({ productId: 'p1', sku: 'SKU-1', oldValue: 'A', newValue: 'B', source: 'MANUAL', sourceRef: 'ref-1', actorId: 'u1', batchId: 'b1' });
    expect(rows[1]).toMatchObject({ oldValue: null, newValue: 'br1' });
  });

  it('skips fields absent from after and records explicit null as a clear', () => {
    const rows = diffFields({ name: 'A', description: 'd' }, { description: null }, ['name', 'description'], meta);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ field: 'description', oldValue: 'd', newValue: null });
  });

  it('treats Decimals, numeric strings and numbers with the same value as equal', () => {
    const d = (v: string) => new Prisma.Decimal(v);
    expect(diffFields({ 'price:ORO_IVA': d('100.00') }, { 'price:ORO_IVA': '100' }, ['price:ORO_IVA'], meta)).toEqual([]);
    expect(diffFields({ 'price:ORO_IVA': d('100.00') }, { 'price:ORO_IVA': 100 }, ['price:ORO_IVA'], meta)).toEqual([]);
    const changed = diffFields({ 'price:ORO_IVA': d('100.00') }, { 'price:ORO_IVA': d('120.50') }, ['price:ORO_IVA'], meta);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ oldValue: '100', newValue: '120.5' });
  });

  it('records a first value (no before row) as a change from null', () => {
    const rows = diffFields(null, { 'price:TIENDA_IVA': new Prisma.Decimal('50') }, ['price:TIENDA_IVA'], meta);
    expect(rows[0]).toMatchObject({ oldValue: null, newValue: '50' });
  });

  it('compares objects and dates structurally', () => {
    const d = new Date('2026-10-20T00:00:00Z');
    expect(diffFields({ a: { x: 1, y: 2 }, at: d }, { a: { y: 2, x: 1 }, at: new Date(d) }, ['a', 'at'], meta)).toEqual([]);
    expect(normalizeChangeValue(d)).toBe('2026-10-20T00:00:00.000Z');
  });
});

describe('ProductChangeService.record', () => {
  const service = new ProductChangeService({} as any, {} as any);

  it('does nothing for an empty list', async () => {
    const tx = { productChange: { createMany: jest.fn() } };
    expect(await service.record(tx as any, [])).toBe(0);
    expect(tx.productChange.createMany).not.toHaveBeenCalled();
  });

  it('writes through the given transaction client, mapping nulls to DbNull', async () => {
    const tx = { productChange: { createMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const rows = diffFields({ name: null }, { name: 'X' }, ['name'], meta);
    expect(await service.record(tx as any, rows)).toBe(1);
    const data = tx.productChange.createMany.mock.calls[0][0].data;
    expect(data).toEqual([expect.objectContaining({ productId: 'p1', field: 'name', oldValue: Prisma.DbNull, newValue: 'X', batchId: 'b1' })]);
  });

  it('newBatchId returns distinct ids', () => {
    expect(newBatchId()).not.toBe(newBatchId());
  });
});

describe('cursor codec', () => {
  it('round-trips and rejects garbage', () => {
    const at = new Date('2026-10-20T12:00:00.123Z');
    expect(decodeCursor(encodeCursor(at, 'id-1'))).toEqual({ createdAt: at, id: 'id-1' });
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor(Buffer.from('nope|x').toString('base64url'))).toBeNull();
  });
});

describe('ProductChangeService.list authorization and price filtering', () => {
  const ctx = { userId: 'u1', roles: ['Admin Comercial'] };
  let prisma: any;
  let acl: any;
  let grantRows: { sourceId: string; actionId: string; scope: string; resourceId?: string }[];
  let service: ProductChangeService;

  const row = (id: string, field: string, ms: number) => ({
    id, productId: 'p1', sku: 'S', field, oldValue: null, newValue: '1', source: 'PRICE_IMPORT',
    sourceRef: null, actorId: null, batchId: null, createdAt: new Date(ms),
  });

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', listaId: 'L1' }) },
      productChange: { findMany: jest.fn().mockResolvedValue([]) },
    };
    acl = { assertProductAccess: jest.fn().mockResolvedValue({ listaId: 'L1' }) };
    grantRows = [
      { sourceId: 's', actionId: 'products:read', scope: 'global' },
      { sourceId: 's', actionId: 'listas:read', scope: 'global' },
      { sourceId: 's', actionId: 'prices:read', scope: 'global' },
    ];
    service = new ProductChangeService(prisma, acl, { grantsForUser: async () => grantRows } as any);
  });

  const whereOf = () => prisma.productChange.findMany.mock.calls[0][0].where;

  it('denies without products:read before touching the product', async () => {
    grantRows = [{ sourceId: 's', actionId: 'prices:read', scope: 'global' }];
    await expect(service.list('p1', ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
  });

  it('denies when the grant is scoped to another lista', async () => {
    grantRows = [{ sourceId: 's', actionId: 'products:read', scope: 'list', resourceId: 'OTHER' }];
    await expect(service.list('p1', ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.productChange.findMany).not.toHaveBeenCalled();
  });

  it('404s an unknown product', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.list('nope', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates the product ACL denial', async () => {
    acl.assertProductAccess.mockRejectedValue(new NotFoundException('Producto no encontrado'));
    await expect(service.list('p1', ctx)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productChange.findMany).not.toHaveBeenCalled();
  });

  it('opens a product without lista for a caller with the global grant', async () => {
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', listaId: null });
    const out = await service.list('p1', ctx);
    expect(out.items).toEqual([]);
    expect(prisma.productChange.findMany).toHaveBeenCalled();
  });

  it('includes price fields with prices:read and excludes them without it', async () => {
    const withPrices = await service.list('p1', ctx);
    expect(withPrices.priceFieldsIncluded).toBe(true);
    expect(whereOf()).toEqual({ productId: 'p1' });

    prisma.productChange.findMany.mockClear();
    grantRows = grantRows.filter((g) => g.actionId !== 'prices:read');
    const without = await service.list('p1', ctx);
    expect(without.priceFieldsIncluded).toBe(false);
    expect(whereOf()).toEqual({ productId: 'p1', AND: [{ NOT: { field: { startsWith: 'price:' } } }] });
  });

  it('returns nothing (without querying) when a caller without prices:read asks for a price field', async () => {
    grantRows = grantRows.filter((g) => g.actionId !== 'prices:read');
    const out = await service.list('p1', ctx, { field: 'price:ORO_IVA' });
    expect(out.items).toEqual([]);
    expect(prisma.productChange.findMany).not.toHaveBeenCalled();
  });

  it('paginates newest first with a cursor and caps the limit at 100', async () => {
    prisma.productChange.findMany.mockResolvedValue([row('c', 'name', 3000), row('b', 'name', 2000), row('a', 'name', 1000)]);
    const page = await service.list('p1', ctx, { limit: 2 });
    expect(page.items.map((r: any) => r.id)).toEqual(['c', 'b']);
    expect(page.nextCursor).toBe(encodeCursor(new Date(2000), 'b'));
    expect(prisma.productChange.findMany.mock.calls[0][0]).toMatchObject({ take: 3, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });

    prisma.productChange.findMany.mockClear();
    await service.list('p1', ctx, { limit: '5000', cursor: page.nextCursor!, source: 'PRICE_IMPORT', field: 'name' });
    const call = prisma.productChange.findMany.mock.calls[0][0];
    expect(call.take).toBe(PRODUCT_CHANGES_MAX_LIMIT + 1);
    expect(call.where.AND).toEqual(expect.arrayContaining([
      { field: 'name' }, { source: 'PRICE_IMPORT' },
      { OR: [{ createdAt: { lt: new Date(2000) } }, { createdAt: new Date(2000), id: { lt: 'b' } }] },
    ]));
  });

  it('returns no next cursor on the last page and always includes coverage', async () => {
    prisma.productChange.findMany.mockResolvedValue([row('a', 'name', 1000)]);
    const out = await service.list('p1', ctx, { limit: 2 });
    expect(out.nextCursor).toBeNull();
    expect(out.coverage).toBe(PRODUCT_HISTORY_COVERAGE);
    expect(out.coverage.complete).toBe(false);
    expect(out.coverage.notRecorded.map((c) => c.source)).toEqual(
      expect.arrayContaining(['IMAGES', 'VITRINA_SHEET', 'LEGACY_PRODUCT_IMPORT', 'BIBLIOTECA_IMPORT', 'HARD_DELETE', 'LISTA_UNLINK']));
  });

  it('treats an invalid cursor as an empty page', async () => {
    const out = await service.list('p1', ctx, { cursor: 'garbage' });
    expect(out.items).toEqual([]);
    expect(prisma.productChange.findMany).not.toHaveBeenCalled();
  });
});
