/**
 * DB-backed spec for the price import (mixed listas). Runs only when
 * PRICE_IMPORT_TEST_DATABASE_URL points to a THROWAWAY Postgres with all
 * migrations applied (never `.env`, never production):
 *
 *   PRICE_IMPORT_TEST_DATABASE_URL=postgresql://postgres:t@127.0.0.1:54400/imp npx jest price-import.db
 */
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import { findProductMatchesBySkus, findProductsBySkus } from '../../products/helpers/sku-identity';
import { PriceImportService } from './price-import.service';

const url = process.env.PRICE_IMPORT_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

const TAG = 'B2DB';
const storageDir = path.join(os.tmpdir(), 'gs-b2-db-storage');

function workbook(rows: unknown[][]): Express.Multer.File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'ORO_IVA'], ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía ficticia']]), 'INSTRUCCIONES');
  return { originalname: 'fixture-db.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) } as Express.Multer.File;
}

suite('price import mixed listas (database)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: url ?? 'postgresql://unused' } } });
  const ids = {
    listaA: '00000000-0000-4000-8000-00000000d0a1', listaB: '00000000-0000-4000-8000-00000000d0b2',
    category: '00000000-0000-4000-8000-00000000d0c1', brand: '00000000-0000-4000-8000-00000000d0d1',
    tariff: '00000000-0000-4000-8000-00000000d0e1', actor: '00000000-0000-4000-8000-00000000d0f1',
    pA: '00000000-0000-4000-8000-00000000d101', pB: '00000000-0000-4000-8000-00000000d102', pFree: '00000000-0000-4000-8000-00000000d103',
  };
  const ctx = { userId: ids.actor, roles: ['Super Admin'] };
  let service: PriceImportService;
  let createdTariff = false;

  async function cleanup() {
    await prisma.priceImportRevision.deleteMany({ where: { createdById: ids.actor } });
    await prisma.price.deleteMany({ where: { productId: { in: [ids.pA, ids.pB, ids.pFree] } } });
    await prisma.product.deleteMany({ where: { id: { in: [ids.pA, ids.pB, ids.pFree] } } });
    await prisma.productChange.deleteMany({ where: { sku: { startsWith: TAG } } });
    if (createdTariff) await prisma.priceList.deleteMany({ where: { id: ids.tariff } });
    await prisma.lista.deleteMany({ where: { id: { in: [ids.listaA, ids.listaB] } } });
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
    await prisma.lista.createMany({ data: [
      { id: ids.listaA, code: `${TAG}-A`, name: 'Alfa' }, { id: ids.listaB, code: `${TAG}-B`, name: 'Beta' },
    ] });
    createdTariff = !(await prisma.priceList.findUnique({ where: { code: 'ORO_IVA' } }));
    if (createdTariff) await prisma.priceList.create({ data: { id: ids.tariff, name: 'Oro', code: 'ORO_IVA' } });
    const common = { categoryId: ids.category, brandId: ids.brand, name: TAG };
    await prisma.product.create({ data: { id: ids.pA, sku: `${TAG}-IDS-E04HQHI-D`, listaId: ids.listaA, ...common } });
    await prisma.product.create({ data: { id: ids.pB, sku: `${TAG}-x-1`, listaId: ids.listaB, ...common } });
    await prisma.product.create({ data: { id: ids.pFree, sku: `${TAG} FREE 01`, listaId: null, ...common } });
    service = new PriceImportService(prisma as never, { isListasAdmin: () => true } as never, { log: jest.fn(), logTx: jest.fn() } as never, { grantsForUser: async () => [] } as never);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await fs.rm(storageDir, { recursive: true, force: true });
    delete process.env.PRICE_IMPORT_STORAGE_DIR;
  });

  describe('SKU identity with the normalized unique index', () => {
    it('findProductsBySkus matches across listas ignoring case and inner spaces, keeping unlisted products', async () => {
      const found = await findProductsBySkus(prisma, [`${TAG}-ids-e04hqhi- d`, `${TAG.toLowerCase()}free01`, 'NO-SUCH-SKU-B2DB'], { id: true, sku: true, listaId: true });
      expect([...found.keys()].sort()).toEqual([`${TAG}-IDS-E04HQHI-D`, `${TAG}FREE01`].sort());
      expect(found.get(`${TAG}-IDS-E04HQHI-D`)).toMatchObject({ id: ids.pA, listaId: ids.listaA });
      expect(found.get(`${TAG}FREE01`)).toMatchObject({ id: ids.pFree, listaId: null });
    });

    it('findProductMatchesBySkus returns one candidate per normalized key (the unique index forbids ambiguity)', async () => {
      const matches = await findProductMatchesBySkus(prisma, [`${TAG}-x-1`, `${TAG}-X-1`], { id: true, listaId: true });
      expect(matches.size).toBe(1);
      expect([...matches.values()][0]).toEqual([{ id: ids.pB, listaId: ids.listaB }]);
    });

    it('the unique normalized index rejects a product whose SKU only differs by case or spaces', async () => {
      await expect(prisma.product.create({ data: {
        sku: `${TAG.toLowerCase()}-ids-e04hqhi- d`, name: TAG, categoryId: ids.category, brandId: ids.brand,
      } })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('preview and save against the real columns', () => {
    it('previews a mixed file, saves it with a null revision lista and per-row snapshots, and reads it back', async () => {
      const rows = [[`${TAG}-ids-e04hqhi- d`, 100], [`${TAG}-X-1`, 200], [`${TAG}FREE 01`, 300], ['B2DB-UNKNOWN', 400]];
      const preview = await service.preview(workbook(rows), ctx);
      expect(preview.summary).toMatchObject({ rows: 4, validRows: 3, unknownRows: 1, unlistedRows: 1, rowsInInaccessibleListas: 0 });
      expect(preview.summary.byLista!.map((l) => l.listaId).sort()).toEqual([ids.listaA, ids.listaB].sort());

      const header = await service.saveRevision(workbook(rows), 'key-b2db-0001', ctx);
      expect(header.listaId).toBeNull();
      const stored = await prisma.priceImportRevisionRow.findMany({ where: { revisionId: header.id }, orderBy: { rowNumber: 'asc' } });
      expect(stored.map((r) => [r.productId, r.listaId, r.resolution])).toEqual([
        [ids.pA, ids.listaA, null], [ids.pB, ids.listaB, null], [ids.pFree, null, null], [null, null, 'PENDING_PRODUCT'],
      ]);
      const again = await service.saveRevision(workbook(rows), 'key-b2db-0001', ctx);
      expect(again.id).toBe(header.id);
      const detail = await service.getRevision(header.id, 1, 100, ctx);
      expect(detail.totalRows).toBe(4);
      expect(detail.byLista).toHaveLength(2);
    });
  });
});
