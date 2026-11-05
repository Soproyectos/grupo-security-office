/**
 * Integration test: editing the DRAFT of an already PUBLISHED product must not change the public
 * sheet, list, filters or facets (images, spec groups, highlights, badges, features, key attributes),
 * while the admin preview shows the draft. Real services against a REAL, DISPOSABLE PostgreSQL.
 *
 * Not picked up by `npm test`. Run it explicitly:
 *   npx jest published-isolation --runInBand --testRegex='.*\.pgint\.ts$'
 *
 * Safety: only the disposable server 127.0.0.1:55433 is accepted; creates its own database
 * `mt_c_<random>`, migrates it, seeds SYNTHETIC rows and drops it at the end.
 * The validation engine is stubbed (always ready) so the REAL publish path (pinning the revision) runs.
 */
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from './products.service';
import { ProductRevisionsService } from './product-revisions.service';
import { ProductSheetService } from './sheet/product-sheet.service';
import { PublicCatalogService } from './public-catalog.service';
import { PublicPricingService } from './public-pricing.service';
import { PublicProductDetailService } from './public-detail/public-product-detail.service';
import { ProductSpecValuesService } from '../library-specs/product-spec-values.service';
import { PublishedKeySpecsService } from '../library-specs/published-key-specs.service';
import { SpecDictionaryService } from '../library-specs/spec-dictionary.service';
import { SpecTemplateService } from '../library-specs/spec-template.service';

const HOST = '127.0.0.1';
const PORT = '55433';
const DB_NAME = `mt_c_${randomBytes(4).toString('hex')}`;
const ADMIN_URL = `postgresql://pgtest@${HOST}:${PORT}/postgres`;
const DB_URL = `postgresql://pgtest@${HOST}:${PORT}/${DB_NAME}?schema=public`;

