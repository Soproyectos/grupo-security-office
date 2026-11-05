/**
 * Integration test: ProductsService.findAll fuzzy-search branch against a REAL, DISPOSABLE PostgreSQL.
 *
 * Not picked up by `npm test` (the name does not end in .spec.ts). Run it explicitly:
 *   npx jest --rootDir src --testRegex "products.service.fuzzy.pgint.ts$" --runInBand
 *
 * Safety: refuses to run unless GS_IT_DATABASE_URL points at the throwaway host and a database whose name
 * starts with `gs_fuzzy_it_`. It never reads DATABASE_URL for its own connection decision.
 * It only INSERTs synthetic rows and counts them; it contains no DROP/TRUNCATE/DELETE of schema objects.
 */
import { PrismaClient } from '@prisma/client';
import { ProductsService } from './products.service';

const RAW_URL = process.env.GS_IT_DATABASE_URL ?? '';
const ALLOWED_HOSTS = (process.env.GS_IT_ALLOWED_HOSTS ?? 'gs-test-pg,127.0.0.1,localhost').split(',');

function assertThrowawayTarget(raw: string): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('GS_IT_DATABASE_URL is missing or invalid: refusing to run.');
  }
  const db = u.pathname.replace(/^\//, '');
  if (!ALLOWED_HOSTS.includes(u.hostname) || !db.startsWith('gs_fuzzy_it_')) {
    throw new Error(`Refusing to run: target ${u.hostname}/${db} is not a disposable gs_fuzzy_it_* database.`);
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL !== raw) {
    throw new Error('DATABASE_URL differs from GS_IT_DATABASE_URL: refusing to run.');
  }
}

assertThrowawayTarget(RAW_URL);

const prisma = new PrismaClient({ datasources: { db: { url: RAW_URL } } });
const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
const mockFiles = { store: jest.fn(), get: jest.fn(), deleteByUrl: jest.fn() };
const mockAcl = { getAllowedListaIds: jest.fn() };

const PAYLOADS = [
  "x' OR '1'='1",
  "x'; DROP TABLE products; --",
  "x'--",
  'x" OR "1"="1',
  "x' UNION SELECT * FROM products --",
];

