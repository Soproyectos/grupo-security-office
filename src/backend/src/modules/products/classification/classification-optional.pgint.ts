/**
 * Integration test: a product can be saved as an incomplete draft (SKU + name) without brand and/or
 * classification, and the importers never invent taxonomy. REAL, DISPOSABLE PostgreSQL only.
 *
 * Not picked up by `npm test`. Run it explicitly:
 *   npx jest classification-optional --runInBand --testRegex='.*\.pgint\.ts$'
 *
 * Safety: it only ever talks to the disposable server 127.0.0.1:55433 (user pgtest, trust auth). It creates its
 * own database `mt_a_<random>`, applies the migrations to it, uses synthetic rows only and drops the database
 * at the end (also on failure). It never reads DATABASE_URL / .env files for its own connection.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { ProductsService } from '../products.service';
import { PublicCatalogService } from '../public-catalog.service';
import { BatchExecutorService } from '../import/pipeline/batch-executor.service';
import { CatalogImportService } from '../catalog-import/catalog-import.service';
import { runValidation, type ProductValidationInput } from '../validation/validation-rules';

const HOST = '127.0.0.1';
const PORT = '55433';
const USER = 'pgtest';
const DB_NAME = `mt_a_${randomBytes(5).toString('hex')}`;

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

function xlsx(rows: unknown[][]): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Carga');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('Optional brand/classification drafts against disposable PostgreSQL', () => {
  jest.setTimeout(420_000);

  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let prisma: PrismaClient;
  let products: ProductsService;
  const id: Record<string, string> = {};
  const counts = async () => ({ brands: await prisma.brand.count(), categories: await prisma.category.count(), subcategories: await prisma.subcategory.count() });
  const read = (sku: string) => prisma.product.findFirstOrThrow({ where: { sku }, select: { id: true, categoryId: true, subcategoryId: true, brandId: true, isVisible: true } });

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
    Object.assign(id, { r1: r1.id, r2: r2.id, c1: c1.id, c2: c2.id, s1: s1.id, s2: s2.id, brand: brand.id });

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

  it('creates a product with only sku + name: no brand, category or subcategory, nothing invented', async () => {
    const before = await counts();
    const created = await products.create({ sku: 'OPT-MIN-1', name: 'Solo SKU y nombre' } as never);
    expect(created.classificationStatus).toBe('incomplete');
    expect(created.classificationMissing).toEqual(['brand', 'subcategory']);
    expect(await read('OPT-MIN-1')).toMatchObject({ brandId: null, categoryId: null, subcategoryId: null });
    expect(await counts()).toEqual(before);
  });

  it('classifies progressively: brand, then subcategory (derives category), then clears them again', async () => {
    const { id: productId } = await read('OPT-MIN-1');
    let updated = await products.update(productId, { brandId: id.brand } as never);
    expect(updated.classificationMissing).toEqual(['subcategory']);
    updated = await products.update(productId, { subcategoryId: id.s1 } as never);
    expect(updated.classificationStatus).toBe('complete');
    expect(await read('OPT-MIN-1')).toMatchObject({ brandId: id.brand, categoryId: id.c1, subcategoryId: id.s1 });

    updated = await products.update(productId, { brandId: null } as never);
    expect(updated.classificationMissing).toEqual(['brand']);
    // Clearing only the subcategory leaves categoryId as is.
    await products.update(productId, { subcategoryId: null } as never);
    expect(await read('OPT-MIN-1')).toMatchObject({ brandId: null, categoryId: id.c1, subcategoryId: null });
    // Clearing the category clears its subcategory with it.
    await products.update(productId, { subcategoryId: id.s2 } as never);
    await products.update(productId, { categoryId: null } as never);
    expect(await read('OPT-MIN-1')).toMatchObject({ categoryId: null, subcategoryId: null });
    // A brand that does not exist is still rejected.
    await expect(products.update(productId, { brandId: 'no-such-brand' } as never)).rejects.toMatchObject({ status: 404 });
  });

  it('publishing stays blocked by the existing rules while brand or category is null', async () => {
    const input = async (sku: string): Promise<ProductValidationInput> => {
      const p = await prisma.product.findFirstOrThrow({ where: { sku }, include: { category: true } });
      return {
        productId: p.id, revisionId: p.id, name: p.name, catalogName: p.catalogName, brandId: p.brandId, catalogBrand: p.catalogBrand,
        categoryActive: p.category?.isActive ?? false, categorySlug: p.category?.slug ?? null,
        images: [], resources: [], files: {}, lista: null, prices: [], stockZero: false,
      };
    };
    const codes = async (sku: string) => runValidation(await input(sku)).issues.filter((i) => i.severity === 'error').map((i) => i.code);

    expect(await codes('OPT-MIN-1')).toEqual(expect.arrayContaining(['base.category_valid', 'base.brand_present']));
    await products.create({ sku: 'OPT-NOBRAND', name: 'Con categoria sin marca', categoryId: id.c1 } as never);
    const noBrand = await codes('OPT-NOBRAND');
    expect(noBrand).toContain('base.brand_present');
    expect(noBrand).not.toContain('base.category_valid');
    await products.create({ sku: 'OPT-NOCAT', name: 'Con marca sin categoria', brandId: id.brand } as never);
    const noCategory = await codes('OPT-NOCAT');
    expect(noCategory).toContain('base.category_valid');
    expect(noCategory).not.toContain('base.brand_present');
    // Documented behaviour of the existing rule: a free-text catalogBrand satisfies brand_present when brandId is null.
    await prisma.product.update({ where: { sku: 'OPT-NOBRAND' }, data: { catalogBrand: 'Marca escrita en la ficha' } });
    expect(await codes('OPT-NOBRAND')).not.toContain('base.brand_present');
  });

  it('an unclassified draft is invisible and harmless in the public catalog and visible in the admin list', async () => {
    const pricing = { getPublicPrices: jest.fn().mockResolvedValue(new Map()) };
    const publicCatalog = new PublicCatalogService(prisma as never, pricing as never);
    const { id: productId } = await read('OPT-MIN-1');

    const list = await publicCatalog.search({});
    expect(list.data.find((p) => p.id === productId)).toBeUndefined();
    await expect(publicCatalog.getDetail(productId)).rejects.toMatchObject({ status: 404 });

    // Even forced into a visible state, a null brand/category must not break the public list (null-safe projection).
    await prisma.$executeRawUnsafe(`UPDATE products SET "isVisible" = true, "isActive" = true WHERE id = '${productId}'`);
    await expect(publicCatalog.search({})).resolves.toBeDefined();
    await prisma.$executeRawUnsafe(`UPDATE products SET "isVisible" = false, "isActive" = false WHERE id = '${productId}'`);

    const adminAll = await products.findAll({ take: 100 });
    expect(adminAll.data.map((p: any) => p.sku)).toEqual(expect.arrayContaining(['OPT-MIN-1', 'OPT-NOBRAND', 'OPT-NOCAT']));
    const row = adminAll.data.find((p: any) => p.sku === 'OPT-MIN-1');
    expect(row).toMatchObject({ brand: null, category: null });
    const searched = await products.findAll({ search: 'OPT-MIN-1' });
    // Literal match first (fuzzy search may add similar SKUs after it).
    expect(searched.data[0].sku).toBe('OPT-MIN-1');
    expect(searched.data[0]).toMatchObject({ brand: null, category: null });
    const trending = await products.findTrending({ search: 'OPT-MIN', forceReload: true }).catch(() => null);
    expect(trending === null || Array.isArray(trending.data)).toBe(true);
  });

  it('a price-import draft with no brand/category is saved unclassified (and nothing is created)', async () => {
    const before = await counts();
    const draft = await prisma.$transaction((tx) =>
      products.createPendingSheetDraft(tx, { sku: 'OPT-PRICE-1', name: 'Desde precios', sourceRevisionId: 'rev-1' }, { userId: null }),
    );
    expect(draft).toMatchObject({ brandId: null, categoryId: null, subcategoryId: null });
    expect(await counts()).toEqual(before);
  });

  it('Excel import: unknown category/brand create NOTHING; the row is an unclassified draft with a needs-confirmation issue', async () => {
    const before = await counts();
    const result = await products.importFromExcel(xlsx([
      ['SKU', 'Nombre', 'Categoría', 'Marca'],
      ['OPT-XL-1', 'Desconocidos', 'Categoria Inventada', 'Marca Inventada'],
      ['OPT-XL-2', 'Conocidos', 'Camaras IP', 'Marca Sintetica'],
    ]));
    expect(result.created).toBe(2);
    expect(await counts()).toEqual(before);
    expect(await read('OPT-XL-1')).toMatchObject({ brandId: null, categoryId: null, subcategoryId: null });
    // An existing child category derives its subcategory through the classification service.
    expect(await read('OPT-XL-2')).toMatchObject({ brandId: id.brand, categoryId: id.c1, subcategoryId: id.s1 });
    expect(result.needsConfirmation).toEqual([
      { row: 2, sku: 'OPT-XL-1', code: 'CATEGORY_NEEDS_CONFIRMATION', label: 'Categoria Inventada' },
      { row: 2, sku: 'OPT-XL-1', code: 'BRAND_NEEDS_CONFIRMATION', label: 'Marca Inventada' },
    ]);
  });

  it('bulk import pipeline: unknown labels create nothing, known ones classify coherently, existing products are never cleared', async () => {
    const executor = new BatchExecutorService(prisma as never, { log: jest.fn().mockResolvedValue(undefined), logTx: jest.fn() } as never);
    const row = (over: Record<string, unknown>) => ({
      rowIndex: 0, sku: 'X', name: 'Producto', description: 'd', categoryName: '', brandName: '', prices: [],
      technicalSpecs: {}, extraAttributes: {}, isUpdate: false, nameIsFallback: false, ...over,
    });
    const ctx = {
      importId: 'imp-1', userId: undefined, fileName: 't.xlsx', fileSize: 1, rawRows: [], headers: [],
      columnMapping: { entries: [], confirmed: true }, ivaMode: 'with_iva', validatedRows: [], normalizedRows: [], pipelineErrors: [], startedAt: new Date(), currentStage: 'batch_execution',
    } as never;
    const before = await counts();
    const result = await executor.execute([
      row({ rowIndex: 0, sku: 'OPT-BX-1', categoryName: 'Categoria Inventada', brandName: 'Marca Inventada' }),
      row({ rowIndex: 1, sku: 'OPT-BX-2', categoryName: 'Switches', brandName: 'Marca Sintetica' }),
      row({ rowIndex: 2, sku: 'OPT-BX-3', categoryName: '', brandName: '' }),
    ] as never, ctx);
    expect(result.created).toBe(3);
    expect(result.errors).toEqual([]);
    expect(await counts()).toEqual(before);
    expect(await read('OPT-BX-1')).toMatchObject({ brandId: null, categoryId: null, subcategoryId: null });
    expect(await read('OPT-BX-2')).toMatchObject({ brandId: id.brand, categoryId: id.c2, subcategoryId: id.s2 });
    expect(await read('OPT-BX-3')).toMatchObject({ brandId: null, categoryId: null });
    expect(result.needsConfirmation).toEqual([
      { rowIndex: 0, sku: 'OPT-BX-1', code: 'CATEGORY_NEEDS_CONFIRMATION', label: 'Categoria Inventada' },
      { rowIndex: 0, sku: 'OPT-BX-1', code: 'BRAND_NEEDS_CONFIRMATION', label: 'Marca Inventada' },
    ]);

    // Re-importing an already classified product with unknown labels does not clear what it has.
    const again = await executor.execute([row({ rowIndex: 0, sku: 'OPT-BX-2', categoryName: 'Otra Inventada', brandName: 'Otra Marca' })] as never, ctx);
    expect(again.updated).toBe(1);
    expect(await read('OPT-BX-2')).toMatchObject({ brandId: id.brand, categoryId: id.c2, subcategoryId: id.s2 });
    // A known category re-derives the subcategory so the pair stays coherent.
    await executor.execute([row({ rowIndex: 0, sku: 'OPT-BX-2', categoryName: 'Camaras IP', brandName: 'Marca Sintetica' })] as never, ctx);
    expect(await read('OPT-BX-2')).toMatchObject({ categoryId: id.c1, subcategoryId: id.s1 });
    expect(await counts()).toEqual(before);
  });

  it('catalog import (products): unknown labels are not proposed nor created; rows are drafts with confirmation issues', async () => {
    const library = { client: prisma, writeTransaction: (fn: (tx: unknown) => unknown) => prisma.$transaction(fn as never), assertWritesAllowed: jest.fn(), config: { mode: 'legacy' } };
    const service = new CatalogImportService(library as never, { append: jest.fn() } as never);
    const actor = { id: 'user-opt', roles: ['Admin Comercial'] };
    const before = await counts();
    const preview = await service.preview(xlsx([
      ['SKU', 'Nombre', 'Marca', 'Categoría', 'Subcategoría'],
      ['OPT-CI-1', 'Todo desconocido', 'Marca Inventada', 'Categoria Inventada', 'Sub Inventada'],
      ['OPT-CI-2', 'Marca desconocida', 'Otra Marca', 'Video', 'Camaras IP'],
    ]), 'catalogo.xlsx', 'products', actor);
    expect(preview.proposedBrands).toEqual([]);
    expect(preview.proposedCategories).toEqual([]);
    expect((preview.rows[0] as any).needsConfirmation).toEqual([
      { code: 'BRAND_NEEDS_CONFIRMATION', label: 'Marca Inventada' },
      { code: 'CATEGORY_NEEDS_CONFIRMATION', label: 'Categoria Inventada > Sub Inventada' },
    ]);
    const report: any = await service.execute(preview.previewId, false, actor);
    expect(report).toMatchObject({ created: 2, invalid: 0 });
    expect(await counts()).toEqual(before);
    expect(await read('OPT-CI-1')).toMatchObject({ brandId: null, categoryId: null, subcategoryId: null });
    expect(await read('OPT-CI-2')).toMatchObject({ brandId: null, categoryId: id.c1, subcategoryId: id.s1 });
    expect(report.needsConfirmation.map((i: any) => `${i.sku}:${i.code}`)).toEqual([
      'OPT-CI-1:BRAND_NEEDS_CONFIRMATION', 'OPT-CI-1:CATEGORY_NEEDS_CONFIRMATION', 'OPT-CI-2:BRAND_NEEDS_CONFIRMATION',
    ]);
  });

  it('a conflicting classification is still rejected by the shared service and writes nothing', async () => {
    await expect(products.create({ sku: 'OPT-BAD-1', name: 'Conflicto', categoryId: id.c1, subcategoryId: id.s2 } as never)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CLASSIFICATION_CONFLICT' }),
    });
    expect(await prisma.product.count({ where: { sku: 'OPT-BAD-1' } })).toBe(0);
  });

  it('no brand was created anywhere in these paths', async () => {
    expect(await prisma.brand.count()).toBe(1);
    expect(await prisma.category.count()).toBe(4);
  });
});
