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
  { id: 'c-camaras', name: 'Cámaras', slug: 'camaras', parentId: null, isActive: true },
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
  overrides: Record<string, unknown> & { publicRevisionId?: string } = {},
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
  brandId: 'brand-hikvision',
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
  if (where.AND && !where.AND.every((condition: any) => matchesProductWhere(row, condition))) return false;
  if (where.OR && !where.OR.some((condition: any) => matchesProductWhere(row, condition))) return false;
  if (where.id?.in && !where.id.in.includes(row.id)) return false;
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  if (where.lifecycleStatus !== undefined && row.lifecycleStatus !== where.lifecycleStatus) return false;
  if (where.categoryId?.in && !where.categoryId.in.includes(row.categoryId)) return false;
  if (where.extraAttributes?.path?.[0] === 'biblioteca' && !row.extraAttributes?.biblioteca) return false;
  for (const field of ['name', 'sku']) {
    if (where[field]?.contains && !String(row[field]).toLowerCase().includes(String(where[field].contains).toLowerCase())) {
      return false;
    }
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
    revisions: Record<string, { brandId?: string | null; sku?: string }> = {},
  ) => {
    const table = [...products, ...extraProducts];
    const publishedRevisions = Object.entries(revisions).map(([id, content]) => ({ id, content }));
    const brands = [
      { id: 'brand-ezviz', name: 'Ezviz', slug: 'ezviz', isActive: true },
      { id: 'brand-hikvision', name: 'Hikvision', slug: 'hikvision', isActive: true },
      { id: 'brand-inactive', name: 'Inactive', slug: 'inactive', isActive: false },
      { id: 'brand-empty', name: 'Empty', slug: 'empty', isActive: true },
    ];
    const snapshotBrandId = (row: { brandId: string | null; publicRevisionId?: string }) => {
      const revision = revisions[row.publicRevisionId ?? ''];
      return revision?.brandId === undefined ? row.brandId : revision.brandId;
    };
  const snapshotSubcategoryId = (row: { subcategoryId?: string | null; publicRevisionId?: string }) => {
    const revision = revisions[row.publicRevisionId ?? ''] as any;
    return revision && Object.prototype.hasOwnProperty.call(revision, 'subcategoryId')
      ? revision.subcategoryId
      : row.subcategoryId ?? null;
  };
    prisma = createPrismaMock();
    Object.assign(prisma, {
      productRevision: {
        findMany: jest.fn(async ({ where }) => {
          expect(where.status).toBe('PUBLICADA');
          return publishedRevisions.filter(({ id }) => where.id.in.includes(id));
        }),
      },
    });
    prisma.brand.findUnique.mockImplementation(async ({ where }) => brands.find((b) => b.slug === where.slug) ?? null);
    prisma.brand.findMany.mockImplementation(async ({ where }) =>
      brands.filter((b) => where.id?.in ? where.id.in.includes(b.id) : b.isActive === where.isActive),
    );
    const subcategoryIdsBySlug: Record<string, string> = {
      'camaras-ip-y-wi-fi': 'sub-ip',
      'camaras-analogicas': 'sub-analog',
      'camaras-especiales-y-para-vehiculos': 'sub-special',
    };
    prisma.subcategory.findMany.mockImplementation(async ({ where }: any) =>
      where.category?.slug === 'camaras'
        ? (where.slug.in as string[]).filter((slug) => subcategoryIdsBySlug[slug]).map((slug) => ({ id: subcategoryIdsBySlug[slug] }))
        : [],
    );
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
    // Simula filtros y ranking usando los valores enlazados a la consulta.
    (prisma as any).$queryRawUnsafe = jest.fn(async (sql: string, ...params: unknown[]) => {
      const term = sql.includes('lower(b.name)') ? (params[0] as string).toLowerCase() : undefined;
      const brandParam = sql.match(/ELSE p\."brandId" END\) = \$(\d+)/)?.[1];
      const brandId = brandParam ? params[Number(brandParam) - 1] : undefined;
      const subcategoryParam = sql.match(/ELSE p\."subcategoryId" END\) = ANY\(\$(\d+)::text\[\]\)/)?.[1];
      const subcategoryIds = subcategoryParam ? (params[Number(subcategoryParam) - 1] as string[]) : undefined;
      const idsParam = sql.match(/ELSE p\."categoryId" END\) = ANY\(\$(\d+)::text\[\]\)/)?.[1];
      const skuParam = sql.match(/COALESCE\(r\.content->>'sku', p\.sku\) = ANY\(\$(\d+)::text\[\]\)/)?.[1];
      const skus = skuParam ? (params[Number(skuParam) - 1] as string[]) : undefined;
      const ids = idsParam ? (params[Number(idsParam) - 1] as string[]) : undefined;
      const rankOf = (row: typeof table[number]): number | undefined => {
        if (!term) return 0;
        const fields = [row.name.toLowerCase(), row.sku.toLowerCase()];
        const brand = brands.find((b) => b.id === snapshotBrandId(row) && b.isActive);
        if (brand?.name.toLowerCase() === term || fields.some((f) => f === term)) return 0;
        if (fields.some((f) => f.startsWith(term))) return 1;
        if (fields.some((f) => f.includes(term))) return 2;
        return undefined;
      };
      return table
        .map((row) => ({ row, rank: rankOf(row) }))
        .filter(({ rank }) => rank !== undefined)
        .filter(({ row }) => !ids || ids.includes(row.categoryId))
        .filter(({ row }) => !skus || skus.includes(revisions[row.publicRevisionId ?? '']?.sku ?? row.sku))
        .filter(({ row }) => !brandId || brandId === snapshotBrandId(row))
        .filter(({ row }) => !subcategoryIds || subcategoryIds.includes(snapshotSubcategoryId(row as never)))
        .map(({ row, rank }) => ({ id: row.id, rank, name: row.name }));
    });
    prisma.product.findFirst.mockImplementation(async (args: any) => {
      const row = table.find((candidate) => matchesProductWhere(candidate, args.where));
      return row ? { ...row, category: categoryById.get(row.categoryId) } : null;
    });
    service = new PublicCatalogService(prisma as any, new PublicPricingService(prisma as any, makeConfig(env)));
  };

  beforeEach(() => build());

  describe('search — listado por categoría', () => {
    it('no aplica ninguna exclusión de marca y muestra un producto con catalogBrand nulo', async () => {
      build([], {}, [product('p-null-brand', 'Sin marca de ficha', 'c-cctv', { catalogBrand: null })]);
      const result = await service.search({});
      await expect(service.getDetail('p-null-brand')).resolves.toBeDefined();

      const listWhere = prisma.product.findMany.mock.calls[0][0].where;
      expect(JSON.stringify(listWhere)).not.toMatch(/catalogBrand|brandId|dahua|imou/i);
      expect(result.data.map((item) => item.id)).toContain('p-null-brand');
      expect(prisma.brand.findMany).not.toHaveBeenCalled();
    });
    it('con category devuelve los publicados de la categoría y sus descendientes', async () => {
      const result = await service.search({ category: 'cctv' });

      // p-04 es DRAFT (fuera), p-05 es de otra categoría, p-06 de una inactiva.
      expect(result.data.map((item) => item.id)).toEqual(['p-01', 'p-02', 'p-03', 'p-07']);
      expect(result.meta).toEqual({ total: 4, offset: 0, limit: 24 });
    });

    it('consulta con publicación comercial o marca de biblioteca y los ids de la categoría', async () => {
      await service.search({ category: 'cctv' });

      const where = prisma.product.findMany.mock.calls[0][0].where;
      expect(where.AND[0].OR).toEqual(expect.arrayContaining([
        { lifecycleStatus: 'PUBLISHED' },
        expect.objectContaining({ extraAttributes: expect.objectContaining({ path: ['biblioteca'] }) }),
      ]));
      const bound = (prisma as any).$queryRawUnsafe.mock.calls[0].slice(1).find(Array.isArray) as string[];
      expect([...bound].sort()).toEqual(['c-cctv', 'c-domos', 'c-ptz']);
      expect(where.AND.some((c: any) => c.id?.in)).toBe(true);
    });

    it('incluye una ficha informativa oficial sin abrir otros borradores', async () => {
      build([{ productId: 'p-library', value: '999999', list: PUBLIC_LIST }], {}, [
        product('p-library', 'SKU informativo', 'c-cctv', {
          lifecycleStatus: 'DRAFT',
          extraAttributes: { biblioteca: { estado: 'pendiente_enriquecimiento' } },
        }),
      ]);

      const result = await service.search({ category: 'cctv' });

      expect(result.data.find((item) => item.id === 'p-library')).toMatchObject({ isInformational: true });
      expect(result.data.find((item) => item.id === 'p-library')?.price).toBeNull();
      expect(result.data.some((item) => item.id === 'p-04')).toBe(false);
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

    it('filtra por referencias publicadas exactas dentro de la categoría', async () => {
      const exact = 'CAM (2.8mm)/LA';
      const live = 'BORRADOR-01';
      build([], {}, [
        product('p-picked', 'Cámara elegida', 'c-domos', { sku: live, publicRevisionId: 'r-picked' }),
        product('p-prefix', 'Variante distinta', 'c-cctv', { sku: exact + '-PRO' }),
        product('p-other', 'Categoría distinta', 'c-acceso', { sku: 'ACCESO-01' }),
        product('p-hidden', 'Cámara borrador', 'c-cctv', { sku: 'OCULTO-01', lifecycleStatus: 'DRAFT' }),
      ], { 'r-picked': { sku: exact } });

      const skus = [exact, live, 'ACCESO-01', 'OCULTO-01'];
      const result = await service.search({ category: 'cctv', sku: skus });

      expect(result.data).toMatchObject([{ id: 'p-picked', sku: exact }]);
      expect(result.meta.total).toBe(1);
      const [sql, , boundSkus] = (prisma as any).$queryRawUnsafe.mock.calls[0];
      expect(boundSkus).toEqual(skus);
      expect(sql).not.toContain(exact);

      const oldSku = await service.search({ category: 'cctv', sku: [live] });
      expect(oldSku.data).toEqual([]);
    });

    it('combina category con q', async () => {
      const result = await service.search({ category: 'cctv', q: '  domo ' });

      expect(result.data.map((item) => item.id)).toEqual(['p-02']);
      expect(result.meta.total).toBe(1);
    });

    it('q ordena por relevancia (exacta, empieza por, contiene) y luego por nombre, y pagina después de ordenar', async () => {
      build([], {}, [
        product('p-a', 'Zeta', 'c-cctv', { sku: 'DS-PWA48-KIT-WB' }),
        product('p-b', 'Alfa', 'c-cctv', { sku: 'DS-PWA48-KIT-WB/EU' }),
        product('p-c', 'Beta', 'c-cctv', { sku: 'X-DS-PWA48-KIT-WB' }),
      ]);

      const all = await service.search({ q: 'DS-PWA48-KIT-WB' });
      expect(all.data.map((item) => item.id)).toEqual(['p-a', 'p-b', 'p-c']);
      expect(all.meta.total).toBe(3);

      const page = await service.search({ q: 'DS-PWA48-KIT-WB', offset: 1, limit: 1 });
      expect(page.data.map((item) => item.id)).toEqual(['p-b']);
      expect(page.meta).toEqual({ total: 3, offset: 1, limit: 1 });
    });

    it('q excluye lo no visible aunque coincida (borrador) y cuenta solo los visibles', async () => {
      const result = await service.search({ q: 'Cámara Domo' });

      expect(result.data.map((item) => item.id)).toEqual(['p-02']); // p-04 es DRAFT
      expect(result.meta.total).toBe(1);
    });

    it('la consulta del snapshot busca SKU, modelo, nombre y referencias; sin descripción y sin LIKE', async () => {
      await service.search({ q: 'DS-PWA48-KIT-WB' });

      const [sql, ...params] = (prisma as any).$queryRawUnsafe.mock.calls[0];
      expect(params).toEqual(['DS-PWA48-KIT-WB']);
      expect(sql).toContain("r.content->>'catalogModel'");
      expect(sql).toContain('p."catalogManufacturerRefs"');
      expect(sql).toContain("r.content->>'sku'");
      expect(sql).not.toContain('p."description"');
      expect(sql).not.toMatch(/LIKE/i);
      expect(sql).not.toContain('DS-PWA48-KIT-WB');
    });

    it('varias palabras (sin forma de código) también buscan por todas las palabras', async () => {
      await service.search({ q: 'camara domo' });

      const [sql, ...params] = (prisma as any).$queryRawUnsafe.mock.calls[0];
      expect(params).toEqual(['camara domo', ['camara', 'domo']]);
      expect(sql).toContain('unnest($2::text[])');
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

    it('combina marca publicada, categoría y texto antes de paginar', async () => {
      build([], {}, [
        product('p-snapshot', 'Cámara de prueba', 'c-domos', { publicRevisionId: 'r-switch' }),
        product('p-null', 'Otra cámara', 'c-domos', { brandId: 'brand-ezviz', publicRevisionId: 'r-null' }),
        product('p-out', 'Cámara exterior', 'c-acceso', { publicRevisionId: 'r-switch' }),
      ], { 'r-switch': { brandId: 'brand-ezviz' }, 'r-null': { brandId: null } });

      const result = await service.search({ brand: 'ezviz', category: 'cctv', q: 'cámara', limit: 1 });

      expect(prisma.brand.findUnique).toHaveBeenCalledWith({
        where: { slug: 'ezviz' }, select: { id: true, isActive: true },
      });
      expect(result.data).toMatchObject([{ id: 'p-snapshot', brandName: 'Ezviz' }]);
      expect(result.meta).toEqual({ total: 1, offset: 0, limit: 1 });
      const [sql, ...params] = (prisma as any).$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain("WHEN jsonb_exists(r.content, 'brandId')");
      expect(sql).toContain('ELSE p."brandId" END) = $3');
      expect(params).toEqual(['cámara', expect.arrayContaining(['c-cctv', 'c-domos']), 'brand-ezviz']);
    });

    it.each(['inactive', 'marca-inexistente'])('devuelve lista vacía para el slug %s', async (brand) => {
      const result = await service.search({ brand });
      expect(result).toEqual({ data: [], meta: { total: 0, offset: 0, limit: 24 } });
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('q admite el nombre exacto de la marca efectiva sin usar la marca viva de una revisión', async () => {
      build([], {}, [
        product('p-snapshot', 'Cámara de prueba', 'c-domos', { publicRevisionId: 'r-switch' }),
      ], { 'r-switch': { brandId: 'brand-ezviz' } });

      const exact = await service.search({ q: ' eZViZ ' });
      const partial = await service.search({ q: 'Ezv' });
      const oldBrand = await service.search({ q: 'Hikvision' });
      expect(exact.data).toMatchObject([{ id: 'p-snapshot', brandName: 'Ezviz' }]);
      expect(partial.meta.total).toBe(0);
      expect(oldBrand.data.map((p) => p.id)).not.toContain('p-snapshot');
      const [sql, ...params] = (prisma as any).$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('lower(b.name) = lower($1)');
      expect(params).toEqual(['eZViZ']);
    });
  });

  describe('search — subcategoría de cámaras', () => {
    it('combina subcategoría, categoría, marca y q sobre identidad publicada conservando el ranking', async () => {
      build([], {}, [
        product('p-sub', 'Cámara IP publicada', 'c-camaras', { publicRevisionId: 'r-sub', subcategoryId: null }),
        product('p-other-sub', 'Cámara IP distinta', 'c-camaras', { subcategoryId: 'sub-other' }),
      ], { 'r-sub': { brandId: 'brand-ezviz', subcategoryId: 'sub-ip' } as any });

      const result = await service.search({
        category: 'camaras', subcategory: 'camaras-ip-y-wi-fi', brand: 'ezviz', q: 'publicada', offset: 0, limit: 10,
      });

      expect(result.data.map((item) => item.id)).toEqual(['p-sub']);
      expect(prisma.subcategory.findMany).toHaveBeenCalledWith({
        where: { slug: { in: ['camaras-ip-y-wi-fi'] }, isActive: true, category: { slug: 'camaras', isActive: true } },
        select: { id: true },
      });
      const [sql, ...params] = (prisma as any).$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain("jsonb_exists(r.content, 'subcategoryId')");
      expect(params).toContainEqual(['sub-ip']);
      expect(prisma.product.findMany.mock.calls.at(-1)![0].where.AND).toContainEqual({ id: { in: ['p-sub'] } });
    });

    it('respeta un subcategoryId publicado explícitamente nulo y devuelve vacío si el slug no resuelve', async () => {
      build([], {}, [product('p-unassigned', 'Sin asignación', 'c-camaras', { subcategoryId: 'sub-ip', publicRevisionId: 'r-null-sub' })], {
        'r-null-sub': { subcategoryId: null } as any,
      });
      const result = await service.search({ category: 'camaras', subcategory: 'camaras-ip-y-wi-fi' });
      expect(result.data).toEqual([]);
      expect((prisma as any).$queryRawUnsafe.mock.calls[0][0]).toContain("jsonb_exists(r.content, 'subcategoryId')");

      prisma.subcategory.findMany.mockResolvedValueOnce([]);
      await expect(service.search({ subcategory: 'no-existe' })).resolves.toMatchObject({ meta: { total: 0 }, data: [] });
    });

    it('no combina una subcategoría de Cámaras con otra categoría', async () => {
      await expect(service.search({ category: 'acceso', subcategory: 'camaras-ip-y-wi-fi' })).resolves.toMatchObject({
        data: [], meta: { total: 0 },
      });
      // La subcategoría se busca dentro de la categoría pedida, así que no aparece bajo otra.
      expect(prisma.subcategory.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ category: { slug: 'acceso', isActive: true } }),
      }));
    });

    it('acepta una lista de subcategorías y consulta todas con sus ids en el SQL', async () => {
      build([], {}, [
        product('p-ip', 'Cámara IP', 'c-camaras', { subcategoryId: 'sub-ip' }),
        product('p-an', 'Cámara análoga', 'c-camaras', { subcategoryId: 'sub-analog' }),
        product('p-acc', 'Accesorio', 'c-camaras', { subcategoryId: 'sub-other' }),
      ]);
      const result = await service.search({ category: 'camaras', subcategory: 'camaras-ip-y-wi-fi, camaras-analogicas,camaras-ip-y-wi-fi' });
      expect(prisma.subcategory.findMany).toHaveBeenCalledWith({
        where: { slug: { in: ['camaras-ip-y-wi-fi', 'camaras-analogicas'] }, isActive: true, category: { slug: 'camaras', isActive: true } },
        select: { id: true },
      });
      const [, ...params] = (prisma as any).$queryRawUnsafe.mock.calls[0];
      expect(params).toContainEqual(['sub-ip', 'sub-analog']);
      expect(result.data.map((item) => item.id).sort()).toEqual(['p-an', 'p-ip']);
    });

    it('devuelve vacío si algún slug de la lista es desconocido', async () => {
      await expect(service.search({ subcategory: 'camaras-ip-y-wi-fi,no-existe' })).resolves.toMatchObject({ data: [], meta: { total: 0 } });
      expect(prisma.subcategory.findMany).not.toHaveBeenCalled();
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

  describe('search — orden recent', () => {
    it('sort=recent ordena por publishedAt desc (nulos al final), createdAt desc e id', async () => {
      await service.search({ sort: 'recent', limit: 4 });

      expect(prisma.product.findMany.mock.calls[0][0].orderBy).toEqual([
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ]);
    });

    it('sin sort conserva nombre e id', async () => {
      await service.search({});

      expect(prisma.product.findMany.mock.calls[0][0].orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    });

    it('con texto q ignora sort y mantiene la relevancia', async () => {
      await service.search({ q: 'a', sort: 'recent' });

      const orders = prisma.product.findMany.mock.calls.map((c: any[]) => c[0].orderBy).filter(Boolean);
      expect(orders).not.toContainEqual(expect.arrayContaining([{ createdAt: 'desc' }]));
    });
  });

  describe('getDetail', () => {
    it('responde 404 para un id inexistente', async () => {
      await expect(service.getDetail('no-existe')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('responde 404 para un producto que no está PUBLISHED (DRAFT)', async () => {
      await expect(service.getDetail('p-04')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'p-04', AND: expect.any(Array) } }),
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
        isInformational: false,
      });
    });

    it('permite el detalle de una ficha informativa oficial', async () => {
      build([], {}, [
        product('p-library', 'SKU informativo', 'c-cctv', {
          lifecycleStatus: 'DRAFT',
          extraAttributes: { biblioteca: { estado: 'pendiente_enriquecimiento' } },
        }),
      ]);

      await expect(service.getDetail('p-library')).resolves.toMatchObject({
        id: 'p-library',
        isInformational: true,
        price: null,
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
        'breadcrumb', 'brand', 'category', 'datasheets', 'description', 'id', 'images', 'isInformational', 'name', 'price', 'sku', 'technicalSpecs',
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

  describe('listBrands', () => {
    it('cuenta la marca efectiva y los productos informativos visibles sin paginar', async () => {
      build([], {}, [
        product('p-switch', 'Cambio visible', 'c-cctv', { publicRevisionId: 'r-switch' }),
        product('p-legacy', 'Revisión antigua', 'c-cctv', { publicRevisionId: 'r-legacy' }),
        product('p-null', 'Sin marca publicada', 'c-cctv', { publicRevisionId: 'r-null' }),
        product('p-inactive', 'Marca inactiva', 'c-cctv', { brandId: 'brand-inactive' }),
        product('p-draft', 'Borrador privado', 'c-cctv', { brandId: 'brand-ezviz', lifecycleStatus: 'DRAFT' }),
        product('p-info', 'Ficha informativa', 'c-cctv', {
          brandId: 'brand-ezviz', lifecycleStatus: 'DRAFT', extraAttributes: { biblioteca: {} },
        }),
      ], { 'r-switch': { brandId: 'brand-ezviz' }, 'r-legacy': {}, 'r-null': { brandId: null } });

      await expect(service.listBrands()).resolves.toEqual([
        { name: 'Ezviz', slug: 'ezviz', productCount: 2 },
        { name: 'Hikvision', slug: 'hikvision', productCount: 7 },
      ]);
      expect(prisma.brand.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { OR: expect.any(Array) },
        select: { brandId: true, publicRevisionId: true },
      }));
    });
  });
});
