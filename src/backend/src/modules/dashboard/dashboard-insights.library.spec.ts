jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { DashboardInsightsService } from './dashboard-insights.service';

/** T06 panel — los indicadores de catálogo se leen de la biblioteca; la base operativa no se toca. Dobles explícitos. */
describe('T06 panel — indicadores de catálogo con biblioteca dedicada', () => {
  it('lee productos y categorías solo del cliente de biblioteca', async () => {
    const library = {
      product: { count: jest.fn(async () => 5), findMany: jest.fn(async () => [{ id: 'p1', sku: 'S', name: 'N', updatedAt: new Date(), lifecycleStatus: 'PUBLISHED', category: { name: 'C' }, _count: { images: 1 } }]) },
      category: { count: jest.fn(async () => 2) },
    };
    const operational: any = new Proxy({}, { get: () => { throw new Error('la base operativa no debe usarse'); } });
    const service = new DashboardInsightsService(operational, { config: { mode: 'dedicated' }, client: library } as never);
    const result = await service.getCatalogInsights(3);
    expect(result).toMatchObject({ products: 5, categories: 2, latest: [{ sku: 'S', category: 'C', hasImage: true }] });
    expect(library.product.count).toHaveBeenCalled();
    expect(library.category.count).toHaveBeenCalledTimes(1);
  });

  it('ventas por categoría: las líneas son operativas y la categoría se resuelve por id en la biblioteca', async () => {
    const library = { product: { findMany: jest.fn(async () => [{ id: 'p1', category: { name: 'Video' } }]) } };
    const operational: any = {
      salesOrder: { findMany: jest.fn(async () => [{ quoteId: 'q1', currency: 'COP' }]) },
      quoteItem: { findMany: jest.fn(async () => [
        { lineTotal: 100, quantity: 2, currency: 'COP', productId: 'p1' },
        { lineTotal: 50, quantity: 1, currency: 'COP', productId: 'sin-biblioteca' },
      ]) },
    };
    const service = new DashboardInsightsService(operational, { config: { mode: 'dedicated' }, client: library } as never);
    const result = await service.getSalesByCategory();
    expect(operational.quoteItem.findMany.mock.calls[0][0].select).not.toHaveProperty('product');
    expect(library.product.findMany).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).toContain('Video');
    expect(JSON.stringify(result)).toContain('Sin categoría');
  });
});
