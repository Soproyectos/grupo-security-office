/**
 * Integration test: master-Excel catalog import against a REAL, DISPOSABLE PostgreSQL.
 *
 * Not picked up by `npm test`. Run it explicitly:
 *   npx jest catalog-import-journey --runInBand --testRegex='.*\.pgint\.ts$'
 *
 * Safety: it only ever talks to the disposable server 127.0.0.1:55433 (user pgtest, trust auth). It creates its
 * own database `mt_i_<random>`, applies the migrations to it, uses SYNTHETIC rows only and drops the database
 * at the end (also on failure). It never reads DATABASE_URL / .env files for its own connection.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { CatalogImportController } from './catalog-import.controller';
import { CatalogImportService } from './catalog-import.service';

const HOST = '127.0.0.1';
const PORT = '55433';
const USER = 'pgtest';
const DB_NAME = `mt_i_${randomBytes(5).toString('hex')}`;

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

const HEADER = ['SKU', 'Nombre', 'Marca', 'Categoria', 'Subcategoria', 'Decision', 'Motivo', 'Evidencia'];
/** Synthetic master workbook with the business layout: title, caption, header on row 3, data from row 4. */
function master(rows: unknown[][]): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Productos'], ['Revisión semántica por lote sintético'], HEADER, ...rows]), 'Productos');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const FILE_ROWS: unknown[][] = [
  ['SKU-001', 'Camara A', 'Marca Sintetica', 'Video', 'Camaras IP', 'OK', '', ''],
  ['sku-002', 'Camara B', '', '', '', 'PENDIENTE', 'sin datos', ''],
  ['SKU-003', 'Lista de camaras', '', '', '', 'ROTULO', '', ''],
  ['SKU-004', 'Switch X', 'Marca Inexistente', 'Redes', 'Desconocida', 'RESTRINGIDO', '', ''],
  ['SKU-005', 'Producto demo', '', '', '', 'DEMO', '', ''],
];

