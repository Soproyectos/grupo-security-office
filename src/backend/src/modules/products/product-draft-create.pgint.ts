/**
 * Integration test: "Nuevo producto" wizard path. A draft is created from the reference alone, or with a name,
 * brand and subcategory chosen from existing masters; incoherent classifications and duplicate references are
 * rejected. REAL, DISPOSABLE PostgreSQL only.
 *
 * Not picked up by `npm test`. Run it explicitly:
 *   npx jest product-draft-create --runInBand --testRegex='.*\.pgint\.ts$'
 *
 * Safety: it only ever talks to the disposable server 127.0.0.1:55433 (user pgtest, trust auth). It creates its
 * own database `mt_w_<random>`, applies the migrations to it, uses synthetic rows only and drops the database
 * at the end (also on failure).
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ProductsService } from './products.service';

const HOST = '127.0.0.1';
const PORT = '55433';
const USER = 'pgtest';
const DB_NAME = `mt_w_${randomBytes(5).toString('hex')}`;

function assertDisposable(raw: string): void {
  const u = new URL(raw);
  if (u.hostname !== HOST || u.port !== PORT || u.username !== USER) {
    throw new Error(`Refusing to run: ${u.hostname}:${u.port} is not the disposable server ${HOST}:${PORT}.`);
  }
}

const ADMIN_URL = `postgresql://${USER}@${HOST}:${PORT}/postgres`;
const TARGET_URL = `postgresql://${USER}@${HOST}:${PORT}/${DB_NAME}?schema=public`;
assertDisposable(ADMIN_URL);
assertDisposable(TARGET_URL);

describe('Manual draft creation (wizard) against disposable PostgreSQL', () => {
  jest.setTimeout(420_000);

  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let prisma: PrismaClient;
  let products: ProductsService;
  const id: Record<string, string> = {};
  const counts = async () => ({ brands: await prisma.brand.count(), categories: await prisma.category.count(), subcategories: await prisma.subcategory.count() });
  const read = (sku: string) => prisma.product.findFirstOrThrow({ where: { sku }, select: { id: true, name: true, categoryId: true, subcategoryId: true, brandId: true, isVisible: true, isActive: true, lifecycleStatus: true } });

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}"`);
    execSync('npx prisma migrate deploy', { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: TARGET_URL }, stdio: 'pipe' });
    prisma = new PrismaClient({ datasources: { db: { url: TARGET_URL } } });
    await prisma.$connect();

    const r1 = await prisma.category.create({ data: { name: 'Video', slug: 'video' } });
    const r2 = await prisma.category.create({ data: { name: 'Redes', slug: 'redes' } });
    const c1 = await prisma.category.create({ data: { name: 'Camaras IP', slug: 'video-camaras-ip', parentId: r1.id } });
    const c2 = await prisma.category.create({ data: { name: 'Switches', slug: 'redes-switches', parentId: r2.id } });
    const s1 = await prisma.subcategory.create({ data: { categoryId: r1.id, name: 'Camaras IP', slug: 'camaras-ip', legacyCategoryId: c1.id } });
    const s2 = await prisma.subcategory.create({ data: { categoryId: r2.id, name: 'Switches', slug: 'switches', legacyCategoryId: c2.id } });
    const brand = await prisma.brand.create({ data: { name: 'Marca Sintetica', slug: 'marca-sintetica' } });
    await prisma.lista.create({ data: { code: 'LISTA-GENERAL', name: 'Lista general' } });
    Object.assign(id, { r1: r1.id, c1: c1.id, c2: c2.id, s1: s1.id, s2: s2.id, brand: brand.id });
    const audit = { log: jest.fn().mockResolvedValue(undefined), logTx: jest.fn().mockResolvedValue(undefined) };
    products = new ProductsService(prisma as never, { getAllowedListaIds: jest.fn() } as never, audit as never, {} as never);
  });

  afterAll(async () => {
    try {
      await prisma?.$disconnect();
    } finally {
      try {
        await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
      } finally {
        await admin.$disconnect();
      }
    }
  });

  it('creates a draft from the reference only: the reference is the provisional name, nothing is invented', async () => {
    const before = await counts();
    const created = await products.create({ sku: 'WZ-REF-1' } as never);
    expect(created.name).toBe('WZ-REF-1');
    expect(created.classificationMissing).toEqual(['brand', 'subcategory']);
    expect(await read('WZ-REF-1')).toMatchObject({ brandId: null, categoryId: null, subcategoryId: null, isVisible: false, isActive: false, lifecycleStatus: 'DRAFT' });
    expect(await counts()).toEqual(before);
    // A blank name counts as missing too.
    await products.create({ sku: 'WZ-REF-BLANK', name: '   ' } as never);
    expect((await read('WZ-REF-BLANK')).name).toBe('WZ-REF-BLANK');
  });

  it('keeps a long name untouched (no trimming) and derives the category from the subcategory', async () => {
    const longName = 'Camara IP bullet 4MP con vision nocturna y analitica de video para exteriores';
    expect(longName.length).toBeGreaterThan(70);
    await products.create({ sku: 'WZ-FULL-1', name: longName, brandId: id.brand, subcategoryId: id.s1 } as never);
    expect(await read('WZ-FULL-1')).toMatchObject({ name: longName, brandId: id.brand, subcategoryId: id.s1, categoryId: id.c1 });
  });

  it('rejects an incoherent classification (category that does not match the subcategory)', async () => {
    await expect(products.create({ sku: 'WZ-CONFLICT', name: 'Conflicto', categoryId: id.c2, subcategoryId: id.s1 } as never)).rejects.toMatchObject({ status: 400 });
    await expect(prisma.product.findFirst({ where: { sku: 'WZ-CONFLICT' } })).resolves.toBeNull();
  });

  it('rejects a duplicate reference (case/space-insensitive) and returns the existing product id', async () => {
    const existing = await read('WZ-REF-1');
    const error = await products.create({ sku: ' wz-ref-1 ', name: 'Otro' } as never).catch((e) => e);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'SKU_EXISTS', existingProductId: existing.id });
    expect(await prisma.product.count({ where: { sku: { startsWith: 'WZ-REF-1' } } })).toBe(1);
  });

  it('later saves update the same draft and never publish it', async () => {
    const { id: productId } = await read('WZ-REF-1');
    const updated = await products.update(productId, { name: 'Nombre ya definido', brandId: id.brand, subcategoryId: id.s2 } as never);
    expect(updated.classificationStatus).toBe('complete');
    expect(await read('WZ-REF-1')).toMatchObject({ name: 'Nombre ya definido', categoryId: id.c2, lifecycleStatus: 'DRAFT', isVisible: false });
  });
});
