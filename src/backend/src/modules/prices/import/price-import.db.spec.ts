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
import { ConflictException } from '@nestjs/common';
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
  // Same shape as AuditService.logTx: the entry commits or rolls back with the transaction.
  const audit = {
    log: jest.fn(),
    logTx: jest.fn(async (tx: Prisma.TransactionClient, p: any) => tx.auditLog.create({ data: {
      userId: p.userId, action: p.action, entity: p.entity, entityId: p.entityId, newValues: p.newValues, result: p.result,
    } })),
  };

  async function cleanup() {
    await prisma.auditLog.deleteMany({ where: { userId: ids.actor } });
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
    service = new PriceImportService(prisma as never, { isListasAdmin: () => true } as never, audit as never, { grantsForUser: async () => [] } as never);
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

    it('persists the large-change percent and flag, clamping an extreme ratio to DECIMAL(9,2)', async () => {
      const tariff = await prisma.priceList.findUniqueOrThrow({ where: { code: 'ORO_IVA' } });
      await prisma.price.create({ data: { productId: ids.pA, priceListId: tariff.id, value: 1, listaId: ids.listaA } });
      const header = await service.saveRevision(workbook([[`${TAG}-IDS-E04HQHI-D`, 99999999]]), 'key-b2db-0002', ctx);
      const [price] = await prisma.priceImportRevisionPrice.findMany({ where: { revisionId: header.id } });
      expect(price.changePercent?.toFixed(2)).toBe('9999999.99');
      expect(price).toMatchObject({ largeChange: true, productId: ids.pA, previousValue: '1' });
      const normal = await service.saveRevision(workbook([[`${TAG}-IDS-E04HQHI-D`, 1]]), 'key-b2db-0003', ctx);
      const [same] = await prisma.priceImportRevisionPrice.findMany({ where: { revisionId: normal.id } });
      expect(same).toMatchObject({ largeChange: false, change: 'unchanged' });
    });
  });

  describe('apply (atomic, concurrent)', () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let keySeq = 0;
    const key = () => `key-b2db-apply-${String(++keySeq).padStart(4, '0')}`;
    const skuA = `${TAG}-IDS-E04HQHI-D`;

    async function reset(prices: Record<string, number | null>) {
      const tariff = await prisma.priceList.findUniqueOrThrow({ where: { code: 'ORO_IVA' } });
      await prisma.price.deleteMany({ where: { productId: { in: [ids.pA, ids.pB, ids.pFree] } } });
      await prisma.productChange.deleteMany({ where: { sku: { startsWith: TAG } } });
      await prisma.product.update({ where: { id: ids.pA }, data: { listaId: ids.listaA } });
      for (const [productId, value] of Object.entries(prices)) {
        if (value !== null) await prisma.price.create({ data: { productId, priceListId: tariff.id, value, listaId: productId === ids.pFree ? null : productId === ids.pA ? ids.listaA : ids.listaB } });
      }
      audit.logTx.mockClear();
      return tariff.id;
    }
    const priceValue = async (productId: string) => (await prisma.price.findFirst({ where: { productId } }))?.value.toFixed(0);

    it('applies a mixed file for real: Price, one ProductChange per price and the audit entry commit together', async () => {
      await reset({ [ids.pA]: 90, [ids.pB]: 500 });
      const header = await service.saveRevision(workbook([[skuA, 100], [`${TAG}-X-1`, 600], [`${TAG}FREE 01`, 300], ['B2DB-UNKNOWN', 5]]), key(), ctx);
      const result = await service.applyRevision(header.id, ctx, { acknowledgeRejectedRows: 1 });
      expect(result).toMatchObject({ appliedRows: 3, appliedPrices: 3, rejectedRows: 1, alreadyApplied: false });
      expect(await priceValue(ids.pA)).toBe('100');
      expect(await priceValue(ids.pB)).toBe('600');
      const free = await prisma.price.findFirstOrThrow({ where: { productId: ids.pFree } });
      expect(free.listaId).toBeNull();
      expect(free.value.toFixed(0)).toBe('300');
      const changes = await prisma.productChange.findMany({ where: { sourceRef: header.id }, orderBy: { productId: 'asc' } });
      expect(changes.map((c) => [c.productId, c.field, c.oldValue, c.newValue, c.source, c.actorId])).toEqual(expect.arrayContaining([
        [ids.pA, 'price:ORO_IVA', '90', '100', 'PRICE_IMPORT', ids.actor],
        [ids.pB, 'price:ORO_IVA', '500', '600', 'PRICE_IMPORT', ids.actor],
        [ids.pFree, 'price:ORO_IVA', null, '300', 'PRICE_IMPORT', ids.actor],
      ]));
      expect(new Set(changes.map((c) => c.batchId)).size).toBe(1);
      const stored = await prisma.priceImportRevision.findUniqueOrThrow({ where: { id: header.id } });
      expect(stored).toMatchObject({ status: 'APLICADA', appliedById: ids.actor });
      expect((stored.appliedResult as any).perLista).toHaveLength(3);
      const auditRows = await prisma.auditLog.findMany({ where: { entityId: header.id, action: 'price-import-apply' } });
      expect(auditRows).toHaveLength(1);
    });

    it('rolls everything back, including the revision claim, when the audit write fails', async () => {
      await reset({ [ids.pA]: 90, [ids.pB]: 500 });
      const header = await service.saveRevision(workbook([[skuA, 100], [`${TAG}-X-1`, 600]]), key(), ctx);
      audit.logTx.mockRejectedValueOnce(new Error('audit down'));
      await expect(service.applyRevision(header.id, ctx)).rejects.toThrow('audit down');
      expect(await priceValue(ids.pA)).toBe('90');
      expect(await priceValue(ids.pB)).toBe('500');
      expect(await prisma.productChange.count({ where: { sourceRef: header.id } })).toBe(0);
      expect((await prisma.priceImportRevision.findUniqueOrThrow({ where: { id: header.id } })).status).toBe('GUARDADA');
      await expect(service.applyRevision(header.id, ctx)).resolves.toMatchObject({ appliedPrices: 2 });
    });

    it('concurrent double apply writes once and both callers get the same stored result', async () => {
      await reset({ [ids.pA]: 90, [ids.pB]: 500 });
      const header = await service.saveRevision(workbook([[skuA, 100], [`${TAG}-X-1`, 600]]), key(), ctx);
      const [one, two] = await Promise.all([service.applyRevision(header.id, ctx), service.applyRevision(header.id, ctx)]);
      expect([one.alreadyApplied, two.alreadyApplied].sort()).toEqual([false, true]);
      expect(one.batchId).toBe(two.batchId);
      expect(await prisma.productChange.count({ where: { sourceRef: header.id } })).toBe(2);
      expect(await prisma.auditLog.count({ where: { entityId: header.id, action: 'price-import-apply' } })).toBe(1);
      expect(await priceValue(ids.pA)).toBe('100');
    });

    it('FOR UPDATE serializes the apply against a concurrent lista change: MEMBERSHIP_CHANGED, nothing written', async () => {
      await reset({ [ids.pA]: 90, [ids.pB]: 500 });
      const header = await service.saveRevision(workbook([[skuA, 100], [`${TAG}-X-1`, 600]]), key(), ctx);
      let release!: () => void;
      let held!: () => void;
      const hold = new Promise<void>((resolve) => { release = resolve; });
      const holding = new Promise<void>((resolve) => { held = resolve; });
      const mover = prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id: ids.pA }, data: { listaId: ids.listaB } });
        held();
        await hold;
      }, { timeout: 30000 });
      await holding;
      const spy = jest.spyOn(prisma, '$transaction');
      const applying = service.applyRevision(header.id, ctx).then(() => null, (error: unknown) => error);
      await sleep(600);
      release();
      await mover;
      const error = (await applying) as ConflictException;
      expect(error).toBeInstanceOf(ConflictException);
      expect((error.getResponse() as any).conflicts[0]).toMatchObject({ code: 'MEMBERSHIP_CHANGED', sku: skuA });
      expect(await priceValue(ids.pA)).toBe('90');
      expect(await priceValue(ids.pB)).toBe('500');
      expect(await prisma.productChange.count({ where: { sourceRef: header.id } })).toBe(0);
      expect((await prisma.priceImportRevision.findUniqueOrThrow({ where: { id: header.id } })).status).toBe('GUARDADA');
      // The blocked apply hit a serialization failure and retried against the new lista.
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
      spy.mockRestore();
      await prisma.product.update({ where: { id: ids.pA }, data: { listaId: ids.listaA } });
    });

    it('recognizes the real serialization failure raised by two conflicting Serializable transactions (P2034 mapping)', async () => {
      await reset({ [ids.pA]: 90 });
      const options = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 };
      let ready!: () => void;
      const firstRead = new Promise<void>((resolve) => { ready = resolve; });
      let finish!: () => void;
      const mayFinish = new Promise<void>((resolve) => { finish = resolve; });
      const first = prisma.$transaction(async (tx) => {
        await tx.price.findMany({ where: { productId: ids.pA } });
        ready();
        await mayFinish;
        await tx.price.updateMany({ where: { productId: ids.pA }, data: { value: 91 } });
      }, options).then(() => null, (e: unknown) => e);
      await firstRead;
      const second = prisma.$transaction(async (tx) => {
        await tx.price.findMany({ where: { productId: ids.pA } });
        await tx.price.updateMany({ where: { productId: ids.pA }, data: { value: 92 } });
      }, options).then(() => null, (e: unknown) => e);
      await sleep(300);
      finish();
      const errors = (await Promise.all([first, second])).filter(Boolean);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => (service as any).isSerializationFailure(e))).toBe(true);
    });
  });
});