describe('Master Excel catalog import against disposable PostgreSQL', () => {
  jest.setTimeout(420_000);

  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let prisma: PrismaClient;
  let controller: CatalogImportController;
  const id: Record<string, string> = {};
  const req = { user: { sub: 'journey-admin', roles: ['Super Admin'] } };

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}"`);
    execSync('npx prisma migrate deploy', { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: TARGET_URL }, stdio: 'pipe' });
    prisma = new PrismaClient({ datasources: { db: { url: TARGET_URL } } });
    await prisma.$connect();
    const video = await prisma.category.create({ data: { name: 'Video', slug: 'video' } });
    const redes = await prisma.category.create({ data: { name: 'Redes', slug: 'redes' } });
    const cams = await prisma.subcategory.create({ data: { categoryId: video.id, name: 'Camaras IP', slug: 'camaras-ip' } });
    const switches = await prisma.subcategory.create({ data: { categoryId: redes.id, name: 'Switches', slug: 'switches' } });
    const brand = await prisma.brand.create({ data: { name: 'Marca Sintetica', slug: 'marca-sintetica' } });
    Object.assign(id, { video: video.id, redes: redes.id, cams: cams.id, switches: switches.id, brand: brand.id });
    const library = {
      client: prisma, config: { mode: 'legacy' }, assertWritesAllowed: jest.fn(),
      writeTransaction: <T>(fn: (tx: PrismaClient) => Promise<T>) => prisma.$transaction((tx) => fn(tx as unknown as PrismaClient), { timeout: 60_000 }),
    };
    controller = new CatalogImportController(new CatalogImportService(library as never, { append: jest.fn() } as never));
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

  const run = async (buffer: Buffer) => {
    const preview = await controller.preview({ buffer, originalname: 'maestro.xlsx' } as never, 'products', req);
    const report = await controller.execute({ previewId: preview.previewId, confirmNewEntities: false }, req) as any;
    return { preview, report };
  };
  const product = (sku: string) => prisma.product.findFirstOrThrow({ where: { sku } });
  const snapshot = async () => ({
    products: await prisma.product.findMany({ orderBy: { sku: 'asc' }, select: { sku: true, name: true, brandId: true, categoryId: true, subcategoryId: true, updatedAt: true } }),
    changes: await prisma.productChange.count(),
    brands: await prisma.brand.count(), categories: await prisma.category.count(), subcategories: await prisma.subcategory.count(),
  });

  it('1. finds the header under title/caption, creates drafts, skips ROTULO and reports what is missing', async () => {
    const { preview, report } = await run(master(FILE_ROWS));
    expect(preview.rows.map((r: any) => [r.row, r.action])).toEqual([[4, 'create'], [5, 'create'], [6, 'skip'], [7, 'create'], [8, 'create']]);
    expect(report).toMatchObject({ created: 4, updated: 0, unchanged: 0, proposed: 0, skipped: 1, invalid: 0 });
    expect(report.rows.find((r: any) => r.row === 6)).toMatchObject({ status: 'skipped', code: 'SKIPPED_HEADING_ROW' });
    expect(report.rows.find((r: any) => r.row === 5)).toMatchObject({ status: 'created', missing: ['brand', 'subcategory'] });
    expect(report.needsConfirmation.map((n: any) => n.code).sort()).toEqual(['BRAND_NEEDS_CONFIRMATION', 'CATEGORY_NEEDS_CONFIRMATION']);

    expect(await prisma.product.count()).toBe(4);
    expect(await prisma.product.count({ where: { sku: 'SKU-003' } })).toBe(0);
    const complete = await product('SKU-001');
    expect(complete).toMatchObject({ name: 'Camara A', brandId: id.brand, subcategoryId: id.cams, categoryId: id.video, lifecycleStatus: 'DRAFT', isActive: false, isVisible: false });
    expect(await product('sku-002')).toMatchObject({ brandId: null, categoryId: null, subcategoryId: null });
    // Unknown brand / subcategory: nothing is created, the known root is kept.
    expect(await product('SKU-004')).toMatchObject({ brandId: null, categoryId: id.redes, subcategoryId: null });
    expect(await prisma.brand.count()).toBe(1);
    expect(await prisma.subcategory.count()).toBe(2);
    expect(await prisma.category.count()).toBe(2);
  });

  it('2. re-running the same file writes nothing (no updatedAt bump, no ProductChange rows)', async () => {
    const before = await snapshot();
    const { preview, report } = await run(master(FILE_ROWS));
    expect(preview.rows.map((r: any) => r.action)).toEqual(['unchanged', 'unchanged', 'skip', 'unchanged', 'unchanged']);
    expect(report).toMatchObject({ created: 0, updated: 0, unchanged: 4, proposed: 0, skipped: 1, invalid: 0 });
    expect(report.rows.filter((r: any) => r.status === 'unchanged').every((r: any) => r.code === 'UNCHANGED')).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it('3. same normalized SKU updates the existing product: only empty fields are filled, other values are proposed', async () => {
    const before = await snapshot();
    const { report } = await run(master([
      [' sku-0 01 ', 'Camara A (otro nombre)', 'Marca Sintetica', 'Video', 'Camaras IP', 'OK', '', ''],
      ['SKU-002', 'Camara B renombrada', 'Marca Sintetica', 'Video', 'Camaras IP', 'OK', '', ''],
      ['SKU-006', 'Nuevo', '', '', '', 'PENDIENTE', '', ''],
    ]));
    expect(report).toMatchObject({ created: 1, updated: 1, unchanged: 0, proposed: 1, invalid: 0 });
    const byRow = (n: number) => report.rows.find((r: any) => r.row === n);
    expect(byRow(4)).toMatchObject({ status: 'proposed', code: 'PROPOSED_DIFFERENT_VALUE', proposals: [{ field: 'name', before: 'Camara A', after: 'Camara A (otro nombre)' }] });
    expect(byRow(5)).toMatchObject({ status: 'updated', code: 'UPDATED_FILLED_EMPTY' });
    expect(byRow(5).changes.map((c: any) => c.field).sort()).toEqual(['brand', 'classification']);
    expect(byRow(5).proposals).toEqual([{ field: 'name', before: 'Camara B', after: 'Camara B renombrada' }]);

    expect(await prisma.product.count()).toBe(before.products.length + 1);
    expect(await product('SKU-001')).toMatchObject({ name: 'Camara A' });
    const filled = await product('sku-002');
    expect(filled).toMatchObject({ name: 'Camara B', brandId: id.brand, subcategoryId: id.cams, categoryId: id.video });
    const log = await prisma.productChange.findMany({ where: { productId: filled.id, source: 'PRODUCT_IMPORT' }, select: { field: true } });
    expect(log.map((l) => l.field)).toEqual(expect.arrayContaining(['brandId', 'categoryId', 'subcategoryId']));
    // The untouched product kept its updatedAt.
    expect((await product('SKU-001')).updatedAt).toEqual(before.products.find((p) => p.sku === 'SKU-001')!.updatedAt);
  });

  it('4. published, name-locked or approved products are never written: proposals only', async () => {
    const published = await product('SKU-004');
    const revision = await prisma.productRevision.create({ data: { id: `rev-${randomBytes(4).toString('hex')}`, productId: published.id, status: 'PUBLICADA', version: 1, content: {} } });
    await prisma.product.update({ where: { id: published.id }, data: { publicRevisionId: revision.id } });
    await prisma.product.update({ where: { sku: 'SKU-005' }, data: { nameLockedAt: new Date() } });
    await prisma.productRevision.create({ data: { id: `rev-${randomBytes(4).toString('hex')}`, productId: (await product('SKU-006')).id, status: 'LISTA_PARA_PUBLICAR', version: 1, content: {} } });
    const before = await snapshot();
    const { report } = await run(master([
      ['SKU-004', 'Switch X', 'Marca Sintetica', 'Redes', 'Switches', 'RESTRINGIDO', '', ''],
      ['SKU-005', 'Otro nombre demo', 'Marca Sintetica', 'Video', 'Camaras IP', 'DEMO', '', ''],
      ['SKU-006', 'Nuevo', 'Marca Sintetica', 'Video', 'Camaras IP', 'PENDIENTE', '', ''],
    ]));
    expect(report).toMatchObject({ created: 0, updated: 0, unchanged: 0, proposed: 3, invalid: 0 });
    expect(report.rows.every((r: any) => r.status === 'proposed' && r.code === 'PROPOSED_PROTECTED')).toBe(true);
    expect(report.rows[0].proposals.map((p: any) => p.field).sort()).toEqual(['brand', 'classification']);
    expect(await snapshot()).toEqual(before);
  });

  it('5. rejects a duplicated normalized SKU inside one file with a clear code and still applies the other rows', async () => {
    const { preview, report } = await run(master([
      ['SKU-DUP', 'Uno', '', '', '', 'OK', '', ''],
      [' sku-dup', 'Dos', '', '', '', 'OK', '', ''],
      ['SKU-007', 'Siete', '', '', '', 'OK', '', ''],
    ]));
    expect(preview.rows.map((r: any) => r.code)).toEqual(['DUPLICATE_SKU_IN_FILE', 'DUPLICATE_SKU_IN_FILE', 'CREATE_DRAFT']);
    expect(report).toMatchObject({ created: 1, invalid: 2 });
    expect(await prisma.product.count({ where: { sku: { in: ['SKU-DUP', ' sku-dup'] } } })).toBe(0);
    expect(await prisma.product.count({ where: { sku: 'SKU-007' } })).toBe(1);
  });

  it('6. a price column is still rejected before anything is stored', async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[...HEADER, 'Precio'], ['SKU-009', 'Precio', '', '', '', 'OK', '', '', '10']]), 'Productos');
    const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    await expect(controller.preview({ buffer, originalname: 'maestro.xlsx' } as never, 'products', req)).rejects.toMatchObject({ status: 400 });
  });
});
