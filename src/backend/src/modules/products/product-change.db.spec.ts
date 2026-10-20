/**
 * DB-backed spec for `product_changes` and cursor pagination. Runs only when
 * PRODUCT_CHANGES_TEST_DATABASE_URL points to a THROWAWAY Postgres with all
 * migrations applied (never `.env`, never production):
 *
 *   PRODUCT_CHANGES_TEST_DATABASE_URL=postgresql://postgres:t@127.0.0.1:54400/t npx jest product-change.db
 */
import { PrismaClient } from '@prisma/client';
import { diffFields, ProductChangeService } from './product-change.service';

const url = process.env.PRODUCT_CHANGES_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('product_changes (database)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? 'postgresql://unused' } } });
  const productId = '00000000-0000-4000-8000-0000000000b1';
  const ctx = { userId: 'u1', roles: ['Super Admin'] };
  const acl = { assertProductAccess: jest.fn().mockResolvedValue({ listaId: null }) };
  const service = new ProductChangeService(prisma as never, acl as never, { grantsForUser: async () => [] } as never);

  beforeAll(async () => {
    await prisma.productChange.deleteMany({ where: { productId } });
    // Pre-existing product row is not required: product_changes has no FK by design.
    jest.spyOn(prisma.product, 'findUnique').mockResolvedValue({ id: productId, listaId: null } as never);
  });
  afterAll(async () => {
    await prisma.productChange.deleteMany({ where: { productId } });
    await prisma.$disconnect();
  });

  it('records diffs in a transaction and pages newest first without gaps or repeats', async () => {
    const meta = { productId, sku: 'DB-1', source: 'MANUAL' as const, actorId: 'u1' };
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < 7; i++) {
        // Same createdAt for several rows exercises the (createdAt, id) tiebreak.
        const rows = diffFields({ name: `n${i}` }, { name: `n${i + 1}` }, ['name'], meta);
        await service.record(tx, rows);
      }
      await service.record(tx, diffFields({}, { 'price:ORO_IVA': '10' }, ['price:ORO_IVA'], { ...meta, source: 'PRICE_IMPORT', sourceRef: 'rev-1' }));
    });
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = await service.list(productId, ctx, { limit: 3, cursor });
      seen.push(...page.items.map((r) => r.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(8);
    expect(new Set(seen).size).toBe(8);
    const all = await prisma.productChange.findMany({ where: { productId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    expect(seen).toEqual(all.map((r) => r.id));
  });

  it('filters by field and source and rolls back with the transaction', async () => {
    const byField = await service.list(productId, ctx, { field: 'price:ORO_IVA' });
    expect(byField.items).toHaveLength(1);
    expect(byField.items[0]).toMatchObject({ source: 'PRICE_IMPORT', sourceRef: 'rev-1', oldValue: null, newValue: '10' });
    const bySource = await service.list(productId, ctx, { source: 'MANUAL', limit: 100 });
    expect(bySource.items).toHaveLength(7);

    await expect(prisma.$transaction(async (tx) => {
      await service.record(tx, diffFields({ name: 'a' }, { name: 'z' }, ['name'], meta2));
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(await prisma.productChange.count({ where: { productId } })).toBe(8);
  });

  const meta2 = { productId, sku: 'DB-1', source: 'MANUAL' as const };
});
