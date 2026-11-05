/**
 * Integration test: product classification against a REAL, DISPOSABLE PostgreSQL.
 *
 * Not picked up by `npm test`. Run it explicitly:
 *   npx jest --runInBand --testRegex '.*\.pgint\.ts$' classification
 *
 * Safety: it only ever talks to the disposable server 127.0.0.1:55433 (user pgtest, trust auth). It creates its
 * own database `mt_f1_<random>`, applies the migrations to it, uses synthetic rows only and drops the database
 * at the end (also on failure). It never reads DATABASE_URL / .env files for its own connection.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ProductsService } from '../products.service';
import { ClassificationService } from './classification.service';
import type { ClassificationDb } from './classification.types';

const HOST = '127.0.0.1';
const PORT = '55433';
const USER = 'pgtest';
const DB_NAME = `mt_f1_${randomBytes(5).toString('hex')}`;

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

describe('Product classification against disposable PostgreSQL', () => {
  jest.setTimeout(420_000);

  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let prisma: PrismaClient;
  let products: ProductsService;
  const classification = new ClassificationService();
  const id: Record<string, string> = {};
  const db = () => prisma as unknown as ClassificationDb;

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}"`);
    execSync('npx prisma migrate deploy', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: TARGET_URL },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({ datasources: { db: { url: TARGET_URL } } });
    await prisma.$connect();

    // Synthetic structure: two roots, three child categories, subcategories copied from some of them.
    const r1 = await prisma.category.create({ data: { name: 'Video', slug: 'video' } });
    const r2 = await prisma.category.create({ data: { name: 'Redes', slug: 'redes' } });
    const c1 = await prisma.category.create({ data: { name: 'Camaras IP', slug: 'video-camaras-ip', parentId: r1.id } });
    const c2 = await prisma.category.create({ data: { name: 'Switches', slug: 'redes-switches', parentId: r2.id } });
    const c3 = await prisma.category.create({ data: { name: 'Sin subcategoria', slug: 'video-sin-sub', parentId: r1.id } });
    const s1 = await prisma.subcategory.create({ data: { categoryId: r1.id, name: 'Camaras IP', slug: 'camaras-ip', legacyCategoryId: c1.id } });
    const s2 = await prisma.subcategory.create({ data: { categoryId: r2.id, name: 'Switches', slug: 'switches', legacyCategoryId: c2.id } });
    const s3 = await prisma.subcategory.create({ data: { categoryId: r1.id, name: 'Grabadores', slug: 'grabadores' } });
    const s4 = await prisma.subcategory.create({ data: { categoryId: r1.id, name: 'Obsoleta', slug: 'obsoleta', isActive: false } });
    const brand = await prisma.brand.create({ data: { name: 'Marca Sintetica', slug: 'marca-sintetica' } });
    await prisma.lista.create({ data: { code: 'LISTA-GENERAL', name: 'Lista general' } });
    Object.assign(id, { r1: r1.id, r2: r2.id, c1: c1.id, c2: c2.id, c3: c3.id, s1: s1.id, s2: s2.id, s3: s3.id, s4: s4.id, brand: brand.id });

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

  const read = (sku: string) => prisma.product.findFirstOrThrow({ where: { sku }, select: { categoryId: true, subcategoryId: true, brandId: true } });
  const count = (sku: string) => prisma.product.count({ where: { sku } });

  it('creates an incomplete draft when only a root category is known', async () => {
    const created = await products.create({ sku: 'IT-DRAFT-1', name: 'Borrador', categoryId: id.r1, brandId: id.brand } as never);
    expect(created.classificationStatus).toBe('incomplete');
    expect(await read('IT-DRAFT-1')).toEqual({ categoryId: id.r1, subcategoryId: null, brandId: id.brand });
  });

  it('classifies with a valid combination and derives categoryId from the subcategory', async () => {
    const created = await products.create({ sku: 'IT-OK-1', name: 'Camara', categoryId: id.c1, subcategoryId: id.s1, brandId: id.brand } as never);
    expect(created.classificationStatus).toBe('complete');
    expect(created.subcategory).toMatchObject({ id: id.s1, slug: 'camaras-ip' });
    expect(await read('IT-OK-1')).toEqual({ categoryId: id.c1, subcategoryId: id.s1, brandId: id.brand });
  });

  it.each([
    ['subcategory of another root vs the given category', () => ({ categoryId: id.c1, subcategoryId: id.s2 }), 'CLASSIFICATION_CONFLICT'],
    ['root category + conflicting subcategory', () => ({ categoryId: id.r1, subcategoryId: id.s1 }), 'CLASSIFICATION_CONFLICT'],
    ['unknown subcategory id', () => ({ categoryId: id.c1, subcategoryId: 'does-not-exist' }), 'SUBCATEGORY_NOT_FOUND'],
    ['inactive subcategory newly assigned', () => ({ categoryId: id.r1, subcategoryId: id.s4 }), 'SUBCATEGORY_INACTIVE'],
  ])('rejects an invalid combination: %s', async (label, build, code) => {
    const sku = `IT-BAD-${label.length}`;
    await expect(products.create({ sku, name: 'Invalida', brandId: id.brand, ...build() } as never)).rejects.toMatchObject({
      response: expect.objectContaining({ code }),
    });
    expect(await count(sku)).toBe(0);
  });

  it('derives the subcategory for a legacy caller with only a child categoryId', async () => {
    await products.create({ sku: 'IT-LEGACY-1', name: 'Legado', categoryId: id.c2, brandId: id.brand } as never);
    expect(await read('IT-LEGACY-1')).toEqual({ categoryId: id.c2, subcategoryId: id.s2, brandId: id.brand });
  });

  it('keeps a legacy caller with a root category (or a child without subcategory) incomplete', async () => {
    await products.create({ sku: 'IT-LEGACY-2', name: 'Raiz', categoryId: id.r2, brandId: id.brand } as never);
    await products.create({ sku: 'IT-LEGACY-3', name: 'Hija sin sub', categoryId: id.c3, brandId: id.brand } as never);
    expect((await read('IT-LEGACY-2')).subcategoryId).toBeNull();
    expect(await read('IT-LEGACY-3')).toMatchObject({ categoryId: id.c3, subcategoryId: null });
  });

  it('derives the subcategory in a price-import draft (same transaction)', async () => {
    const draft = await prisma.$transaction((tx) =>
      products.createPendingSheetDraft(tx, { sku: 'IT-PRICE-1', name: 'Desde precios', brandId: id.brand, categoryId: id.c2, sourceRevisionId: 'rev-1' }, { userId: null }),
    );
    expect(draft.subcategoryId).toBe(id.s2);
    expect(await read('IT-PRICE-1')).toEqual({ categoryId: id.c2, subcategoryId: id.s2, brandId: id.brand });
  });

  it('moves a product to another subcategory and keeps categoryId consistent', async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { sku: 'IT-OK-1' }, select: { id: true } });
    await products.update(product.id, { subcategoryId: id.s3 } as never);
    expect(await read('IT-OK-1')).toMatchObject({ categoryId: id.r1, subcategoryId: id.s3 });
    await products.update(product.id, { subcategoryId: id.s2 } as never);
    expect(await read('IT-OK-1')).toMatchObject({ categoryId: id.c2, subcategoryId: id.s2 });
    // A stale categoryId next to a new subcategory is rejected and nothing changes.
    await expect(products.update(product.id, { subcategoryId: id.s1, categoryId: id.c2 } as never)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CLASSIFICATION_CONFLICT' }),
    });
    expect(await read('IT-OK-1')).toMatchObject({ categoryId: id.c2, subcategoryId: id.s2 });
    // A legacy update with only a child category re-derives the subcategory.
    await products.update(product.id, { categoryId: id.c1 } as never);
    expect(await read('IT-OK-1')).toMatchObject({ categoryId: id.c1, subcategoryId: id.s1 });
  });

  it('reports drift without fixing it and exposes the tree of active subcategories', async () => {
    await prisma.$executeRawUnsafe(`UPDATE products SET "categoryId" = '${id.c2}' WHERE sku = 'IT-OK-1'`);
    const conflicts = await classification.listConflicts(db());
    expect(conflicts).toEqual([
      expect.objectContaining({ sku: 'IT-OK-1', categoryId: id.c2, subcategoryId: id.s1, expectedCategoryId: id.c1 }),
    ]);
    expect(await read('IT-OK-1')).toMatchObject({ categoryId: id.c2, subcategoryId: id.s1 });

    const tree = await classification.tree(db());
    const video = tree.find((node) => node.id === id.r1)!;
    expect(video.subcategories.map((s) => s.slug).sort()).toEqual(['camaras-ip', 'grabadores']);
  });
});
