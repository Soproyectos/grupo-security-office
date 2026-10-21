/**
 * DB-backed spec for R2 (unknown SKUs). Runs only when PRICE_IMPORT_TEST_DATABASE_URL points to
 * a THROWAWAY Postgres with all migrations applied (never `.env`, never production):
 *
 *   PRICE_IMPORT_TEST_DATABASE_URL=postgresql://postgres:t@127.0.0.1:54400/imp npx jest price-import-resolution.db
 */
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { AuditService } from '../../audit/audit.service';
import { ProductChangeService } from '../../products/product-change.service';
import { ProductsService } from '../../products/products.service';
import { PublicCatalogService } from '../../products/public-catalog.service';
import { PublicPricingService } from '../../products/public-pricing.service';
import { PriceImportResolutionService } from './price-import-resolution.service';
import { PriceImportService } from './price-import.service';

const url = process.env.PRICE_IMPORT_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const TAG = 'B3DB';
const storageDir = path.join(os.tmpdir(), 'gs-b3-db-storage');

function workbook(rows: unknown[][]): Express.Multer.File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'DPP_ORO_IVA'], ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía ficticia']]), 'INSTRUCCIONES');
  return { originalname: 'fixture-b3.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) } as Express.Multer.File;
}

suite('R2 unknown SKU resolution (database)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? 'postgresql://unused' } } });
  const ids = {
    lista: '00000000-0000-4000-8000-00000000e0a1', category: '00000000-0000-4000-8000-00000000e0c1', brand: '00000000-0000-4000-8000-00000000e0d1',
    tariff: '00000000-0000-4000-8000-00000000e0e1', actor: '00000000-0000-4000-8000-00000000e0f1', pA: '00000000-0000-4000-8000-00000000e101',
    published: '00000000-0000-4000-8000-00000000e102',
  };
  const ctx = { userId: ids.actor, roles: ['Super Admin'] };
  const acl = { isListasAdmin: () => true } as never;
  const audit = new AuditService(prisma as never, {} as never);
  const changes = new ProductChangeService(prisma as never, acl);
  const imports = new PriceImportService(prisma as never, acl, audit, { grantsForUser: async () => [] } as never, changes);
  const products = new ProductsService(prisma as never, acl, audit, {} as never, undefined, undefined, undefined, changes);
  const resolution = new PriceImportResolutionService(prisma as never, imports, products, changes, audit);
  const publicCatalog = new PublicCatalogService(prisma as never, new PublicPricingService(prisma as never, { get: () => undefined } as never));
  let createdTariff = false;

  async function cleanup() {
    const created = await prisma.product.findMany({ where: { OR: [{ brandId: ids.brand }, { categoryId: ids.category }] }, select: { id: true } });
    const productIds = [...created.map((p) => p.id), ids.pA, ids.published];
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: ids.actor }, { productId: { in: productIds } }] } });
    await prisma.priceImportRevision.deleteMany({ where: { createdById: ids.actor } });
    await prisma.price.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.productChange.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    if (createdTariff) await prisma.priceList.deleteMany({ where: { id: ids.tariff } });
    await prisma.lista.deleteMany({ where: { id: ids.lista } });
    await prisma.brand.deleteMany({ where: { id: ids.brand } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.user.deleteMany({ where: { id: ids.actor } });
  }

  beforeAll(async () => {
    process.env.PRICE_IMPORT_STORAGE_DIR = storageDir;
    await cleanup();
    await prisma.user.create({ data: { id: ids.actor, email: `${TAG}@example.test`, name: TAG, password: 'x' } });
    await prisma.category.create({ data: { id: ids.category, name: TAG, slug: `${TAG}-cat` } });
    await prisma.brand.create({ data: { id: ids.brand, name: TAG, slug: `${TAG}-brand` } });
    await prisma.lista.create({ data: { id: ids.lista, code: `${TAG}-A`, name: 'Alfa' } });
    createdTariff = !(await prisma.priceList.findUnique({ where: { code: 'DPP_ORO_IVA' } }));
    if (createdTariff) await prisma.priceList.create({ data: { id: ids.tariff, name: 'Oro', code: 'DPP_ORO_IVA' } });
    const common = { categoryId: ids.category, brandId: ids.brand };
    await prisma.product.create({ data: { id: ids.pA, sku: `${TAG}-KNOWN`, name: `${TAG} known`, listaId: ids.lista, ...common } });
    await prisma.product.create({ data: { id: ids.published, sku: `${TAG}-PUBLISHED`, name: `${TAG} published`, listaId: ids.lista, lifecycleStatus: 'PUBLISHED', publishStatus: 'publicado', isActive: true, isVisible: true, ...common } });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await fs.rm(storageDir, { recursive: true, force: true });
    delete process.env.PRICE_IMPORT_STORAGE_DIR;
  });

  it('preview -> save -> apply with an unknown SKU -> resolve CREATE -> hidden product with prices and history', async () => {
    const rows = [[`${TAG}-KNOWN`, 100], [`${TAG}-new-1`, 250.4], [`${TAG}-new-2`, 300]];
    const preview = await imports.preview(workbook(rows), ctx);
    expect(preview.summary).toMatchObject({ rows: 3, validRows: 1, unknownRows: 2 });
    const header = await imports.saveRevision(workbook(rows), 'key-b3db-0001', ctx);
    await imports.applyRevision(header.id, ctx, { acknowledgeRejectedRows: 2 });

    const listed = await resolution.listUnknownReferences(header.id, ctx);
    expect(listed).toMatchObject({ canCreate: true, total: 2 });
    expect(listed.items[0]).toMatchObject({ sku: `${TAG}-new-1`, prices: [{ tariffCode: 'DPP_ORO_IVA', received: '250.4', value: '250' }] });

    const { results } = await resolution.resolve(header.id, [
      { rowNumber: 3, action: 'CREATE', name: `  ${TAG} Camara nueva `, brandId: ids.brand, categoryId: ids.category },
      { rowNumber: 4, action: 'SKIP' },
    ], ctx);
    expect(results).toEqual([{ rowNumber: 3, status: 'CREATED', productId: expect.any(String) }, { rowNumber: 4, status: 'SKIPPED' }]);
    const productId = results[0].productId!;

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product).toMatchObject({
      sku: `${TAG}-new-1`, name: `${TAG} Camara nueva`, listaId: null, lifecycleStatus: 'DRAFT', publishStatus: 'borrador', isActive: false, isVisible: false,
      extraAttributes: { importStatus: 'pending_enrichment', pendingReason: 'created_from_price_import', sourceRevisionId: header.id },
    });
    const prices = await prisma.price.findMany({ where: { productId } });
    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({ listaId: null, currency: 'COP' });
    expect(prices[0].value.toString()).toBe('250');

    const history = await prisma.productChange.findMany({ where: { productId }, orderBy: { field: 'asc' } });
    expect(history.map((h) => h.field)).toEqual(['brandId', 'categoryId', 'created', 'name', 'price:DPP_ORO_IVA', 'sku']);
    expect(history.find((h) => h.field === 'price:DPP_ORO_IVA')).toMatchObject({ source: 'PRICE_IMPORT', sourceRef: header.id, actorId: ids.actor, oldValue: null, newValue: '250' });
    expect(await prisma.auditLog.count({ where: { productId, action: 'price-import-create-draft' } })).toBe(1);

    const rowsAfter = await prisma.priceImportRevisionRow.findMany({ where: { revisionId: header.id }, orderBy: { rowNumber: 'asc' } });
    expect(rowsAfter.map((r) => [r.rowNumber, r.resolution, r.productId])).toEqual([[2, null, ids.pA], [3, 'PRODUCT_CREATED', productId], [4, 'SKIPPED', null]]);
    expect(rowsAfter[1].resolvedById).toBe(ids.actor);
  });

  it('the draft is NOT returned by the real public search nor by the public detail (a published control is)', async () => {
    const draft = await prisma.product.findFirstOrThrow({ where: { sku: `${TAG}-new-1` } });
    const found = await publicCatalog.search({ q: TAG });
    expect(found.data.map((p) => p.sku)).toEqual([`${TAG}-PUBLISHED`]);
    await expect(publicCatalog.getDetail(draft.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('repeating the request is idempotent and creates no duplicate; two concurrent identical requests create one product', async () => {
    const header = await imports.saveRevision(workbook([[`${TAG}-KNOWN`, 120], [`${TAG}-race-1`, 500]]), 'key-b3db-0002', ctx);
    await imports.applyRevision(header.id, ctx, { acknowledgeRejectedRows: 1 });
    const body = [{ rowNumber: 3, action: 'CREATE' as const, name: `${TAG} Race`, brandId: ids.brand, categoryId: ids.category }];
    const [a, b] = await Promise.all([resolution.resolve(header.id, body, ctx), resolution.resolve(header.id, body, ctx)]);
    expect(a.results[0].status).toBe('CREATED');
    expect(b.results[0]).toMatchObject({ status: 'CREATED', productId: a.results[0].productId });
    expect(await prisma.product.count({ where: { sku: `${TAG}-race-1` } })).toBe(1);
    expect(await prisma.productChange.count({ where: { productId: a.results[0].productId, field: 'price:DPP_ORO_IVA' } })).toBe(1);
  });

  it('SKU_EXISTS when the SKU appears meanwhile (even differing in case/spaces): no duplicate, row stays pending', async () => {
    const header = await imports.saveRevision(workbook([[`${TAG}-KNOWN`, 130], [`${TAG}-late-1`, 700]]), 'key-b3db-0003', ctx);
    await imports.applyRevision(header.id, ctx, { acknowledgeRejectedRows: 1 });
    await prisma.product.create({ data: { sku: `${TAG.toLowerCase()}-late- 1`, name: 'created meanwhile', categoryId: ids.category, brandId: ids.brand } });
    const { results } = await resolution.resolve(header.id, [{ rowNumber: 3, action: 'CREATE', name: 'x', brandId: ids.brand, categoryId: ids.category }], ctx);
    expect(results[0]).toMatchObject({ status: 'FAILED', code: 'SKU_EXISTS' });
    const row = await prisma.priceImportRevisionRow.findFirstOrThrow({ where: { revisionId: header.id, rowNumber: 3 } });
    expect(row).toMatchObject({ resolution: 'PENDING_PRODUCT', productId: null });
    expect(await prisma.product.count({ where: { sku: { startsWith: `${TAG}-late`, mode: 'insensitive' } } })).toBe(1);
  });

  it('a failing item does not roll back the others and leaves nothing of itself behind', async () => {
    const header = await imports.saveRevision(workbook([[`${TAG}-KNOWN`, 140], [`${TAG}-ok-1`, 10], [`${TAG}-bad-1`, 20]]), 'key-b3db-0004', ctx);
    await imports.applyRevision(header.id, ctx, { acknowledgeRejectedRows: 2 });
    const { results } = await resolution.resolve(header.id, [
      { rowNumber: 3, action: 'CREATE', name: `${TAG} ok`, brandId: ids.brand, categoryId: ids.category },
      { rowNumber: 4, action: 'CREATE', name: `${TAG} bad`, brandId: '00000000-0000-4000-8000-0000000fffff', categoryId: ids.category },
    ], ctx);
    expect(results.map((r) => r.status)).toEqual(['CREATED', 'FAILED']);
    expect(results[1].code).toBe('BRAND_NOT_FOUND');
    expect(await prisma.product.count({ where: { sku: `${TAG}-ok-1` } })).toBe(1);
    expect(await prisma.product.count({ where: { sku: `${TAG}-bad-1` } })).toBe(0);
    const bad = await prisma.priceImportRevisionRow.findFirstOrThrow({ where: { revisionId: header.id, rowNumber: 4 } });
    expect(bad.resolution).toBe('PENDING_PRODUCT');
  });

  it('TARIFF_UNAVAILABLE creates nothing', async () => {
    const header = await imports.saveRevision(workbook([[`${TAG}-KNOWN`, 150], [`${TAG}-tar-1`, 30]]), 'key-b3db-0005', ctx);
    await imports.applyRevision(header.id, ctx, { acknowledgeRejectedRows: 1 });
    const tariff = await prisma.priceList.findUniqueOrThrow({ where: { code: 'DPP_ORO_IVA' } });
    await prisma.priceList.update({ where: { id: tariff.id }, data: { isActive: false } });
    try {
      const { results } = await resolution.resolve(header.id, [{ rowNumber: 3, action: 'CREATE', name: 'x', brandId: ids.brand, categoryId: ids.category }], ctx);
      expect(results[0]).toMatchObject({ status: 'FAILED', code: 'TARIFF_UNAVAILABLE' });
      expect(await prisma.product.count({ where: { sku: `${TAG}-tar-1` } })).toBe(0);
    } finally {
      await prisma.priceList.update({ where: { id: tariff.id }, data: { isActive: true } });
    }
  });
});