describe('ProductsService.findAll (fuzzy) against disposable PostgreSQL', () => {
  let service: ProductsService;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');

    // Synthetic data only.
    const catA = await prisma.category.create({ data: { name: 'Cat A', slug: 'cat-a' } });
    const catB = await prisma.category.create({ data: { name: 'Cat B', slug: 'cat-b' } });
    const brandA = await prisma.brand.create({ data: { name: 'Brand A', slug: 'brand-a' } });
    const brandB = await prisma.brand.create({ data: { name: 'Brand B', slug: 'brand-b' } });
    const listaA = await prisma.lista.create({ data: { code: 'IT-A', name: 'Lista A' } });
    const listaB = await prisma.lista.create({ data: { code: 'IT-B', name: 'Lista B' } });
    Object.assign(ids, {
      catA: catA.id, catB: catB.id, brandA: brandA.id, brandB: brandB.id, listaA: listaA.id, listaB: listaB.id,
    });

    const rows = [
      // sku, categoria, marca, lista, activo, visible
      ['IT-CAM-001', catA.id, brandA.id, listaA.id, true, true],
      ['IT-CAM-002', catA.id, brandB.id, listaA.id, true, false],
      ['IT-CAM-003', catB.id, brandA.id, listaB.id, false, true],
      ['IT-CAM-004', catB.id, brandB.id, listaB.id, true, true],
      ['IT-CAM-005', catA.id, brandA.id, listaB.id, true, true],
    ] as const;
    for (const [sku, categoryId, brandId, listaId, isActive, isVisible] of rows) {
      await prisma.product.create({
        data: {
          sku, name: `Camara bala ${sku}`, description: 'Camara de seguridad sintetica',
          categoryId, brandId, listaId, isActive, isVisible,
        },
      });
    }
    await prisma.product.create({
      data: {
        sku: 'IDS-E04HQHI-D', name: 'Grabador sintético', description: 'Equipo %_ de prueba',
        categoryId: catA.id, brandId: brandA.id, listaId: listaA.id,
      },
    });

    service = new ProductsService(prisma as any, mockAcl as any, mockAudit as any, mockFiles as any);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const skus = (res: any): string[] => res.data.map((p: any) => p.sku).sort();

  it('search of more than 2 characters returns all synthetic matches', async () => {
    const res = await service.findAll({ search: 'camara bala', take: 50, skip: 0 });
    expect(skus(res)).toEqual(['IT-CAM-001', 'IT-CAM-002', 'IT-CAM-003', 'IT-CAM-004', 'IT-CAM-005']);
    expect(res.meta.total).toBe(5);
  });

  it('matches a SKU with equivalent separators removed', async () => {
    const res = await service.findAll({ search: 'IDSE04HQHID', take: 50, skip: 0 });
    expect(skus(res)).toEqual(['IDS-E04HQHI-D']);
  });

  it('matches literal wildcard symbols in a description for one-character search', async () => {
    const res = await service.findAll({ search: '%_', take: 50, skip: 0 });
    expect(skus(res)).toEqual(['IDS-E04HQHI-D']);
  });

  it('valid categoryId alone', async () => {
    const res = await service.findAll({ search: 'camara bala', categoryId: ids.catA });
    expect(skus(res)).toEqual(['IT-CAM-001', 'IT-CAM-002', 'IT-CAM-005']);
  });

  it('valid brandId alone', async () => {
    const res = await service.findAll({ search: 'camara bala', brandId: ids.brandB });
    expect(skus(res)).toEqual(['IT-CAM-002', 'IT-CAM-004']);
  });

  it('categoryId + brandId combined', async () => {
    const res = await service.findAll({ search: 'camara bala', categoryId: ids.catA, brandId: ids.brandA });
    expect(skus(res)).toEqual(['IT-CAM-001', 'IT-CAM-005']);
  });

  it('boolean filters isActive / isVisible reach the database as booleans', async () => {
    const res = await service.findAll({ search: 'camara bala', isActive: true, isVisible: true });
    expect(skus(res)).toEqual(['IT-CAM-001', 'IT-CAM-004', 'IT-CAM-005']);
  });

  it('pagination: LIMIT / OFFSET bound as numbers', async () => {
    const first = await service.findAll({ search: 'camara bala', take: 2, skip: 0 });
    const second = await service.findAll({ search: 'camara bala', take: 2, skip: 2 });
    expect(first.data).toHaveLength(2);
    expect(second.data).toHaveLength(2);
    expect(skus({ data: [...first.data, ...second.data] })).toHaveLength(4);
  });

  it.each(PAYLOADS)('malformed categoryId/brandId %p returns no rows, no error, table intact', async (payload) => {
    const before = await prisma.product.count();
    const res = await service.findAll({ search: 'camara bala', categoryId: payload, brandId: payload });
    expect(res.data).toHaveLength(0);
    expect(res.meta.total).toBe(0);
    expect(await prisma.product.count()).toBe(before);
  });

  it('ACL: allowed lista ids are bound as a text[] array (ANY)', async () => {
    mockAcl.getAllowedListaIds.mockResolvedValue([ids.listaA]);
    const res = await service.findAll({ search: 'camara bala' }, { userId: 'u1', roles: ['Vendedor'] } as any);
    expect(skus(res)).toEqual(['IT-CAM-001', 'IT-CAM-002']);
  });

  it('ACL: a lista id carrying quotes and SQL is treated as a plain value', async () => {
    mockAcl.getAllowedListaIds.mockResolvedValue([ids.listaB, "z') OR ('1'='1", "x'; DROP TABLE products; --"]);
    const before = await prisma.product.count();
    const res = await service.findAll({ search: 'camara bala' }, { userId: 'u1', roles: ['Vendedor'] } as any);
    expect(skus(res)).toEqual(['IT-CAM-003', 'IT-CAM-004', 'IT-CAM-005']);
    expect(await prisma.product.count()).toBe(before);
  });

  it('ACL: empty allowed list returns zero rows', async () => {
    mockAcl.getAllowedListaIds.mockResolvedValue([]);
    const res = await service.findAll({ search: 'camara bala' }, { userId: 'u1', roles: ['Vendedor'] } as any);
    expect(res.data).toHaveLength(0);
  });

  it('ACL + category combined keeps both restrictions', async () => {
    mockAcl.getAllowedListaIds.mockResolvedValue([ids.listaB]);
    const res = await service.findAll(
      { search: 'camara bala', categoryId: ids.catB },
      { userId: 'u1', roles: ['Vendedor'] } as any,
    );
    expect(skus(res)).toEqual(['IT-CAM-003', 'IT-CAM-004']);
  });
});
