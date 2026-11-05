/**
 * Scale + resilience of the template catalog import against a REAL, DISPOSABLE PostgreSQL.
 * Not picked up by `npm test`:
 *   npx jest catalog-template-scale --runInBand --testRegex='.*\.pgint\.ts$'
 * Creates its own database mt_v_scale_<hex>, SYNTHETIC rows only, drops it at the end. Prints a METRICS table (and writes it to
 * $CATALOG_SCALE_METRICS_OUT when set).
 */
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { buildCatalogTemplate, LIMITS, parseCatalogTemplate, PrismaCatalogSnapshotReader, TemplateDictionary } from './template';
import { CatalogTemplateApplyService } from './catalog-template-apply.service';
import { CatalogTemplateImportService } from './catalog-template-import.service';
import { ProductSpecValuesService } from '../../library-specs/product-spec-values.service';
import { bulkRows, createMigratedDb, disposableDb, dropDb, fakeLibrary, masterCounts, productTables, seedMasters, writeFingerprint } from './catalog-import.pgint-support';

const DB = disposableDb('scale');
const SCALE = LIMITS.maxProducts; // 5000 = the importer's own limit
const METRICS: Record<string, unknown> = { products: SCALE };
const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
const ms = (t0: bigint) => Math.round(Number(process.hrtime.bigint() - t0) / 1e6);

/** Samples rss/heap while an async phase runs; `maxRSS` (process lifetime peak) is reported too. */
async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number; peakRssMb: number; peakHeapMb: number }> {
  let peakRss = 0; let peakHeap = 0;
  const sample = () => { const m = process.memoryUsage(); peakRss = Math.max(peakRss, m.rss); peakHeap = Math.max(peakHeap, m.heapUsed); };
  sample();
  const timer = setInterval(sample, 20);
  const t0 = process.hrtime.bigint();
  try {
    const result = await fn();
    const elapsed = ms(t0);
    const peaks = { peakRssMb: mb(Math.max(peakRss, process.memoryUsage().rss)), peakHeapMb: mb(Math.max(peakHeap, process.memoryUsage().heapUsed)) };
    // With `node --expose-gc` the heap still retained after a forced collection is reported (the sampled peak includes garbage).
    METRICS.retainedHeapMbAfterPhases = (METRICS.retainedHeapMbAfterPhases as number[] | undefined) ?? [];
    if (typeof (global as any).gc === 'function') { (global as any).gc(); (METRICS.retainedHeapMbAfterPhases as number[]).push(mb(process.memoryUsage().heapUsed)); }
    return { result, ms: elapsed, ...peaks };
  } finally { clearInterval(timer); }
}

