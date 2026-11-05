/**
 * Integration test: key-spec publication, public sheet, store filters and admin draft preview
 * against a REAL, DISPOSABLE PostgreSQL.
 *
 * Not picked up by `npm test`. Run it explicitly:
 *   npx jest key-spec-publication --runInBand --testRegex='.*\.pgint\.ts$'
 *
 * Safety: it only connects to the disposable server 127.0.0.1:55433 (anything else is refused before any
 * connection), creates its own database `mt_f4_<random>`, migrates it, seeds SYNTHETIC rows and drops it at the end.
 */
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicCatalogService } from '../products/public-catalog.service';
import { PublicPricingService } from '../products/public-pricing.service';
import { PublicProductDetailService } from '../products/public-detail/public-product-detail.service';
import { ProductSpecValuesService } from './product-spec-values.service';
import { PublishedKeySpecsService } from './published-key-specs.service';
import { SpecDictionaryService } from './spec-dictionary.service';
import { SpecTemplateService } from './spec-template.service';

const HOST = '127.0.0.1';
const PORT = '55433';
const DB_NAME = `mt_f4_${randomBytes(4).toString('hex')}`;
const ADMIN_URL = `postgresql://pgtest@${HOST}:${PORT}/postgres`;
const DB_URL = `postgresql://pgtest@${HOST}:${PORT}/${DB_NAME}?schema=public`;

