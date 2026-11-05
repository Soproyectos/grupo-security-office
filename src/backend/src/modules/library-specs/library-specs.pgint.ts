/**
 * Integration test of the key-data services against a REAL, DISPOSABLE PostgreSQL.
 *
 * Not picked up by `npm test` (the name does not end in .spec.ts). Run it explicitly:
 *   npx jest --runInBand --testRegex '.*\.pgint\.ts$' library-specs
 *
 * Safety: it only ever connects to the disposable server 127.0.0.1:55433 (anything else is refused before
 * any connection), creates its own database `mt_f2_<random>`, migrates it with `prisma migrate deploy`,
 * seeds SYNTHETIC rows and drops the database at the end, also when a test fails.
 */
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductSpecValuesService } from './product-spec-values.service';
import { SpecDictionaryService } from './spec-dictionary.service';
import { SpecTemplateService } from './spec-template.service';

const ALLOWED_HOST = '127.0.0.1';
const ALLOWED_PORT = '55433';
const DB_NAME = `mt_f2_${randomBytes(4).toString('hex')}`;
const ADMIN_URL = `postgresql://pgtest@${ALLOWED_HOST}:${ALLOWED_PORT}/postgres`;
const DB_URL = `postgresql://pgtest@${ALLOWED_HOST}:${ALLOWED_PORT}/${DB_NAME}?schema=public`;

