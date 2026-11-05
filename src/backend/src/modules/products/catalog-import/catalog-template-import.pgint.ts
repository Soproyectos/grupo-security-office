/**
 * Integration test of the template catalog import (preview -> mapping -> apply -> history) against a REAL, DISPOSABLE PostgreSQL.
 * Not picked up by `npm test`:
 *   npx jest catalog-template-import --runInBand --testRegex='.*\.pgint\.ts$'
 * Only talks to 127.0.0.1:55433 (user pgtest). Creates its own database mt_i1_<random>, SYNTHETIC rows only, drops it at the end.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { buildCatalogTemplate, TemplateDictionary, PrismaCatalogSnapshotReader } from './template';
import { CatalogTemplateApplyService } from './catalog-template-apply.service';
import { CatalogTemplateImportService } from './catalog-template-import.service';
import { ProductSpecValuesService } from '../../library-specs/product-spec-values.service';

const HOST = '127.0.0.1'; const PORT = '55433'; const USER = 'pgtest';
const DB_NAME = `mt_i1_${randomBytes(5).toString('hex')}`;
const ADMIN_URL = `postgresql://${USER}@${HOST}:${PORT}/postgres`;
const TARGET_URL = `postgresql://${USER}@${HOST}:${PORT}/${DB_NAME}?schema=public`;
for (const raw of [ADMIN_URL, TARGET_URL]) {
  const u = new URL(raw);
  if (u.hostname !== HOST || u.port !== PORT || u.username !== USER) throw new Error('Refusing to run: not the disposable server.');
}

describe('template catalog import against disposable PostgreSQL', () => {
  jest.setTimeout(900_000);
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let prisma: PrismaClient;
  let service: CatalogTemplateImportService;
  let applier: CatalogTemplateApplyService;
  let dictionary: TemplateDictionary;
  const actor = { id: 'user-1', name: 'Tester', roles: ['Super Admin'] };
  const ids: Record<string, string> = {};

  const book = (rows: Parameters<typeof buildCatalogTemplate>[1]) => buildCatalogTemplate(dictionary, rows);
  /** preview + execute + wait; returns the results by sku. */
  async function run(rows: Parameters<typeof buildCatalogTemplate>[1], confirm?: string[]) {
    const preview = await service.preview(book(rows), 'lote.xlsx', actor);
    const started = await service.execute(preview.previewId, confirm, actor);
    await service.waitForBatch(started.batchId);
    const done = await service.progress(started.batchId);
    const { rows: results } = await service.results(started.batchId);
    return { preview, batchId: started.batchId, done, results, by: (sku: string) => results.find((r) => r.sku === sku.toUpperCase().replace(/\s+/g, ''))! };
  }

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}"`);
    execSync('npx prisma migrate deploy', { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: TARGET_URL }, stdio: 'pipe' });
    prisma = new PrismaClient({ datasources: { db: { url: TARGET_URL } } });
    await prisma.$connect();
    const video = await prisma.category.create({ data: { name: 'Video', slug: 'video' } });
    const sub = await prisma.subcategory.create({ data: { categoryId: video.id, name: 'Camaras IP', slug: 'camaras-ip' } });
    const brand = await prisma.brand.create({ data: { name: 'Marca Sintetica', slug: 'marca-sintetica' } });
    const channels = await prisma.specDefinition.create({ data: { key: 'channels', label: 'Canales', dataType: 'NUMBER', unit: 'canales' } });
    const poe = await prisma.specDefinition.create({ data: { key: 'poe', label: 'PoE', dataType: 'BOOLEAN' } });
    for (const [i, def] of [channels, poe].entries()) await prisma.subcategorySpec.create({ data: { subcategoryId: sub.id, specDefinitionId: def.id, status: 'APPROVED', sortOrder: i, approvedById: 'synthetic', approvedAt: new Date() } });
    Object.assign(ids, { video: video.id, sub: sub.id, brand: brand.id });
    const library = {
      client: prisma, config: { mode: 'legacy' }, assertWritesAllowed: jest.fn(),
      writeTransaction: <T>(fn: (tx: PrismaClient) => Promise<T>, options?: object) => prisma.$transaction((tx) => fn(tx as unknown as PrismaClient), { timeout: 60_000, ...(options as object) }),
    };
    const audit = { append: jest.fn() };
    applier = new CatalogTemplateApplyService(library as never, audit as never, new ProductSpecValuesService(prisma as never));
    service = new CatalogTemplateImportService(library as never, applier, audit as never);
    dictionary = await new PrismaCatalogSnapshotReader(prisma).readDictionary();
  });

  afterAll(async () => {
    try { await prisma?.$disconnect(); } finally {
      try { await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`); } finally { await admin.$disconnect(); }
    }
  });

  it('creates a reference-only product as a hidden draft, then completes it with a second import and is idempotent', async () => {
    const masters = { brands: await prisma.brand.count(), categories: await prisma.category.count(), subs: await prisma.subcategory.count(), defs: await prisma.specDefinition.count() };
    const first = await run({ products: [['syn-100', 'Camara parcial', '', '', '', '']] });
    expect(first.done.state).toBe('COMPLETED');
    expect(first.by('SYN-100')).toMatchObject({ status: 'CREATED', code: 'CREATED_DRAFT' });
    const created = await prisma.product.findFirstOrThrow({ where: { sku: 'syn-100' } });
    expect(created).toMatchObject({ lifecycleStatus: 'DRAFT', isActive: false, isVisible: false, brandId: null, subcategoryId: null, sheetVersion: 0 });
    expect(await prisma.productChange.count({ where: { productId: created.id, sourceRef: first.batchId, source: 'PRODUCT_IMPORT' } })).toBeGreaterThan(0);

    const full = {
      products: [['SYN-100', 'Camara parcial', 'Marca Sintetica', 'Camaras IP', 'Video', 'Descripcion completa']],
      mainData: [['SYN-100', 'Canales', 'Conocido', 0], ['SYN-100', 'PoE', 'Conocido', 'No']],
      specs: [['SYN-100', 'Video', 'Compresion', 'H.265', 0]],
      highlights: [['SYN-100', 'Destacado', 'Alta definicion', 0], ['SYN-100', 'Caracteristica', 'Vision nocturna', 1], ['SYN-100', 'Insignia', 'PoE', 2]],
      resources: [['SYN-100', 'Documento', 'Ficha', 'https://ejemplo.invalid/ficha.pdf', 0], ['SYN-100', 'Imagen', 'Frente', 'https://ejemplo.invalid/frente.jpg', 1], ['SYN-100', 'Firmware', 'FW 1', 'https://ejemplo.invalid/fw.bin', 2]],
    };
    const second = await run(full);
    expect(second.by('SYN-100')).toMatchObject({ status: 'UPDATED' });
    const product = await prisma.product.findFirstOrThrow({ where: { id: created.id }, include: { catalogSpecGroups: { include: { items: true } }, catalogResources: true } });
    expect(product).toMatchObject({ brandId: ids.brand, subcategoryId: ids.sub, categoryId: ids.video, description: 'Descripcion completa', lifecycleStatus: 'DRAFT', isActive: false, sheetVersion: 0, catalogName: null });
    expect(product.catalogHighlights).toEqual(['Alta definicion']);
    expect((product.catalogFeatures as any[]).map((f) => [f.label, f.icon])).toEqual([['Vision nocturna', 'shield']]);
    expect(product.catalogBadges).toEqual(['PoE']);
    expect(product.catalogSpecGroups.flatMap((g) => g.items.map((i) => i.label))).toEqual(['Compresion']);
    expect(product.catalogResources.map((r) => [r.kind, r.language]).sort()).toEqual([['DATASHEET', 'es'], ['FIRMWARE', 'es']]);
    expect(await prisma.productImage.count({ where: { productId: created.id } })).toBe(1);
    // zero and false are real values (not "empty"); they are written in the WORKING stage only
    const values = await prisma.productSpecValue.findMany({ where: { productId: created.id }, include: { definition: true } });
    expect(values.every((v) => v.stage === 'WORKING')).toBe(true);
    expect(Object.fromEntries(values.map((v) => [v.definition.key, [v.state, v.valueNumber === null ? null : Number(v.valueNumber), v.valueBoolean]]))).toEqual({ channels: ['KNOWN', 0, null], poe: ['KNOWN', null, false] });

    // same file again: everything UNCHANGED, nothing written, no duplicates
    const changesBefore = await prisma.productChange.count();
    const third = await run(full);
    expect(third.by('SYN-100')).toMatchObject({ status: 'UNCHANGED' });
    expect(third.done.counts).toMatchObject({ UNCHANGED: 1, CREATED: 0, UPDATED: 0 });
    expect(await prisma.productChange.count()).toBe(changesBefore);
    expect(await prisma.productCatalogResource.count({ where: { productId: created.id } })).toBe(2);
    expect({ brands: await prisma.brand.count(), categories: await prisma.category.count(), subs: await prisma.subcategory.count(), defs: await prisma.specDefinition.count() }).toEqual(masters);
  });

  it('keeps an unknown brand as source text only after confirmation, and a mapping decision resolves it to an existing master', async () => {
    const rows = { products: [['SYN-200', 'Producto con marca nueva', 'Marca Desconocida', 'Camaras IP', 'Video', '']] };
    const preview = await service.preview(book(rows), 'marca.xlsx', actor);
    expect(preview.mappingIncidents).toEqual([expect.objectContaining({ kind: 'brand', sourceText: 'Marca Desconocida', skus: ['SYN-200'] })]);
    expect(preview.summary.needsConfirmation).toBe(1);

    // not confirmed -> not created
    const skipped = await service.execute(preview.previewId, [], actor);
    await service.waitForBatch(skipped.batchId);
    expect((await service.progress(skipped.batchId)).counts).toMatchObject({ NEEDS_CONFIRMATION: 1, CREATED: 0 });
    expect(await prisma.product.count({ where: { sku: 'SYN-200' } })).toBe(0);

    // map the text to the existing brand -> no incident, product created with it
    const again = await service.preview(book(rows), 'marca.xlsx', actor);
    const mapped = await service.resolveMapping(again.previewId, [{ kind: 'brand', sourceText: 'Marca Desconocida', targetId: ids.brand }], actor);
    expect(mapped.mappingIncidents).toEqual([]);
    await expect(service.resolveMapping(again.previewId, [{ kind: 'brand', sourceText: 'x', targetId: 'no-such-id' }], actor)).rejects.toMatchObject({ response: { code: 'MAPPING_TARGET_UNKNOWN' } });
    const started = await service.execute(again.previewId, [], actor);
    await service.waitForBatch(started.batchId);
    expect(await prisma.product.findFirstOrThrow({ where: { sku: 'SYN-200' } })).toMatchObject({ brandId: ids.brand });

    // confirmed creation without a master keeps the text with the product
    const third = await service.preview(book({ products: [['SYN-201', 'Sin marca maestra', 'Marca Fantasma', '', '', '']] }), 'fantasma.xlsx', actor);
    const confirmed = await service.execute(third.previewId, ['syn-201'], actor);
    await service.waitForBatch(confirmed.batchId);
    const p = await prisma.product.findFirstOrThrow({ where: { sku: 'SYN-201' } });
    expect(p.brandId).toBeNull();
    expect(await prisma.productSource.findFirstOrThrow({ where: { productId: p.id } })).toMatchObject({ originalBrandLabel: 'Marca Fantasma', classificationCriterion: 'catalog-template:unresolved-mapping' });
  });

  it('never writes a protected product (locked name / edited sheet / published) and keeps its public state', async () => {
    const locked = await prisma.product.create({ data: { sku: 'SYN-300', name: 'Nombre fijo', nameLockedAt: new Date(), description: 'Original' } });
    const published = await prisma.product.create({ data: { sku: 'SYN-301', name: 'Publicado', lifecycleStatus: 'PUBLISHED', publishedAt: new Date(), isActive: true, isVisible: true, catalogPublished: true, catalogSlug: 'publicado' } });
    const edited = await prisma.product.create({ data: { sku: 'SYN-302', name: 'Editado', sheetVersion: 3 } });
    const result = await run({
      products: [['SYN-300', 'Otro nombre', 'Marca Sintetica', '', '', 'Descripcion nueva'], ['SYN-301', 'Publicado', 'Marca Sintetica', 'Camaras IP', 'Video', 'Texto nuevo'], ['SYN-302', 'Editado', 'Marca Sintetica', '', '', 'Algo']],
      highlights: [['SYN-301', 'Destacado', 'Nuevo destacado', 0]],
    });
    for (const sku of ['SYN-300', 'SYN-301', 'SYN-302']) expect(result.by(sku)).toMatchObject({ status: 'PROPOSED', code: 'PROPOSED_PROTECTED' });
    expect(result.by('SYN-300').proposals.map((p) => p.field).sort()).toEqual(['brand', 'description', 'name']);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: locked.id } })).toMatchObject({ name: 'Nombre fijo', description: 'Original', brandId: null });
    const pub = await prisma.product.findUniqueOrThrow({ where: { id: published.id } });
    expect(pub).toMatchObject({ lifecycleStatus: 'PUBLISHED', catalogPublished: true, isVisible: true, isActive: true, description: null, catalogHighlights: [], subcategoryId: null });
    expect(pub.updatedAt.getTime()).toBe(published.updatedAt.getTime());
    expect(await prisma.productChange.count({ where: { productId: { in: [locked.id, published.id, edited.id] } } })).toBe(0);
  });

  it('detects products changed after the preview and skips them (never overwrites)', async () => {
    const product = await prisma.product.create({ data: { sku: 'SYN-400', name: 'Producto estable' } });
    const rows = { products: [['SYN-400', 'Producto estable', 'Marca Sintetica', '', '', 'Descripcion del archivo'], ['SYN-401', 'Nuevo normal', '', '', '', '']] };
    const preview = await service.preview(book(rows), 'obsoleta.xlsx', actor);
    expect(preview.updates.map((r) => r.sku)).toEqual(['SYN-400']);
    await prisma.product.update({ where: { id: product.id }, data: { description: 'Escrita por una persona' } }); // someone edits meanwhile
    const started = await service.execute(preview.previewId, [], actor);
    await service.waitForBatch(started.batchId);
    const { rows: results } = await service.results(started.batchId);
    expect(results.find((r) => r.sku === 'SYN-400')).toMatchObject({ status: 'STALE', code: 'PLAN_CHANGED' });
    expect(results.find((r) => r.sku === 'SYN-401')).toMatchObject({ status: 'CREATED' });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({ description: 'Escrita por una persona', brandId: null });
    expect((await service.progress(started.batchId)).state).toBe('COMPLETED_WITH_ERRORS');
  });

  it('keeps durable history and downloadable results', async () => {
    const result = await run({ products: [['SYN-500', 'Historial', '', '', '', '']] });
    const list = await service.listBatches(1, 50);
    expect(list.items.map((b) => b.batchId)).toContain(result.batchId);
    expect(list.items[0]).toMatchObject({ userId: 'user-1', userName: 'Tester', fileName: 'lote.xlsx', templateVersion: 'catalogo-v1' });
    const view = await service.resultsView(result.batchId);
    expect(view.rows[0]).toMatchObject({ sku: 'SYN-500', status: 'CREATED' });
    const xlsx = await service.resultsFile(result.batchId, 'xlsx');
    expect(XLSX.read(xlsx.buffer, { type: 'buffer' }).SheetNames).toEqual(['Resultados', 'Resumen']);
    const csv = (await service.resultsFile(result.batchId, 'csv')).buffer.toString('utf8');
    expect(csv).toContain('SYN-500');
    await expect(service.progress('no-existe')).rejects.toMatchObject({ response: { code: 'CATALOG_TEMPLATE_BATCH_NOT_FOUND' } });
    // the same preview is applied once
    const preview = await service.preview(book({ products: [['SYN-501', 'Una vez', '', '', '', '']] }), 'una-vez.xlsx', actor);
    const a = await service.execute(preview.previewId, [], actor);
    const b = await service.execute(preview.previewId, [], actor);
    await service.waitForBatch(a.batchId);
    expect(b.batchId).toBe(a.batchId);
    expect(await prisma.product.count({ where: { sku: 'SYN-501' } })).toBe(1);
  });

  it('applies 600 products in bounded batches; a transient failure is retried and a permanent one is reported, with no duplicates', async () => {
    const skus = Array.from({ length: 600 }, (_, i) => `BULK-${String(i + 1).padStart(4, '0')}`);
    const rows = { products: skus.map((sku) => [sku, `Producto ${sku}`, 'Marca Sintetica', 'Camaras IP', 'Video', '']) };
    const original = (applier as any).createProduct.bind(applier);
    const calls = new Map<string, number>();
    const spy = jest.spyOn(applier as any, 'createProduct').mockImplementation(async (input: any, progress: any) => {
      const sku = input.row.sku as string;
      calls.set(sku, (calls.get(sku) ?? 0) + 1);
      if (sku === 'BULK-0300' && calls.get(sku) === 1) throw new Error('simulated transient failure');
      if (sku === 'BULK-0450') throw new Error('simulated permanent failure');
      return original(input, progress);
    });
    const first = await run(rows);
    spy.mockRestore();
    expect(first.done).toMatchObject({ state: 'COMPLETED_WITH_ERRORS', total: 600, processed: 600 });
    expect(first.done.counts).toMatchObject({ CREATED: 599, FAILED: 1 });
    expect(first.by('BULK-0300')).toMatchObject({ status: 'CREATED', attempts: 2 });
    expect(first.by('BULK-0450')).toMatchObject({ status: 'FAILED', code: 'APPLY_FAILED', attempts: 3 });
    expect(await prisma.product.count({ where: { sku: { startsWith: 'BULK-' } } })).toBe(599);

    // re-importing the same file creates only the missing one; nothing is duplicated
    const second = await run(rows);
    expect(second.done.counts).toMatchObject({ CREATED: 1, UNCHANGED: 599 });
    expect(await prisma.product.count({ where: { sku: { startsWith: 'BULK-' } } })).toBe(600);
    const duplicated = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM (SELECT upper(sku) FROM products WHERE sku LIKE 'BULK-%' GROUP BY 1 HAVING count(*) > 1) d`;
    expect(Number(duplicated[0].n)).toBe(0);
  });
});
