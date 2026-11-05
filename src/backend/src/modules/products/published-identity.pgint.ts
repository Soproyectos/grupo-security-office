/**
 * Integration test: editing the DRAFT of an already PUBLISHED product must not change the public
 * SEARCH, FILTERS, FACETS, brand/category display or slug resolution. Real services against a REAL,
 * DISPOSABLE PostgreSQL.
 *
 * Not picked up by `npm test`. Run it explicitly:
 *   npx jest published-identity --runInBand --testRegex='.*\.pgint\.ts$'
 *
 * Safety: only the disposable server 127.0.0.1:55433 is accepted; creates its own database
 * `mt_s_<random>`, migrates it, seeds SYNTHETIC rows and drops it at the end.
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
const DB_NAME = `mt_s_${randomBytes(4).toString('hex')}`;
const ADMIN_URL = `postgresql://pgtest@${HOST}:${PORT}/postgres`;
const DB_URL = `postgresql://pgtest@${HOST}:${PORT}/${DB_NAME}?schema=public`;

function assertDisposableTarget(raw: string): void {
  const u = new URL(raw);
  if (u.hostname !== HOST || u.port !== PORT || u.username !== 'pgtest') {
    throw new Error(`Refusing to run: ${u.hostname}:${u.port} is not the disposable server ${HOST}:${PORT}.`);
  }
  if (!/^mt_s_[0-9a-f]{8}$/.test(u.pathname.replace(/^\//, '')) && u.pathname !== '/postgres') {
    throw new Error('Refusing to run: unexpected database name.');
  }
}

jest.setTimeout(300_000);

// Smallest valid PNG signature: the upload path checks the REAL type by magic bytes.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const file = (name: string) => ({ buffer: PNG, mimetype: 'image/png', size: PNG.length, originalname: name }) as never;

describe('published identity (search, filters, facets, slug) against disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let products: ProductsService;
  let sheets: ProductSheetService;
  let catalog: PublicCatalogService;
  let detail: PublicProductDetailService;
  let values: ProductSpecValuesService;
  let created = false;
  const ids: Record<string, string> = {};
  const actor = { userId: 'user-syn-editor' };

  const sheetDto = (over: Record<string, unknown> = {}) => ({
    name: 'Synthetic sheet',
    slug: 'syn-old-slug',
    published: true,
    status: 'ACTIVE',
    badges: [],
    highlights: [],
    features: [],
    availableModels: [],
    specGroups: [],
    resources: [],
    ...over,
  }) as never;

  const found = async (params: Parameters<PublicCatalogService['search']>[0]) =>
    (await catalog.search(params)).data.map((p) => p.id);

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
    const files = { store: async () => ({ url: '/api/files/syn' }), release: async () => ({ deleted: true }) };
    const validation = { runFresh: async () => ({ report: { status: 'LISTA', issues: [], revisionId: null } }) };
    const audit = { log: jest.fn().mockResolvedValue(undefined), logTx: jest.fn().mockResolvedValue(undefined) };
    products = new ProductsService(svc, { getAllowedListaIds: jest.fn() } as never, audit as never, files as never, revisions, undefined, validation as never);
    sheets = new ProductSheetService(svc, { getAllowedListaIds: jest.fn() } as never, audit as never, undefined, revisions);
    values = new ProductSpecValuesService(svc);
    const keySpecs = new PublishedKeySpecsService(svc);
    catalog = new PublicCatalogService(prisma as never, new PublicPricingService(prisma as never, { get: () => undefined } as never), undefined, keySpecs);
    detail = new PublicProductDetailService(prisma as never, catalog, undefined, keySpecs);

    const rootA = await prisma.category.create({ data: { name: 'Category Alpha', slug: 'cat-alpha' } });
    const rootB = await prisma.category.create({ data: { name: 'Category Beta', slug: 'cat-beta' } });
    ids.rootA = rootA.id;
    ids.rootB = rootB.id;
    ids.brandA = (await prisma.brand.create({ data: { name: 'Brand Alpha', slug: 'brand-alpha' } })).id;
    ids.brandB = (await prisma.brand.create({ data: { name: 'Brand Beta', slug: 'brand-beta' } })).id;
    ids.subA = (await prisma.subcategory.create({ data: { categoryId: rootA.id, name: 'Sub Alpha', slug: 'sub-alpha' } })).id;
    ids.subB = (await prisma.subcategory.create({ data: { categoryId: rootB.id, name: 'Sub Beta', slug: 'sub-beta' } })).id;
    const mk = async (key: string, sku: string, name: string, extra: Record<string, unknown> = {}) => {
      ids[key] = (await prisma.product.create({
        data: { sku, name, categoryId: rootA.id, brandId: ids.brandA, subcategoryId: ids.subA, lifecycleStatus: 'DRAFT', ...extra } as never,
      })).id;
    };
    await mk('main', 'IDN-OLD-001', 'Alpha Camera Old');
    await mk('never', 'IDN-NEVER', 'Alpha Never Published');
    await mk('legacy', 'IDN-LEGACY', 'Legacy Camera');
    await mk('info', 'IDN-INFO', 'Informative Camera', { subcategoryId: null, extraAttributes: { biblioteca: { source: 'synthetic' } } });
    const priceList = await prisma.priceList.create({ data: { name: 'Synthetic', code: 'SYN-PL' } });
    for (const key of ['main', 'legacy']) {
      await prisma.price.create({ data: { productId: ids[key], priceListId: priceList.id, value: 100 } });
    }

    const dictionary = new SpecDictionaryService(svc);
    const templates = new SpecTemplateService(svc);
    await dictionary.create({ key: 'analog_channels', label: 'Canales analogicos', dataType: 'NUMBER' });
    for (const sub of [ids.subA, ids.subB]) {
      await templates.upsertEntries(sub, [{ specKey: 'analog_channels', sortOrder: 10, isFilterable: true }]);
      await templates.approve(sub, 'analog_channels', 'Ana Approver', {});
    }
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

  it('(1) publishes with an identity snapshot', async () => {
    await products.uploadImage(ids.main, file('main.png'), true);
    await sheets.update(ids.main, sheetDto());
    await values.writeProductSpecValues(ids.main, [{ specKey: 'analog_channels', valueNumber: 4 }], { source: { kind: 'editor' }, actor });
    await values.publishProductSpecValues(ids.main, actor);
    await products.transition(ids.main, { event: 'PUBLISH' } as never);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: ids.main } });
    const content = (await prisma.productRevision.findUniqueOrThrow({ where: { id: product.publicRevisionId! } })).content as Record<string, unknown>;
    expect(content).toMatchObject({ sku: 'IDN-OLD-001', name: 'Alpha Camera Old', categoryId: ids.rootA, brandId: ids.brandA, subcategoryId: ids.subA, catalogSlug: 'syn-old-slug' });

    expect(await found({ q: 'alpha camera old' })).toEqual([ids.main]);
    expect(await found({ category: 'cat-alpha' })).toContain(ids.main);
    expect((await detail.findByIdOrSlug('syn-old-slug')).id).toBe(ids.main);
  });

  it('(2) LIVE edits of name, SKU, category, brand, subcategory and slug leave the public view untouched', async () => {
    await products.update(ids.main, { sku: 'IDN-NEW-001', name: 'Zeta Camera New', subcategoryId: ids.subB, brandId: ids.brandB } as never);
    await sheets.update(ids.main, sheetDto({ slug: 'syn-new-slug' }));
    const live = await prisma.product.findUniqueOrThrow({ where: { id: ids.main } });
    expect(live).toMatchObject({ sku: 'IDN-NEW-001', name: 'Zeta Camera New', categoryId: ids.rootB, brandId: ids.brandB, subcategoryId: ids.subB, catalogSlug: 'syn-new-slug' });

    // search by name / SKU: old finds it, new does not
    expect(await found({ q: 'Alpha Camera Old' })).toEqual([ids.main]);
    expect(await found({ q: 'idn-old-001' })).toEqual([ids.main]);
    expect(await found({ q: 'Zeta' })).toEqual([]);
    expect(await found({ q: 'IDN-NEW' })).toEqual([]);
    // category filter: old finds it, new does not
    expect(await found({ category: 'cat-alpha' })).toContain(ids.main);
    expect(await found({ category: 'cat-beta' })).not.toContain(ids.main);
    // list item and sheet show the published brand/category/name
    const item = (await catalog.search({})).data.find((p) => p.id === ids.main)!;
    expect(item).toMatchObject({ sku: 'IDN-OLD-001', name: 'Alpha Camera Old', categoryName: 'Category Alpha', categorySlug: 'cat-alpha', brandName: 'Brand Alpha' });
    const sheet = await detail.findByIdOrSlug(ids.main);
    expect(sheet.brand).toBe('Brand Alpha');
    expect(sheet.breadcrumb.map((b) => b.label)).toContain('Category Alpha');
    const base = await catalog.getDetail(ids.main);
    expect(base).toMatchObject({ name: 'Alpha Camera Old', category: { slug: 'cat-alpha' }, brand: { slug: 'brand-alpha' } });
    // key-spec facets / filters / sheet data follow the published subcategory
    expect((await catalog.keySpecFacets(ids.subA)).products).toBe(1);
    expect((await catalog.keySpecFacets(ids.subB)).products).toBe(0);
    expect(await found({ keySpec: ['analog_channels:4'] })).toEqual([ids.main]);
    expect(sheet.keySpecs.map((k) => k.value)).toEqual(['4']);
    // slug resolves as before
    expect((await detail.findByIdOrSlug('syn-old-slug')).id).toBe(ids.main);
    await expect(detail.findByIdOrSlug('syn-new-slug')).rejects.toThrow();
  });

  it('(3) the admin preview and admin lists keep the live draft', async () => {
    const preview = await detail.previewById(ids.main);
    expect(preview.brand).toBe('Brand Beta');
    expect(preview.breadcrumb.map((b) => b.label)).toContain('Category Beta');
    expect(preview.preview?.mode).toBe('draft');
    // Admin search is fuzzy (trigram) over the LIVE columns: it finds the draft by its new name and returns it.
    const admin = await products.findAll({ search: 'Zeta' } as never);
    const rows = ((admin as { data?: Array<{ id: string; name: string }> }).data ?? (admin as unknown as Array<{ id: string; name: string }>));
    expect(rows.find((p) => p.id === ids.main)?.name).toBe('Zeta Camera New');
  });

  it('(4) republishing switches search, filters, facets, display and slug to the new values', async () => {
    await products.transition(ids.main, { event: 'UNPUBLISH' } as never);
    await products.transition(ids.main, { event: 'PUBLISH' } as never);

    expect(await found({ q: 'Zeta Camera' })).toEqual([ids.main]);
    expect(await found({ q: 'IDN-NEW-001' })).toEqual([ids.main]);
    expect(await found({ q: 'Alpha Camera Old' })).toEqual([]);
    expect(await found({ category: 'cat-beta' })).toContain(ids.main);
    expect(await found({ category: 'cat-alpha' })).not.toContain(ids.main);
    const item = (await catalog.search({})).data.find((p) => p.id === ids.main)!;
    expect(item).toMatchObject({ name: 'Zeta Camera New', categorySlug: 'cat-beta', brandName: 'Brand Beta' });
    expect((await catalog.keySpecFacets(ids.subB)).products).toBe(1);
    expect((await catalog.keySpecFacets(ids.subA)).products).toBe(0);
    expect(await found({ keySpec: ['analog_channels:4'] })).toEqual([ids.main]);
    expect((await detail.findByIdOrSlug('syn-new-slug')).id).toBe(ids.main);
    await expect(detail.findByIdOrSlug('syn-old-slug')).rejects.toThrow();
  });

  it('(5) LEGACY: a published revision without the identity keys keeps the live behavior', async () => {
    await products.uploadImage(ids.legacy, file('legacy.png'), true);
    await sheets.update(ids.legacy, sheetDto({ slug: 'syn-legacy' }));
    await products.transition(ids.legacy, { event: 'PUBLISH' } as never);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: ids.legacy } });
    const revision = await prisma.productRevision.findUniqueOrThrow({ where: { id: product.publicRevisionId! } });
    const { categoryId, brandId, subcategoryId, catalogSlug, ...legacyContent } = revision.content as Record<string, unknown>;
    await prisma.productRevision.update({ where: { id: revision.id }, data: { content: legacyContent as never } });

    await prisma.product.update({ where: { id: ids.legacy }, data: { categoryId: ids.rootB, brandId: ids.brandB, subcategoryId: ids.subB, catalogSlug: 'syn-legacy-live' } });
    expect(await found({ category: 'cat-beta' })).toContain(ids.legacy);
    expect(await found({ category: 'cat-alpha' })).not.toContain(ids.legacy);
    expect((await catalog.search({ q: 'Legacy Camera' })).data[0]).toMatchObject({ categorySlug: 'cat-beta', brandName: 'Brand Beta' });
    expect((await detail.findByIdOrSlug('syn-legacy-live')).id).toBe(ids.legacy);
    expect((await catalog.keySpecFacets(ids.subB)).products).toBe(2);
  });

  it('(6) a product without a pinned revision (informative record) keeps the live behavior', async () => {
    expect(await found({ q: 'Informative' })).toEqual([ids.info]);
    await prisma.product.update({ where: { id: ids.info }, data: { name: 'Renamed Informative', categoryId: ids.rootB } });
    expect(await found({ q: 'Informative Camera' })).toEqual([]);
    expect(await found({ q: 'Renamed' })).toEqual([ids.info]);
    expect(await found({ category: 'cat-beta' })).toContain(ids.info);
    expect((await catalog.search({ q: 'Renamed' })).data[0]).toMatchObject({ categorySlug: 'cat-beta', isInformational: true });
  });

  it('(7) a never-published product stays invisible to search, filters and slug', async () => {
    expect(await found({ q: 'Never Published' })).toEqual([]);
    expect(await found({ category: 'cat-alpha' })).not.toContain(ids.never);
    await expect(detail.findByIdOrSlug(ids.never)).rejects.toThrow();
  });
});