function assertDisposableTarget(raw: string): void {
  const u = new URL(raw);
  if (u.hostname !== ALLOWED_HOST || u.port !== ALLOWED_PORT || u.username !== 'pgtest') {
    throw new Error(`Refusing to run: ${u.hostname}:${u.port} is not the disposable server ${ALLOWED_HOST}:${ALLOWED_PORT}.`);
  }
  if (!/^mt_f2_[0-9a-f]{8}$/.test(u.pathname.replace(/^\//, '')) && u.pathname !== '/postgres') {
    throw new Error('Refusing to run: unexpected database name.');
  }
}

jest.setTimeout(240_000);

describe('library key specs against disposable PostgreSQL', () => {
  let prisma: PrismaClient;
  let dictionary: SpecDictionaryService;
  let templates: SpecTemplateService;
  let values: ProductSpecValuesService;
  let created = false;
  const ids: Record<string, string> = {};
  const actor = { userId: 'user-syn-editor' };
  const editor = { kind: 'editor' };

  const raw = async <T = any>(sql: string, ...params: unknown[]): Promise<T[]> => prisma.$queryRawUnsafe<T[]>(sql, ...params);
  const stored = async (productId: string, specKey: string, stage = 'WORKING') =>
    (
      await raw(
        `SELECT v."dataType"::text AS "dataType", v."valueText", v."valueNumber"::text AS "valueNumber", v."valueBoolean",
                COALESCE((SELECT array_agg(o."optionKey" ORDER BY o."optionKey") FROM product_spec_value_options o
                          WHERE o."productId"=v."productId" AND o."specDefinitionId"=v."specDefinitionId" AND o."stage"=v."stage"), '{}') AS "optionKeys",
                v."updatedById"
           FROM product_spec_values v JOIN spec_definitions d ON d.id = v."specDefinitionId"
          WHERE v."productId"=$1 AND d.key=$2 AND v."stage"=$3::"SpecValueStage"`,
        productId,
        specKey,
        stage,
      )
    )[0];
  const write = (productId: string, entries: any[], source: any = editor) =>
    values.writeProductSpecValues(productId, entries, { source, actor });
  const outcome = (r: any[], key: string) => r.find((x) => x.specKey === key);

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
    execSync('npx prisma migrate deploy', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: DB_URL },
      stdio: 'pipe',
      timeout: 200_000,
    });

    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();
    const svc = prisma as unknown as PrismaService;
    dictionary = new SpecDictionaryService(svc);
    templates = new SpecTemplateService(svc);
    values = new ProductSpecValuesService(svc);

    // Synthetic classification and products.
    const root = await prisma.category.create({ data: { name: 'Synthetic root', slug: 'syn-root' } });
    const brand = await prisma.brand.create({ data: { name: 'Synthetic brand', slug: 'syn-brand' } });
    for (const [k, name] of [['dvr', 'DVR recorders'], ['switch', 'Switches'], ['acc', 'Accessories']] as const) {
      const sub = await prisma.subcategory.create({ data: { categoryId: root.id, name, slug: `syn-${k}` } });
      ids[`sub_${k}`] = sub.id;
      const p = await prisma.product.create({
        data: { sku: `SYN-${k.toUpperCase()}-001`, name: `Synthetic ${name}`, categoryId: root.id, brandId: brand.id, subcategoryId: sub.id },
      });
      ids[`prod_${k}`] = p.id;
    }

    // Dictionary through the service (DVR, switch, accessory example data).
    await dictionary.create({ key: 'device_type', label: 'Tipo de equipo', dataType: 'OPTION', options: [{ key: 'DVR', label: 'DVR' }, { key: 'NVR', label: 'NVR' }] });
    await dictionary.create({ key: 'analog_channels', label: 'Canales analogicos', dataType: 'NUMBER' });
    await dictionary.create({ key: 'storage', label: 'Almacenamiento', dataType: 'TEXT' });
    await dictionary.create({
      key: 'analytics', label: 'Analitica', dataType: 'MULTI_OPTION',
      options: [{ key: 'ACUSENSE', label: 'AcuSense' }, { key: 'MOTION', label: 'Movimiento' }, { key: 'LEGACY', label: 'Anterior', isActive: false }],
    });
    await dictionary.create({ key: 'audio_in', label: 'Entrada de audio', dataType: 'BOOLEAN' });
    await dictionary.create({ key: 'poe_budget', label: 'Potencia PoE', dataType: 'NUMBER', unit: 'W' });
    await dictionary.create({ key: 'screen_size', label: 'Pantalla', dataType: 'NUMBER', unit: 'in' });
    await dictionary.create({ key: 'total_ports', label: 'Puertos', dataType: 'NUMBER' });
    await dictionary.create({ key: 'color', label: 'Color', dataType: 'OPTION', options: [{ key: 'RED', label: 'Rojo' }, { key: 'BLUE', label: 'Azul' }] });

    // Example templates enter as PROPOSED.
    await templates.upsertEntries(ids.sub_dvr, [
      { specKey: 'device_type', sortOrder: 10, isRequired: true, requiredReason: 'Defines what the buyer is choosing.', isFilterable: true },
      { specKey: 'analog_channels', sortOrder: 20, isFilterable: true },
      { specKey: 'storage', sortOrder: 30 },
      { specKey: 'analytics', sortOrder: 40, isFilterable: true },
      { specKey: 'audio_in', sortOrder: 50 },
      { specKey: 'poe_budget', sortOrder: 60 },
      { specKey: 'screen_size', sortOrder: 70 },
    ]);
    await templates.upsertEntries(ids.sub_switch, [
      { specKey: 'total_ports', sortOrder: 10, isRequired: true, requiredReason: 'Ports decide the purchase.' },
      { specKey: 'poe_budget', sortOrder: 20 },
    ]);
    await templates.upsertEntries(ids.sub_acc, [{ specKey: 'color', sortOrder: 10 }]);
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

  it('refuses any target other than the disposable server', () => {
    expect(() => assertDisposableTarget('postgresql://pgtest@10.0.0.5:55433/mt_f2_abcdef12')).toThrow(/Refusing/);
    expect(() => assertDisposableTarget('postgresql://pgtest@127.0.0.1:5432/mt_f2_abcdef12')).toThrow(/Refusing/);
  });

  describe('dictionary', () => {
    it('rejects duplicates, bad keys, units on non-numbers and unit changes once values exist', async () => {
      await expect(dictionary.create({ key: 'storage', label: 'x', dataType: 'TEXT' })).rejects.toMatchObject({ response: { code: 'spec_key_taken' } });
      await expect(dictionary.create({ key: 'Bad Key', label: 'x', dataType: 'TEXT' })).rejects.toMatchObject({ response: { code: 'invalid_key' } });
      await expect(dictionary.create({ key: 'txt_unit', label: 'x', dataType: 'TEXT', unit: 'W' })).rejects.toMatchObject({ response: { code: 'unit_not_allowed' } });
      await expect(dictionary.create({ key: 'no_opts', label: 'x', dataType: 'OPTION' })).rejects.toMatchObject({ response: { code: 'options_required' } });
      const got = await dictionary.get('analytics');
      expect(got.options.map((o) => [o.key, o.isActive])).toEqual([['ACUSENSE', true], ['MOTION', true], ['LEGACY', false]]);
      const upd = await dictionary.update('color', { options: [{ key: 'GREEN', label: 'Verde' }, { key: 'BLUE', label: 'Azul', isActive: false }] });
      expect(upd.options.map((o) => [o.key, o.isActive]).sort()).toEqual([['BLUE', false], ['GREEN', true], ['RED', true]]);
    });
  });

  describe('templates (moldes)', () => {
    it('example templates are PROPOSED and carry no approver; PUT cannot approve', async () => {
      const t = await templates.get(ids.sub_dvr);
      expect(t.summary).toEqual({ proposed: 7, approved: 0, retired: 0 });
      expect(t.entries.every((e) => e.approvedBy === null && e.approvedAt === null && e.counts === false)).toBe(true);
      await expect(templates.upsertEntries(ids.sub_dvr, [{ specKey: 'storage', status: 'APPROVED' as any }])).rejects.toMatchObject({
        response: { code: 'invalid_template_entries', details: [expect.objectContaining({ code: 'approval_requires_explicit_action' })] },
      });
    });

    it('a required datum needs a written justification: service and DB CHECK both refuse', async () => {
      await expect(templates.upsertEntries(ids.sub_dvr, [{ specKey: 'storage', isRequired: true }])).rejects.toMatchObject({
        response: { details: [expect.objectContaining({ code: 'required_without_reason' })] },
      });
      await expect(raw(`UPDATE subcategory_specs SET "isRequired"=true, "requiredReason"='   ' WHERE "subcategoryId"=$1`, ids.sub_dvr)).rejects.toThrow(/subcategory_specs_required_reason_check/);
      await expect(raw(`UPDATE subcategory_specs SET status='APPROVED' WHERE "subcategoryId"=$1`, ids.sub_dvr)).rejects.toThrow(/subcategory_specs_approval_check/);
    });

    it('approval is an explicit call with a named approver; required rows need the justification', async () => {
      await expect(templates.approve(ids.sub_dvr, 'device_type', '  ', {})).rejects.toMatchObject({ response: { code: 'approver_required' } });
      const done = await templates.approve(ids.sub_dvr, 'device_type', 'Ana Approver', {}, new Date('2026-10-29T12:00:00Z'));
      expect(done.outcome).toBe('approved');
      const row = (await raw(`SELECT status::text, "approvedById", "approvedAt" FROM subcategory_specs s JOIN spec_definitions d ON d.id=s."specDefinitionId" WHERE s."subcategoryId"=$1 AND d.key='device_type'`, ids.sub_dvr))[0];
      expect(row.status).toBe('APPROVED');
      expect(row.approvedById).toBe('Ana Approver');
      expect((await templates.approve(ids.sub_dvr, 'device_type', 'Ana Approver', {})).outcome).toBe('unchanged');
      // The other rows stayed PROPOSED: nothing is approved automatically.
      expect((await templates.get(ids.sub_dvr)).summary).toEqual({ proposed: 6, approved: 1, retired: 0 });
    });

    it('changing the required flag of an approved row sends it back to PROPOSED', async () => {
      const r = await templates.upsertEntries(ids.sub_dvr, [{ specKey: 'device_type', requiredReason: 'New written reason.' }]);
      expect(r.results[0]).toMatchObject({ outcome: 'updated', approvalReset: true });
      const e = r.template.entries.find((x) => x.specKey === 'device_type')!;
      expect(e.status).toBe('PROPOSED');
      expect(e.approvedBy).toBeNull();
      await templates.approve(ids.sub_dvr, 'device_type', 'Ana Approver', {});
    });

    it('approves the rest of the DVR, switch and accessory templates', async () => {
      for (const key of ['analog_channels', 'storage', 'analytics', 'audio_in', 'poe_budget', 'screen_size']) {
        await templates.approve(ids.sub_dvr, key, 'Ana Approver', {});
      }
      await templates.approve(ids.sub_switch, 'total_ports', 'Ana Approver', {});
      await templates.approve(ids.sub_switch, 'poe_budget', 'Ana Approver', {});
      await templates.approve(ids.sub_acc, 'color', 'Ana Approver', {});
      expect((await templates.get(ids.sub_dvr)).summary.approved).toBe(7);
    });
  });

  describe('product values', () => {
    it('saves and recovers exact values of every supported type', async () => {
      const r = await write(ids.prod_dvr, [
        { specKey: 'device_type', optionKeys: ['NVR'] },
        { specKey: 'analog_channels', valueNumber: 16 },
        { specKey: 'storage', valueText: '  2 TB SATA  ' },
        { specKey: 'analytics', optionKeys: ['MOTION', 'ACUSENSE'] },
        { specKey: 'audio_in', valueBoolean: true },
        { specKey: 'poe_budget', valueNumber: 123.456789, unit: 'W' },
        { specKey: 'screen_size', valueNumber: 10.1, unit: 'in' },
      ]);
      expect(r.map((x) => x.outcome)).toEqual(Array(7).fill('saved'));
      expect(await stored(ids.prod_dvr, 'device_type')).toMatchObject({ dataType: 'OPTION', optionKeys: ['NVR'], valueText: null, valueNumber: null, valueBoolean: null });
      expect(await stored(ids.prod_dvr, 'analog_channels')).toMatchObject({ dataType: 'NUMBER', valueNumber: '16.000000' });
      expect(await stored(ids.prod_dvr, 'storage')).toMatchObject({ valueText: '2 TB SATA' });
      expect(await stored(ids.prod_dvr, 'analytics')).toMatchObject({ dataType: 'MULTI_OPTION', optionKeys: ['ACUSENSE', 'MOTION'] });
      expect(await stored(ids.prod_dvr, 'audio_in')).toMatchObject({ valueBoolean: true });
      expect(await stored(ids.prod_dvr, 'poe_budget')).toMatchObject({ valueNumber: '123.456789', updatedById: 'user-syn-editor' });
      expect(await stored(ids.prod_dvr, 'screen_size')).toMatchObject({ valueNumber: '10.100000' });
      const view = await values.getValues(ids.prod_dvr);
      const item = (k: string) => view.items.find((i) => i.specKey === k)!;
      expect(item('screen_size').working).toMatchObject({ valueNumber: 10.1, state: 'set' });
      expect(item('analytics').working!.optionKeys).toEqual(['ACUSENSE', 'MOTION']);
    });

    it('keeps zero, false, unknown distinct and never turns missing data into 0', async () => {
      await write(ids.prod_dvr, [{ specKey: 'analog_channels', valueNumber: 0 }, { specKey: 'audio_in', valueBoolean: false }]);
      expect(await stored(ids.prod_dvr, 'analog_channels')).toMatchObject({ valueNumber: '0.000000' });
      expect(await stored(ids.prod_dvr, 'audio_in')).toMatchObject({ valueBoolean: false });
      const view = await values.getValues(ids.prod_dvr);
      const state = (k: string) => view.items.find((i) => i.specKey === k)!.state;
      expect(state('analog_channels')).toBe('zero');
      expect(state('audio_in')).toBe('false');
      // The switch product has no value at all for its datum: unknown, no row.
      const sw = await values.getValues(ids.prod_switch);
      expect(sw.items.find((i) => i.specKey === 'total_ports')!.state).toBe('unknown');
      expect(await stored(ids.prod_switch, 'total_ports')).toBeUndefined();
      // A null number is blank, not 0.
      const r = await write(ids.prod_switch, [{ specKey: 'total_ports', valueNumber: null }]);
      expect(r[0]).toMatchObject({ outcome: 'unchanged', code: 'blank_ignored' });
      expect(await stored(ids.prod_switch, 'total_ports')).toBeUndefined();
    });

    it('rejects invalid option, unit, type, length, membership and unknown datum without writing them', async () => {
      const r = await write(ids.prod_dvr, [
        { specKey: 'device_type', optionKeys: ['LEGACY_BOX'] },
        { specKey: 'device_type', optionKeys: ['DVR'] },
        { specKey: 'poe_budget', valueNumber: 5, unit: 'mW' },
        { specKey: 'analog_channels', valueText: 'ocho' },
        { specKey: 'analog_channels', valueNumber: 8 },
        { specKey: 'storage', valueText: 'x'.repeat(301) },
        { specKey: 'color', optionKeys: ['RED'] },
        { specKey: 'nonexistent', valueText: 'x' },
        { specKey: 'analytics', optionKeys: ['LEGACY'] },
        { specKey: 'screen_size', valueNumber: 1e15 },
      ]);
      expect(r.map((x) => x.code)).toEqual([
        'option_not_allowed', 'duplicate_entry', 'unit_mismatch', 'type_mismatch', 'duplicate_entry', 'text_too_long',
        'not_in_template', 'unknown_spec', 'option_inactive', 'number_out_of_range',
      ]);
      expect(r.every((x) => x.outcome === 'rejected')).toBe(true);
      expect(await stored(ids.prod_dvr, 'device_type')).toMatchObject({ optionKeys: ['NVR'] });
      expect(await stored(ids.prod_dvr, 'storage')).toMatchObject({ valueText: '2 TB SATA' });
      // The database itself also refuses an option outside the dictionary and a wrong shape.
      await expect(raw(`INSERT INTO product_spec_value_options ("productId","specDefinitionId","stage","optionKey")
                        SELECT $1, d.id, 'WORKING', 'NOPE' FROM spec_definitions d WHERE d.key='device_type'`, ids.prod_dvr)).rejects.toThrow();
      await expect(raw(`UPDATE product_spec_values SET "valueNumber"=1, "valueText"='a' WHERE "productId"=$1`, ids.prod_dvr)).rejects.toThrow(/product_spec_values_shape_check/);
    });

    it('is idempotent: re-running the same write reports unchanged and touches nothing', async () => {
      const before = await raw(`SELECT "specDefinitionId", "updatedAt" FROM product_spec_values WHERE "productId"=$1 ORDER BY 1`, ids.prod_dvr);
      const sourcesBefore = await prisma.productSource.count({ where: { productId: ids.prod_dvr } });
      const r = await write(ids.prod_dvr, [
        { specKey: 'device_type', optionKeys: ['NVR'] },
        { specKey: 'analytics', optionKeys: ['ACUSENSE', 'MOTION'] },
        { specKey: 'poe_budget', valueNumber: 123.4567891, unit: 'W' },
        { specKey: 'storage', valueText: '2 TB SATA' },
        { specKey: 'audio_in', valueBoolean: false },
      ]);
      expect(r.map((x) => x.outcome)).toEqual(Array(5).fill('unchanged'));
      expect(await raw(`SELECT "specDefinitionId", "updatedAt" FROM product_spec_values WHERE "productId"=$1 ORDER BY 1`, ids.prod_dvr)).toEqual(before);
      expect(await prisma.productSource.count({ where: { productId: ids.prod_dvr } })).toBe(sourcesBefore);
    });

    it('blank never erases; erasing needs an explicit clear and only touches the working value', async () => {
      const blank = await write(ids.prod_dvr, [
        { specKey: 'storage', valueText: '   ' },
        { specKey: 'analytics', optionKeys: [] },
        { specKey: 'device_type' },
      ]);
      expect(blank.map((x) => [x.outcome, x.code])).toEqual([['unchanged', 'blank_ignored'], ['unchanged', 'blank_ignored'], ['unchanged', 'blank_ignored']]);
      expect(await stored(ids.prod_dvr, 'storage')).toMatchObject({ valueText: '2 TB SATA' });
      expect(await stored(ids.prod_dvr, 'analytics')).toMatchObject({ optionKeys: ['ACUSENSE', 'MOTION'] });

      const mixed = await write(ids.prod_dvr, [{ specKey: 'storage', clear: true, valueText: 'x' }]);
      expect(mixed[0]).toMatchObject({ outcome: 'rejected', code: 'clear_with_value' });
      const cleared = await write(ids.prod_dvr, [{ specKey: 'storage', clear: true }, { specKey: 'analytics', clear: true }]);
      expect(cleared.map((x) => x.outcome)).toEqual(['saved', 'saved']);
      expect(await stored(ids.prod_dvr, 'storage')).toBeUndefined();
      expect(await stored(ids.prod_dvr, 'analytics')).toBeUndefined();
      expect(await raw(`SELECT 1 FROM product_spec_value_options WHERE "productId"=$1 AND "specDefinitionId"=(SELECT id FROM spec_definitions WHERE key='analytics')`, ids.prod_dvr)).toHaveLength(0);
      expect((await write(ids.prod_dvr, [{ specKey: 'storage', clear: true }]))[0].outcome).toBe('unchanged');
    });

    it('a change over a PUBLISHED value is a new draft and the published projection stays the same', async () => {
      // Simulate the publication step (not part of this task): copy the working values to PUBLISHED.
      await write(ids.prod_dvr, [{ specKey: 'storage', valueText: '2 TB SATA' }, { specKey: 'analytics', optionKeys: ['MOTION'] }]);
      await prisma.$executeRawUnsafe(
        `INSERT INTO product_spec_values ("productId","specDefinitionId","stage","dataType","valueText","valueNumber","valueBoolean","updatedAt")
         SELECT "productId","specDefinitionId",'PUBLISHED',"dataType","valueText","valueNumber","valueBoolean",now() FROM product_spec_values
          WHERE "productId"=$1 AND stage='WORKING'`, ids.prod_dvr);
      await prisma.$executeRawUnsafe(
        `INSERT INTO product_spec_value_options ("productId","specDefinitionId","stage","optionKey")
         SELECT "productId","specDefinitionId",'PUBLISHED',"optionKey" FROM product_spec_value_options WHERE "productId"=$1 AND stage='WORKING'`, ids.prod_dvr);

      const publishedBefore = (await values.getProjections(ids.prod_dvr)).published;
      expect(publishedBefore.sheetGroup!.items.map((i) => i.label)).toEqual(expect.arrayContaining(['Almacenamiento', 'Canales analogicos']));
      const storageRowBefore = await stored(ids.prod_dvr, 'storage', 'PUBLISHED');

      const r = await write(ids.prod_dvr, [{ specKey: 'storage', valueText: '4 TB SATA' }, { specKey: 'analog_channels', valueNumber: 32 }]);
      expect(r.map((x) => x.outcome)).toEqual(['saved', 'saved']);

      const after = await values.getProjections(ids.prod_dvr);
      expect(after.published).toEqual(publishedBefore);
      expect(await stored(ids.prod_dvr, 'storage', 'PUBLISHED')).toEqual(storageRowBefore);
      expect(await stored(ids.prod_dvr, 'storage', 'WORKING')).toMatchObject({ valueText: '4 TB SATA' });
      const draftItems = after.draft.sheetGroup!.items;
      expect(draftItems.find((i) => i.label === 'Almacenamiento')!.value).toBe('4 TB SATA');
      expect(publishedBefore.sheetGroup!.items.find((i) => i.label === 'Almacenamiento')!.value).toBe('2 TB SATA');

      const view = await values.getValues(ids.prod_dvr);
      expect(view.items.find((i) => i.specKey === 'storage')).toMatchObject({ pendingChange: true });
      // Clearing is refused for a published value that has no draft.
      expect((await write(ids.prod_dvr, [{ specKey: 'analytics', clear: true }]))[0].outcome).toBe('saved');
      expect((await write(ids.prod_dvr, [{ specKey: 'analytics', clear: true }]))[0]).toMatchObject({ outcome: 'rejected', code: 'cannot_clear_published' });
    });

    it('records provenance in product_sources, one row per identity, never another product\'s', async () => {
      const rows = await prisma.productSource.findMany({ where: { productId: ids.prod_dvr } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ sourceFile: 'editor', sourceSheet: ids.prod_dvr, sourceRow: 1, originalReference: 'SYN-DVR-001' });
      expect((rows[0].extra as any).specKeys).toEqual(expect.arrayContaining(['device_type', 'storage']));

      const imp = { kind: 'import', ref: 'lista-sintetica.xlsx', sheet: 'Hoja1', row: 7 };
      await write(ids.prod_acc, [{ specKey: 'color', optionKeys: ['RED'] }], imp);
      const accRows = await prisma.productSource.findMany({ where: { productId: ids.prod_acc } });
      expect(accRows).toHaveLength(1);
      expect(accRows[0]).toMatchObject({ sourceFile: 'lista-sintetica.xlsx', sourceSheet: 'Hoja1', sourceRow: 7 });
      // Same identity used by a different product is refused and nothing is saved.
      await expect(write(ids.prod_switch, [{ specKey: 'total_ports', valueNumber: 24 }], imp)).rejects.toMatchObject({ response: { code: 'source_identity_taken' } });
      expect(await stored(ids.prod_switch, 'total_ports')).toBeUndefined();
      // The service refuses a bad row number and the DB CHECK refuses it too.
      await expect(write(ids.prod_switch, [{ specKey: 'total_ports', valueNumber: 24 }], { kind: 'import', ref: 'f.xlsx', row: 0 })).rejects.toMatchObject({ response: { code: 'invalid_source' } });
      await expect(raw(`INSERT INTO product_sources (id,"productId","sourceFile","sourceSheet","sourceRow","cutoffDate","originalReference") VALUES ('x',$1,'f','s',0,now(),'r')`, ids.prod_switch)).rejects.toThrow(/sourceRow|check/i);
    });

    it('reports missing required data (APPROVED rows only) and flags nothing for proposed ones', async () => {
      const dvr = await values.getMissing(ids.prod_dvr);
      expect(dvr.missing).toEqual([]);
      const sw = await values.getMissing(ids.prod_switch);
      expect(sw.missing.map((m) => m.specKey)).toEqual(['total_ports']);
      await write(ids.prod_switch, [{ specKey: 'total_ports', valueNumber: 24 }]);
      expect((await values.getMissing(ids.prod_switch)).missing).toEqual([]);
      expect((await values.getMissing(ids.prod_switch, 'PUBLISHED')).missing.map((m) => m.specKey)).toEqual(['total_ports']);
    });
  });

  describe('subcategory change', () => {
    it('previews kept / needs review / newly missing and deletes nothing', async () => {
      // The DVR product holds device_type, analog_channels, audio_in, poe_budget, screen_size, storage ...
      const countBefore = await prisma.productSpecValue.count({ where: { productId: ids.prod_dvr } });
      const preview = await values.previewSubcategoryChange(ids.prod_dvr, ids.sub_switch);
      expect(preview.fromSubcategoryId).toBe(ids.sub_dvr);
      expect(preview.kept.map((k) => k.specKey)).toEqual(['poe_budget']);
      expect(preview.needsReview.map((k) => k.specKey)).toEqual(expect.arrayContaining(['analog_channels', 'audio_in', 'device_type', 'screen_size', 'storage']));
      expect(preview.newlyMissing).toEqual([expect.objectContaining({ specKey: 'total_ports', isRequired: true, status: 'APPROVED' })]);
      expect(await prisma.productSpecValue.count({ where: { productId: ids.prod_dvr } })).toBe(countBefore);

      // After the product actually moves, its old values are kept and reported as outside the template.
      await prisma.product.update({ where: { id: ids.prod_dvr }, data: { subcategoryId: ids.sub_switch } });
      const view = await values.getValues(ids.prod_dvr);
      expect(await prisma.productSpecValue.count({ where: { productId: ids.prod_dvr } })).toBe(countBefore);
      expect(view.items.find((i) => i.specKey === 'storage')).toMatchObject({ outsideTemplate: true, template: null });
      expect(view.items.find((i) => i.specKey === 'poe_budget')).toMatchObject({ outsideTemplate: false });
      expect(view.outsideTemplateCount).toBeGreaterThanOrEqual(5);
      // New writes follow the new template.
      const r = await write(ids.prod_dvr, [{ specKey: 'storage', valueText: 'again' }, { specKey: 'total_ports', valueNumber: 8 }]);
      expect(r.map((x) => [x.specKey, x.outcome, x.code])).toEqual([['storage', 'rejected', 'not_in_template'], ['total_ports', 'saved', undefined]]);
      await expect(values.previewSubcategoryChange(ids.prod_dvr, 'missing-sub')).rejects.toMatchObject({ response: { code: 'subcategory_not_found' } });
    });

    it('removing a datum from a template only retires it: values stay stored', async () => {
      await templates.upsertEntries(ids.sub_switch, [{ specKey: 'poe_budget', status: 'RETIRED' }]);
      expect((await templates.get(ids.sub_switch)).summary.retired).toBe(1);
      const stillThere = await prisma.productSpecValue.count({ where: { productId: ids.prod_dvr } });
      expect(stillThere).toBeGreaterThan(0);
      const view = await values.getValues(ids.prod_dvr);
      expect(view.items.find((i) => i.specKey === 'poe_budget')).toMatchObject({ outsideTemplate: true });
    });
  });

  describe('explicit answers: unknown / not applicable / zero / false / never answered', () => {
    const st: Record<string, string> = {};
    const answers = async (productId: string) =>
      raw<{ key: string; stage: string; state: string; valueNumber: string | null; valueBoolean: boolean | null; valueText: string | null }>(
        `SELECT d.key, v."stage"::text AS stage, v."state"::text AS state, v."valueNumber"::text AS "valueNumber", v."valueBoolean", v."valueText"
           FROM product_spec_values v JOIN spec_definitions d ON d.id = v."specDefinitionId" WHERE v."productId"=$1 ORDER BY d.key, v."stage"`,
        productId,
      );
    const row = async (key: string, stage = 'WORKING') => (await answers(st.prod)).find((r) => r.key === key && r.stage === stage);
    const optionRows = async (key: string, stage: string) =>
      Number(
        (
          await raw<{ n: string }>(
            `SELECT count(*)::text AS n FROM product_spec_value_options o JOIN spec_definitions d ON d.id=o."specDefinitionId"
              WHERE o."productId"=$1 AND d.key=$2 AND o."stage"=$3::"SpecValueStage"`,
            st.prod,
            key,
            stage,
          )
        )[0].n,
      );

    beforeAll(async () => {
      const root = await prisma.category.findFirstOrThrow({ where: { slug: 'syn-root' } });
      const brand = await prisma.brand.findFirstOrThrow({ where: { slug: 'syn-brand' } });
      const sub = await prisma.subcategory.create({ data: { categoryId: root.id, name: 'State lab', slug: 'syn-state' } });
      const p = await prisma.product.create({
        data: { sku: 'SYN-STATE-001', name: 'Synthetic state product', categoryId: root.id, brandId: brand.id, subcategoryId: sub.id },
      });
      st.sub = sub.id;
      st.prod = p.id;
      const opts = [{ key: 'X', label: 'Equis' }, { key: 'Y', label: 'Ye' }];
      await dictionary.create({ key: 'st_req_num', label: 'Req number', dataType: 'NUMBER' });
      await dictionary.create({ key: 'st_req_txt', label: 'Req text', dataType: 'TEXT' });
      await dictionary.create({ key: 'st_num', label: 'Number', dataType: 'NUMBER' });
      await dictionary.create({ key: 'st_bool', label: 'Flag', dataType: 'BOOLEAN' });
      await dictionary.create({ key: 'st_txt', label: 'Text', dataType: 'TEXT' });
      await dictionary.create({ key: 'st_opt', label: 'Option', dataType: 'OPTION', options: opts });
      await dictionary.create({ key: 'st_multi', label: 'Multi', dataType: 'MULTI_OPTION', options: opts });
      await dictionary.create({ key: 'st_na', label: 'NA datum', dataType: 'NUMBER' });
      await dictionary.create({ key: 'st_unk', label: 'Unknown datum', dataType: 'BOOLEAN' });
      await templates.upsertEntries(st.sub, [
        { specKey: 'st_req_num', sortOrder: 1, isRequired: true, requiredReason: 'Needed to choose.' },
        { specKey: 'st_req_txt', sortOrder: 2, isRequired: true, requiredReason: 'Needed to choose.' },
        { specKey: 'st_num', sortOrder: 3, isFilterable: true },
        { specKey: 'st_bool', sortOrder: 4, isFilterable: true },
        { specKey: 'st_txt', sortOrder: 5 },
        { specKey: 'st_opt', sortOrder: 6, isFilterable: true },
        { specKey: 'st_multi', sortOrder: 7 },
        { specKey: 'st_na', sortOrder: 8 },
        { specKey: 'st_unk', sortOrder: 9 },
      ]);
      for (const k of ['st_req_num', 'st_req_txt', 'st_num', 'st_bool', 'st_txt', 'st_opt', 'st_multi', 'st_na', 'st_unk']) {
        await templates.approve(st.sub, k, 'Ana Approver', {});
      }
    });

    it('stores zero, false, not applicable and unknown as four different answers; an unanswered datum has no row', async () => {
      const r = await write(st.prod, [
        { specKey: 'st_num', valueNumber: 0 },
        { specKey: 'st_bool', valueBoolean: false },
        { specKey: 'st_na', state: 'NOT_APPLICABLE' },
        { specKey: 'st_unk', state: 'UNKNOWN' },
      ]);
      expect(r.map((x) => x.outcome)).toEqual(['saved', 'saved', 'saved', 'saved']);
      expect(await row('st_num')).toMatchObject({ state: 'KNOWN', valueNumber: '0.000000' });
      expect(await row('st_bool')).toMatchObject({ state: 'KNOWN', valueBoolean: false });
      expect(await row('st_na')).toMatchObject({ state: 'NOT_APPLICABLE', valueNumber: null, valueBoolean: null, valueText: null });
      expect(await row('st_unk')).toMatchObject({ state: 'UNKNOWN', valueNumber: null, valueBoolean: null, valueText: null });
      expect(await row('st_txt')).toBeUndefined();

      const view = await values.getValues(st.prod);
      const item = (k: string) => view.items.find((i) => i.specKey === k)!;
      expect([item('st_num').state, item('st_num').storedState]).toEqual(['zero', 'KNOWN']);
      expect([item('st_bool').state, item('st_bool').storedState]).toEqual(['false', 'KNOWN']);
      expect([item('st_na').state, item('st_na').storedState]).toEqual(['not_applicable', 'NOT_APPLICABLE']);
      expect([item('st_unk').state, item('st_unk').storedState]).toEqual(['unknown', 'UNKNOWN']);
      expect([item('st_txt').state, item('st_txt').storedState]).toEqual(['unknown', null]);
    });

    it('the service refuses a value with a non-KNOWN state and a KNOWN without value; the DB CHECK refuses the same shapes', async () => {
      const r = await write(st.prod, [
        { specKey: 'st_num', state: 'NOT_APPLICABLE', valueNumber: 0 },
        { specKey: 'st_bool', state: 'UNKNOWN', valueBoolean: false },
        { specKey: 'st_txt', state: 'KNOWN' },
      ]);
      expect(r.map((x) => [x.outcome, x.code])).toEqual([['rejected', 'state_with_value'], ['rejected', 'state_with_value'], ['rejected', 'value_required']]);
      expect(await row('st_num')).toMatchObject({ state: 'KNOWN', valueNumber: '0.000000' });
      const defId = (await raw<{ id: string }>(`SELECT id FROM spec_definitions WHERE key='st_txt'`))[0].id;
      await expect(
        raw(`INSERT INTO product_spec_values ("productId","specDefinitionId","stage","dataType","state","valueText","updatedAt") VALUES ($1,$2,'WORKING','TEXT','NOT_APPLICABLE','x',now())`, st.prod, defId),
      ).rejects.toThrow(/product_spec_values_shape_check/);
      await expect(
        raw(`INSERT INTO product_spec_values ("productId","specDefinitionId","stage","dataType","state","updatedAt") VALUES ($1,$2,'WORKING','TEXT','KNOWN',now())`, st.prod, defId),
      ).rejects.toThrow(/product_spec_values_shape_check/);
    });

    it('is idempotent on the state and a change of state is a real change', async () => {
      const before = (await raw<{ t: string }>(`SELECT v."updatedAt"::text AS t FROM product_spec_values v JOIN spec_definitions d ON d.id=v."specDefinitionId" WHERE v."productId"=$1 AND d.key='st_na'`, st.prod))[0].t;
      const same = await write(st.prod, [{ specKey: 'st_na', state: 'NOT_APPLICABLE' }]);
      expect(same[0].outcome).toBe('unchanged');
      const after = (await raw<{ t: string }>(`SELECT v."updatedAt"::text AS t FROM product_spec_values v JOIN spec_definitions d ON d.id=v."specDefinitionId" WHERE v."productId"=$1 AND d.key='st_na'`, st.prod))[0].t;
      expect(after).toBe(before);
      expect((await write(st.prod, [{ specKey: 'st_na', state: 'UNKNOWN' }]))[0].outcome).toBe('saved');
      expect(await row('st_na')).toMatchObject({ state: 'UNKNOWN' });
      expect((await write(st.prod, [{ specKey: 'st_na', valueNumber: 7 }]))[0].outcome).toBe('saved');
      expect(await row('st_na')).toMatchObject({ state: 'KNOWN', valueNumber: '7.000000' });
      expect((await write(st.prod, [{ specKey: 'st_na', state: 'NOT_APPLICABLE' }]))[0].outcome).toBe('saved');
      expect(await row('st_na')).toMatchObject({ state: 'NOT_APPLICABLE', valueNumber: null });
    });

    it('a non-KNOWN answer removes the option rows of the datum, and none is ever created for it', async () => {
      await write(st.prod, [{ specKey: 'st_multi', optionKeys: ['X', 'Y'] }]);
      expect(await optionRows('st_multi', 'WORKING')).toBe(2);
      expect((await write(st.prod, [{ specKey: 'st_multi', state: 'UNKNOWN' }]))[0].outcome).toBe('saved');
      expect(await row('st_multi')).toMatchObject({ state: 'UNKNOWN' });
      expect(await optionRows('st_multi', 'WORKING')).toBe(0);
      const bad = await write(st.prod, [{ specKey: 'st_multi', state: 'NOT_APPLICABLE', optionKeys: ['X'] }]);
      expect(bad[0]).toMatchObject({ outcome: 'rejected', code: 'state_with_value' });
      expect(await optionRows('st_multi', 'WORKING')).toBe(0);
      await write(st.prod, [{ specKey: 'st_multi', optionKeys: ['Y'] }]);
      expect(await optionRows('st_multi', 'WORKING')).toBe(1);
      await write(st.prod, [{ specKey: 'st_multi', state: 'NOT_APPLICABLE' }]);
      expect(await optionRows('st_multi', 'WORKING')).toBe(0);
    });

    it('readiness: unknown stays missing, not applicable on a required datum is flagged, on an optional one it is answered', async () => {
      // st_na / st_unk are optional: they never appear as missing.
      await write(st.prod, [{ specKey: 'st_req_num', state: 'UNKNOWN' }, { specKey: 'st_req_txt', state: 'NOT_APPLICABLE' }]);
      const { missing } = await values.getMissing(st.prod, 'WORKING');
      expect(missing.map((m) => [m.specKey, (m as any).flag])).toEqual([['st_req_num', 'explicit_unknown'], ['st_req_txt', 'required_marked_not_applicable']]);
      await write(st.prod, [{ specKey: 'st_req_num', valueNumber: 0 }, { specKey: 'st_req_txt', valueText: 'ok' }]);
      expect((await values.getMissing(st.prod, 'WORKING')).missing).toEqual([]);
    });

    it('projection: only known values reach the sheet and facets; a non-KNOWN draft over a PUBLISHED value leaves the published view untouched', async () => {
      const pub = (key: string, data: Record<string, unknown>) =>
        raw<unknown>(
          `INSERT INTO product_spec_values ("productId","specDefinitionId","stage","dataType","state","valueText","valueNumber","valueBoolean","updatedAt")
           SELECT $1, d.id, 'PUBLISHED', d."dataType", $3::"SpecValueState", $4, $5::numeric, $6::boolean, now() FROM spec_definitions d WHERE d.key=$2`,
          st.prod,
          key,
          data.state ?? 'KNOWN',
          data.valueText ?? null,
          data.valueNumber ?? null,
          data.valueBoolean ?? null,
        );
      await pub('st_num', { valueNumber: 0 });
      await pub('st_bool', { valueBoolean: false });
      await pub('st_txt', { valueText: 'abc' });
      await pub('st_opt', {});
      await raw(
        `INSERT INTO product_spec_value_options ("productId","specDefinitionId","stage","optionKey") SELECT $1, id, 'PUBLISHED', 'X' FROM spec_definitions WHERE key='st_opt'`,
        st.prod,
      );
      await pub('st_na', { state: 'NOT_APPLICABLE' });
      await pub('st_unk', { state: 'UNKNOWN' });
      await pub('st_multi', { state: 'UNKNOWN' });

      const first = await values.getProjections(st.prod);
      const labels = (p: typeof first.published) => p.sheetGroup?.items.map((i) => `${i.label}=${i.value}`);
      // Zero and false are real values and display; the two explicit answers and the unanswered datum do not.
      expect(labels(first.published)).toEqual(['Number=0', 'Flag=No', 'Text=abc', 'Option=Equis']);
      expect(first.published.facets.map((f) => f.specKey)).toEqual(['st_num', 'st_bool', 'st_opt']);
      expect(first.published.skipped).toEqual([]);

      // Draft: "this no longer applies" over published values.
      await write(st.prod, [{ specKey: 'st_num', state: 'NOT_APPLICABLE' }, { specKey: 'st_opt', state: 'NOT_APPLICABLE' }]);
      expect(await row('st_num', 'PUBLISHED')).toMatchObject({ state: 'KNOWN', valueNumber: '0.000000' });
      expect(await row('st_num', 'WORKING')).toMatchObject({ state: 'NOT_APPLICABLE', valueNumber: null });
      expect(await optionRows('st_opt', 'PUBLISHED')).toBe(1);
      expect(await optionRows('st_opt', 'WORKING')).toBe(0);

      const after = await values.getProjections(st.prod);
      expect(after.published).toEqual(first.published);
      expect(labels(after.draft)).toEqual(['Req number=0', 'Req text=ok', 'Flag=No', 'Text=abc']);
      expect(after.draft.facets.map((f) => f.specKey)).toEqual(['st_bool']);
      expect(after.draft.skipped).toEqual([]);

      const view = await values.getValues(st.prod);
      const num = view.items.find((i) => i.specKey === 'st_num')!;
      expect([num.state, num.storedState, num.published?.state, num.published?.storedState, num.pendingChange]).toEqual(['not_applicable', 'NOT_APPLICABLE', 'zero', 'KNOWN', true]);
    });

    it('options under a non-KNOWN value are impossible in the database, and the services switch state without leaving options', async () => {
      const root = await prisma.category.findFirstOrThrow({ where: { slug: 'syn-root' } });
      const brand = await prisma.brand.findFirstOrThrow({ where: { slug: 'syn-brand' } });
      const p = await prisma.product.create({
        data: { sku: 'SYN-STATE-002', name: 'Synthetic guard product', categoryId: root.id, brandId: brand.id, subcategoryId: st.sub },
      });
      await dictionary.create({ key: 'st_guard', label: 'Guard', dataType: 'MULTI_OPTION', options: [{ key: 'X', label: 'Equis' }, { key: 'Y', label: 'Ye' }] });
      await templates.upsertEntries(st.sub, [{ specKey: 'st_guard', sortOrder: 20 }]);
      await templates.approve(st.sub, 'st_guard', 'Ana Approver', {});
      const defId = (await prisma.specDefinition.findFirstOrThrow({ where: { key: 'st_guard' } })).id;
      const count = async (stage: string) =>
        Number(
          (
            await raw<{ n: string }>(
              `SELECT count(*)::text AS n FROM product_spec_value_options WHERE "productId"=$1 AND "specDefinitionId"=$2 AND "stage"=$3::"SpecValueStage"`,
              p.id,
              defId,
              stage,
            )
          )[0].n,
        );
      const stateOf = async (stage: string) =>
        (await raw<{ s: string }>(`SELECT "state"::text AS s FROM product_spec_values WHERE "productId"=$1 AND "specDefinitionId"=$2 AND "stage"=$3::"SpecValueStage"`, p.id, defId, stage))[0]?.s;
      const insertValue = (stage: string, state: string) =>
        raw(`INSERT INTO product_spec_values ("productId","specDefinitionId","stage","dataType","state","updatedAt") VALUES ($1,$2,$3::"SpecValueStage",'MULTI_OPTION',$4::"SpecValueState",now())`, p.id, defId, stage, state);
      const insertOption = (stage: string, state?: string) =>
        state
          ? raw(`INSERT INTO product_spec_value_options ("productId","specDefinitionId","stage","optionKey","state") VALUES ($1,$2,$3::"SpecValueStage",'X',$4::"SpecValueState")`, p.id, defId, stage, state)
          : raw(`INSERT INTO product_spec_value_options ("productId","specDefinitionId","stage","optionKey") VALUES ($1,$2,$3::"SpecValueStage",'X')`, p.id, defId, stage);

      // (a) the DATABASE refuses an option under an UNKNOWN or NOT_APPLICABLE value (raw SQL, no service).
      await insertValue('WORKING', 'UNKNOWN');
      await insertValue('PUBLISHED', 'NOT_APPLICABLE');
      await expect(insertOption('WORKING')).rejects.toThrow(); // default state KNOWN: no matching (.., KNOWN) value
      await expect(insertOption('WORKING', 'UNKNOWN')).rejects.toThrow(); // CHECK ("state" = 'KNOWN')
      await expect(insertOption('PUBLISHED')).rejects.toThrow();
      await expect(insertOption('PUBLISHED', 'NOT_APPLICABLE')).rejects.toThrow();
      expect([await count('WORKING'), await count('PUBLISHED')]).toEqual([0, 0]);
      await raw(`DELETE FROM product_spec_values WHERE "productId"=$1`, p.id);

      // (b) KNOWN -> UNKNOWN through the service with existing options succeeds and leaves none.
      await write(p.id, [{ specKey: 'st_guard', optionKeys: ['X', 'Y'] }]);
      expect(await count('WORKING')).toBe(2);
      expect((await write(p.id, [{ specKey: 'st_guard', state: 'UNKNOWN' }]))[0].outcome).toBe('saved');
      expect([await stateOf('WORKING'), await count('WORKING')]).toEqual(['UNKNOWN', 0]);

      // (c) the same through publishProductSpecValues for the PUBLISHED stage.
      await write(p.id, [{ specKey: 'st_guard', optionKeys: ['X', 'Y'] }]);
      await values.publishProductSpecValues(p.id, actor);
      expect([await stateOf('PUBLISHED'), await count('PUBLISHED')]).toEqual(['KNOWN', 2]);
      await write(p.id, [{ specKey: 'st_guard', state: 'NOT_APPLICABLE' }]);
      const pub = await values.publishProductSpecValues(p.id, actor);
      expect(pub.published).toBe(1);
      expect([await stateOf('PUBLISHED'), await count('PUBLISHED')]).toEqual(['NOT_APPLICABLE', 0]);

      // (d) a raw UPDATE of the state while options exist is rejected at commit and changes nothing.
      await write(p.id, [{ specKey: 'st_guard', optionKeys: ['X'] }]);
      expect(await count('WORKING')).toBe(1);
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`UPDATE product_spec_values SET "state"='UNKNOWN' WHERE "productId"=$1 AND "specDefinitionId"=$2 AND "stage"='WORKING'`, p.id, defId);
        }),
      ).rejects.toThrow();
      await expect(raw(`UPDATE product_spec_values SET "state"='UNKNOWN' WHERE "productId"=$1 AND "specDefinitionId"=$2 AND "stage"='WORKING'`, p.id, defId)).rejects.toThrow();
      expect([await stateOf('WORKING'), await count('WORKING')]).toEqual(['KNOWN', 1]);
    });
  });
});
