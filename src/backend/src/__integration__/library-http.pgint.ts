/**
 * HTTP integration: who can do what on the key-spec ("datos clave") endpoints, with the REAL AppModule,
 * the REAL login (password hashing, session cookie), the REAL JwtAuthGuard / RolesGuard / GrantGuard and the
 * global ValidationPipe, against a DISPOSABLE PostgreSQL. Synthetic data only.
 *
 * Not picked up by `npm test`. Run it explicitly:
 *   npx jest library-http --runInBand --testRegex='.*\.pgint\.ts$'
 *
 * Safety: only the disposable server 127.0.0.1:55433 is accepted (anything else is refused before any connection);
 * it creates `mt_b_<random>`, migrates it, and drops it at the end.
 */
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as cookieParser from 'cookie-parser';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

const HOST = '127.0.0.1';
const PORT = '55433';
const DB_NAME = `mt_b_${randomBytes(4).toString('hex')}`;
const ADMIN_URL = `postgresql://pgtest@${HOST}:${PORT}/postgres`;
const DB_URL = `postgresql://pgtest@${HOST}:${PORT}/${DB_NAME}?schema=public`;

function assertDisposableTarget(raw: string): void {
  const u = new URL(raw);
  if (u.hostname !== HOST || u.port !== PORT || u.username !== 'pgtest') {
    throw new Error(`Refusing to run: ${u.hostname}:${u.port} is not the disposable server ${HOST}:${PORT}.`);
  }
  if (u.pathname !== '/postgres' && !/^\/mt_b_[0-9a-f]{8}$/.test(u.pathname)) {
    throw new Error('Refusing to run: unexpected database name.');
  }
}

jest.setTimeout(300_000);

type Level = 'read' | 'write' | 'publish' | 'approve' | 'roles' | 'public';
type Who = 'anon' | 'U0' | 'U1' | 'U2' | 'U3' | 'U4';
const USERS: Who[] = ['U0', 'U1', 'U2', 'U3', 'U4'];
const GRANTS: Record<string, string[]> = {
  U0: [],
  U1: ['products:read'],
  U2: ['products:read', 'products:write'],
  U3: ['products:read', 'products:write', 'products:approveSpecs'],
  U4: ['products:read', 'products:write', 'products:publish'],
};
const PASSWORD = 'synthetic-pass-2026';

