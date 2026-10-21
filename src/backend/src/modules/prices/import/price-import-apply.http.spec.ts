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
import { PriceImportController } from './price-import.controller';
import { PriceImportService } from './price-import.service';
import { createGrantsProvider, createPriceImportFake } from './price-import.test-helpers';

/**
 * Apply endpoint over HTTP with the production validation pipe and exception filter:
 * body validation, machine-readable 409 codes and structured details, and a save
 * request that no longer carries a destination lista.
 */
const LIST = '00000000-0000-4000-8000-0000000000a1';
const PERSON = 'fixture-person';
const SESSION = 'fixture-apply-session';
const SECRET = 'fixture-only-http-price-apply-secret';
const ACTIONS = ['prices:save', 'prices:preview', 'prices:read', 'prices:apply', 'listas:read'];
const storageDir = path.join(os.tmpdir(), 'gs-b2-apply-http-storage');

function workbook(rows: unknown[][]): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'DPP_ORO_IVA'], ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Completa la referencia y el precio con IVA.']]), 'INSTRUCCIONES');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

describe('Price import apply through HTTP', () => {
  let app: INestApplication;
  let fake: ReturnType<typeof createPriceImportFake>;
  let grants: ReturnType<typeof createGrantsProvider>;
  const jwt = new JwtService({ secret: SECRET });
  const token = jwt.sign({ sub: PERSON, jti: SESSION, roles: ['Supervisor'] });
  const prisma: any = {};
  let seq = 0;

  beforeAll(async () => {
    process.env.PRICE_IMPORT_STORAGE_DIR = storageDir;
    await fs.rm(storageDir, { recursive: true, force: true });
    const module = await Test.createTestingModule({
      controllers: [PriceImportController],
      providers: [PriceImportService, AclService, JwtStrategy,
        { provide: ConfigService, useValue: { get: () => SECRET } },
        { provide: PrismaService, useValue: prisma },
        { provide: SessionService, useValue: { isActive: async (jti: string) => jti === SESSION } },
        { provide: AuditService, useValue: { log: (...args: unknown[]) => fake.audit.log(...args), logTx: (...args: unknown[]) => fake.audit.logTx(...args) } },
        { provide: AccessAssignmentsService, useValue: { grantsForUser: async () => grants.grants } },
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
      products: [{ id: 'product-a', sku: 'SKU-A', listaId: LIST }, { id: 'product-b', sku: 'SKU-B', listaId: LIST }],
      tariffs: [{ id: 'tariff-oro', code: 'DPP_ORO_IVA' }],
      prices: [{ productId: 'product-a', priceListId: 'tariff-oro', value: 100, listaId: LIST }, { productId: 'product-b', priceListId: 'tariff-oro', value: 100, listaId: LIST }],
    });
    for (const key of Object.keys(prisma)) delete prisma[key];
    Object.assign(prisma, fake.prisma, {
      user: { findUnique: jest.fn(async ({ where }: any) => where.id === PERSON ? { id: PERSON, name: 'Fixture', email: 'f@example.test', isActive: true, roles: [{ role: { name: 'Supervisor' } }] } : null) },
      accessGrant: { findMany: jest.fn(async () => grants.grants.map((g) => ({ sourceId: g.sourceId, actionId: g.actionId, scopeKind: g.scope, resourceId: g.resourceId ?? '' }))) },
    });
    grants = createGrantsProvider();
    grants.grantOnLista(LIST, ...ACTIONS);
  });

  const auth = (req: request.Test) => req.auth(token, { type: 'bearer' });
  async function saveRevision(rows: unknown[][]): Promise<string> {
    const response = await auth(request(app.getHttpServer()).post('/api/prices/import/revisions'))
      .field('idempotencyKey', `http-key-${String(++seq).padStart(6, '0')}`)
      .attach('file', workbook(rows), { filename: 'precios.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      .expect(201);
    expect(response.body.data.listaId).toBeNull();
    return response.body.data.id;
  }
  const apply = (id: string) => auth(request(app.getHttpServer()).post(`/api/prices/import/revisions/${id}/apply`));

  it('saves a revision without any destination lista', async () => {
    const id = await saveRevision([['SKU-A', 110]]);
    expect(fake.state.revisions[0]).toMatchObject({ id, listaId: null, createdById: PERSON });
  });

  it('applies without a body when nothing needs confirmation', async () => {
    const id = await saveRevision([['SKU-A', 110]]);
    const response = await apply(id).expect(201);
    expect(response.body.data).toMatchObject({ status: 'APLICADA', alreadyApplied: false, appliedPrices: 1 });
    const again = await apply(id).expect(201);
    expect(again.body.data.alreadyApplied).toBe(true);
  });

  it('answers 409 with a machine code and structured details for unacknowledged rejected rows', async () => {
    const id = await saveRevision([['SKU-A', 110], ['NO-SUCH', 5]]);
    const response = await apply(id).send({}).expect(409);
    expect(response.body).toMatchObject({
      code: 'REJECTED_ROWS_UNACKNOWLEDGED',
      details: { count: 1, rows: [{ rowNumber: 3, sku: 'NO-SUCH', code: 'UNKNOWN_REFERENCE' }] },
    });
    expect(response.body.feedback).toEqual(['Fila 3 (NO-SUCH): UNKNOWN_REFERENCE']);
    await apply(id).send({ acknowledgeRejectedRows: 1 }).expect(201);
  });

  it('answers 409 LARGE_CHANGES_UNCONFIRMED until the same call confirms', async () => {
    const id = await saveRevision([['SKU-A', 200]]);
    const response = await apply(id).send({ acknowledgeRejectedRows: 0 }).expect(409);
    expect(response.body).toMatchObject({ code: 'LARGE_CHANGES_UNCONFIRMED', details: { count: 1, changes: [{ sku: 'SKU-A', tariffCode: 'DPP_ORO_IVA', previous: '100', new: '200', percent: '100.00' }] } });
    const ok = await apply(id).send({ confirmLargeChanges: true }).expect(201);
    expect(ok.body.data.largeChangesConfirmed).toBe(true);
  });

  it('answers 409 NOTHING_TO_APPLY and REVISION_CONFLICT with their codes', async () => {
    const same = await saveRevision([['SKU-A', 100]]);
    expect((await apply(same).expect(409)).body.code).toBe('NOTHING_TO_APPLY');
    const id = await saveRevision([['SKU-B', 110]]);
    fake.state.prices[1].value = 105;
    const conflict = await apply(id).expect(409);
    expect(conflict.body).toMatchObject({ code: 'REVISION_CONFLICT', details: { conflicts: [{ code: 'PRICE_CHANGED', sku: 'SKU-B' }] } });
  });

  it('re-reads the grants on every request: no apply action is a 403, a global grant still covers the lista', async () => {
    const id = await saveRevision([['SKU-A', 110]]);
    grants.grants.splice(0, grants.grants.length);
    grants.grantOnLista(LIST, 'prices:read', 'listas:read');
    await apply(id).expect(403);
    grants.grants.splice(0, grants.grants.length);
    grants.grant('prices:read', 'prices:apply', 'listas:read', 'prices:save', 'prices:preview');
    await apply(id).expect(201);
  });

  it.each([
    [{ acknowledgeRejectedRows: 'x' }], [{ acknowledgeRejectedRows: -1 }], [{ acknowledgeRejectedRows: 1.5 }],
    [{ confirmLargeChanges: 'yes' }], [{ bypassAcl: true }],
  ])('rejects the invalid body %j with 400 before touching data', async (payload) => {
    const id = await saveRevision([['SKU-A', 110]]);
    fake.prisma.$transaction.mockClear();
    await apply(id).send(payload).expect(400);
    expect(fake.prisma.$transaction).not.toHaveBeenCalled();
  });
});
