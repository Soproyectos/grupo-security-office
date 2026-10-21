import { createGrantsProvider, createPriceImportFake } from './price-import.test-helpers';

describe('price import test helpers', () => {
  const seed = {
    products: [
      { id: 'p1', sku: 'SKU-A', listaId: 'lista-1' },
      { id: 'p2', sku: 'sku-b', listaId: null },
    ],
    tariffs: [{ id: 't1', code: 'ORO_IVA' }],
    prices: [{ productId: 'p1', priceListId: 't1', value: 100 }],
  };

  it('finds products across listas by SKU, case-insensitively, keeping the unlisted ones', async () => {
    const { prisma } = createPriceImportFake(seed);
    const found = await prisma.product.findMany({ where: { sku: { in: ['sku-a', 'SKU-B'], mode: 'insensitive' } } });
    expect(found.map((p: any) => p.id).sort()).toEqual(['p1', 'p2']);
    const inLista = await prisma.product.findMany({ where: { listaId: 'lista-1' } });
    expect(inLista).toHaveLength(1);
  });

  it('stores revisions with rows and prices and reads them back', async () => {
    const { prisma } = createPriceImportFake(seed);
    const rev = await prisma.priceImportRevision.create({ data: { listaId: null, idempotencyKey: 'k' } });
    await prisma.priceImportRevisionRow.createMany({ data: [{ revisionId: rev.id, rowNumber: 2, productId: 'p1' }] });
    await prisma.priceImportRevisionPrice.createMany({ data: [{ revisionId: rev.id, rowNumber: 2, tariffCode: 'ORO_IVA' }] });
    expect(await prisma.priceImportRevision.findUnique({ where: { idempotencyKey: 'k' } })).toMatchObject({ id: rev.id, listaId: null, status: 'GUARDADA' });
    expect(await prisma.priceImportRevisionRow.count({ where: { revisionId: rev.id } })).toBe(1);
    expect(await prisma.priceImportRevisionPrice.findMany({ where: { revisionId: rev.id } })).toHaveLength(1);
    const updated = await prisma.priceImportRevision.update({ where: { id: rev.id }, data: { status: 'APLICADA' } });
    expect(updated.status).toBe('APLICADA');
  });

  it('updates prices and runs transactions on the same state', async () => {
    const { prisma, state } = createPriceImportFake(seed);
    await prisma.$transaction(async (tx: any) => {
      await tx.price.update({ where: { productId_priceListId: { productId: 'p1', priceListId: 't1' } }, data: { value: 120 } });
    });
    expect(state.prices[0].value).toBe(120);
  });

  it('fake grants provider supports grant and revoke between calls', async () => {
    const grants = createGrantsProvider();
    grants.grant('prices:apply', 'products:write');
    expect((await grants.grantsForUser()).map((g) => g.actionId)).toEqual(['prices:apply', 'products:write']);
    grants.revoke('prices:apply');
    expect((await grants.grantsForUser()).map((g) => g.actionId)).toEqual(['products:write']);
  });
});
