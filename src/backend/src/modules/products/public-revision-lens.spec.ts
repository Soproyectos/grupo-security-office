/**
 * CAT-02 backend-publico — lente de revisión y predicado único de visibilidad.
 * (ficha acceptance: «storefront.service y controlador público no filtran
 * borrador por ID/slug/listado» + conservar respuesta/presentación.)
 *
 * RED observado: el helper/lente aún no existen.
 */
import { NotFoundException } from '@nestjs/common';
import { applyRevisionLens, loadActiveRevisionContents } from './public-revision-lens';
import { PublicCatalogService } from './public-catalog.service';

describe('CAT-02 backend-publico — lente de revisión', () => {
  const PUBLICADA = { id: 'rev-1', status: 'PUBLICADA', content: { name: 'Nombre del snapshot', sku: 'SKU-SNAP' } };

  it('applyRevisionLens pisa solo los campos definidos y conserva el resto (presentación)', () => {
    const contents = new Map([[PUBLICADA.id, { ...PUBLICADA.content, catalogName: 'Catalog del snapshot' }]]);
    const row = { id: 'p1', name: 'Vivo', sku: 'SKU-VIVO', description: 'desc viva', imageUrl: '/img/1', price: { value: 10 }, catalogName: 'Catalog vivo' };
    const out = applyRevisionLens({ ...row, publicRevisionId: 'rev-1' }, contents);
    expect(out.name).toBe('Nombre del snapshot');
    expect(out.sku).toBe('SKU-SNAP');
    expect((out as any).catalogName).toBe('Catalog del snapshot');
    expect(out.description).toBe('desc viva'); // no definido en el snapshot → vivo
    expect(out.imageUrl).toBe('/img/1');
    expect(out.price).toEqual({ value: 10 });
  });

  it('sin referencia activa el lente no cambia nada (compatibilidad K4)', () => {
    const contents = new Map();
    const row = { id: 'p1', name: 'Vivo', publicRevisionId: null };
    expect(applyRevisionLens(row, contents)).toEqual(row);
  });

  it('CAT-04 (D2): el lente pisa las LISTAS de medios (images/catalogResources) y conserva las vivas si el snapshot no las define', () => {
    const live = [
      { id: 'i1', url: '/api/files/nueva', alt: null, isPrimary: true, type: 'PRINCIPAL', sortOrder: 0 },
    ];
    const snapshot = [
      { id: 'i9', url: '/api/files/publicada', alt: 'Publicada', isPrimary: true, type: 'PRINCIPAL', sortOrder: 0 },
    ];
    const contents = new Map([['rev-2', { images: snapshot } as Record<string, unknown>]]);

    const out = applyRevisionLens({ id: 'p1', publicRevisionId: 'rev-2', images: live }, contents);
    expect((out as any).images).toEqual(snapshot); // la pública manda → sustituir NO rompe lo publicado

    // Snapshot antiguo (CAT-02) sin images: las filas vivas se conservan.
    const contentsOld = new Map([['rev-3', { name: 'viejo' } as Record<string, unknown>]]);
    const outOld = applyRevisionLens({ id: 'p1', publicRevisionId: 'rev-3', name: 'vivo', images: live }, contentsOld);
    expect((outOld as any).images).toEqual(live);
    expect(outOld.name).toBe('viejo');
  });

  it('loadActiveRevisionContents ignora referencias a revisiones no publicadas', async () => {
    const prisma = {
      productRevision: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'rev-1', content: { name: 'ok' } },
          // la fila borrador jamás debe volver (filtro status PUBLICADA)
        ]),
      },
    } as any;
    const map = await loadActiveRevisionContents(prisma, ['rev-1', 'rev-borrador', null, undefined]);
    expect(prisma.productRevision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PUBLICADA' }) }),
    );
    expect(map.has('rev-1')).toBe(true);
    expect(map.has('rev-borrador')).toBe(false);
  });

  describe('PublicCatalogService.getDetail usa el lente', () => {
    it('sirve el snapshot aunque las columnas vivas hayan cambiado (ruta legacy)', async () => {
      const prisma = {
        product: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'p1', lifecycleStatus: 'PUBLISHED', catalogPublished: true,
            publicRevisionId: 'rev-1', sku: 'SKU-VIVO', name: 'Vivo cambiado',
            description: 'd', technicalSpecs: null, documents: null,
            brand: { name: 'B', slug: 'b' }, category: { id: 'c1', name: 'C', slug: 'c', parentId: null },
            images: [],
          }),
          count: jest.fn().mockResolvedValue(0),
        },
        productRevision: {
          findMany: jest.fn().mockResolvedValue([{ id: 'rev-1', content: { name: 'Del snapshot', sku: 'SKU-SNAP' } }]),
        },
      } as any;
      const pricing = { getPublicPrice: jest.fn().mockResolvedValue(null), breadcrumbOf: jest.fn().mockResolvedValue([]) } as any;
      const service = new PublicCatalogService(prisma, pricing);
      const detail = await service.getDetail('p1');
      expect(detail.name).toBe('Del snapshot');
      expect(detail.sku).toBe('SKU-SNAP');
    });

    it('search exige catalogPublished además de PUBLISHED (borrador jamás listado)', async () => {
      const prisma = {
        category: { findMany: jest.fn().mockResolvedValue([]) },
        product: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
        productRevision: { findMany: jest.fn().mockResolvedValue([]) },
      } as any;
      const pricing = { getPublicPrices: jest.fn().mockResolvedValue(new Map()) } as any;
      const service = new PublicCatalogService(prisma, pricing);
      await service.search({ q: 'x' });
      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where.lifecycleStatus).toBe('PUBLISHED');
      expect(where.catalogPublished).toBe(true);
    });
  });

  describe('getDetail por ID exige visibilidad completa (hueco §2.1 cerrado)', () => {
    it('el where exige catalogPublished además de PUBLISHED', async () => {
      const prisma = {
        product: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'p1', lifecycleStatus: 'PUBLISHED', catalogPublished: true,
            publicRevisionId: null, sku: 'S', name: 'N', description: null,
            technicalSpecs: null, documents: null,
            brand: { name: 'B', slug: 'b' }, category: { id: 'c1', name: 'C', slug: 'c', parentId: null },
            images: [],
          }),
        },
      } as any;
      const pricing = { getPublicPrice: jest.fn().mockResolvedValue(null) } as any;
      const service = new PublicCatalogService(prisma, pricing);
      await service.getDetail('p1');
      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1', lifecycleStatus: 'PUBLISHED', catalogPublished: true },
        }),
      );
    });
  });
});
