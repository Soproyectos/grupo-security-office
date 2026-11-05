/**
 * CAT-02 backend-publico — lente de revisión y predicado único de visibilidad.
 * (ficha acceptance: «storefront.service y controlador público no filtran
 * borrador por ID/slug/listado» + conservar respuesta/presentación.)
 *
 * RED observado: el helper/lente aún no existen.
 */
import { NotFoundException } from '@nestjs/common';
import { applyRevisionLens, applySheetSnapshot, effectiveIdentity, loadActiveRevisionContents, sheetDiffersFromSnapshot } from './public-revision-lens';
import { PublicCatalogService } from './public-catalog.service';
import { PUBLIC_CATALOG_VISIBILITY } from './public-catalog-visibility';

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
        brand: { findMany: jest.fn().mockResolvedValue([]) },
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

    it('search exige la visibilidad pública común (PUBLIC_CATALOG_VISIBILITY): publicado o ficha informativa de la biblioteca', async () => {
      const prisma = {
        brand: { findMany: jest.fn().mockResolvedValue([]) },
        category: { findMany: jest.fn().mockResolvedValue([]) },
        product: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
        productRevision: { findMany: jest.fn().mockResolvedValue([]) },
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      } as any;
      const pricing = { getPublicPrices: jest.fn().mockResolvedValue(new Map()) } as any;
      const service = new PublicCatalogService(prisma, pricing);
      await service.search({ q: 'x' });
      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual(expect.arrayContaining([PUBLIC_CATALOG_VISIBILITY]));
    });
  });

  describe('getDetail por ID exige visibilidad completa (hueco §2.1 cerrado)', () => {
    it('el where exige la visibilidad pública común además del id', async () => {
      const prisma = {
        brand: { findMany: jest.fn().mockResolvedValue([]) },
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
          where: { id: 'p1', AND: [PUBLIC_CATALOG_VISIBILITY] },
        }),
      );
    });
  });
});

describe('published isolation — detailed sheet snapshot', () => {
  const live = { id: 'p1', publicRevisionId: 'rev-1', catalogHighlights: ['live'], catalogBadges: ['live'], catalogImageUrl: '/live.png', catalogSpecGroups: [{ key: 'v', title: 'Live', items: [] }] };

  it('applySheetSnapshot takes the snapshot values, including an authoritative null', () => {
    const contents = new Map([['rev-1', { catalogHighlights: ['pub'], catalogImageUrl: null, catalogSpecGroups: [] } as Record<string, unknown>]]);
    const out = applySheetSnapshot(live, contents) as any;
    expect(out.catalogHighlights).toEqual(['pub']);
    expect(out.catalogImageUrl).toBeNull();
    expect(out.catalogSpecGroups).toEqual([]);
    expect(out.catalogBadges).toEqual(['live']); // key absent in the snapshot -> live fallback
  });

  it('applySheetSnapshot is a no-op for a legacy revision and without an active revision', () => {
    expect(applySheetSnapshot(live, new Map([['rev-1', { name: 'x' } as Record<string, unknown>]]))).toEqual(live);
    expect(applySheetSnapshot(live, new Map())).toEqual(live);
  });

  it('sheetDiffersFromSnapshot detects draft changes and ignores keys a legacy snapshot lacks', () => {
    const snap = { catalogHighlights: ['live'], catalogBadges: ['live'], catalogSpecGroups: [{ key: 'v', title: 'Live', items: [] }], images: [{ url: '/a', alt: null, isPrimary: true }] };
    const row = { ...live, images: [{ url: '/a', alt: null, isPrimary: true }] };
    expect(sheetDiffersFromSnapshot(row, snap)).toBe(false);
    expect(sheetDiffersFromSnapshot({ ...row, catalogHighlights: ['edited'] }, snap)).toBe(true);
    expect(sheetDiffersFromSnapshot({ ...row, images: [{ url: '/b', alt: null, isPrimary: true }] }, snap)).toBe(true);
    expect(sheetDiffersFromSnapshot({ ...row, catalogSpecGroups: [{ key: 'v', title: 'Live', items: [{ label: 'a', value: 'b' }] }] }, snap)).toBe(true);
    expect(sheetDiffersFromSnapshot({ ...row, catalogHighlights: ['edited'] }, { name: 'legacy' })).toBe(false);
    expect(sheetDiffersFromSnapshot(row, undefined)).toBe(false);
  });
});

