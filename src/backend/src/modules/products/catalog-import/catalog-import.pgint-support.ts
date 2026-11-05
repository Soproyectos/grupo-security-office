/**
 * Shared support for the catalog-import integration tests (`*.pgint.ts`): disposable database, library wiring,
 * synthetic masters and a synthetic bulk workbook generator. SYNTHETIC data only. Never imported by production code.
 *
 * Safety: only the disposable server 127.0.0.1:55433 (user pgtest) is accepted, and only databases named `mt_v_<name>_<hex>`.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export const HOST = '127.0.0.1';
export const PORT = '55433';
export const USER = 'pgtest';

export interface DisposableDb { name: string; adminUrl: string; url: string }

export function disposableDb(tag: string): DisposableDb {
  const name = `mt_v_${tag}_${randomBytes(3).toString('hex')}`;
  const adminUrl = `postgresql://${USER}@${HOST}:${PORT}/postgres`;
  const url = `postgresql://${USER}@${HOST}:${PORT}/${name}?schema=public`;
  for (const raw of [adminUrl, url]) {
    const u = new URL(raw);
    if (u.hostname !== HOST || u.port !== PORT || u.username !== USER) throw new Error('Refusing to run: not the disposable server.');
  }
  if (!/^mt_v_[a-z0-9]+_[0-9a-f]{6}$/.test(name)) throw new Error('Refusing to run: unexpected database name.');
  return { name, adminUrl, url };
}

export async function createMigratedDb(db: DisposableDb, admin: PrismaClient): Promise<void> {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${db.name}"`);
  execSync('npx prisma migrate deploy', { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: db.url }, stdio: 'pipe', timeout: 250_000 });
}

export async function dropDb(db: DisposableDb, admin: PrismaClient): Promise<void> {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${db.name}" WITH (FORCE)`);
}

export interface LibraryHooks { beforeTransaction?: () => void }

/** Minimal stand-in of BibliotecaPrismaService over one client (legacy mode). `hooks.beforeTransaction` may throw to inject a failure. */
export function fakeLibrary(prisma: PrismaClient, hooks: LibraryHooks = {}) {
  return {
    client: prisma, config: { mode: 'legacy' }, assertWritesAllowed: () => undefined,
    writeTransaction: <T>(fn: (tx: PrismaClient) => Promise<T>, options?: object) => {
      hooks.beforeTransaction?.();
      return prisma.$transaction((tx) => fn(tx as unknown as PrismaClient), { timeout: 60_000, ...(options as object) });
    },
  };
}

