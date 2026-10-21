jest.mock('../../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import * as XLSX from 'xlsx';
import { AclService } from '../../../common/acl/acl.service';
import { HttpExceptionFilter } from '../../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../../common/interceptors/transform.interceptor';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import { SessionService } from '../../../common/security/session.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { ProductChangeService } from '../../products/product-change.service';
import { ProductsService } from '../../products/products.service';
import { PriceImportController } from './price-import.controller';
import { PriceImportResolutionController } from './price-import-resolution.controller';
import { PriceImportResolutionService } from './price-import-resolution.service';
import { PriceImportService } from './price-import.service';
import { createGrantsProvider, createPriceImportFake } from './price-import.test-helpers';

/**
 * The resolution controller has NO class-level @Roles: a person whose role is not one of the
 * price-import roles still reaches it, and the service decides from the current grants.
 */
const LIST = '00000000-0000-4000-8000-0000000000a1';
const BRAND = '00000000-0000-4000-8000-0000000000b1';
const CATEGORY = '00000000-0000-4000-8000-0000000000c1';
const PERSON = 'fixture-person';
const SESSION = 'fixture-resolution-session';
const SECRET = 'fixture-only-http-resolution-secret';
const ACTIONS = ['prices:save', 'prices:preview', 'prices:read', 'prices:apply', 'listas:read'];
const storageDir = path.join(os.tmpdir(), 'gs-b3-resolution-http-storage');

function workbook(rows: unknown[][]): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'DPP_ORO_IVA'], ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Completa la referencia y el precio con IVA.']]), 'INSTRUCCIONES');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

