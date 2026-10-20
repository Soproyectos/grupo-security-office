jest.mock('../../../prisma/prisma.service', () => ({ PrismaService: class {} }));
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
import { MAX_XLSX_BYTES } from './xlsx-container';

/**
 * IMP-01 integrado — HTTP con NUESTRO stack (JwtAuthGuard del controller +
 * RolesGuard/PermissionsGuard por decorador; concesiones revalidadas POR
 * SOLICITUD en el servicio con AccessAssignmentsService). Claims stale del
 * token jamás conceden las acciones del preview (la autorización sale de los
 * grants de BD); la capa rol es la transición D5 documentada de la tanda.
 */
const LIST = '00000000-0000-4000-8000-000000000001';
const OTHER_LIST = '00000000-0000-4000-8000-000000000002';
const PERSON = 'fixture-person';
const SESSION = 'fixture-price-session';
const TARIFF = 'fixture-tariff';
const SECRET = 'fixture-only-http-price-preview-secret';
const endpoint = '/api/prices/import/preview';
const writes = ['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'] as const;
const writesForModel = () => Object.fromEntries(writes.map((method) => [method, jest.fn()]));

function workbook(rows: unknown[][] = [['0001-A', 123456.5], ['0002-B', 99000]]): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'ORO_IVA'], ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Completa la referencia y el precio con IVA.']]), 'INSTRUCCIONES');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

