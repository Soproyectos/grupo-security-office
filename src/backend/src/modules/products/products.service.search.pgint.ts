/**
 * Integration test: ProductsService.findAll text search (exacta > prefijo > contiene > difusa)
 * against a REAL, DISPOSABLE PostgreSQL with pg_trgm.
 *
 * Not picked up by `npm test` (the name does not end in .spec.ts). Run it explicitly, on a FRESH database:
 *   npx jest --rootDir src --testRegex "products.service.search.pgint.ts$" --runInBand
 *
 * Safety: same guard as products.service.fuzzy.pgint.ts — needs GS_IT_DATABASE_URL pointing at the throwaway
 * host and a database named `gs_fuzzy_it_*`. It only INSERTs synthetic rows.
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

interface Row { sku: string; name: string; model?: string; refs?: string[]; description?: string }

const ROWS: Row[] = [
  { sku: 'DS-PWA48-KIT-WB', name: 'Kit de alarma inalambrica AX PRO', model: 'DS-PWA48-KIT-WB' },
  { sku: 'DS-PWA48-KIT-WB/EU', name: 'Kit de alarma AX PRO variante europea' },
  { sku: 'DS-PWA64-KIT-WB', name: 'Kit de alarma AX PRO 64 zonas' },
  { sku: 'DS-PW1-IN', name: 'Sensor interior' },
  { sku: 'DS-PWB48-KIT-WB', name: 'Kit parecido pero distinto' },
  { sku: 'XX-9000', name: 'Fuente 12V', description: 'Compatible con DS-PWA48-KIT-WB y otros' },
  { sku: 'DS-2CD2047G3-LI2UY/S(L)(RB)', name: 'Camara bala 4 MP ColorVu' },
  { sku: 'DS-2CD2047G3-LI2UY/S(L)', name: 'Camara bala 4 MP ColorVu sin accesorio' },
  { sku: 'DS-2CD2347G3-LI2UY', name: 'Camara bala 4 MP variante', model: 'DS-2CD2347G3-LI2UY' },
  { sku: 'DS-K1T341AMF', name: 'Terminal de reconocimiento facial', refs: ['DS-K1T341AM-F-OLD', 'DS-K1T341AMFW'] },
  { sku: 'DS-2DE4A425IWG-E', name: 'Domo PTZ exterior 4 MP' },
  { sku: 'DS-2CD1143G2-LIUF', name: 'Domo fijo interior economico' },
];

describe('ProductsService.findAll (search tiers) against disposable PostgreSQL', () => {
  let service: ProductsService;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    const category = await prisma.category.create({ data: { name: 'Cat S', slug: 'srch-cat' } });
    const brand = await prisma.brand.create({ data: { name: 'Brand S', slug: 'srch-brand' } });
    const lista = await prisma.lista.create({ data: { code: 'IT-SRCH', name: 'Lista S' } });
    for (const row of ROWS) {
      await prisma.product.create({
        data: {
          sku: row.sku,
          name: row.name,
          description: row.description ?? 'Producto sintetico',
          catalogModel: row.model ?? null,
          catalogManufacturerRefs: row.refs ?? [],
          categoryId: category.id,
          brandId: brand.id,
          listaId: lista.id,
        },
      });
    }
    service = new ProductsService(prisma as any, mockAcl as any, mockAudit as any, mockFiles as any);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** SKUs in the order the service returned them. */
  const ordered = async (search: string): Promise<string[]> =>
    (await service.findAll({ search, take: 50, skip: 0 })).data.map((p: any) => p.sku);

  it('a full SKU returns only exact + prefix + contains matches, exact first (no fuzzy noise, no description hits)', async () => {
    expect(await ordered('DS-PWA48-KIT-WB')).toEqual(['DS-PWA48-KIT-WB', 'DS-PWA48-KIT-WB/EU']);
  });

  it('is case-insensitive', async () => {
    expect(await ordered('ds-pwa48-kit-wb')).toEqual(['DS-PWA48-KIT-WB', 'DS-PWA48-KIT-WB/EU']);
  });

  it('a prefix returns every SKU/model that starts with it, nothing else', async () => {
    expect(await ordered('DS-PW')).toEqual([
      'DS-PW1-IN', 'DS-PWA48-KIT-WB', 'DS-PWA48-KIT-WB/EU', 'DS-PWA64-KIT-WB', 'DS-PWB48-KIT-WB',
    ]);
    expect(await ordered('ds-pwa')).toEqual(['DS-PWA48-KIT-WB', 'DS-PWA48-KIT-WB/EU', 'DS-PWA64-KIT-WB']);
  });

  it('SKU with slash and parentheses: exact first, then the ones that start with it', async () => {
    expect(await ordered('DS-2CD2047G3-LI2UY/S(L)(RB)')).toEqual(['DS-2CD2047G3-LI2UY/S(L)(RB)']);
    expect(await ordered('DS-2CD2047G3-LI2UY/S(L)')).toEqual([
      'DS-2CD2047G3-LI2UY/S(L)', 'DS-2CD2047G3-LI2UY/S(L)(RB)',
    ]);
  });

  it('SKU typed without separators still finds it', async () => {
    expect(await ordered('DS2CD2047G3LI2UYSLRB')).toEqual(['DS-2CD2047G3-LI2UY/S(L)(RB)']);
  });

  it('matches catalogModel', async () => {
    expect(await ordered('DS-2CD2347')).toEqual(['DS-2CD2347G3-LI2UY']);
  });

  it('contains comes after prefix', async () => {
    expect(await ordered('2CD2047G3')).toEqual(['DS-2CD2047G3-LI2UY/S(L)', 'DS-2CD2047G3-LI2UY/S(L)(RB)']);
  });

  it('a SKU of a deleted duplicate (catalogManufacturerRefs) leads to the kept product', async () => {
    expect(await ordered('DS-K1T341AM-F-OLD')).toEqual(['DS-K1T341AMF']);
    expect(await ordered('ds-k1t341amfw')).toEqual(['DS-K1T341AMF']);
    expect(await ordered('DS-K1T341AM-F')).toEqual(['DS-K1T341AMF']);
  });

  it('text with no code shape uses word/fuzzy search', async () => {
    expect(await ordered('domo ptz')).toContain('DS-2DE4A425IWG-E');
    expect(await ordered('terminal facial')).toEqual(['DS-K1T341AMF']);
  });

  it('exact name beats a contains match', async () => {
    const res = await ordered('Domo PTZ exterior 4 MP');
    expect(res[0]).toBe('DS-2DE4A425IWG-E');
  });

  it('a code with no literal match falls back to fuzzy (typo tolerance)', async () => {
    const res = await ordered('DS-PWA49-KIT-WB');
    expect(res).toEqual(expect.arrayContaining(['DS-PWA48-KIT-WB']));
  });

  it('total matches the returned rows and paginates after ranking', async () => {
    const page1 = await service.findAll({ search: 'DS-PW', take: 2, skip: 0 });
    const page2 = await service.findAll({ search: 'DS-PW', take: 2, skip: 2 });
    expect(page1.meta.total).toBe(5);
    expect([...page1.data, ...page2.data].map((p: any) => p.sku)).toEqual([
      'DS-PW1-IN', 'DS-PWA48-KIT-WB', 'DS-PWA48-KIT-WB/EU', 'DS-PWA64-KIT-WB',
    ]);
  });
});