function assertDisposableTarget(raw: string): void {
  const u = new URL(raw);
  if (u.hostname !== HOST || u.port !== PORT || u.username !== 'pgtest') {
    throw new Error(`Refusing to run: ${u.hostname}:${u.port} is not the disposable server ${HOST}:${PORT}.`);
  }
  if (!/^mt_c_[0-9a-f]{8}$/.test(u.pathname.replace(/^\//, '')) && u.pathname !== '/postgres') {
    throw new Error('Refusing to run: unexpected database name.');
  }
}

jest.setTimeout(300_000);

// Smallest valid PNG signature: the upload path checks the REAL type by magic bytes.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const file = (name: string) => ({ buffer: PNG, mimetype: 'image/png', size: PNG.length, originalname: name }) as never;

describe('published isolation against disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let products: ProductsService;
  let sheets: ProductSheetService;
  let catalog: PublicCatalogService;
  let detail: PublicProductDetailService;
  let values: ProductSpecValuesService;
  let created = false;
  let fileSeq = 0;
  const ids: Record<string, string> = {};
  const actor = { userId: 'user-syn-editor' };

  const sheetDto = (over: Record<string, unknown> = {}) => ({
    name: 'Synthetic DVR sheet',
    slug: 'syn-dvr-sheet',
    published: true,
    status: 'ACTIVE',
    badges: ['Nuevo'],
    highlights: ['Highlight A'],
    features: [{ label: 'Feature A', icon: 'video' }],
    availableModels: [],
    specGroups: [{ title: 'Video', items: [{ label: 'Canales', value: '4' }] }],
    resources: [],
    ...over,
  }) as never;

  const publicView = async (productId: string) => ({
    detail: await detail.findByIdOrSlug(productId),
    list: (await catalog.search({})).data.filter((p) => p.id === productId),
    byName: (await catalog.search({ q: 'Synthetic SYN-DVR-001' })).data.filter((p) => p.id === productId),
    facets: await catalog.keySpecFacets(ids.sub),
    filtered: (await catalog.search({ keySpec: ['analog_channels:4'] })).data.map((p) => p.id),
  });

  beforeAll(async () => {
    assertDisposableTarget(ADMIN_URL);
    assertDisposableTarget(DB_URL);
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${DB_NAME}"`);
      created = true;
    } finally {
      await admin.end();
    }
    execSync('npx prisma migrate deploy', { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: DB_URL }, stdio: 'pipe', timeout: 250_000 });

    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();
    const svc = prisma as unknown as PrismaService;
    const revisions = new ProductRevisionsService(svc, {} as never);
    const files = { store: async () => ({ url: `/api/files/syn-${++fileSeq}` }), release: async () => ({ deleted: true }) };
    const validation = { runFresh: async () => ({ report: { status: 'LISTA', issues: [], revisionId: null } }) };
    const audit = { log: jest.fn().mockResolvedValue(undefined), logTx: jest.fn().mockResolvedValue(undefined) };
    products = new ProductsService(svc, { getAllowedListaIds: jest.fn() } as never, audit as never, files as never, revisions, undefined, validation as never);
    sheets = new ProductSheetService(svc, { getAllowedListaIds: jest.fn() } as never, audit as never, undefined, revisions);
    values = new ProductSpecValuesService(svc);
    const keySpecs = new PublishedKeySpecsService(svc);
    catalog = new PublicCatalogService(prisma as never, new PublicPricingService(prisma as never, { get: () => undefined } as never), undefined, keySpecs);
    detail = new PublicProductDetailService(prisma as never, catalog, undefined, keySpecs);

    const root = await prisma.category.create({ data: { name: 'Synthetic root', slug: 'syn-root' } });
    const brand = await prisma.brand.create({ data: { name: 'Synthetic brand', slug: 'syn-brand' } });
    ids.sub = (await prisma.subcategory.create({ data: { categoryId: root.id, name: 'DVR recorders', slug: 'syn-dvr' } })).id;
    const mk = async (key: string, sku: string) => {
      ids[key] = (await prisma.product.create({ data: { sku, name: `Synthetic ${sku}`, categoryId: root.id, brandId: brand.id, subcategoryId: ids.sub, lifecycleStatus: 'DRAFT' } })).id;
    };
    await mk('dvr', 'SYN-DVR-001');
    await mk('never', 'SYN-DVR-NEVER');
    await mk('legacy', 'SYN-DVR-LEGACY');
    await mk('v2', 'SYN-DVR-V2');
    const priceList = await prisma.priceList.create({ data: { name: 'Synthetic', code: 'SYN-PL' } });
    for (const key of ['dvr', 'legacy', 'v2']) {
      await prisma.price.create({ data: { productId: ids[key], priceListId: priceList.id, value: 100 } });
    }

    const dictionary = new SpecDictionaryService(svc);
    const templates = new SpecTemplateService(svc);
    await dictionary.create({ key: 'analog_channels', label: 'Canales analogicos', dataType: 'NUMBER' });
    await templates.upsertEntries(ids.sub, [{ specKey: 'analog_channels', sortOrder: 10, isFilterable: true }]);
    await templates.approve(ids.sub, 'analog_channels', 'Ana Approver', {});
  });

  afterAll(async () => {
    try {
      await prisma?.$disconnect();
    } finally {
      if (created) {
        const admin = new Client({ connectionString: ADMIN_URL });
        await admin.connect();
        try {
          await admin.query(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
        } finally {
          await admin.end();
        }
      }
    }
  });

  let baseline: Awaited<ReturnType<typeof publicView>>;
  let originalImageId: string;

  it('(1) publishes through the real path with a snapshot holding the new fields', async () => {
    originalImageId = (await products.uploadImage(ids.dvr, file('original.png'), true)).id;
    await sheets.update(ids.dvr, sheetDto());
    await values.writeProductSpecValues(ids.dvr, [{ specKey: 'analog_channels', valueNumber: 4 }], { source: { kind: 'editor' }, actor });
    await values.publishProductSpecValues(ids.dvr, actor);
    await products.transition(ids.dvr, { event: 'PUBLISH' } as never);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: ids.dvr } });
    expect(product.lifecycleStatus).toBe('PUBLISHED');
    const revision = await prisma.productRevision.findUniqueOrThrow({ where: { id: product.publicRevisionId! } });
    const content = revision.content as Record<string, any>;
    expect(revision.status).toBe('PUBLICADA');
    expect(content.catalogHighlights).toEqual(['Highlight A']);
    expect(content.catalogBadges).toEqual(['Nuevo']);
    expect(content.catalogSpecGroups).toEqual([{ key: 'video', title: 'Video', items: [{ label: 'Canales', value: '4' }] }]);
    expect(content.images).toHaveLength(1);

    baseline = await publicView(ids.dvr);
    expect(baseline.detail.highlights).toEqual(['Highlight A']);
    expect(baseline.detail.images).toHaveLength(1);
    expect(baseline.detail.keySpecs.map((k) => k.value)).toEqual(['4']);
    expect(baseline.list).toHaveLength(1);
    expect(baseline.byName).toHaveLength(1);
    expect(baseline.filtered).toEqual([ids.dvr]);
  });

  it('(2) draft edits leave the public sheet, list, filters and facets identical', async () => {
    await sheets.update(ids.dvr, sheetDto({
      badges: ['Oferta', 'Nuevo modelo'],
      highlights: ['Highlight B', 'Highlight C'],
      features: [{ label: 'Feature B', icon: 'cloud' }],
      specGroups: [{ title: 'Video', items: [{ label: 'Canales', value: '16' }] }, { title: 'Red', items: [{ label: 'Puertos', value: '2' }] }],
    }));
    const added = await products.uploadImage(ids.dvr, file('draft.png'), true);
    await products.updateImage(added.id, { alt: 'Draft alt' });
    await products.deleteImage(originalImageId);
    await values.writeProductSpecValues(ids.dvr, [{ specKey: 'analog_channels', valueNumber: 16 }], { source: { kind: 'editor' }, actor });

    expect(await publicView(ids.dvr)).toEqual(baseline);
    expect((await catalog.search({ keySpec: ['analog_channels:16'] })).data).toEqual([]);
  });

  it('(3) the admin preview shows every drafted change', async () => {
    const preview = await detail.previewById(ids.dvr);
    expect(preview.preview).toEqual({ mode: 'draft', unpublishedChanges: true });
    expect(preview.badges).toEqual(['Oferta', 'Nuevo modelo']);
    expect(preview.highlights).toEqual(['Highlight B', 'Highlight C']);
    expect(preview.features.map((f) => f.label)).toEqual(['Feature B']);
    expect(preview.specGroups.map((g) => g.title)).toEqual(['Video', 'Red']);
    expect(preview.images.map((i) => i.alt)).toEqual(['Draft alt']);
    expect(preview.images[0].src).not.toBe(baseline.detail.images[0].src);
    expect(preview.keySpecs.map((k) => k.value)).toEqual(['16']);
  });

  it('(4) publishing again makes the public view show the new values', async () => {
    await products.transition(ids.dvr, { event: 'UNPUBLISH' } as never);
    await products.transition(ids.dvr, { event: 'PUBLISH' } as never);
    await values.publishProductSpecValues(ids.dvr, actor);
    const view = await publicView(ids.dvr);
    expect(view.detail.highlights).toEqual(['Highlight B', 'Highlight C']);
    expect(view.detail.badges).toEqual(['Oferta', 'Nuevo modelo']);
    expect(view.detail.specGroups.map((g) => g.title)).toEqual(['Video', 'Red']);
    expect(view.detail.images.map((i) => i.alt)).toEqual(['Draft alt']);
    expect(view.list[0].imageUrl).toBe(view.detail.images[0].src);
    expect((await detail.previewById(ids.dvr)).preview).toEqual({ mode: 'draft', unpublishedChanges: false });
  });

  it('(5) LEGACY: a published revision without the new keys falls back to the live rows (documented behavior)', async () => {
    await products.uploadImage(ids.legacy, file('legacy.png'), true);
    await sheets.update(ids.legacy, sheetDto({ slug: 'syn-legacy', highlights: ['Legacy live'] }));
    await products.transition(ids.legacy, { event: 'PUBLISH' } as never);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: ids.legacy } });
    const revision = await prisma.productRevision.findUniqueOrThrow({ where: { id: product.publicRevisionId! } });
    const { catalogSpecGroups, catalogHighlights, catalogBadges, catalogFeatures, catalogImageUrl, catalogImageAlt, catalogStatus, catalogSpecsDisclaimer, catalogAvailableModels, catalogFirmwareNote, sheetSnapshotVersion, ...legacyContent } = revision.content as Record<string, unknown>;
    await prisma.productRevision.update({ where: { id: revision.id }, data: { content: legacyContent as never } });

    await sheets.update(ids.legacy, sheetDto({ slug: 'syn-legacy', highlights: ['Legacy edited'] }));
    expect((await detail.findByIdOrSlug(ids.legacy)).highlights).toEqual(['Legacy edited']); // live: pre-change behavior, no crash
    expect((await detail.previewById(ids.legacy)).preview?.unpublishedChanges).toBe(false);
  });

  describe('snapshot version 2: null/empty sheet fields are authoritative', () => {
    const fw = { kind: 'FIRMWARE', title: 'FW 1.0', language: 'es', url: '/api/files/syn-fw', fileName: 'fw.bin', version: '1.0', region: null, requiresLicense: false };
    let v2Baseline: Awaited<ReturnType<typeof detail.findByIdOrSlug>>;
    let v2RevisionId: string;

    it('(7) draft edits of brand/description/status/disclaimer/models/firmware note never reach the public detail', async () => {
      await products.uploadImage(ids.v2, file('v2.png'), true);
      await sheets.update(ids.v2, sheetDto({ slug: 'syn-v2', resources: [fw] }));
      await products.transition(ids.v2, { event: 'PUBLISH' } as never);
      const product = await prisma.product.findUniqueOrThrow({ where: { id: ids.v2 } });
      v2RevisionId = product.publicRevisionId!;
      const content = (await prisma.productRevision.findUniqueOrThrow({ where: { id: v2RevisionId } })).content as Record<string, any>;
      expect(content.sheetSnapshotVersion).toBe(2);
      expect(content.description ?? null).toBeNull();
      expect(content.catalogBrand ?? null).toBeNull();
      expect(content.catalogStatus).toBe('ACTIVE');
      expect(content.catalogSpecsDisclaimer).toBeNull();
      expect(content.catalogAvailableModels).toEqual([]);
      expect(content.catalogFirmwareNote).toBeNull();
      v2Baseline = await detail.findByIdOrSlug(ids.v2);
      expect(v2Baseline.firmware?.note).toBeUndefined();

      await prisma.product.update({ where: { id: ids.v2 }, data: { description: 'Edited description' } });
      await sheets.update(ids.v2, sheetDto({
        slug: 'syn-v2',
        brand: 'Edited Brand',
        status: 'DISCONTINUED',
        specsDisclaimer: 'Edited disclaimer',
        availableModels: ['MODEL-X'],
        firmwareNote: 'Edited firmware note',
        manufacturerRefs: ['REF-1'],
        resources: [fw],
      }));
      expect(await detail.findByIdOrSlug(ids.v2)).toEqual(v2Baseline);
    });

    it('(8) the admin preview shows the draft edits and flags unpublished changes', async () => {
      const preview = await detail.previewById(ids.v2);
      expect(preview.preview).toEqual({ mode: 'draft', unpublishedChanges: true });
      expect(preview.brand).toBe('Edited Brand');
      expect(preview.description).toBe('Edited description');
      expect(preview.status).toBe('discontinued');
      expect(preview.specsDisclaimer).toBe('Edited disclaimer');
      expect(preview.availableModels).toEqual(['MODEL-X']);
      expect(preview.firmware?.note).toBe('Edited firmware note');
    });

    it('(9) republishing (UNPUBLISH then PUBLISH) shows the new values publicly', async () => {
      await products.transition(ids.v2, { event: 'UNPUBLISH' } as never);
      await products.transition(ids.v2, { event: 'PUBLISH' } as never);
      const view = await detail.findByIdOrSlug(ids.v2);
      expect(view.brand).toBe('Edited Brand');
      expect(view.description).toBe('Edited description');
      expect(view.status).toBe('discontinued');
      expect(view.specsDisclaimer).toBe('Edited disclaimer');
      expect(view.availableModels).toEqual(['MODEL-X']);
      expect(view.firmware?.note).toBe('Edited firmware note');
      expect((await detail.previewById(ids.v2)).preview).toEqual({ mode: 'draft', unpublishedChanges: false });
    });

    it('(10) LEGACY: the same revision without the marker keeps the old behavior (null ignored, live fallback)', async () => {
      const product = await prisma.product.findUniqueOrThrow({ where: { id: ids.v2 } });
      const revision = await prisma.productRevision.findUniqueOrThrow({ where: { id: product.publicRevisionId! } });
      const { sheetSnapshotVersion, catalogStatus, catalogSpecsDisclaimer, catalogAvailableModels, catalogFirmwareNote, ...legacy } = revision.content as Record<string, unknown>;
      await prisma.productRevision.update({ where: { id: revision.id }, data: { content: { ...legacy, description: null, catalogBrand: null } as never } });
      await prisma.product.update({ where: { id: ids.v2 }, data: { description: 'Live after legacy', catalogSpecsDisclaimer: 'Live disclaimer' } });
      const view = await detail.findByIdOrSlug(ids.v2);
      expect(view.description).toBe('Live after legacy');
      expect(view.specsDisclaimer).toBe('Live disclaimer');
    });
  });

  it('(6) a never-published product is neither visible nor affected', async () => {
    await expect(detail.findByIdOrSlug(ids.never)).rejects.toThrow();
    expect((await catalog.search({})).data.map((p) => p.id)).not.toContain(ids.never);
    expect((await detail.previewById(ids.never)).preview).toEqual({ mode: 'draft', unpublishedChanges: false });
  });
});