describe('key-spec endpoints over HTTP: real auth + real grants', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let created = false;
  const cookies: Record<string, string> = {};
  const userIds: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const matrix: Record<string, Record<string, number>> = {};

  const http = () => request(app.getHttpServer());
  const call = (who: Who, method: string, path: string, body?: unknown) => {
    let req = http()[method.toLowerCase()](path);
    if (who !== 'anon') req = req.set('Cookie', cookies[who]);
    return body === undefined ? req : req.send(body);
  };
  const record = (route: string, who: Who, status: number) => {
    (matrix[route] ??= {})[who] = status;
  };
  const templateRow = () =>
    prisma.subcategorySpec.findFirstOrThrow({ where: { subcategoryId: ids.subA, definition: { key: 'color' } } });

  async function login(email: string): Promise<string> {
    const res = await http().post('/api/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBeLessThan(300);
    const cookie = (res.headers['set-cookie'] as string[]).find((c) => c.startsWith('access_token='));
    expect(cookie).toBeTruthy();
    return (cookie as string).split(';')[0];
  }

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

    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: DB_URL,
      LIBRARY_DATABASE_MODE: 'legacy',
      LIBRARY_WRITES_FROZEN: 'false',
      JWT_SECRET: randomBytes(32).toString('hex'),
      JWT_EXPIRES_IN: '1h',
      MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      MFA_ISSUER: 'MT-HTTP-Test',
      THROTTLE_LIMIT: '100000',
      THROTTLE_TTL: '60',
      PRICE_IMPORT_STORAGE_DIR: mkdtempSync(join(tmpdir(), 'mt-b-')),
    });

    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    await prisma.$connect();

    // --- synthetic users: "Vendedor" carries no panel permission by itself; everything comes from grants ---
    const role = await prisma.role.create({ data: { name: 'Vendedor', description: 'synthetic' } });
    const hash = bcrypt.hashSync(PASSWORD, 4);
    for (const who of USERS) {
      const user = await prisma.user.create({
        data: { email: `${who.toLowerCase()}@test.invalid`, name: `Synthetic ${who}`, password: hash, isActive: true, roles: { create: { roleId: role.id } } },
      });
      userIds[who] = user.id;
      await prisma.accessState.create({ data: { userId: user.id, version: 1 } });
      if (GRANTS[who].length) {
        const source = await prisma.accessSource.create({
          data: { userId: user.id, kind: 'manual', catalogVersion: 'test', grantedById: user.id, reason: 'synthetic' },
        });
        for (const actionId of GRANTS[who]) {
          await prisma.accessGrant.create({ data: { sourceId: source.id, actionId, scopeKind: 'global', resourceId: '' } });
        }
      }
    }

    // --- synthetic catalog ---
    const root = await prisma.category.create({ data: { name: 'Synthetic root', slug: 'syn-root' } });
    const brand = await prisma.brand.create({ data: { name: 'Synthetic brand', slug: 'syn-brand' } });
    ids.subA = (await prisma.subcategory.create({ data: { categoryId: root.id, name: 'Sub A', slug: 'syn-a' } })).id;
    ids.subB = (await prisma.subcategory.create({ data: { categoryId: root.id, name: 'Sub B', slug: 'syn-b' } })).id;
    ids.product = (
      await prisma.product.create({
        data: { sku: 'HTTP-001', name: 'Synthetic HTTP-001', categoryId: root.id, brandId: brand.id, subcategoryId: ids.subA, lifecycleStatus: 'DRAFT' },
      })
    ).id;
    const def = await prisma.specDefinition.create({ data: { key: 'color', label: 'Color', dataType: 'TEXT' } });
    await prisma.subcategorySpec.create({
      data: { subcategoryId: ids.subA, specDefinitionId: def.id, status: 'PROPOSED', isRequired: false, isFilterable: false, sortOrder: 1 },
    });

    // The app is loaded only now so that it reads the environment above.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Test } = require('@nestjs/testing');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AppModule } = require('../app.module');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { HttpExceptionFilter } = require('../common/filters/http-exception.filter');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TransformInterceptor } = require('../common/interceptors/transform.interceptor');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    // Same global pipeline as main.ts.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    for (const who of USERS) cookies[who] = await login(`${who.toLowerCase()}@test.invalid`);
  }, 280_000);

  afterAll(async () => {
    try {
      await app?.close();
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
    // eslint-disable-next-line no-console
    console.log('HTTP matrix (route -> status per user)\n' + JSON.stringify(matrix, null, 1));
  }, 60_000);

  // `ok` is the status of a successful call; `body(tag)` builds a body that is valid for each user that may succeed.
  interface Route {
    name: string;
    method: string;
    path: () => string;
    level: Level;
    ok: number;
    body?: (tag: string) => unknown;
  }
  const routes: Route[] = [
    { name: 'GET library/spec-definitions', method: 'GET', path: () => '/api/library/spec-definitions', level: 'read', ok: 200 },
    { name: 'GET library/spec-definitions/:key', method: 'GET', path: () => '/api/library/spec-definitions/color', level: 'read', ok: 200 },
    { name: 'POST library/spec-definitions', method: 'POST', path: () => '/api/library/spec-definitions', level: 'write', ok: 201, body: (t) => ({ key: `extra_${t.toLowerCase()}`, label: `Extra ${t}`, dataType: 'TEXT' }) },
    { name: 'PATCH library/spec-definitions/:key', method: 'PATCH', path: () => '/api/library/spec-definitions/color', level: 'write', ok: 200, body: (t) => ({ label: `Color ${t}` }) },
    { name: 'GET library/subcategories/:id/spec-template', method: 'GET', path: () => `/api/library/subcategories/${ids.subA}/spec-template`, level: 'read', ok: 200 },
    { name: 'PUT library/subcategories/:id/spec-template', method: 'PUT', path: () => `/api/library/subcategories/${ids.subA}/spec-template`, level: 'write', ok: 200, body: (t) => ({ entries: [{ specKey: 'color', sortOrder: t === 'U2' ? 5 : 6 }] }) },
    { name: 'GET products/:id/key-specs', method: 'GET', path: () => `/api/products/${ids.product}/key-specs`, level: 'read', ok: 200 },
    { name: 'PUT products/:id/key-specs', method: 'PUT', path: () => `/api/products/${ids.product}/key-specs`, level: 'write', ok: 200, body: (t) => ({ entries: [{ specKey: 'color', valueText: `red-${t}` }] }) },
    { name: 'GET products/:id/key-specs/missing', method: 'GET', path: () => `/api/products/${ids.product}/key-specs/missing`, level: 'read', ok: 200 },
    { name: 'GET products/:id/key-specs/subcategory-change-preview', method: 'GET', path: () => `/api/products/${ids.product}/key-specs/subcategory-change-preview?subcategoryId=${ids.subB}`, level: 'read', ok: 200 },
    { name: 'GET products/:id/key-specs/projection', method: 'GET', path: () => `/api/products/${ids.product}/key-specs/projection`, level: 'read', ok: 200 },
    { name: 'POST products/:id/key-specs/publish', method: 'POST', path: () => `/api/products/${ids.product}/key-specs/publish`, level: 'publish', ok: 201 },
    { name: 'GET products/:id/preview-detail', method: 'GET', path: () => `/api/products/${ids.product}/preview-detail`, level: 'read', ok: 200 },
    { name: 'PUT products/:id (subcategoryId)', method: 'PUT', path: () => `/api/products/${ids.product}`, level: 'write', ok: 200, body: (t) => ({ subcategoryId: t === 'U2' ? ids.subB : ids.subA }) },
    { name: 'GET categories/classification-tree', method: 'GET', path: () => '/api/categories/classification-tree', level: 'roles', ok: 200 },
  ];

  const allowed = (level: Level, who: Who): boolean => {
    if (who === 'anon') return level === 'public';
    if (level === 'roles' || level === 'public') return true; // role-based (every user holds "Vendedor") / public
    if (level === 'read') return GRANTS[who].includes('products:read');
    if (!GRANTS[who].includes('products:write')) return false;
    if (level === 'publish') return GRANTS[who].includes('products:publish');
    return level === 'write' || GRANTS[who].includes('products:approveSpecs');
  };

  it('401 without session on every protected route (nothing is written)', async () => {
    const before = await prisma.productSpecValue.count();
    const defs = await prisma.specDefinition.count();
    for (const r of routes) {
      const res = await call('anon', r.method, r.path(), r.body?.('anon'));
      record(r.name, 'anon', res.status);
      expect({ route: r.name, status: res.status }).toEqual({ route: r.name, status: 401 });
    }
    const approve = await call('anon', 'POST', `/api/library/subcategories/${ids.subA}/spec-template/color/approve`, { reason: 'x' });
    record('POST .../spec-template/:key/approve', 'anon', approve.status);
    expect(approve.status).toBe(401);
    expect(await prisma.productSpecValue.count()).toBe(before);
    expect(await prisma.specDefinition.count()).toBe(defs);
    expect((await templateRow()).status).toBe('PROPOSED');
  });

  it('U0 (no grants): 403 on every grant-protected route, 200 only where the rule is role-based', async () => {
    for (const r of routes) {
      const res = await call('U0', r.method, r.path(), r.body?.('U0'));
      record(r.name, 'U0', res.status);
      expect({ route: r.name, status: res.status }).toEqual({ route: r.name, status: r.level === 'roles' ? r.ok : 403 });
    }
    const approve = await call('U0', 'POST', `/api/library/subcategories/${ids.subA}/spec-template/color/approve`, { reason: 'x' });
    record('POST .../spec-template/:key/approve', 'U0', approve.status);
    expect(approve.status).toBe(403);
  });

  it('U1 (read only): reads 200, every write 403 and nothing stored', async () => {
    const productBefore = await prisma.product.findUniqueOrThrow({ where: { id: ids.product } });
    for (const r of routes) {
      const res = await call('U1', r.method, r.path(), r.body?.('U1'));
      record(r.name, 'U1', res.status);
      expect({ route: r.name, status: res.status }).toEqual({ route: r.name, status: allowed(r.level, 'U1') ? r.ok : 403 });
    }
    const approve = await call('U1', 'POST', `/api/library/subcategories/${ids.subA}/spec-template/color/approve`, { reason: 'x' });
    record('POST .../spec-template/:key/approve', 'U1', approve.status);
    expect(approve.status).toBe(403);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.product } })).subcategoryId).toBe(productBefore.subcategoryId);
    expect(await prisma.specDefinition.count({ where: { key: { startsWith: 'extra_' } } })).toBe(0);
    expect(await prisma.productSpecValue.count()).toBe(0);
    expect((await templateRow()).status).toBe('PROPOSED');
  });

  it('U2 (read+write): writes succeed and are stored; approving is 403 (also with a spoofed approvedBy) and stores nothing', async () => {
    for (const r of routes) {
      const res = await call('U2', r.method, r.path(), r.body?.('U2'));
      record(r.name, 'U2', res.status);
      expect({ route: r.name, status: res.status }).toEqual({ route: r.name, status: allowed(r.level, 'U2') ? r.ok : 403 });
    }
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.product } })).subcategoryId).toBe(ids.subB);
    expect(await prisma.specDefinition.count({ where: { key: 'extra_u2' } })).toBe(1);
    expect((await prisma.specDefinition.findUniqueOrThrow({ where: { key: 'color' } })).label).toBe('Color U2');

    for (const body of [{ reason: 'x' }, { approvedBy: 'someone-else', reason: 'x' }]) {
      const res = await call('U2', 'POST', `/api/library/subcategories/${ids.subA}/spec-template/color/approve`, body);
      record(`POST .../spec-template/:key/approve ${JSON.stringify(body).includes('approvedBy') ? '(spoof)' : ''}`.trim(), 'U2', res.status);
      expect(res.status).toBe(403);
    }
    const row = await templateRow();
    expect(row.status).toBe('PROPOSED');
    expect(row.approvedById).toBeNull();
    expect(row.approvedAt).toBeNull();
  });

  it('U3 (read+write+approve): spoofed approvedBy is rejected with 400 and nothing is stored; then approval records the session user', async () => {
    const spoof = await call('U3', 'POST', `/api/library/subcategories/${ids.subA}/spec-template/color/approve`, { approvedBy: 'someone-else', reason: 'x' });
    record('POST .../spec-template/:key/approve (spoof)', 'U3', spoof.status);
    expect(spoof.status).toBe(400);
    let row = await templateRow();
    expect(row.status).toBe('PROPOSED');
    expect(row.approvedById).toBeNull();
    expect(row.approvedAt).toBeNull();

    // Product moved to subB by U2: put it back first through U3's write rights (also proves U3 can write).
    const approve = await call('U3', 'POST', `/api/library/subcategories/${ids.subA}/spec-template/color/approve`, { reason: 'ok' });
    record('POST .../spec-template/:key/approve', 'U3', approve.status);
    expect(approve.status).toBe(201);
    row = await templateRow();
    expect(row.status).toBe('APPROVED');
    expect(row.approvedById).toBe(userIds.U3);
    expect(row.approvedAt).toBeInstanceOf(Date);
    expect(row.approvedById).not.toBe('someone-else');

    // Remaining routes behave for U3 like for any writer.
    for (const r of routes) {
      const res = await call('U3', r.method, r.path(), r.body?.('U3'));
      record(r.name, 'U3', res.status);
      expect({ route: r.name, status: res.status }).toEqual({ route: r.name, status: allowed(r.level, 'U3') ? r.ok : 403 });
    }
    expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.product } })).subcategoryId).toBe(ids.subA);
  });

  const ensureApproved = async () => {
    if ((await templateRow()).status !== 'APPROVED') {
      const res = await call('U3', 'POST', `/api/library/subcategories/${ids.subA}/spec-template/color/approve`, { reason: 'ok' });
      expect(res.status).toBe(201);
    }
    const row = await templateRow();
    expect(row.status).toBe('APPROVED');
    expect(row.approvedById).toBe(userIds.U3);
  };
  const expectVoided = async () => {
    const row = await templateRow();
    expect(row.status).toBe('PROPOSED');
    expect(row.approvedById).toBeNull();
    expect(row.approvedAt).toBeNull();
  };

  it('a body that still sends approvedBy is rejected for a writer who may approve, even on an already approved row', async () => {
    await ensureApproved();
    const res = await call('U3', 'POST', `/api/library/subcategories/${ids.subA}/spec-template/color/approve`, { approvedBy: userIds.U2 });
    expect(res.status).toBe(400);
    expect((await templateRow()).approvedById).toBe(userIds.U3);
  });

  it('publish needs products:publish on top of write: U2 and U3 get 403 and no PUBLISHED row exists', async () => {
    for (const who of ['U2', 'U3'] as Who[]) {
      const res = await call(who, 'POST', `/api/products/${ids.product}/key-specs/publish`);
      expect(res.status).toBe(403);
    }
    expect(await prisma.productSpecValue.count({ where: { stage: 'PUBLISHED' } })).toBe(0);
  });

  it('U4 (read+write+publish): publishes (201) but cannot approve (403)', async () => {
    for (const r of routes) {
      const res = await call('U4', r.method, r.path(), r.body?.('U4'));
      record(r.name, 'U4', res.status);
      expect({ route: r.name, status: res.status }).toEqual({ route: r.name, status: allowed(r.level, 'U4') ? r.ok : 403 });
    }
    const approve = await call('U4', 'POST', `/api/library/subcategories/${ids.subA}/spec-template/color/approve`, { reason: 'x' });
    record('POST .../spec-template/:key/approve', 'U4', approve.status);
    expect(approve.status).toBe(403);
    expect(await prisma.productSpecValue.count({ where: { stage: 'PUBLISHED' } })).toBeGreaterThan(0);
  });

  it('PUT spec-template cannot approve: status APPROVED is rejected (400) and the row is unchanged', async () => {
    await ensureApproved();
    const before = await templateRow();
    const res = await call('U2', 'PUT', `/api/library/subcategories/${ids.subA}/spec-template`, { entries: [{ specKey: 'color', status: 'APPROVED' }] });
    expect(res.status).toBe(400);
    expect(await templateRow()).toEqual(before);
    const other = await prisma.specDefinition.create({ data: { key: 'other_spec', label: 'Other', dataType: 'TEXT' } });
    await prisma.subcategorySpec.create({ data: { subcategoryId: ids.subB, specDefinitionId: other.id, status: 'PROPOSED', isRequired: false, isFilterable: false, sortOrder: 1 } });
    const res2 = await call('U2', 'PUT', `/api/library/subcategories/${ids.subB}/spec-template`, { entries: [{ specKey: 'other_spec', status: 'APPROVED' }] });
    expect(res2.status).toBe(400);
    expect((await prisma.subcategorySpec.findFirstOrThrow({ where: { subcategoryId: ids.subB, specDefinitionId: other.id } })).status).toBe('PROPOSED');
  });

  it('PUT spec-template: sortOrder keeps the approval, isFilterable voids it', async () => {
    await ensureApproved();
    const sort = await call('U2', 'PUT', `/api/library/subcategories/${ids.subA}/spec-template`, { entries: [{ specKey: 'color', sortOrder: 99 }] });
    expect(sort.status).toBe(200);
    expect((await templateRow()).status).toBe('APPROVED');
    const filt = await call('U2', 'PUT', `/api/library/subcategories/${ids.subA}/spec-template`, { entries: [{ specKey: 'color', isFilterable: true }] });
    expect(filt.status).toBe(200);
    expect((await templateRow()).isFilterable).toBe(true);
    await expectVoided();
  });

  it('PATCH spec-definitions: changing the label voids the approved rows that use it and says how many', async () => {
    await ensureApproved();
    const current = (await prisma.specDefinition.findUniqueOrThrow({ where: { key: 'color' } })).label;
    const same = await call('U2', 'PATCH', '/api/library/spec-definitions/color', { label: current });
    expect(same.status).toBe(200);
    expect((await templateRow()).status).toBe('APPROVED');
    const res = await call('U2', 'PATCH', '/api/library/spec-definitions/color', { label: 'Color renamed' });
    expect(res.status).toBe(200);
    expect((res.body.data ?? res.body).voidedApprovals).toBe(1);
    await expectVoided();
  });

  it('PUT key-specs takes no identity from the body: updatedById (top level or per entry) is rejected with 400 and nothing is stored', async () => {
    const before = await prisma.productSpecValue.count();
    const top = await call('U2', 'PUT', `/api/products/${ids.product}/key-specs`, { entries: [{ specKey: 'color', valueText: 'spoof' }], updatedById: 'someone-else' });
    expect(top.status).toBe(400);
    const entry = await call('U2', 'PUT', `/api/products/${ids.product}/key-specs`, { entries: [{ specKey: 'color', valueText: 'spoof', updatedById: 'someone-else' }] });
    expect(entry.status).toBe(400);
    expect(await prisma.productSpecValue.count()).toBe(before);
    expect(await prisma.productSpecValue.count({ where: { updatedById: 'someone-else' } })).toBe(0);
    const ok = await call('U2', 'PUT', `/api/products/${ids.product}/key-specs`, { entries: [{ specKey: 'color', valueText: 'legit' }] });
    expect(ok.status).toBe(200);
    expect((await prisma.productSpecValue.findFirstOrThrow({ where: { productId: ids.product, stage: 'WORKING' } })).updatedById).toBe(userIds.U2);
  });

  it('public key-spec facets need no login: 200 with subcategoryId, 400 without', async () => {
    const ok = await call('anon', 'GET', `/api/public/catalog/key-spec-facets?subcategoryId=${ids.subA}`);
    record('GET public/catalog/key-spec-facets', 'anon', ok.status);
    expect(ok.status).toBe(200);
    for (const who of USERS) {
      const res = await call(who, 'GET', `/api/public/catalog/key-spec-facets?subcategoryId=${ids.subA}`);
      record('GET public/catalog/key-spec-facets', who, res.status);
      expect(res.status).toBe(200);
    }
    const missing = await call('anon', 'GET', '/api/public/catalog/key-spec-facets');
    record('GET public/catalog/key-spec-facets (no subcategoryId)', 'anon', missing.status);
    expect(missing.status).toBe(400);
  });
});