describe('Price template preview through HTTP, live sessions and real ACL', () => {
  let app: INestApplication;
  let grants: { sourceId: string; actionId: string; scope: 'list' | 'global' | 'own' | 'team' | 'product'; resourceId?: string }[];
  let userActive: boolean;
  let sessionActive: boolean;
  let assignments: { userId: string; resourceType: string; resourceId: string; level: string; isActive: boolean }[];
  const jwt = new JwtService({ secret: SECRET });
  // Claims stale deliberados (rol/permisos): jamás deben conceder el preview.
  const token = jwt.sign({ sub: PERSON, jti: SESSION, roles: ['Supervisor'], permissions: ['prices:preview', 'products:read'] });
  const audit = { log: jest.fn().mockResolvedValue({}) };
  const sessions = { isActive: jest.fn(async (jti: string) => jti === SESSION && sessionActive) };
  const products = [
    { id: 'fixture-product-a', sku: '0001-A', listaId: LIST },
    { id: 'fixture-product-b', sku: '0002-B', listaId: LIST },
    { id: 'fixture-product-foreign', sku: 'FOREIGN-SECRET', listaId: OTHER_LIST },
  ];
  const stored = [
    { productId: 'fixture-product-a', priceListId: TARIFF, listaId: LIST, value: '100000', currency: 'COP' },
    { productId: 'fixture-product-b', priceListId: TARIFF, listaId: LIST, value: '99000', currency: 'COP' },
    { productId: 'fixture-product-foreign', priceListId: TARIFF, listaId: OTHER_LIST, value: '876543210', currency: 'COP' },
  ];
  const prisma = {
    user: { findUnique: jest.fn(async ({ where }: any) => where.id === PERSON ? {
      id: PERSON, name: 'Fixture', email: 'fixture@example.test', isActive: userActive,
      roles: [{ role: { name: 'Supervisor' } }],
    } : null) },
    assignment: { findMany: jest.fn(async ({ where }: any) => assignments.filter((a) => {
      if (where.userId && a.userId !== where.userId) return false;
      if (where.resourceType && a.resourceType !== where.resourceType) return false;
      if (where.isActive !== undefined && a.isActive !== where.isActive) return false;
      if (typeof where.resourceId === 'string' && a.resourceId !== where.resourceId) return false;
      if (where.resourceId?.in && !where.resourceId.in.includes(a.resourceId)) return false;
      if (where.level?.in && !where.level.in.includes(a.level)) return false;
      return true;
    })) },
    accessGrant: { findMany: jest.fn(async ({ where }: any) => where?.source?.userId === PERSON
      ? grants.map((grant) => ({
          sourceId: grant.sourceId, actionId: grant.actionId,
          scopeKind: grant.scope, resourceId: grant.resourceId ?? '',
        })) : []) },
    lista: { ...writesForModel(), findUnique: jest.fn(async ({ where }: any) => [LIST, OTHER_LIST].includes(where.id) ? {
      id: where.id, isActive: true, archivedAt: null, deletionStatus: null, currency: 'COP',
    } : null) },
    product: { ...writesForModel(), findMany: jest.fn(async ({ where }: any) => products.filter((p) => p.listaId === where.listaId && where.sku.in.some((sku: string) => sku.toUpperCase() === p.sku.toUpperCase()))) },
    priceList: { ...writesForModel(), findMany: jest.fn(async ({ where }: any) => where.code.in.includes('ORO_IVA') ? [{ id: TARIFF, code: 'ORO_IVA', isActive: true, currency: 'COP', validFrom: null, validUntil: null }] : []) },
    price: { ...writesForModel(), findMany: jest.fn(async ({ where }: any) => stored.filter((p) => where.productId.in.includes(p.productId) && where.priceListId.in.includes(p.priceListId))) },
    $transaction: jest.fn(),
  };
  const grantRow = (actionId: string) => ({ sourceId: 'src-1', actionId, scope: 'list' as const, resourceId: LIST });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PriceImportController],
      providers: [PriceImportService, AclService, JwtStrategy,
        { provide: ConfigService, useValue: { get: () => SECRET } },
        { provide: PrismaService, useValue: prisma },
        { provide: SessionService, useValue: sessions },
        { provide: AuditService, useValue: audit },
        { provide: AccessAssignmentsService, useValue: { grantsForUser: async () => grants } },
        { provide: APP_GUARD, useClass: JwtAuthGuard }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    userActive = true;
    sessionActive = true;
    grants = ['prices:preview', 'prices:read', 'listas:read'].map((actionId) => grantRow(actionId));
    assignments = [{ userId: PERSON, resourceType: 'LISTA', resourceId: LIST, level: 'view_prices', isActive: true }];
  });

  afterEach(() => {
    for (const model of [prisma.price, prisma.product, prisma.lista, prisma.priceList]) {
      for (const method of writes) expect(model[method]).not.toHaveBeenCalled();
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  afterAll(async () => { await app.close(); });

  function upload(options: { token?: string | null; listaId?: string; buffer?: Buffer; fileName?: string } = {}) {
    let req = request(app.getHttpServer()).post(endpoint);
    if (options.token !== null) req = req.auth(options.token ?? token, { type: 'bearer' });
    return req.field('listaId', options.listaId ?? LIST).attach('file', options.buffer ?? workbook(), {
      filename: options.fileName ?? 'precios-fixture.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  it('allows only preview/read/listas read with view_prices, without Biblioteca or global scope', async () => {
    const response = await upload().expect(201);
    const result = response.body.data;
    expect(result).toMatchObject({ listaId: LIST, readOnly: true, currency: 'COP', taxIncluded: true, rounding: 'HALF_UP',
      summary: { rows: 2, validRows: 2, errorRows: 0, prices: 2, changedPrices: 1, unchangedPrices: 1, roundedPrices: 1 } });
    expect(result.rows[0].prices[0]).toMatchObject({ code: 'ORO_IVA', raw: '123456.5', rounded: '123457', previous: '100000', difference: '23457', change: 'changed' });
    // La autorización salió de los grants de BD, no de los claims del token.
    expect(grants.map((g) => g.actionId).sort()).toEqual(['listas:read', 'prices:preview', 'prices:read']);
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ listaId: LIST }) }));
  });

  it('logs only a domain summary and file hash rather than references, prices or binary content', async () => {
    await upload().expect(201);
    const domain = audit.log.mock.calls.find(([event]) => event.action === 'price-import-preview')?.[0];
    expect(domain).toMatchObject({ userId: PERSON, action: 'price-import-preview', entity: 'LISTA', entityId: LIST, result: 'SUCCESS' });
    expect(Object.keys(domain.newValues).sort()).toEqual(['fileHash', 'rounding', 'summary', 'tariffs']);
    expect(domain.newValues.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(domain)).not.toMatch(/0001-A|123456|precios-fixture|base64|buffer/i);
  });

  it('requires authentication before reading prices or parsing a file', async () => {
    await upload({ token: null }).expect(401);
    expect(prisma.price.findMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it.each(['prices:preview', 'prices:read', 'listas:read'])('denies missing action/dependency %s in the DB grants despite stale privileged JWT claims', async (missing) => {
    grants = grants.filter((g) => g.actionId !== missing);
    const response = await upload();
    expect(response.status).toBe(403);
    // La acción ausente se nombra; una dependencia ausente se señala como
    // missing-dependency de la acción raíz (adaptación documentada).
    const message = String(response.body.message);
    expect(message).toMatch(new RegExp(`Sin permiso (${missing}|prices:preview)`));
    if (missing !== 'prices:preview') expect(message).toContain('missing-dependency');
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('rejects a view-only Lista assignment without disclosing stored prices', async () => {
    assignments[0].level = 'view';
    grants = grants.filter((grant) => grant.actionId !== 'prices:read');
    await upload().expect(403);
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('hides another Lista when it has no assignment', async () => {
    const response = await upload({ listaId: OTHER_LIST }).expect(404);
    expect(response.body.message).toBe('Lista no encontrada');
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('does not reveal prices for an explicitly restricted PRODUCT', async () => {
    assignments.push({ userId: PERSON, resourceType: 'PRODUCT', resourceId: 'fixture-product-a', level: 'view_prices', isActive: false });
    const response = await upload({ buffer: workbook([['0001-A', 200000]]) }).expect(201);
    expect(response.body.data.rows[0]).toMatchObject({ status: 'error', prices: [{ previous: null, difference: null }] });
    expect(response.body.data.rows[0].issues).toContainEqual(expect.objectContaining({ code: 'REFERENCE_UNAVAILABLE' }));
    expect(prisma.price.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain('100000');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'price-import-preview', result: 'WARNING' }));
  });

  it('does not search or reveal foreign product details from the chosen Lista', async () => {
    const response = await upload({ buffer: workbook([['FOREIGN-SECRET', 777]]) }).expect(201);
    expect(response.body.data.rows[0]).toMatchObject({ status: 'error', prices: [{ previous: null, difference: null }] });
    expect(JSON.stringify(response.body)).not.toMatch(/876543210|fixture-product-foreign/);
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('revokes the preview action immediately while using the same signed token (fresh DB grants)', async () => {
    await upload().expect(201);
    grants = grants.filter((g) => g.actionId !== 'prices:preview');
    await upload().expect(403);
  });

  it('revokes the current session immediately while using the same signed token', async () => {
    await upload().expect(201);
    sessionActive = false;
    await upload().expect(401);
    expect(sessions.isActive).toHaveBeenCalledWith(SESSION);
  });

  it('rejects an inactive user', async () => {
    userActive = false;
    await upload().expect(401);
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('rejects an MFA challenge even when signed by the same issuer', async () => {
    await upload({ token: jwt.sign({ sub: PERSON, jti: SESSION, scope: 'mfa' }) }).expect(401);
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('rejects an invalid UUID before invoking the service', async () => {
    const response = await upload({ listaId: 'not-a-uuid' }).expect(400);
    expect(response.body.message).toContain('listaId must be a UUID');
    expect(prisma.lista.findUnique).not.toHaveBeenCalled();
  });

  it('rejects unknown DTO properties using the production whitelist', async () => {
    const response = await request(app.getHttpServer()).post(endpoint).auth(token, { type: 'bearer' }).send({ listaId: LIST, bypassAcl: true }).expect(400);
    expect(response.body.message).toContain('property bypassAcl should not exist');
  });

  it('rejects a missing Lista UUID', async () => {
    await request(app.getHttpServer()).post(endpoint).auth(token, { type: 'bearer' }).attach('file', workbook(), 'fixture.xlsx').expect(400);
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('rejects a missing file', async () => {
    const response = await request(app.getHttpServer()).post(endpoint).auth(token, { type: 'bearer' }).field('listaId', LIST).expect(400);
    expect(response.body.message).toContain('.xlsx');
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it.each([
    { fileName: 'fixture.xlsx', buffer: Buffer.from('not an Excel zip') },
    { fileName: 'fixture.csv', buffer: Buffer.from('REFERENCIA,ORO_IVA\n0001-A,123456') },
  ])('rejects invalid uploaded content or extension ($fileName)', async ({ fileName, buffer }) => {
    const response = await upload({ fileName, buffer }).expect(400);
    expect(response.body.path).toBe(endpoint);
    expect(typeof response.body.message).toBe('string');
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('rejects a multipart file larger than 5 MB', async () => {
    const response = await upload({ buffer: Buffer.alloc(MAX_XLSX_BYTES + 1, 1) }).expect(413);
    expect(response.body.message).toBe('File too large');
    expect(prisma.price.findMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'price-import-preview' }));
  });
});