describe('published isolation — identity snapshot', () => {
  const row = { publicRevisionId: 'rev-1' };
  const contents = new Map([['rev-1', { categoryId: 'c-old', brandId: null, name: 'legacy-like' }]]);

  it('a present key is authoritative, even null', () => {
    expect(effectiveIdentity(row, contents, 'categoryId', 'c-live')).toBe('c-old');
    expect(effectiveIdentity(row, contents, 'brandId', 'b-live')).toBeNull();
  });

  it('a missing key (legacy revision) or no pinned revision falls back to the live value', () => {
    expect(effectiveIdentity(row, contents, 'subcategoryId', 's-live')).toBe('s-live');
    expect(effectiveIdentity({ publicRevisionId: null }, contents, 'categoryId', 'c-live')).toBe('c-live');
    expect(effectiveIdentity(row, new Map(), 'categoryId', null)).toBeNull();
  });
  describe('sheet snapshot version 2', () => {
    const live = { publicRevisionId: 'r', name: 'Live', sku: 'L', description: 'live desc', catalogBrand: 'Live brand', catalogStatus: 'DISCONTINUED', catalogSpecsDisclaimer: 'live disc', catalogAvailableModels: ['A'], catalogFirmwareNote: 'live fw' };
    const withContent = (content: Record<string, unknown>) => new Map([['r', content]]);

    it('with the marker, a present null/empty value is authoritative (no live fallback)', () => {
      const contents = withContent({ sheetSnapshotVersion: 2, description: null, catalogBrand: null, name: null, catalogStatus: 'ACTIVE', catalogSpecsDisclaimer: null, catalogAvailableModels: [], catalogFirmwareNote: null });
      const out = applySheetSnapshot(applyRevisionLens(live, contents), contents);
      expect(out).toMatchObject({ description: null, catalogBrand: null, catalogStatus: 'ACTIVE', catalogSpecsDisclaimer: null, catalogAvailableModels: [], catalogFirmwareNote: null });
      expect(out.name).toBe('Live'); // non-nullable identity column keeps live
    });

    it('with the marker, absent keys still fall back to live', () => {
      const contents = withContent({ sheetSnapshotVersion: 2 });
      expect(applySheetSnapshot(applyRevisionLens(live, contents), contents)).toEqual(live);
    });

    it('without the marker (legacy), null is ignored and new keys are not applied', () => {
      const contents = withContent({ description: null, catalogBrand: null, catalogStatus: 'ACTIVE', catalogSpecsDisclaimer: null, catalogAvailableModels: [] });
      expect(applySheetSnapshot(applyRevisionLens(live, contents), contents)).toEqual(live);
    });

    it('preview keeps the live description and brand even with the marker', () => {
      const contents = withContent({ sheetSnapshotVersion: 2, description: 'frozen', catalogBrand: 'frozen' });
      expect(applyRevisionLens(live, contents, { preview: true })).toMatchObject({ description: 'live desc', catalogBrand: 'Live brand' });
      expect(applyRevisionLens(live, contents)).toMatchObject({ description: 'frozen', catalogBrand: 'frozen' });
    });

    it('sheetDiffersFromSnapshot compares the new fields only with the marker', () => {
      const snapshot = { description: null, catalogBrand: null, catalogStatus: 'ACTIVE', catalogSpecsDisclaimer: null, catalogAvailableModels: [], catalogFirmwareNote: null };
      const row = { images: [], ...live };
      expect(sheetDiffersFromSnapshot(row, snapshot)).toBe(false);
      expect(sheetDiffersFromSnapshot(row, { ...snapshot, sheetSnapshotVersion: 2 })).toBe(true);
      expect(sheetDiffersFromSnapshot({ images: [], description: '', catalogBrand: null, catalogStatus: null, catalogSpecsDisclaimer: null, catalogAvailableModels: [], catalogFirmwareNote: null }, { ...snapshot, sheetSnapshotVersion: 2 })).toBe(false);
    });
  });
});
