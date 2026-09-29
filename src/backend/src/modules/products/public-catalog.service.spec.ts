import { NotFoundException } from '@nestjs/common';
import { createPrismaMock } from '../../__test__/mocks/prisma.mock';
import { fakePriceFindMany, FakePriceRow } from '../../__test__/helpers/fake-price-db';
import { PublicCatalogService } from './public-catalog.service';
import { PublicPricingService } from './public-pricing.service';

/** ConfigService hermético: no depende del process.env de quien corre la prueba. */
const makeConfig = (env: Record<string, string | undefined> = {}) =>
  ({ get: jest.fn((key: string) => env[key]) }) as any;

const PUBLIC_LIST = { code: 'CLIENTE_FINAL_IVA' };

// Árbol: cctv > domos > ptz ; acceso ; oculta (inactiva) > hija-de-oculta
const categories = [
  { id: 'c-cctv', name: 'CCTV', slug: 'cctv', parentId: null, isActive: true },
  { id: 'c-domos', name: 'Domos', slug: 'domos', parentId: 'c-cctv', isActive: true },
  { id: 'c-ptz', name: 'PTZ', slug: 'ptz', parentId: 'c-domos', isActive: true },
  { id: 'c-acceso', name: 'Control de Acceso', slug: 'acceso', parentId: null, isActive: true },
  { id: 'c-oculta', name: 'Oculta', slug: 'oculta', parentId: null, isActive: false },
  { id: 'c-hija', name: 'Hija de oculta', slug: 'hija-de-oculta', parentId: 'c-oculta', isActive: true },
];
const categoryById = new Map(categories.map((c) => [c.id, c]));

const product = (
  id: string,
  name: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  sku: `SKU-${id}`,
  name,
  categoryId,
  lifecycleStatus: 'PUBLISHED',
  description: null,
  technicalSpecs: null,
  documents: null,
  extraAttributes: { COSTO: 1_000_000, PLATINO: 1_100_000 },
  brand: { name: 'Hikvision', slug: 'hikvision' },
  images: [],
  ...overrides,
});

const products = [
  product('p-01', 'Cámara Bala', 'c-cctv', { images: [{ url: '/api/files/bala', alt: null, isPrimary: true, sortOrder: 0 }] }),
  product('p-02', 'Cámara Domo', 'c-domos'),
  product('p-03', 'Cámara PTZ', 'c-ptz'),
  product('p-04', 'Cámara Domo Borrador', 'c-domos', { lifecycleStatus: 'DRAFT' }),
  product('p-05', 'Lector Facial', 'c-acceso'),
  product('p-06', 'Producto en categoría oculta', 'c-oculta'),
  product('p-07', 'Cámara Térmica', 'c-cctv'),
];

/** Aplica el `where` que el servicio manda a Prisma sobre `products`. */
function matchesProductWhere(row: any, where: any): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.lifecycleStatus !== undefined && row.lifecycleStatus !== where.lifecycleStatus) return false;
  if (where.categoryId?.in && !where.categoryId.in.includes(row.categoryId)) return false;
  if (where.OR) {
    const hit = where.OR.some((cond: any) => {
      const [field, filter] = Object.entries(cond)[0] as [string, any];
      return String(row[field]).toLowerCase().includes(String(filter.contains).toLowerCase());
    });
    if (!hit) return false;
  }
  return true;
}

