import { findProductBySku, findProductsBySkus, normalizeSku } from './sku-identity';

describe('normalizeSku (product identity)', () => {
  it.each([
    ['IDS-E04HQHI-D', 'IDS-E04HQHI-D'],
    ['iDS-E04HQHI-D', 'IDS-E04HQHI-D'],
    ['  ids-e04hqhi-d  ', 'IDS-E04HQHI-D'],
    ['IDS-E04 HQHI-D', 'IDS-E04HQHI-D'],
    ['ds-2ce16u1t-itf (2.8mm)', 'DS-2CE16U1T-ITF(2.8MM)'],
    ['A\tB\nC D', 'ABCD'],
  ])('%j -> %j', (raw, expected) => {
    expect(normalizeSku(raw)).toBe(expected);
  });

  it('returns an empty string for null, undefined and blank input', () => {
    expect(normalizeSku(null)).toBe('');
    expect(normalizeSku(undefined)).toBe('');
    expect(normalizeSku('   ')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeSku(' iDS-E04 HQHI-D ');
    expect(normalizeSku(once)).toBe(once);
  });
});

describe('findProductsBySkus', () => {
  const makeClient = (matches: Array<{ id: string; sku: string }>, rows: Array<Record<string, unknown>>) => ({
    $queryRaw: jest.fn().mockResolvedValue(matches),
    product: { findMany: jest.fn().mockResolvedValue(rows) },
  });

  it('matches an import SKU against a stored SKU that differs only in case', async () => {
    const client = makeClient(
      [{ id: 'p1', sku: 'iDS-E04HQHI-D' }],
      [{ id: 'p1', sku: 'iDS-E04HQHI-D', name: 'DVR' }],
    );

    const found = await findProductsBySkus(client as never, ['IDS-E04HQHI-D'], { sku: true, name: true });

    expect(found.get(normalizeSku('IDS-E04HQHI-D'))).toEqual({ id: 'p1', sku: 'iDS-E04HQHI-D', name: 'DVR' });
    // The query receives the normalized SKU, not the raw input.
    const sqlValues = client.$queryRaw.mock.calls[0][0].values;
    expect(sqlValues[0]).toEqual(['IDS-E04HQHI-D']);
    expect(client.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1'] } },
      select: { sku: true, name: true, id: true },
    });
  });

  it('de-duplicates and ignores blank SKUs before querying', async () => {
    const client = makeClient([], []);

    await findProductsBySkus(client as never, ['abc 1', 'ABC1', '', '   ', null, undefined], { sku: true });

    expect(client.$queryRaw.mock.calls[0][0].values[0]).toEqual(['ABC1']);
  });

  it('does not query at all when there is nothing to look up', async () => {
    const client = makeClient([], []);

    const found = await findProductsBySkus(client as never, ['', null], { sku: true });

    expect(found.size).toBe(0);
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });

  it('keeps the first (Lista-owned, oldest) product when several share a normalized SKU', async () => {
    const client = makeClient(
      [
        { id: 'with-lista', sku: 'IDS-1' },
        { id: 'without-lista', sku: 'ids-1' },
      ],
      [
        { id: 'without-lista', sku: 'ids-1' },
        { id: 'with-lista', sku: 'IDS-1' },
      ],
    );

    const found = await findProductsBySkus(client as never, ['IDS-1'], { sku: true });

    expect(found.get('IDS-1')?.id).toBe('with-lista');
  });

  it('applies the extra where filter on top of the identity match', async () => {
    const client = makeClient([{ id: 'p1', sku: 'A' }], [{ id: 'p1', sku: 'A' }]);

    await findProductsBySkus(client as never, ['a'], { sku: true }, { listaId: 'lista-1' });

    expect(client.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { listaId: 'lista-1', id: { in: ['p1'] } } }),
    );
  });
});

describe('findProductBySku', () => {
  it('returns null when no product matches', async () => {
    const client = { $queryRaw: jest.fn().mockResolvedValue([]), product: { findMany: jest.fn() } };

    await expect(findProductBySku(client as never, 'NOPE', { sku: true })).resolves.toBeNull();
    expect(client.product.findMany).not.toHaveBeenCalled();
  });

  it('returns the matching product regardless of SKU casing', async () => {
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'p1', sku: 'iDS-E04HQHI-D' }]),
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', sku: 'iDS-E04HQHI-D' }]) },
    };

    const found = await findProductBySku(client as never, 'ids-e04hqhi-d', { sku: true });

    expect(found?.id).toBe('p1');
  });
});