function assertDisposableTarget(raw: string): void {
  const u = new URL(raw);
  if (u.hostname !== HOST || u.port !== PORT || u.username !== 'pgtest') {
    throw new Error(`Refusing to run: ${u.hostname}:${u.port} is not the disposable server ${HOST}:${PORT}.`);
  }
  if (!/^mt_f4_[0-9a-f]{8}$/.test(u.pathname.replace(/^\//, '')) && u.pathname !== '/postgres') {
    throw new Error('Refusing to run: unexpected database name.');
  }
}

jest.setTimeout(300_000);

describe('key-spec publication against disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let values: ProductSpecValuesService;
  let catalog: PublicCatalogService;
  let detail: PublicProductDetailService;
  let created = false;
  const ids: Record<string, string> = {};
  const actor = { userId: 'user-syn-editor' };

  const write = (productId: string, entries: any[]) => values.writeProductSpecValues(productId, entries, { source: { kind: 'editor' }, actor });
  const publish = (productId: string) => values.publishProductSpecValues(productId, actor);
  const found = async (...keySpec: string[]) => (await catalog.search({ keySpec })).data.map((p) => p.sku).sort();
  const sheetOf = async (productId: string) => detail.findByIdOrSlug(productId);
  const withoutKeySpecs = ({ keySpecs, preview, ...rest }: any) => rest;
  const facetValues = (view: any, specKey: string) => view.facets.find((f: any) => f.specKey === specKey)?.values.map((v: any) => [v.value, v.count]);
  const publishedCount = (productId: string) => prisma.productSpecValue.count({ where: { productId, stage: 'PUBLISHED' } });

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
    const dictionary = new SpecDictionaryService(svc);
    const templates = new SpecTemplateService(svc);
    values = new ProductSpecValuesService(svc);
    const keySpecs = new PublishedKeySpecsService(svc);
    catalog = new PublicCatalogService(prisma as never, new PublicPricingService(prisma as never, { get: () => undefined } as never), undefined, keySpecs);
    detail = new PublicProductDetailService(prisma as never, catalog, undefined, keySpecs);

    const root = await prisma.category.create({ data: { name: 'Synthetic root', slug: 'syn-root' } });
    const brand = await prisma.brand.create({ data: { name: 'Synthetic brand', slug: 'syn-brand' } });
    for (const [k, name] of [['dvr', 'DVR recorders'], ['switch', 'Switches'], ['acc', 'Accessories']] as const) {
      ids[`sub_${k}`] = (await prisma.subcategory.create({ data: { categoryId: root.id, name, slug: `syn-${k}` } })).id;
    }
    const product = async (key: string, sku: string, sub: string, lifecycleStatus: 'PUBLISHED' | 'DRAFT') => {
      ids[key] = (
        await prisma.product.create({
          data: { sku, name: `Synthetic ${sku}`, categoryId: root.id, brandId: brand.id, subcategoryId: ids[`sub_${sub}`], lifecycleStatus },
        })
      ).id;
    };
    await product('dvr1', 'SYN-DVR-001', 'dvr', 'PUBLISHED');
    await product('dvr2', 'SYN-DVR-002', 'dvr', 'PUBLISHED');
    await product('dvrDraft', 'SYN-DVR-DRAFT', 'dvr', 'DRAFT');
    await product('sw1', 'SYN-SW-001', 'switch', 'PUBLISHED');
    await product('acc1', 'SYN-ACC-001', 'acc', 'PUBLISHED');

    await dictionary.create({ key: 'device_type', label: 'Tipo de equipo', dataType: 'OPTION', options: [{ key: 'DVR', label: 'DVR' }, { key: 'NVR', label: 'NVR' }] });
    await dictionary.create({ key: 'analog_channels', label: 'Canales analogicos', dataType: 'NUMBER' });
    await dictionary.create({ key: 'poe_budget', label: 'Potencia PoE', dataType: 'NUMBER', unit: 'W' });
    await dictionary.create({ key: 'audio_in', label: 'Entrada de audio', dataType: 'BOOLEAN' });
    await dictionary.create({ key: 'storage', label: 'Almacenamiento', dataType: 'TEXT' });
    await dictionary.create({ key: 'warranty_years', label: 'Garantia', dataType: 'NUMBER' });
    await dictionary.create({ key: 'color', label: 'Color', dataType: 'OPTION', options: [{ key: 'RED', label: 'Rojo' }, { key: 'BLUE', label: 'Azul' }] });

    await templates.upsertEntries(ids.sub_dvr, [
      { specKey: 'device_type', sortOrder: 10, isFilterable: true },
      { specKey: 'analog_channels', sortOrder: 20, isFilterable: true },
      { specKey: 'poe_budget', sortOrder: 30, isFilterable: true },
      { specKey: 'audio_in', sortOrder: 40, isFilterable: true },
      { specKey: 'storage', sortOrder: 50 },
      { specKey: 'warranty_years', sortOrder: 60, isFilterable: true },
      { specKey: 'color', sortOrder: 70, isFilterable: true }, // stays PROPOSED
    ]);
    await templates.upsertEntries(ids.sub_switch, [{ specKey: 'poe_budget', sortOrder: 10, isFilterable: true }]);
    for (const key of ['device_type', 'analog_channels', 'poe_budget', 'audio_in', 'storage', 'warranty_years']) {
      await templates.approve(ids.sub_dvr, key, 'Ana Approver', {});
    }
    await templates.approve(ids.sub_switch, 'poe_budget', 'Ana Approver', {});
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

  let before: any;

  it('(1) pending WORKING edits stay out of the public sheet and the filters', async () => {
    await write(ids.dvr1, [
      { specKey: 'device_type', optionKeys: ['DVR'] },
      { specKey: 'analog_channels', valueNumber: 4 },
      { specKey: 'storage', valueText: 'eSSD 1 TB' },
    ]);
    await write(ids.dvr2, [{ specKey: 'analog_channels', valueNumber: 8 }]);

    before = await sheetOf(ids.dvr1);
    expect(before.keySpecs).toEqual([]);
    expect((await catalog.keySpecFacets(ids.sub_dvr)).facets).toEqual([]);
    expect(await found('analog_channels:4')).toEqual([]);
    expect(await found('analog_channels:8')).toEqual([]);
  });

  it('(2) publishing makes sheet and filters show the same value', async () => {
    expect(await publish(ids.dvr1)).toEqual({ productId: ids.dvr1, published: 3, unchanged: 0, removed: 0 });
    const sheet = await sheetOf(ids.dvr1);
    expect(sheet.keySpecs.map((k) => [k.key, k.value])).toEqual([['device_type', 'DVR'], ['analog_channels', '4'], ['storage', 'eSSD 1 TB']]);

    const facets = await catalog.keySpecFacets(ids.sub_dvr);
    expect(facetValues(facets, 'analog_channels')).toEqual([['4', 1]]);
    expect(facetValues(facets, 'device_type')).toEqual([['DVR', 1]]);
    expect(facetValues(facets, 'storage')).toBeUndefined(); // not filterable

    expect(await found('analog_channels:4')).toEqual(['SYN-DVR-001']);
    expect(await found('analog_channels:8')).toEqual([]); // dvr2 is still unpublished
    expect(await found('analog_channels:4', 'device_type:nvr')).toEqual([]);
    expect(await found('device_type:dvr')).toEqual(['SYN-DVR-001']);

    expect(withoutKeySpecs(sheet)).toEqual(withoutKeySpecs(before));
  });

  it('(3) a real zero and false appear; NOT_APPLICABLE and UNKNOWN do not', async () => {
    await write(ids.dvr1, [
      { specKey: 'poe_budget', valueNumber: 0 },
      { specKey: 'audio_in', valueBoolean: false },
      { specKey: 'storage', state: 'NOT_APPLICABLE' },
      { specKey: 'warranty_years', state: 'UNKNOWN' },
    ]);
    await publish(ids.dvr1);
    const keys = Object.fromEntries((await sheetOf(ids.dvr1)).keySpecs.map((k) => [k.key, k]));
    expect(keys.poe_budget).toMatchObject({ value: '0 W', unit: 'W' });
    expect(keys.audio_in.value).toBe('No');
    expect(keys.storage).toBeUndefined();
    expect(keys.warranty_years).toBeUndefined();
    expect(await found('poe_budget:0')).toEqual(['SYN-DVR-001']);
    expect(await found('audio_in:false')).toEqual(['SYN-DVR-001']);
    expect(await found('audio_in:true')).toEqual([]);
    expect(await found('warranty_years:0')).toEqual([]);
    expect(facetValues(await catalog.keySpecFacets(ids.sub_dvr), 'warranty_years')).toBeUndefined();
  });

  it('(4) a pending change after publishing stays out of the public sheet but shows in the draft preview', async () => {
    const clean = await detail.previewById(ids.dvr1);
    expect(clean.preview).toEqual({ mode: 'draft', unpublishedChanges: false });

    await write(ids.dvr1, [{ specKey: 'analog_channels', valueNumber: 16 }]);
    const pub = await sheetOf(ids.dvr1);
    expect(pub.keySpecs.find((k) => k.key === 'analog_channels')?.value).toBe('4');
    expect(pub.preview).toBeUndefined();
    expect(facetValues(await catalog.keySpecFacets(ids.sub_dvr), 'analog_channels')).toEqual([['4', 1]]);
    expect(await found('analog_channels:16')).toEqual([]);

    const draft = await detail.previewById(ids.dvr1);
    expect(draft.keySpecs.find((k) => k.key === 'analog_channels')?.value).toBe('16');
    expect(draft.preview).toEqual({ mode: 'draft', unpublishedChanges: true });
    expect(withoutKeySpecs(draft)).toEqual(withoutKeySpecs(pub));
  });

  it('(5) the preview of a product that is not public works while the public sheet refuses it', async () => {
    await write(ids.dvrDraft, [{ specKey: 'analog_channels', valueNumber: 2 }]);
    await publish(ids.dvrDraft);
    await expect(detail.findByIdOrSlug(ids.dvrDraft)).rejects.toBeInstanceOf(NotFoundException);
    const preview = await detail.previewById(ids.dvrDraft);
    expect(preview.keySpecs.map((k) => [k.key, k.value])).toEqual([['analog_channels', '2']]);
    expect(preview.preview?.mode).toBe('draft');
    // Never public: not in facets, not in the filtered list.
    expect(facetValues(await catalog.keySpecFacets(ids.sub_dvr), 'analog_channels')).toEqual([['4', 1]]);
    expect(await found('analog_channels:2')).toEqual([]);
    await expect(detail.previewById('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('(6) publishing is idempotent and removes what the draft dropped', async () => {
    const first = await publish(ids.dvr2);
    expect(first).toMatchObject({ published: 1, unchanged: 0, removed: 0 });
    const again = await publish(ids.dvr2);
    expect(again).toEqual({ productId: ids.dvr2, published: 0, unchanged: 1, removed: 0 });
    expect(await publishedCount(ids.dvr2)).toBe(1);
    expect(await found('analog_channels:8')).toEqual(['SYN-DVR-002']);

    await write(ids.dvr2, [{ specKey: 'analog_channels', clear: true }]);
    expect(await publish(ids.dvr2)).toEqual({ productId: ids.dvr2, published: 0, unchanged: 0, removed: 1 });
    expect(await publishedCount(ids.dvr2)).toBe(0);
    expect(await found('analog_channels:8')).toEqual([]);
    await expect(publish('does-not-exist')).rejects.toMatchObject({ response: { code: 'product_not_found' } });
  });

  it('(7) other subcategories and PROPOSED template rows never leak into facets or sheets', async () => {
    await write(ids.sw1, [{ specKey: 'poe_budget', valueNumber: 100 }]);
    await publish(ids.sw1);
    await write(ids.dvr1, [{ specKey: 'color', optionKeys: ['RED'] }]);
    await publish(ids.dvr1);
    expect(await prisma.productSpecValue.count({ where: { productId: ids.dvr1, stage: 'PUBLISHED', definition: { key: 'color' } } })).toBe(1);

    const dvr = await catalog.keySpecFacets(ids.sub_dvr);
    expect(facetValues(dvr, 'poe_budget')).toEqual([['0', 1]]); // not the switch's 100
    expect(facetValues(dvr, 'color')).toBeUndefined(); // PROPOSED row
    expect((await sheetOf(ids.dvr1)).keySpecs.some((k) => k.key === 'color')).toBe(false);
    expect(facetValues(await catalog.keySpecFacets(ids.sub_switch), 'poe_budget')).toEqual([['100', 1]]);
    expect((await catalog.keySpecFacets(ids.sub_acc)).facets).toEqual([]);
    expect(await found('color:red')).toEqual([]);
    expect(await found('poe_budget:100')).toEqual(['SYN-SW-001']);
  });

  it('(8) the existing public fields and the product state are unchanged by key specs', async () => {
    const after = await sheetOf(ids.dvr1);
    expect(withoutKeySpecs(after)).toEqual(withoutKeySpecs(before));
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.dvr1 }, select: { lifecycleStatus: true } })).lifecycleStatus).toBe('PUBLISHED');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.dvrDraft }, select: { lifecycleStatus: true } })).lifecycleStatus).toBe('DRAFT');
  });
});
