/**
 * Integration test of the Prisma-backed readers of the catalog template against a REAL, DISPOSABLE PostgreSQL.
 * Not picked up by `npm test`:
 *   npx jest catalog-template --runInBand --testRegex='.*\.pgint\.ts$'
 * Only talks to 127.0.0.1:55433 (user pgtest). Creates its own database mt_t_<random> and drops it at the end.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { buildCatalogPlan, buildCatalogTemplate, loadSnapshot, parseCatalogTemplate, PrismaCatalogSnapshotReader, TemplateDictionary } from './index';

const HOST = '127.0.0.1'; const PORT = '55433'; const USER = 'pgtest';
const DB_NAME = `mt_t_${randomBytes(5).toString('hex')}`;
const ADMIN_URL = `postgresql://${USER}@${HOST}:${PORT}/postgres`;
const TARGET_URL = `postgresql://${USER}@${HOST}:${PORT}/${DB_NAME}?schema=public`;
for (const raw of [ADMIN_URL, TARGET_URL]) {
  const u = new URL(raw);
  if (u.hostname !== HOST || u.port !== PORT || u.username !== USER) throw new Error('Refusing to run: not the disposable server.');
}

describe('catalog template readers against disposable PostgreSQL', () => {
  jest.setTimeout(420_000);
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  let prisma: PrismaClient;

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}"`);
    execSync('npx prisma migrate deploy', { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: TARGET_URL }, stdio: 'pipe' });
    prisma = new PrismaClient({ datasources: { db: { url: TARGET_URL } } });
    await prisma.$connect();
  });
  afterAll(async () => {
    try { await prisma?.$disconnect(); } finally {
      try { await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`); } finally { await admin.$disconnect(); }
    }
  });

  it('reads dictionaries and products, plans an idempotent re-import and creates no master', async () => {
    const video = await prisma.category.create({ data: { name: 'Video', slug: 'video' } });
    const sub = await prisma.subcategory.create({ data: { categoryId: video.id, name: 'Camaras IP', slug: 'camaras-ip' } });
    const brand = await prisma.brand.create({ data: { name: 'Marca Sintetica', slug: 'marca-sintetica' } });
    const def = await prisma.specDefinition.create({ data: { key: 'channels', label: 'Canales', dataType: 'NUMBER', unit: 'canales' } });
    await prisma.subcategorySpec.create({ data: { subcategoryId: sub.id, specDefinitionId: def.id, status: 'APPROVED', approvedById: 'synthetic', approvedAt: new Date() } });
    await prisma.product.create({ data: { sku: 'SYN-1', name: 'Camara sintetica', brandId: brand.id, categoryId: video.id, subcategoryId: sub.id } });

    const reader = new PrismaCatalogSnapshotReader(prisma);
    const dictionary: TemplateDictionary = await reader.readDictionary();
    expect(dictionary.subcategories[0]).toMatchObject({ name: 'Camaras IP', category: 'Video' });
    expect(dictionary.subcategories[0].specs.map((s) => s.key)).toEqual(['channels']);

    const buffer = buildCatalogTemplate(dictionary, {
      products: [['syn- 1', 'Camara sintetica', 'Marca Sintetica', 'Camaras IP', 'Video', 'Descripcion nueva'], ['SYN-2', 'Camara nueva', 'Marca Inexistente', 'Camaras IP', '', '']],
      mainData: [['SYN-1', 'Canales', 'Conocido', 4]],
    });
    const parsed = parseCatalogTemplate(buffer);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.fatal));
    const before = { brands: await prisma.brand.count(), categories: await prisma.category.count(), subcategories: await prisma.subcategory.count(), defs: await prisma.specDefinition.count() };
    const plan = buildCatalogPlan(parsed.catalog, await loadSnapshot(reader, parsed.catalog));
    expect(plan.rows.map((r) => [r.sku, r.action])).toEqual([['SYN-1', 'update'], ['SYN-2', 'create']]);
    expect(plan.rows[0].changes.map((c) => c.field).sort()).toEqual(['description', 'mainData']);
    expect(plan.rows[1].issues.map((i) => i.code)).toEqual(['MAPPING_BRAND_UNKNOWN']);
    expect({ brands: await prisma.brand.count(), categories: await prisma.category.count(), subcategories: await prisma.subcategory.count(), defs: await prisma.specDefinition.count() }).toEqual(before);
  });
});
