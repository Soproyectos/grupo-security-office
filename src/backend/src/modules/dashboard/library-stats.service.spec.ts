jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { LibraryStatsService } from './library-stats.service';

const g = (actionId: string) => ({ sourceId: 's1', actionId, scope: 'global' });
const user = { userId: 'u1', roles: ['Operador'] };

function build(grantRows: unknown[]) {
  const library = {
    product: {
      count: jest.fn(async () => 7),
      findMany: jest.fn(async () => [
        { name: 'Camera A', catalogName: 'Camera Alpha', publishedAt: new Date('2026-10-01T00:00:00Z') },
        { name: 'Recorder B', catalogName: null, publishedAt: new Date('2026-09-30T00:00:00Z') },
      ]),
    },
    category: { findMany: jest.fn(async () => [{ name: 'Video', _count: { products: 4 } }]) },
    priceImportRevision: {
      count: jest.fn(async () => 2),
      findFirst: jest.fn(async () => ({ appliedAt: new Date('2026-10-20T00:00:00Z') })),
    },
    catalogJob: { count: jest.fn(async () => 1) },
  };
  const grants = { grantsForUser: jest.fn(async () => grantRows) };
  const operational: any = new Proxy({}, { get: () => { throw new Error('operational DB must not be used'); } });
  const service = new LibraryStatsService(grants as never, operational, { config: { mode: 'dedicated' }, client: library } as never);
  return { service, library };
}

describe('LibraryStatsService', () => {
  it('without grants returns an empty object and queries nothing', async () => {
    const { service, library } = build([]);
    await expect(service.getLibraryStats(user)).resolves.toEqual({});
    expect(library.product.count).not.toHaveBeenCalled();
    expect(library.catalogJob.count).not.toHaveBeenCalled();
  });

  it('a stats grant without its tab access (dependency) returns nothing', async () => {
    const { service } = build([g('libraryStats:products')]);
    await expect(service.getLibraryStats(user)).resolves.toEqual({});
  });

  it('only the granted section is returned', async () => {
    const { service, library } = build([g('products:read'), g('libraryStats:products')]);
    const result = await service.getLibraryStats(user);
    expect(Object.keys(result)).toEqual(['products']);
    expect(result.products).toMatchObject({ total: 7, published: 7, withoutImage: 7, topCategories: [{ name: 'Video', count: 4 }] });
    expect(library.priceImportRevision.count).not.toHaveBeenCalled();
  });

  it('update section exposes figures and the last applied price revision', async () => {
    const { service } = build([g('products:read'), g('products:write'), g('libraryStats:update')]);
    const result = await service.getLibraryStats(user);
    expect(Object.keys(result)).toEqual(['update']);
    expect(result.update).toMatchObject({
      unvalidated: 7, notUpdated30Days: 7, pendingPriceRevisions: 2, jobsQueued: 1, jobsRunning: 1,
      lastPriceRevisionAppliedAt: new Date('2026-10-20T00:00:00Z'),
    });
  });

  it('publication section prefers the catalog name and keeps order', async () => {
    const { service } = build([g('products:read'), g('products:publish'), g('libraryStats:publication')]);
    const result = await service.getLibraryStats(user);
    expect(Object.keys(result)).toEqual(['publication']);
    expect(result.publication?.latestPublished.map((p) => p.name)).toEqual(['Camera Alpha', 'Recorder B']);
    expect(result.publication).toMatchObject({ pending: 7, withIssues: 7, published: 7 });
  });

  it('all three grants return the three sections', async () => {
    const { service } = build([
      g('products:read'), g('products:write'), g('products:publish'),
      g('libraryStats:products'), g('libraryStats:update'), g('libraryStats:publication'),
    ]);
    expect(Object.keys(await service.getLibraryStats(user)).sort()).toEqual(['products', 'publication', 'update']);
  });

  it('Super Admin keeps the explicit exception', async () => {
    const { service } = build([]);
    const result = await service.getLibraryStats({ userId: 'admin', roles: ['Super Admin'] });
    expect(Object.keys(result).sort()).toEqual(['products', 'publication', 'update']);
  });

  it('without identity nothing is returned', async () => {
    const { service } = build([g('products:read'), g('libraryStats:products')]);
    await expect(service.getLibraryStats({ userId: '', roles: [] })).resolves.toEqual({});
  });
});
