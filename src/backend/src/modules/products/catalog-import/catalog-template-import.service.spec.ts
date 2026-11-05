import 'reflect-metadata';

jest.mock('../../../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { REQUIRED_GRANTS_KEY } from '../../../common/security/require-grant';
import { buildCatalogTemplate, ExistingProduct, PrismaCatalogSnapshotReader, TemplateDictionary } from './template';
import { additionsOfChanges, additionsOfDesired, CatalogTemplateApplyService, RowRejected, RowStale } from './catalog-template-apply.service';
import { applyMappings, CatalogTemplateImportService, rowDigest } from './catalog-template-import.service';
import { CatalogTemplateImportController } from './catalog-template-import.controller';

const dictionary: TemplateDictionary = {
  brands: [{ id: 'b1', name: 'Marca Uno' }],
  categories: [{ id: 'c1', name: 'Video' }, { id: 'c2', name: 'Redes' }],
  subcategories: [
    { id: 's1', categoryId: 'c1', category: 'Video', name: 'Camaras', specs: [] },
    { id: 's2', categoryId: 'c2', category: 'Redes', name: 'Switches', specs: [] },
  ],
};
const actor = { id: 'u1', name: 'Ana', roles: [] as string[] };

function existing(sku: string, extra: Partial<ExistingProduct> = {}): ExistingProduct {
  return {
    id: `id-${sku}`, sku, updatedAt: '2026-10-01T00:00:00.000Z', protectedBy: [], name: `Producto ${sku}`, description: null, brandId: null, categoryId: null, subcategoryId: null,
    mainData: {}, specs: [], highlights: [], features: [], badges: [], resources: [], related: [], ...extra,
  };
}

function setup(products: Record<string, ExistingProduct> = {}) {
  const sessions = new Map<string, any>();
  const db: any = {
    importSession: {
      create: jest.fn(async ({ data }: any) => { sessions.set(data.id, { ...data, createdAt: new Date(), updatedAt: new Date() }); }),
      findUnique: jest.fn(async ({ where }: any) => sessions.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => { sessions.set(where.id, { ...sessions.get(where.id), ...data, updatedAt: new Date() }); }),
      findMany: jest.fn(async ({ where }: any) => (where?.id?.startsWith ? [...sessions.values()].filter((s) => s.id.startsWith(where.id.startsWith)) : [...sessions.values()].filter((s) => s.data.namespace === 'catalog-template-batch'))),
      count: jest.fn(async () => [...sessions.values()].filter((s) => s.data.namespace === 'catalog-template-batch').length),
    },
    $queryRaw: jest.fn(async () => []),
  };
  const library: any = { client: db, config: { mode: 'legacy' }, assertWritesAllowed: jest.fn(), writeTransaction: async (fn: any) => fn(db) };
  const state = { products: new Map(Object.entries(products)) };
  jest.spyOn(PrismaCatalogSnapshotReader.prototype, 'readDictionary').mockImplementation(async () => dictionary);
  jest.spyOn(PrismaCatalogSnapshotReader.prototype, 'readProducts').mockImplementation(async (skus: string[]) => ({ products: new Map([...state.products].filter(([k]) => skus.includes(k))), ambiguous: new Set<string>() }));
  const applier: any = {
    applyRow: jest.fn(async (input: any) => ({ status: input.row.action === 'create' ? 'CREATED' : 'UPDATED', code: 'X', productId: `p-${input.row.sku}`, applied: [{ field: 'description' }], issues: [], attempts: 1 })),
  };
  const audit: any = { append: jest.fn() };
  const service = new CatalogTemplateImportService(library, applier, audit);
  return { service, applier, sessions, state, db };
}

const file = (rows: Parameters<typeof buildCatalogTemplate>[1]) => buildCatalogTemplate(dictionary, rows);

afterEach(() => jest.restoreAllMocks());

describe('CatalogTemplateImportService', () => {
  it('rejects a file that is not the template without storing anything', async () => {
    const { service, sessions } = setup();
    await expect(service.preview(Buffer.from('not an xlsx'), 'x.xlsx', actor)).rejects.toMatchObject({ response: { code: 'CATALOG_TEMPLATE_INVALID' } });
    await expect(service.preview(undefined, 'x.xlsx', actor)).rejects.toMatchObject({ response: { code: 'CATALOG_TEMPLATE_FILE_REQUIRED' } });
    expect(sessions.size).toBe(0);
  });

  it('previews creates / updates / proposals / skipped / errors and creates no master', async () => {
    const { service } = setup({
      'SKU-U': existing('SKU-U'),
      'SKU-P': existing('SKU-P', { protectedBy: ['NAME_LOCKED'], description: 'x' }),
      'SKU-S': existing('SKU-S', { description: 'igual' }),
    });
    const view = await service.preview(file({ products: [['SKU-N', 'Nuevo', '', '', '', ''], ['SKU-U', 'Producto SKU-U', '', '', '', 'Descripcion'], ['SKU-P', 'Otro', '', '', '', 'Otra'], ['SKU-S', 'Producto SKU-S', '', '', '', 'igual'], ['', 'Sin referencia', '', '', '', '']] }), 'a.xlsx', actor);
    expect(view.creates.map((r) => r.sku)).toEqual(['SKU-N']);
    expect(view.updates.map((r) => r.sku)).toEqual(['SKU-U']);
    expect(view.proposals.map((r) => r.sku)).toEqual(['SKU-P']);
    expect(view.skipped.map((r) => r.sku)).toEqual(['SKU-S']);
    expect(view.mastersToCreate).toEqual({ brands: 0, categories: 0, subcategories: 0, specDefinitions: 0 });
    expect(view.options.brands).toEqual(dictionary.brands);
  });

  it('only the owner can read a preview, and an unknown mapping target is refused', async () => {
    const { service } = setup();
    const view = await service.preview(file({ products: [['SKU-N', 'Nuevo', 'Marca X', '', '', '']] }), 'a.xlsx', actor);
    await expect(service.execute(view.previewId, [], { id: 'other' })).rejects.toMatchObject({ response: { code: 'CATALOG_TEMPLATE_PREVIEW_NOT_FOUND' } });
    await expect(service.resolveMapping(view.previewId, [{ kind: 'brand', sourceText: 'Marca X', targetId: 'nope' }], actor)).rejects.toMatchObject({ response: { code: 'MAPPING_TARGET_UNKNOWN' } });
    const mapped = await service.resolveMapping(view.previewId, [{ kind: 'brand', sourceText: 'marca x', targetId: 'b1' }], actor);
    expect(mapped.mappingIncidents).toEqual([]);
    expect(mapped.creates[0].needsConfirmation).toBe(false);
  });

  it('skips STALE rows, holds unresolved new products until confirmed, never applies proposals and applies a preview once', async () => {
    const { service, applier, state } = setup({ 'SKU-U': existing('SKU-U'), 'SKU-P': existing('SKU-P', { protectedBy: ['PUBLISHED'], description: 'x' }) });
    const rows = { products: [['SKU-U', 'Producto SKU-U', '', '', '', 'Descripcion'], ['SKU-P', 'Otro', '', '', '', 'Otra'], ['SKU-N', 'Nuevo', 'Marca X', '', '', ''], ['SKU-OK', 'Nuevo OK', '', '', '', '']] };
    const view = await service.preview(file(rows), 'a.xlsx', actor);
    state.products.set('SKU-U', existing('SKU-U', { updatedAt: '2026-10-02T00:00:00.000Z' })); // edited after the preview
    const started = await service.execute(view.previewId, [], actor);
    await service.waitForBatch(started.batchId);
    const { rows: results } = await service.results(started.batchId);
    const status = Object.fromEntries(results.map((r) => [r.sku, r.status]));
    expect(status).toEqual({ 'SKU-U': 'STALE', 'SKU-P': 'PROPOSED', 'SKU-N': 'NEEDS_CONFIRMATION', 'SKU-OK': 'CREATED' });
    expect(applier.applyRow.mock.calls.map((c: any) => c[0].row.sku)).toEqual(['SKU-OK']);
    const again = await service.execute(view.previewId, ['SKU-N'], actor);
    expect(again.batchId).toBe(started.batchId);
    expect(applier.applyRow).toHaveBeenCalledTimes(1);
    expect((await service.progress(started.batchId)).state).toBe('COMPLETED_WITH_ERRORS');
  });

  it('applies a confirmed unresolved product, in batches of 15, and lists the history', async () => {
    const { service, applier } = setup();
    const products = Array.from({ length: 31 }, (_, i) => [`SKU-${i}`, `Nuevo ${i}`, '', '', '', '']);
    products.push(['SKU-X', 'Sin marca maestra', 'Marca X', '', '', '']);
    const view = await service.preview(file({ products }), 'lote.xlsx', actor);
    const started = await service.execute(view.previewId, ['sku-x'], actor);
    await service.waitForBatch(started.batchId);
    expect(applier.applyRow).toHaveBeenCalledTimes(32);
    const progress = await service.progress(started.batchId);
    expect(progress).toMatchObject({ state: 'COMPLETED', total: 32, processed: 32, percent: 100, counts: { CREATED: 32 } });
    const history = await service.listBatches(1, 20);
    expect(history.items[0]).toMatchObject({ batchId: started.batchId, fileName: 'lote.xlsx', userId: 'u1', userName: 'Ana', templateVersion: 'catalogo-v1' });
    const csv = (await service.resultsFile(started.batchId, 'csv')).buffer.toString('utf8');
    expect(csv.split('\n').length).toBeGreaterThan(32);
  });

  it('reports a failure of the applier per product and still finishes the batch', async () => {
    const { service, applier } = setup();
    applier.applyRow.mockImplementationOnce(async () => ({ status: 'FAILED', code: 'APPLY_FAILED', applied: [], issues: [], error: 'boom', attempts: 3 }));
    const view = await service.preview(file({ products: [['SKU-A', 'A', '', '', '', ''], ['SKU-B', 'B', '', '', '', '']] }), 'a.xlsx', actor);
    const started = await service.execute(view.previewId, [], actor);
    await service.waitForBatch(started.batchId);
    expect((await service.progress(started.batchId))).toMatchObject({ state: 'COMPLETED_WITH_ERRORS', counts: { FAILED: 1, CREATED: 1 } });
  });

  it('applyMappings only points to masters by their exact name and keeps a conflicting category written in the file', () => {
    const parsed: any = { version: 'catalogo-v1', products: [{ row: 2, reference: 'A', sku: 'A', name: 'A', brand: 'Marca X', subcategory: 'Sw', category: '', description: '' }, { row: 3, reference: 'B', sku: 'B', name: 'B', brand: '', subcategory: 'Sw', category: 'Video', description: '' }] };
    const out = applyMappings(parsed, [{ kind: 'brand', sourceText: 'MARCA x', targetId: 'b1' }, { kind: 'subcategory', sourceText: 'sw', targetId: 's2' }], dictionary);
    expect(out.products.map((p) => [p.brand, p.subcategory, p.category])).toEqual([['Marca Uno', 'Switches', 'Redes'], ['', 'Switches', 'Video']]);
    expect(parsed.products[0].brand).toBe('Marca X'); // original untouched
  });

  it('digests change when the product token changes', () => {
    const base: any = { action: 'update', code: 'C', productId: 'p', productUpdatedAt: 'a', changes: [], proposals: [], protectedBy: [], desired: {} };
    expect(rowDigest(base)).not.toBe(rowDigest({ ...base, productUpdatedAt: 'b' }));
  });
});

describe('CatalogTemplateApplyService orchestration', () => {
  const mk = () => new CatalogTemplateApplyService({} as never, {} as never, {} as never);
  const input: any = { batchId: 'b', actor: { id: 'u1' }, row: { action: 'create', sku: 'S', reference: 'S', desired: { mainData: {} }, changes: [], issues: [] }, source: { row: 2 }, dictionary, skuDisplay: new Map() };

  it('retries a transient failure of the key-data step without creating the product twice', async () => {
    const applier: any = mk();
    applier.createProduct = jest.fn(async (_i: any, p: any) => { p.productId = 'p1'; p.created = true; });
    applier.writeKeyData = jest.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValue(undefined);
    const outcome = await applier.applyRow(input);
    expect(applier.createProduct).toHaveBeenCalledTimes(1);
    expect(applier.writeKeyData).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ status: 'CREATED', productId: 'p1', attempts: 2 });
  });

  it('gives up after 2 retries and reports the partial state', async () => {
    const applier: any = mk();
    applier.createProduct = jest.fn(async (_i: any, p: any) => { p.productId = 'p1'; p.created = true; });
    applier.writeKeyData = jest.fn().mockRejectedValue(new Error('down'));
    expect(await applier.applyRow(input)).toMatchObject({ status: 'FAILED', code: 'KEY_DATA_FAILED', productId: 'p1', attempts: 3 });
    const other: any = mk();
    other.createProduct = jest.fn().mockRejectedValue(new Error('down'));
    expect(await other.applyRow(input)).toMatchObject({ status: 'FAILED', code: 'APPLY_FAILED', attempts: 3 });
    expect(other.createProduct).toHaveBeenCalledTimes(3);
  });

  it('does not retry deterministic refusals (stale / rejected)', async () => {
    const stale: any = mk();
    stale.createProduct = jest.fn().mockRejectedValue(new RowStale('PRODUCT_CHANGED', 'cambió'));
    expect(await stale.applyRow(input)).toMatchObject({ status: 'STALE', code: 'PRODUCT_CHANGED', attempts: 1 });
    const rejected: any = mk();
    rejected.createProduct = jest.fn().mockRejectedValue(new RowRejected('CLASSIFICATION_BLOCKED', 'no'));
    expect(await rejected.applyRow(input)).toMatchObject({ status: 'FAILED', code: 'CLASSIFICATION_BLOCKED', attempts: 1 });
    expect(rejected.createProduct).toHaveBeenCalledTimes(1);
  });

  it('an update skips the transaction step once it is done and marks the revision pending only in the transaction', async () => {
    const revisions = { markPendingFromLive: jest.fn() };
    const applier: any = new CatalogTemplateApplyService({} as never, {} as never, {} as never, revisions as never);
    applier.updateProduct = jest.fn(async (_i: any, p: any) => { p.productId = 'p9'; });
    applier.writeKeyData = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined);
    const outcome = await applier.applyRow({ ...input, row: { ...input.row, action: 'update', productId: 'p9' } });
    expect(applier.updateProduct).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ status: 'UPDATED', attempts: 2 });
  });

  it('additions are taken from the plan changes (existing product) or from the whole file (new product)', () => {
    const display = new Map([['REL-1', 'Rel-1']]);
    const row: any = { desired: { highlights: ['h'], features: ['f'], badges: ['b'], related: ['REL-1'], specs: [{ group: 'G', label: 'L', value: 'V', position: 0 }], resources: [{ type: 'Documento', title: 'T', url: 'https://x.test/a', position: 0 }] } };
    expect(additionsOfDesired(row, display)).toEqual({ highlights: ['h'], features: ['f'], badges: ['b'], related: ['Rel-1'], specs: [{ group: 'G', label: 'L', value: 'V' }], resources: [{ type: 'Documento', title: 'T', url: 'https://x.test/a' }] });
    const adds = additionsOfChanges([{ field: 'highlights', before: null, after: 'nuevo' }, { field: 'description', before: null, after: 'ignored' }, { field: 'related', key: 'REL-1', before: null, after: 'REL-1' }], display);
    expect(adds.highlights).toEqual(['nuevo']);
    expect(adds.related).toEqual(['Rel-1']);
    expect(adds.specs).toEqual([]);
  });
});

describe('CatalogTemplateImportController grants', () => {
  const grants = (name: keyof CatalogTemplateImportController) => Reflect.getMetadata(REQUIRED_GRANTS_KEY, CatalogTemplateImportController.prototype[name] as never);
  it('reading and downloading need imports:read; preview/mapping/execute need imports:run and products:write', () => {
    for (const name of ['template', 'example', 'progress', 'batches', 'results', 'download'] as const) expect(grants(name)).toEqual(['imports:read']);
    for (const name of ['preview', 'mapping', 'execute'] as const) expect(grants(name)).toEqual(['imports:run', 'products:write']);
  });
});
