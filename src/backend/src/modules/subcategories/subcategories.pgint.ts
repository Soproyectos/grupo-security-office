/**
 * Integration test: master catalogs (subcategories, usage and delete guards) against a REAL, DISPOSABLE PostgreSQL.
 *
 * Not picked up by `npm test`. Run it explicitly:
 *   npx jest subcategories --runInBand --testRegex='.*\.pgint\.ts$'
 *
 * Safety: it only talks to the disposable server 127.0.0.1:55433 (user pgtest, trust auth). It creates its own
 * database `mt_m1_<random>`, applies the migrations, uses synthetic rows only and drops the database at the end.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BrandsService } from '../brands/brands.service';
import { CategoriesService } from '../categories/categories.service';
import { directLegacyProductLibrary } from '../products/product-library';
import { PricesService } from '../prices/prices.service';
import { LibraryAuditService } from '../library-audit/library-audit.service';
import { SubcategoriesService } from './subcategories.service';

const HOST = '127.0.0.1';
const PORT = '55433';
const USER = 'pgtest';
const DB_NAME = `mt_m1_${randomBytes(5).toString('hex')}`;
const ADMIN_URL = `postgresql://${USER}@${HOST}:${PORT}/postgres`;
const TARGET_URL = `postgresql://${USER}@${HOST}:${PORT}/${DB_NAME}?schema=public`;

function assertDisposable(raw: string): void {
  const u = new URL(raw);
  if (u.hostname !== HOST || u.port !== PORT || u.username !== USER) {
    throw new Error(`Refusing to run: ${u.hostname}:${u.port} is not the disposable server ${HOST}:${PORT}.`);
  }
}
assertDisposable(ADMIN_URL);
assertDisposable(TARGET_URL);

describe('Master catalogs against disposable PostgreSQL', () => {
  jest.setTimeout(420_000);

  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let prisma: PrismaClient;
  let subs: SubcategoriesService;
  let categories: CategoriesService;
  let brands: BrandsService;
  let prices: PricesService;
  const id: Record<string, string> = {};

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}"`);
    execSync('npx prisma migrate deploy', { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: TARGET_URL }, stdio: 'pipe' });
    prisma = new PrismaClient({ datasources: { db: { url: TARGET_URL } } });
    await prisma.$connect();

    const library = directLegacyProductLibrary(prisma as never);
    const audit = new LibraryAuditService(library);
    subs = new SubcategoriesService(library, audit);
    categories = new CategoriesService(library, audit);
    brands = new BrandsService(library, {} as never, audit);
    prices = new PricesService(prisma as never, {} as never, { log: jest.fn() } as never, undefined, library, audit);

    const r1 = await prisma.category.create({ data: { name: 'Video', slug: 'video' } });
    const r2 = await prisma.category.create({ data: { name: 'Redes', slug: 'redes' } });
    const child = await prisma.category.create({ data: { name: 'Hija', slug: 'hija', parentId: r1.id } });
    const brand = await prisma.brand.create({ data: { name: 'Marca', slug: 'marca' } });
    Object.assign(id, { r1: r1.id, r2: r2.id, child: child.id, brand: brand.id });
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

  it('creates, rejects equivalent names and duplicated slugs, and requires a root category', async () => {
    const created = await subs.create({ categoryId: id.r1, name: 'Cámaras IP' });
    id.s1 = created.id;
    expect(created.slug).toBe('camaras-ip');

    await expect(subs.create({ categoryId: id.r1, name: 'CAMARAS ip', slug: 'otra' })).rejects.toMatchObject({ response: { code: 'NAME_DUPLICATED' } });
    await expect(subs.create({ categoryId: id.r1, name: 'Distinta', slug: 'camaras-ip' })).rejects.toMatchObject({ response: { code: 'SLUG_DUPLICATED' } });
    await expect(subs.create({ categoryId: id.child, name: 'Bajo hija' })).rejects.toMatchObject({ response: { code: 'CATEGORY_NOT_ROOT' } });
    // The same name is fine under another category.
    await expect(subs.create({ categoryId: id.r2, name: 'Cámaras IP' })).resolves.toBeDefined();
  });

  it('rename keeps id and product relations; list searches and paginates', async () => {
    const product = await prisma.product.create({ data: { sku: 'M1-P1', name: 'Producto', categoryId: id.r1, subcategoryId: id.s1, brandId: id.brand } });
    id.p1 = product.id;
    const renamed = await subs.update(id.s1, { name: 'Cámaras IP PoE' });
    expect(renamed.id).toBe(id.s1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: id.p1 } })).subcategoryId).toBe(id.s1);

    const page = await subs.list({ q: 'poe', categoryId: id.r1, page: 1, pageSize: 5 });
    expect(page.total).toBe(1);
    expect(page.data[0]).toMatchObject({ id: id.s1, productCount: 1 });
  });

  it('usage reports products and blocks delete; the 409 carries the dependency detail', async () => {
    const usage = await subs.usage(id.s1);
    expect(usage).toMatchObject({ canDelete: false, counts: { products: 1 } });
    const err = await subs.remove(id.s1).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'DELETE_BLOCKED', usage: { canDelete: false } });
    expect(await prisma.subcategory.count({ where: { id: id.s1 } })).toBe(1);
  });

  it('a parent change with products asks for confirmation, then moves them; products are never deleted', async () => {
    // r2 already has the slug 'camaras-ip': the move is refused until the slug is free there.
    await expect(subs.update(id.s1, { categoryId: id.r2 })).rejects.toMatchObject({ response: { code: 'SLUG_DUPLICATED' } });
    const err = await subs.update(id.s1, { categoryId: id.r2, slug: 'camaras-poe' }).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'IMPACT_CONFIRMATION_REQUIRED', impact: { products: 1 } });
    await subs.update(id.s1, { categoryId: id.r2, slug: 'camaras-poe', confirmImpact: true });
    const product = await prisma.product.findUniqueOrThrow({ where: { id: id.p1 } });
    expect(product).toMatchObject({ subcategoryId: id.s1, categoryId: id.r2 });
  });

  it('deactivating keeps the product; a deactivated subcategory is not assignable to new products', async () => {
    await subs.setActive(id.s1, false);
    expect((await prisma.subcategory.findUniqueOrThrow({ where: { id: id.s1 } })).isActive).toBe(false);
    expect(await prisma.product.count({ where: { id: id.p1 } })).toBe(1);
  });

  it('deletes an unused subcategory and refuses one with a mold', async () => {
    const free = await subs.create({ categoryId: id.r2, name: 'Sin uso' });
    await expect(subs.remove(free.id)).resolves.toMatchObject({ message: expect.any(String) });
    expect(await prisma.subcategory.count({ where: { id: free.id } })).toBe(0);

    const withMold = await subs.create({ categoryId: id.r2, name: 'Con molde' });
    const def = await prisma.specDefinition.create({ data: { key: 'color', label: 'Color', dataType: 'TEXT' } });
    await prisma.subcategorySpec.create({ data: { subcategoryId: withMold.id, specDefinitionId: def.id } });
    const err = await subs.remove(withMold.id).catch((e) => e);
    expect(err.getResponse().usage).toMatchObject({ canDelete: false, counts: { templateEntries: 1 } });
  });

  it('category: usage counts subcategories, delete is blocked by them, deactivate keeps data, name collision among siblings', async () => {
    const usage = await categories.usage(id.r2);
    expect(usage.canDelete).toBe(false);
    expect(usage.counts.subcategories).toBeGreaterThan(0);
    await expect(categories.remove(id.r2)).rejects.toMatchObject({ response: { code: 'DELETE_BLOCKED' } });

    await categories.setActive(id.r2, false);
    await categories.setActive(id.r2, true);
    await expect(categories.create({ name: 'VIDEO', slug: 'video-2' })).rejects.toMatchObject({ response: { code: 'NAME_DUPLICATED' } });
  });

  it('category parent change with products requires confirmImpact', async () => {
    const err = await categories.update(id.child, { parentId: id.r2 }).catch((e) => e);
    // child has no products/children/subcategories: no confirmation needed
    expect(err).not.toBeInstanceOf(Error);
    await prisma.product.create({ data: { sku: 'M1-P2', name: 'En hija', categoryId: id.child, brandId: id.brand } });
    const blocked = await categories.update(id.child, { parentId: id.r1 }).catch((e) => e);
    expect(blocked.getResponse()).toMatchObject({ code: 'IMPACT_CONFIRMATION_REQUIRED', impact: { products: 1 } });
    await expect(categories.update(id.child, { parentId: id.r1, confirmImpact: true })).resolves.toMatchObject({ parentId: id.r1 });
  });

  it('brand: usage and normalized duplicate name', async () => {
    expect(await brands.usage(id.brand)).toMatchObject({ canDelete: false });
    await expect(brands.create({ name: 'MARCA', slug: 'marca-dos' } as never)).rejects.toMatchObject({ response: { code: 'NAME_DUPLICATED' } });
  });

  it('tariff: delete is blocked by portal tiers and customer accounts; currency change with prices needs confirmation', async () => {
    const list = await prisma.priceList.create({ data: { name: 'Tarifa', code: 'TAR' } });
    const tier = await prisma.portalTier.create({ data: { name: 'Nivel', priceListId: list.id } });
    const usage = await prices.priceListUsage(list.id);
    expect(usage.counts).toMatchObject({ portalTiers: 1, prices: 0 });
    await expect(prices.removePriceList(list.id)).rejects.toMatchObject({ response: { code: 'DELETE_BLOCKED' } });
    await prisma.portalTier.delete({ where: { id: tier.id } });

    await prisma.price.create({ data: { productId: id.p1, priceListId: list.id, value: 10 } });
    const err = await prices.updatePriceList(list.id, { currency: 'USD' }).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'IMPACT_CONFIRMATION_REQUIRED', impact: { priceCount: 1 } });
    await expect(prices.updatePriceList(list.id, { currency: 'USD', confirmImpact: true })).resolves.toMatchObject({ currency: 'USD' });
    expect(await prisma.price.count({ where: { priceListId: list.id } })).toBe(1);
  });
});