describe('Unknown-reference resolution through HTTP', () => {
  let app: INestApplication;
  let fake: ReturnType<typeof createPriceImportFake>;
  let grants: ReturnType<typeof createGrantsProvider>;
  const jwt = new JwtService({ secret: SECRET });
  // A role that is NOT in the price-import @Roles list.
  const token = jwt.sign({ sub: PERSON, jti: SESSION, roles: ['Compras'] });
  const prisma: any = {};
  let seq = 0;

  beforeAll(async () => {
    process.env.PRICE_IMPORT_STORAGE_DIR = storageDir;
    await fs.rm(storageDir, { recursive: true, force: true });
    const module = await Test.createTestingModule({
      controllers: [PriceImportController, PriceImportResolutionController],
      providers: [PriceImportService, PriceImportResolutionService, AclService, JwtStrategy,
        { provide: ConfigService, useValue: { get: () => SECRET } },
        { provide: PrismaService, useValue: prisma },
        { provide: SessionService, useValue: { isActive: async (jti: string) => jti === SESSION } },
        { provide: AuditService, useValue: { log: (...a: unknown[]) => fake.audit.log(...a), logTx: (...a: unknown[]) => fake.audit.logTx(...a) } },
        { provide: AccessAssignmentsService, useValue: { grantsForUser: async () => grants.grants } },
        { provide: ProductChangeService, useFactory: (acl: AclService) => new ProductChangeService(prisma, acl, { grantsForUser: async () => grants.grants } as never), inject: [AclService] },
        { provide: ProductsService, useFactory: (acl: AclService, changes: ProductChangeService) =>
          new ProductsService(prisma, acl, { logTx: (...a: unknown[]) => fake.audit.logTx(...a) } as never, {} as never, undefined, undefined, undefined, changes), inject: [AclService, ProductChangeService] },
        { provide: APP_GUARD, useClass: JwtAuthGuard }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    await fs.rm(storageDir, { recursive: true, force: true });
    delete process.env.PRICE_IMPORT_STORAGE_DIR;
  });

  beforeEach(() => {
    fake = createPriceImportFake({
      listas: [{ id: LIST, code: 'LA', name: 'Lista Alfa' }],
      products: [{ id: 'product-a', sku: 'SKU-A', listaId: LIST }],
      tariffs: [{ id: 'tariff-oro', code: 'DPP_ORO_IVA' }],
      prices: [{ productId: 'product-a', priceListId: 'tariff-oro', value: 100, listaId: LIST }],
      brands: [{ id: BRAND, name: 'Sin marca' }], categories: [{ id: CATEGORY, name: 'Sin categoría' }],
    });
    for (const key of Object.keys(prisma)) delete prisma[key];
    Object.assign(prisma, fake.prisma, {
      user: { findUnique: jest.fn(async ({ where }: any) => where.id === PERSON ? { id: PERSON, name: 'Fixture', email: 'f@example.test', isActive: true, roles: [{ role: { name: 'Compras' } }] } : null) },
      accessGrant: { findMany: jest.fn(async () => grants.grants.map((g) => ({ sourceId: g.sourceId, actionId: g.actionId, scopeKind: g.scope, resourceId: g.resourceId ?? '' }))) },
    });
    grants = createGrantsProvider();
    grants.grantOnLista(LIST, ...ACTIONS);
    grants.grant(...ACTIONS, 'products:read', 'products:write');
  });

  const auth = (req: request.Test) => req.auth(token, { type: 'bearer' });
  const person = { userId: PERSON, roles: ['Compras'] };
  const xlsx = (rows: unknown[][]) => ({ originalname: 'precios.xlsx', buffer: workbook(rows) } as Express.Multer.File);
  /** The price-import controller is role-gated, so saving and applying go through the service; this spec is about the new routes. */
  async function savedRevision(rows: unknown[][]): Promise<string> {
    return (await app.get(PriceImportService).saveRevision(xlsx(rows), `http-key-${String(++seq).padStart(6, '0')}`, person)).id;
  }
  async function appliedRevision(): Promise<string> {
    const id = await savedRevision([['SKU-A', 110], ['NEW-1', 250]]);
    await app.get(PriceImportService).applyRevision(id, person, { acknowledgeRejectedRows: 1 });
    return id;
  }
  const url = (id: string) => `/api/prices/import/revisions/${id}/unknown-references`;
  const resolve = (id: string) => auth(request(app.getHttpServer()).post(`${url(id)}/resolve`));

  it('lists unknown references for a person whose role is outside the price-import roles', async () => {
    const id = await appliedRevision();
    const response = await auth(request(app.getHttpServer()).get(url(id))).expect(200);
    expect(response.body.data).toMatchObject({ canCreate: true, total: 1, items: [{ sku: 'NEW-1', rowNumber: 3 }], defaults: { brandId: BRAND, categoryId: CATEGORY } });
  });

  it('rejects unauthenticated calls', async () => {
    await request(app.getHttpServer()).get(url('whatever')).expect(401);
  });

  it('creates through the endpoint (name trimmed) and replays idempotently', async () => {
    const id = await appliedRevision();
    const body = { items: [{ rowNumber: 3, action: 'CREATE', name: '  Cámara nueva  ', brandId: BRAND, categoryId: CATEGORY }] };
    const first = await resolve(id).send(body).expect(201);
    expect(first.body.data.results).toEqual([{ rowNumber: 3, status: 'CREATED', productId: expect.any(String) }]);
    expect(fake.state.products.find((p) => p.sku === 'NEW-1')).toMatchObject({ name: 'Cámara nueva', listaId: null, isVisible: false });
    const again = await resolve(id).send(body).expect(201);
    expect(again.body.data.results).toEqual(first.body.data.results);
    expect(fake.state.products.filter((p) => p.sku === 'NEW-1')).toHaveLength(1);
  });

  it('accepts SKIP without name or ids', async () => {
    const id = await appliedRevision();
    const response = await resolve(id).send({ items: [{ rowNumber: 3, action: 'SKIP' }] }).expect(201);
    expect(response.body.data.results).toEqual([{ rowNumber: 3, status: 'SKIPPED' }]);
  });

  it('validates the body: action, name length, uuids, empty and oversized batches, extra properties', async () => {
    const id = await appliedRevision();
    const bad = async (items: unknown) => resolve(id).send({ items }).expect(400);
    await bad([]);
    await bad([{ rowNumber: 3, action: 'DELETE' }]);
    await bad([{ rowNumber: 3, action: 'CREATE', name: '   ', brandId: BRAND, categoryId: CATEGORY }]);
    await bad([{ rowNumber: 3, action: 'CREATE', name: 'x'.repeat(256), brandId: BRAND, categoryId: CATEGORY }]);
    await bad([{ rowNumber: 3, action: 'CREATE', name: 'ok', brandId: 'not-a-uuid', categoryId: CATEGORY }]);
    await bad([{ rowNumber: 0, action: 'SKIP' }]);
    await bad([{ rowNumber: 3, action: 'SKIP', price: 1 }]);
    await bad(Array.from({ length: 201 }, (_, i) => ({ rowNumber: i + 1, action: 'SKIP' })));
    await resolve(id).send({}).expect(400);
    expect(fake.state.products.find((p) => p.sku === 'NEW-1')).toBeUndefined();
  });

  it('answers 403 for CREATE without GLOBAL products:write and 409 with a machine code before apply', async () => {
    const id = await appliedRevision();
    grants.revoke('products:write');
    await resolve(id).send({ items: [{ rowNumber: 3, action: 'CREATE', name: 'Algo', brandId: BRAND, categoryId: CATEGORY }] }).expect(403);
    const pending = await savedRevision([['SKU-A', 120], ['NEW-9', 5]]);
    const response = await resolve(pending).send({ items: [{ rowNumber: 3, action: 'SKIP' }] }).expect(409);
    expect(response.body.code ?? response.body.error?.code ?? JSON.stringify(response.body)).toMatch(/REVISION_NOT_APPLIED/);
  });
});