describe('template catalog import at scale against disposable PostgreSQL', () => {
  jest.setTimeout(1_800_000);
  const admin = new PrismaClient({ datasources: { db: { url: DB.adminUrl } } });
  let prisma: PrismaClient;
  let service: CatalogTemplateImportService;
  let applier: CatalogTemplateApplyService;
  let dictionary: TemplateDictionary;
  let injectFailures = false; let txCalls = 0; let injected = 0;
  const actor = { id: 'user-1', name: 'Tester', roles: ['Super Admin'] };

  const makeService = () => {
    const library = fakeLibrary(prisma, {
      beforeTransaction: () => {
        if (!injectFailures) return;
        txCalls++;
        if (txCalls > 1 && txCalls % 37 === 0 && injected < 25) { injected++; throw new Error('simulated transient database failure'); }
      },
    });
    const audit = { append: jest.fn() };
    const a = new CatalogTemplateApplyService(library as never, audit as never, new ProductSpecValuesService(prisma as never));
    return { a, s: new CatalogTemplateImportService(library as never, a, audit as never) };
  };
  const book = (rows: ReturnType<typeof bulkRows>) => buildCatalogTemplate(dictionary, rows);

  beforeAll(async () => {
    await createMigratedDb(DB, admin);
    prisma = new PrismaClient({ datasources: { db: { url: DB.url } } });
    await prisma.$connect();
    await seedMasters(prisma);
    ({ a: applier, s: service } = makeService());
    dictionary = await new PrismaCatalogSnapshotReader(prisma).readDictionary();
  });

  afterAll(async () => {
    // eslint-disable-next-line no-console
    console.log(`METRICS ${JSON.stringify(METRICS, null, 1)}`);
    if (process.env.CATALOG_SCALE_METRICS_OUT) writeFileSync(process.env.CATALOG_SCALE_METRICS_OUT, JSON.stringify(METRICS, null, 1));
    try { await prisma?.$disconnect(); } finally { try { await dropDb(DB, admin); } finally { await admin.$disconnect(); } }
  });

  it(`imports ${SCALE} products: parse, preview, execute, bounded state, monotonic progress, then an unchanged re-import writes nothing`, async () => {
    const rows = bulkRows('SC', SCALE);
    const buildT = process.hrtime.bigint();
    const file = book(rows);
    METRICS.fileBuildMs = ms(buildT); METRICS.fileMb = mb(file.length); METRICS.rowsInFile = rows.expected.rowsInFile;
    expect(file.length).toBeLessThan(LIMITS.maxFileBytes);
    const masters = await masterCounts(prisma);

    const parse = await measure(async () => parseCatalogTemplate(file));
    expect(parse.result.ok).toBe(true);
    Object.assign(METRICS, { parseMs: parse.ms, parsePeakRssMb: parse.peakRssMb, parsePeakHeapMb: parse.peakHeapMb });

    const preview = await measure(() => service.preview(file, 'escala.xlsx', actor));
    Object.assign(METRICS, { previewMs: preview.ms, previewPeakRssMb: preview.peakRssMb, previewPeakHeapMb: preview.peakHeapMb });
    expect(preview.result.summary).toMatchObject({ create: SCALE, invalid: 0 });
    const stored = await prisma.$queryRawUnsafe<Array<{ bytes: number; chars: number }>>(`SELECT pg_column_size(data)::int AS bytes, length(data::text) AS chars FROM import_sessions WHERE id = '${preview.result.previewId}'`);
    METRICS.previewStateJsonMb = mb(stored[0].chars); METRICS.previewStateStoredMb = mb(stored[0].bytes);
    METRICS.previewResponseJsonMb = mb(JSON.stringify(preview.result).length);
    expect(stored[0].chars).toBeLessThan(50 * 1024 * 1024);

    // execute + poll: progress must be monotonic and reach 100
    const seen: number[] = []; let lastState = '';
    const exec = await measure(async () => {
      const started = await service.execute(preview.result.previewId, [], actor);
      const poll = setInterval(() => { void service.progress(started.batchId).then((p) => { seen.push(p.processed); lastState = p.state; }).catch(() => undefined); }, 500);
      try { await service.waitForBatch(started.batchId); } finally { clearInterval(poll); }
      return started;
    });
    const batchId = exec.result.batchId;
    const done = await service.progress(batchId);
    Object.assign(METRICS, { executeMs: exec.ms, executePeakRssMb: exec.peakRssMb, executePeakHeapMb: exec.peakHeapMb, productsPerSecond: Math.round((SCALE / exec.ms) * 1000), progressSamples: seen.length, processRssMaxMb: mb(process.resourceUsage().maxRSS * 1024) });
    expect(done).toMatchObject({ state: 'COMPLETED', total: SCALE, processed: SCALE, percent: 100 });
    expect(done.counts.CREATED).toBe(SCALE);
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1])).toBe(true);
    expect(seen.length).toBeGreaterThan(1);
    expect(lastState).not.toBe('');
    const batchRows = await prisma.$queryRawUnsafe<Array<{ chars: number; n: number; maxchunk: number }>>(
      `SELECT sum(length(data::text))::int AS chars, count(*)::int AS n, max(length(data::text))::int AS maxchunk FROM import_sessions WHERE id = '${batchId}' OR id LIKE '${batchId}:r:%'`);
    Object.assign(METRICS, { resultRowsInImportSession: batchRows[0].n, resultStateTotalMb: mb(batchRows[0].chars), largestResultChunkKb: Math.round(batchRows[0].maxchunk / 1024) });

    const tables = await productTables(prisma);
    Object.assign(METRICS, { dbRows: tables });
    expect(tables).toMatchObject({ products: SCALE, specValues: rows.expected.specValues, specItems: rows.expected.specItems, specGroups: rows.expected.specGroups, resources: rows.expected.resources, images: rows.expected.images });
    expect(await masterCounts(prisma)).toEqual(masters); // no brand/category/subcategory/definition/molde/tariff/price created
    const dup = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM (SELECT upper(sku) FROM products GROUP BY 1 HAVING count(*) > 1) d`);
    expect(Number(dup[0].n)).toBe(0);
    expect(await prisma.product.count({ where: { OR: [{ isActive: true }, { isVisible: true }, { lifecycleStatus: { not: 'DRAFT' } }] } })).toBe(0);

    // results are readable in full
    const view = await measure(() => service.results(batchId));
    METRICS.resultsReadMs = view.ms;
    expect(view.result.rows).toHaveLength(SCALE);

    // same file again: preview plan says UNCHANGED for all, execution writes nothing
    const before = { tables: await productTables(prisma), print: await writeFingerprint(prisma) };
    const again = await measure(async () => {
      const p = await service.preview(file, 'escala.xlsx', actor);
      const s = await service.execute(p.previewId, [], actor);
      await service.waitForBatch(s.batchId);
      return { p, s, done: await service.progress(s.batchId) };
    });
    Object.assign(METRICS, { reimportUnchangedMs: again.ms, reimportPeakRssMb: again.peakRssMb });
    expect(again.result.p.summary).toMatchObject({ unchanged: SCALE, create: 0, update: 0 });
    expect(again.result.done).toMatchObject({ state: 'COMPLETED', total: SCALE });
    expect(again.result.done.counts).toMatchObject({ UNCHANGED: SCALE, CREATED: 0, UPDATED: 0, FAILED: 0 });
    expect(await productTables(prisma)).toEqual(before.tables); // incl. product_changes
    expect(await writeFingerprint(prisma)).toBe(before.print); // no updatedAt moved
  });

  it('process death mid-batch: batch turns FAILED after the inactivity rule; re-importing the same file completes ONLY what is missing', async () => {
    const N = 1500; const DIE_AT = 400;
    const rows = bulkRows('KD', N);
    const file = book(rows);
    const baseline = await productTables(prisma);

    // the first "process": its 400th key-data write never finishes (the process died in the middle of that product)
    const original = (applier as any).writeKeyData.bind(applier);
    let calls = 0;
    const spy = jest.spyOn(applier as any, 'writeKeyData').mockImplementation(((input: any, progress: any) => {
      calls++;
      if (calls === DIE_AT) return new Promise(() => undefined);
      return original(input, progress);
    }) as never);
    const preview = await service.preview(file, 'muerte.xlsx', actor);
    const started = await service.execute(preview.previewId, [], actor);
    for (let i = 0; i < 600 && calls < DIE_AT; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 1500));
    spy.mockRestore();
    expect(calls).toBe(DIE_AT);
    const half = await productTables(prisma);
    expect(half.products - baseline.products).toBe(DIE_AT); // created so far, incl. the half-written one
    expect(half.products - baseline.products).toBeLessThan(N);

    // "new process": a fresh service has no runner for the batch. Fresh activity -> still PROCESSING.
    const restarted = makeService().s;
    expect((await restarted.progress(started.batchId)).state).toBe('PROCESSING');
    const partial = await restarted.progress(started.batchId);
    expect(partial.processed).toBeLessThan(N);
    expect(partial.processed).toBeGreaterThan(0);
    // inactivity rule: nobody touched the batch for more than 10 minutes
    await prisma.$executeRawUnsafe(`UPDATE import_sessions SET "updatedAt" = now() - interval '11 minutes' WHERE id = '${started.batchId}'`);
    const failed = await restarted.progress(started.batchId);
    expect(failed.state).toBe('FAILED');
    expect((await restarted.progress(started.batchId)).state).toBe('FAILED'); // stays closed, idempotent
    METRICS.interruptedProcessedBeforeDeath = partial.processed;

    // re-import of the same file: completes the missing ones only
    const res = await measure(async () => {
      const p = await restarted.preview(file, 'muerte.xlsx', actor);
      const s = await restarted.execute(p.previewId, [], actor);
      await restarted.waitForBatch(s.batchId);
      return { p, done: await restarted.progress(s.batchId) };
    });
    METRICS.interruptedResumeMs = res.ms;
    expect(res.result.done.state).toBe('COMPLETED');
    expect(res.result.done.counts.CREATED).toBe(N - DIE_AT);
    expect(res.result.done.counts.UPDATED).toBe(1); // the half-written product only gets its missing key data
    expect(res.result.done.counts.UNCHANGED).toBe(DIE_AT - 1);
    const after = await productTables(prisma);
    expect(after.products - baseline.products).toBe(N);
    expect(after.specValues - baseline.specValues).toBe(rows.expected.specValues);
    expect(after.specItems - baseline.specItems).toBe(rows.expected.specItems);
    expect(after.specGroups - baseline.specGroups).toBe(rows.expected.specGroups);
    expect(after.resources - baseline.resources).toBe(rows.expected.resources);
    expect(after.images - baseline.images).toBe(rows.expected.images);
    const dupChanges = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM (SELECT "productId", field, "sourceRef" FROM product_changes GROUP BY 1,2,3 HAVING count(*) > 1) d`);
    expect(Number(dupChanges[0].n)).toBe(0);
    const dupSku = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM (SELECT upper(sku) FROM products GROUP BY 1 HAVING count(*) > 1) d`);
    expect(Number(dupSku[0].n)).toBe(0);
    const dupItems = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM (SELECT "groupId", label FROM product_catalog_spec_items GROUP BY 1,2 HAVING count(*) > 1) d`);
    expect(Number(dupItems[0].n)).toBe(0);
    const dupRes = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM (SELECT "productId", url FROM product_catalog_resources GROUP BY 1,2 HAVING count(*) > 1) d`);
    expect(Number(dupRes[0].n)).toBe(0);
    // and one more identical import is now a no-op
    const print = await writeFingerprint(prisma);
    const p3 = await restarted.preview(file, 'muerte.xlsx', actor);
    const s3 = await restarted.execute(p3.previewId, [], actor);
    await restarted.waitForBatch(s3.batchId);
    expect((await restarted.progress(s3.batchId)).counts).toMatchObject({ UNCHANGED: N });
    expect(await writeFingerprint(prisma)).toBe(print);
    expect(await productTables(prisma)).toEqual(after);
  });

  it('transient database failures (create, key data, result chunk) are retried: no failed rows, no duplicates', async () => {
    const N = 600;
    const rows = bulkRows('TR', N);
    const file = book(rows);
    const baseline = await productTables(prisma);
    injectFailures = true; txCalls = 0; injected = 0;
    let result: any;
    try {
      const p = await service.preview(file, 'transitorio.xlsx', actor);
      txCalls = 0; // preview does not use writeTransaction; execute's own transaction is call 1 and is never failed
      const s = await service.execute(p.previewId, [], actor);
      await service.waitForBatch(s.batchId);
      result = { done: await service.progress(s.batchId), results: (await service.results(s.batchId)).rows };
    } finally { injectFailures = false; }
    METRICS.transientFailuresInjected = injected;
    expect(injected).toBeGreaterThan(5);
    expect(result.done.counts).toMatchObject({ CREATED: N, FAILED: 0 });
    expect(result.done.state).toBe('COMPLETED');
    expect(result.results.some((r: any) => (r.attempts ?? 1) > 1)).toBe(true);
    const after = await productTables(prisma);
    expect(after.products - baseline.products).toBe(N);
    expect(after.specValues - baseline.specValues).toBe(rows.expected.specValues);
    expect(after.specItems - baseline.specItems).toBe(rows.expected.specItems);
    expect(after.resources - baseline.resources).toBe(rows.expected.resources);
    expect(after.images - baseline.images).toBe(rows.expected.images);
    const dupChanges = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM (SELECT "productId", field, "sourceRef" FROM product_changes GROUP BY 1,2,3 HAVING count(*) > 1) d`);
    expect(Number(dupChanges[0].n)).toBe(0);
    // the counters of the batch equal the rows persisted (a retried chunk is not double counted)
    expect(result.done.processed).toBe(N);
    expect(result.results).toHaveLength(N);
  });
});