describe('PublicCatalogService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: PublicCatalogService;

  const build = (
    priceRows: FakePriceRow[] = [],
    env: Record<string, string | undefined> = {},
    extraProducts: ReturnType<typeof product>[] = [],
  ) => {
    const table = [...products, ...extraProducts];
    prisma = createPrismaMock();
    prisma.price.findMany.mockImplementation(fakePriceFindMany(priceRows));
    prisma.category.findMany.mockResolvedValue(categories);
    prisma.product.findMany.mockImplementation(async (args: any) => {
      const rows = table
        .filter((row) => matchesProductWhere(row, args.where))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? Infinity));
      return rows.map((row) => ({
        ...row,
        category: categoryById.get(row.categoryId),
        images: row.images.filter((image: any) => image.isPrimary).slice(0, 1),
      }));
    });
    prisma.product.count.mockImplementation(
      async (args: any) => table.filter((row) => matchesProductWhere(row, args.where)).length,
    );
    prisma.product.findFirst.mockImplementation(async (args: any) => {
      const row = table.find((candidate) => matchesProductWhere(candidate, args.where));
      return row ? { ...row, category: categoryById.get(row.categoryId) } : null;
    });
    service = new PublicCatalogService(prisma as any, new PublicPricingService(prisma as any, makeConfig(env)));
  };

  beforeEach(() => build());

  describe('search — listado por categoría', () => {
    it('con category devuelve los publicados de la categoría y sus descendientes', async () => {
      const result = await service.search({ category: 'cctv' });

      // p-04 es DRAFT (fuera), p-05 es de otra categoría, p-06 de una inactiva.
      expect(result.data.map((item) => item.id)).toEqual(['p-01', 'p-02', 'p-03', 'p-07']);
      expect(result.meta).toEqual({ total: 4, offset: 0, limit: 24 });
    });

    it('consulta con PUBLISHED y los ids de la categoría y sus descendientes', async () => {
      await service.search({ category: 'cctv' });

      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where.lifecycleStatus).toBe('PUBLISHED');
      expect([...where.categoryId.in].sort()).toEqual(['c-cctv', 'c-domos', 'c-ptz']);
    });

    it('una subcategoría solo trae su propio subárbol', async () => {
      const result = await service.search({ category: 'domos' });

      expect(result.data.map((item) => item.id)).toEqual(['p-02', 'p-03']);
    });

    it('un slug desconocido devuelve lista vacía (200, no error) sin consultar productos', async () => {
      const result = await service.search({ category: 'no-existe', offset: 5, limit: 10 });

      expect(result).toEqual({ data: [], meta: { total: 0, offset: 5, limit: 10 } });
      expect(prisma.product.findMany).not.toHaveBeenCalled();
      expect(prisma.product.count).not.toHaveBeenCalled();
      expect(prisma.price.findMany).not.toHaveBeenCalled();
    });

    it('una categoría inactiva se trata como desconocida', async () => {
      const result = await service.search({ category: 'oculta' });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('combina category con q', async () => {
      const result = await service.search({ category: 'cctv', q: '  domo ' });

      expect(result.data.map((item) => item.id)).toEqual(['p-02']);
      expect(result.meta.total).toBe(1);
    });

    it('sin category ni q lista todos los publicados', async () => {
      const result = await service.search({});

      expect(result.data).toHaveLength(6); // 7 productos - 1 DRAFT
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('cada fila lleva el precio público de la página resuelto en una consulta', async () => {
      build([
        { productId: 'p-02', value: '850000', list: PUBLIC_LIST },
        { productId: 'p-02', value: '700000', list: { code: 'INSTALADOR_IVA' } },
      ]);

      const result = await service.search({ category: 'domos' });

      expect(result.data.map((item) => item.price)).toEqual([{ value: 850000, currency: 'COP' }, null]);
      expect(prisma.price.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('search — paginación', () => {
    it('devuelve la meta { total, offset, limit } y pagina con skip/take', async () => {
      const result = await service.search({ offset: 2, limit: 2 });

      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 2, take: 2 }));
      expect(result.meta).toEqual({ total: 6, offset: 2, limit: 2 });
      expect(result.data).toHaveLength(2);
    });

    it('usa offset 0 y limit 24 por defecto', async () => {
      const result = await service.search({});

      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 24 }));
      expect(result.meta).toEqual({ total: 6, offset: 0, limit: 24 });
    });

    it('un offset más allá del total devuelve data vacía pero conserva el total', async () => {
      const result = await service.search({ offset: 40, limit: 10 });

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({ total: 6, offset: 40, limit: 10 });
    });

    it('ordena de forma estable por nombre y luego id, y las páginas no se solapan', async () => {
      const args = () => prisma.product.findMany.mock.calls[0][0];
      const first = await service.search({ limit: 3, offset: 0 });
      expect(args().orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
      const second = await service.search({ limit: 3, offset: 3 });

      const ids = [...first.data, ...second.data].map((item) => item.id);
      expect(new Set(ids).size).toBe(6);
      const names = [...first.data, ...second.data].map((item) => item.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });
  });

  describe('getDetail', () => {
    it('responde 404 para un id inexistente', async () => {
      await expect(service.getDetail('no-existe')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('responde 404 para un producto que no está PUBLISHED (DRAFT)', async () => {
      await expect(service.getDetail('p-04')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p-04', lifecycleStatus: 'PUBLISHED' } }),
      );
      // Un 404 no debe gastar consultas de precio ni de categorías.
      expect(prisma.price.findMany).not.toHaveBeenCalled();
    });

    it('devuelve la ficha con marca, categoría, breadcrumb, imágenes, specs, fichas y precio', async () => {
      const detailProduct = product('p-detail', 'Cámara Domo 4K', 'c-ptz', {
        description: 'Domo 4K con visión nocturna',
        technicalSpecs: [
          { key: 'resolucion', type: 'SELECT', unit: 'MP', options: ['4', '8'], required: true, value: '8' },
          { key: 'vacio', type: 'TEXT', value: '' },
        ],
        documents: [
          { name: 'ficha-tecnica.pdf', url: '/api/files/f1/ficha-tecnica.pdf', type: 'pdf', size: 2048 },
          { name: 'Foto', url: '/uploads/foto.jpg' },
        ],
        images: [
          { url: '/api/files/extra', alt: 'Vista lateral', isPrimary: false, sortOrder: 1 },
          { url: '/api/files/portada', alt: null, isPrimary: true, sortOrder: 2 },
        ],
      });
      build([{ productId: 'p-detail', value: '2450000.00', list: PUBLIC_LIST }], {}, [detailProduct]);

      const detail = await service.getDetail('p-detail');

      expect(detail).toEqual({
        id: 'p-detail',
        sku: 'SKU-p-detail',
        name: 'Cámara Domo 4K',
        description: 'Domo 4K con visión nocturna',
        brand: { name: 'Hikvision', slug: 'hikvision' },
        category: { name: 'PTZ', slug: 'ptz' },
        breadcrumb: [
          { name: 'CCTV', slug: 'cctv' },
          { name: 'Domos', slug: 'domos' },
        ],
        images: [
          { url: '/api/files/portada', alt: null },
          { url: '/api/files/extra', alt: 'Vista lateral' },
        ],
        technicalSpecs: [{ key: 'resolucion', value: '8', unit: 'MP' }],
        datasheets: [{ name: 'ficha-tecnica.pdf', url: '/api/files/f1/ficha-tecnica.pdf' }],
        price: { value: 2450000, currency: 'COP' },
      });
    });

    it('el breadcrumb es vacío para una categoría raíz y no consulta el árbol', async () => {
      const detail = await service.getDetail('p-05');

      expect(detail.category).toEqual({ name: 'Control de Acceso', slug: 'acceso' });
      expect(detail.breadcrumb).toEqual([]);
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('un producto sin precio público sigue devolviéndose, con price null', async () => {
      const detail = await service.getDetail('p-05');

      expect(detail.id).toBe('p-05');
      expect(detail.price).toBeNull();
    });

    it('un producto sin specs, documentos ni imágenes devuelve listas vacías', async () => {
      const detail = await service.getDetail('p-05');

      expect(detail).toEqual(
        expect.objectContaining({ images: [], technicalSpecs: [], datasheets: [], description: null }),
      );
    });

    it('no filtra extraAttributes, costos ni listas internas aunque la BD los devuelva', async () => {
      build([
        { productId: 'p-05', value: '1', list: { code: 'INSTALADOR_IVA' } },
        { productId: 'p-05', value: '2', list: { code: 'TIENDA_IVA' } },
        { productId: 'p-05', value: '3', list: { code: 'DPP_ORO_IVA' } },
        { productId: 'p-05', value: '4', list: { code: 'DPP_PLATINO_IVA' } },
        { productId: 'p-05', value: '5', list: { code: 'ORO_SIN_IVA' } },
        { productId: 'p-05', value: '6', list: { code: 'INSTALLER_SIN_IVA' } },
        { productId: 'p-05', value: '399000', list: PUBLIC_LIST },
      ]);

      const detail = await service.getDetail('p-05');

      expect(detail.price).toEqual({ value: 399000, currency: 'COP' });
      expect(Object.keys(detail).sort()).toEqual([
        'breadcrumb', 'brand', 'category', 'datasheets', 'description', 'id', 'images', 'name', 'price', 'sku', 'technicalSpecs',
      ].sort());
      const serialized = JSON.stringify(detail);
      for (const forbidden of ['extraAttributes', 'COSTO', 'PLATINO', 'INSTALADOR', 'TIENDA', 'DPP_', 'SIN_IVA', 'lifecycleStatus']) {
        expect(serialized).not.toContain(forbidden);
      }
      // La consulta nunca pide extraAttributes ni las listas de precios.
      const select = prisma.product.findFirst.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('extraAttributes');
      expect(select).not.toHaveProperty('prices');
      expect(select).not.toHaveProperty('listaId');
    });

    it('un precio público vencido deja price en null', async () => {
      build([
        {
          productId: 'p-05',
          value: '399000',
          list: PUBLIC_LIST,
          validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      ]);

      expect((await service.getDetail('p-05')).price).toBeNull();
    });
  });
});