/** Counts of every master/dictionary table: an import must never change them. */
export async function masterCounts(prisma: PrismaClient) {
  const one = async (table: string) => Number((await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM "${table}"`))[0].n);
  const tables = ['brands', 'categories', 'subcategories', 'spec_definitions', 'spec_options', 'subcategory_specs', 'price_lists', 'prices'];
  return Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await one(t)])));
}

export interface MasterIds { video: string; redes: string; dvr: string; sw: string; acc: string; brands: string[] }

/** Video/Redes, three subcategories with approved templates (DVR, switch, accessory), three brands. */
export async function seedMasters(prisma: PrismaClient): Promise<MasterIds> {
  const video = await prisma.category.create({ data: { name: 'Video', slug: 'video' } });
  const redes = await prisma.category.create({ data: { name: 'Redes', slug: 'redes' } });
  const dvr = await prisma.subcategory.create({ data: { categoryId: video.id, name: 'Grabadores DVR', slug: 'grabadores-dvr' } });
  const sw = await prisma.subcategory.create({ data: { categoryId: redes.id, name: 'Switches', slug: 'switches' } });
  const acc = await prisma.subcategory.create({ data: { categoryId: video.id, name: 'Accesorios', slug: 'accesorios' } });
  const brands = [] as string[];
  for (const n of ['A', 'B', 'C']) brands.push((await prisma.brand.create({ data: { name: `Marca Sintetica ${n}`, slug: `marca-sintetica-${n.toLowerCase()}` } })).id);
  const def = (key: string, label: string, dataType: any, unit?: string) => prisma.specDefinition.create({ data: { key, label, dataType, unit: unit ?? null } });
  const channels = await def('channels', 'Canales', 'NUMBER', 'canales');
  const resolution = await def('resolution', 'Resolucion maxima', 'OPTION');
  const poe = await def('poe', 'Puertos PoE', 'BOOLEAN');
  const ports = await def('ports', 'Puertos', 'NUMBER', 'puertos');
  const material = await def('material', 'Material', 'TEXT');
  for (const [i, [key, label]] of [['4mp', '4 MP'], ['8mp', '8 MP']].entries()) await prisma.specOption.create({ data: { specDefinitionId: resolution.id, key, label, sortOrder: i } });
  const attach = async (subId: string, defs: Array<{ id: string }>) => {
    for (const [i, d] of defs.entries()) await prisma.subcategorySpec.create({ data: { subcategoryId: subId, specDefinitionId: d.id, status: 'APPROVED', sortOrder: i, approvedById: 'synthetic', approvedAt: new Date() } });
  };
  await attach(dvr.id, [channels, resolution, poe]);
  await attach(sw.id, [ports]);
  await attach(acc.id, [material]);
  return { video: video.id, redes: redes.id, dvr: dvr.id, sw: sw.id, acc: acc.id, brands };
}

export interface BulkExpected {
  products: number; specValues: number; specItems: number; specGroups: number; resources: number; images: number; rowsInFile: number;
}
export interface BulkRows {
  products: unknown[][]; mainData: unknown[][]; specs: unknown[][]; highlights: unknown[][]; resources: unknown[][]; related: unknown[][];
  expected: BulkExpected;
}

/** Synthetic catalog: 40% DVR, 30% switch, 30% accessory, each using different sheets. */
export function bulkRows(prefix: string, count: number, offset = 0): BulkRows {
  const out: BulkRows = { products: [], mainData: [], specs: [], highlights: [], resources: [], related: [], expected: { products: count, specValues: 0, specItems: 0, specGroups: 0, resources: 0, images: 0, rowsInFile: 0 } };
  const e = out.expected;
  const sku = (i: number) => `${prefix}-${String(i + 1).padStart(5, '0')}`;
  for (let k = 0; k < count; k++) {
    const i = k + offset; const s = sku(i); const m = i % 10;
    const brand = `Marca Sintetica ${'ABC'[i % 3]}`;
    if (m < 4) {
      out.products.push([s, `Grabador DVR ${s}`, brand, 'Grabadores DVR', i % 2 ? 'Video' : '', `Grabador sintetico ${s} con varias funciones.`]);
      out.mainData.push([s, 'Canales', 'Conocido', 4 + (i % 4) * 4], [s, 'Resolucion maxima', 'Conocido', i % 2 ? '4 MP' : '8 MP'], [s, 'Puertos PoE', 'Conocido', i % 2 ? 'Si' : 'No']);
      out.specs.push([s, 'Video', 'Compresion', 'H.265+', 0], [s, 'Almacenamiento', 'Discos', '1 disco SATA', 1]);
      out.highlights.push([s, 'Destacado', `Reproduccion simultanea ${s}`, 0], [s, 'Caracteristica', 'Compresion H.265+', 1]);
      out.resources.push([s, 'Imagen', 'Vista frontal', `https://ejemplo.invalid/img/${s}.jpg`, 0], [s, 'Documento', 'Ficha tecnica', `https://ejemplo.invalid/doc/${s}.pdf`, 1]);
      if (k + 1 < count) out.related.push([s, sku(i + 1)]);
      e.specValues += 3; e.specItems += 2; e.specGroups += 2; e.resources += 1; e.images += 1;
    } else if (m < 7) {
      out.products.push([s, `Switch ${s}`, brand, 'Switches', '', `Switch sintetico ${s}.`]);
      out.mainData.push([s, 'Puertos', 'Conocido', 8 + (i % 3) * 8]);
      out.specs.push([s, 'Red', 'Velocidad', '1 Gbps', 0]);
      out.highlights.push([s, 'Insignia', 'PoE', 0]);
      out.resources.push([s, 'Firmware', 'Firmware v1', `https://ejemplo.invalid/fw/${s}.bin`, 0]);
      e.specValues += 1; e.specItems += 1; e.specGroups += 1; e.resources += 1;
    } else {
      out.products.push([s, `Accesorio ${s}`, brand, 'Accesorios', 'Video', '']);
      out.mainData.push([s, 'Material', 'Conocido', 'Aluminio']);
      out.highlights.push([s, 'Destacado', `Accesorio ${s}`, 0]);
      e.specValues += 1;
    }
  }
  e.rowsInFile = out.products.length + out.mainData.length + out.specs.length + out.highlights.length + out.resources.length + out.related.length;
  return out;
}

/** Row counts of the product-owned tables (what an import writes). */
export async function productTables(prisma: PrismaClient) {
  const one = async (sql: string) => Number((await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(sql))[0].n);
  return {
    products: await one('SELECT count(*) AS n FROM products'),
    specValues: await one('SELECT count(*) AS n FROM product_spec_values'),
    specGroups: await one('SELECT count(*) AS n FROM product_catalog_spec_groups'),
    specItems: await one('SELECT count(*) AS n FROM product_catalog_spec_items'),
    resources: await one('SELECT count(*) AS n FROM product_catalog_resources'),
    images: await one('SELECT count(*) AS n FROM product_images'),
    changes: await one('SELECT count(*) AS n FROM product_changes'),
    sources: await one('SELECT count(*) AS n FROM product_sources'),
  };
}

/** Fingerprint of every product-owned row's updatedAt: equal before/after = nothing was written. */
export async function writeFingerprint(prisma: PrismaClient): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ h: string }>>(
    `SELECT md5(coalesce((SELECT string_agg(id || ':' || "updatedAt"::text, ',' ORDER BY id) FROM products), '') || '|' ||
       coalesce((SELECT string_agg("productId" || ':' || "specDefinitionId" || ':' || stage::text || ':' || "updatedAt"::text, ',' ORDER BY "productId", "specDefinitionId", stage) FROM product_spec_values), '')) AS h`);
  return rows[0].h;
}
