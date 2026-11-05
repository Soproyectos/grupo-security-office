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
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { LibraryAuditService } from '../../library-audit/library-audit.service';
import { directLegacyProductLibrary } from '../../products/product-library';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { PriceImportController } from './price-import.controller';
import { PriceImportService } from './price-import.service';
import { MAX_XLSX_BYTES } from './xlsx-container';

/**
 * IMP-01 integrado — HTTP con NUESTRO stack (JwtAuthGuard + GrantGuard por @RequireGrant;
 * concesiones GLOBALES del panel revalidadas POR SOLICITUD con AccessAssignmentsService).
 * Claims stale del token y el cargo jamás conceden nada: la autorización sale de los grants de
 * BD. Ninguna Lista interviene (una concesión ligada a una Lista no abre estos endpoints).
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
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'DPP_ORO_IVA'], ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Completa la referencia y el precio con IVA.']]), 'INSTRUCCIONES');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

/** File with the single-price column (supplier without tariff tiers); `extraHeaders` lets a test mix in tariff columns. */
function singleWorkbook(rows: unknown[][] = [['0001-A', 123456.5], ['0002-B', 99000]], extraHeaders: string[] = []): Buffer {
  const book = XLSX.utils.book_new();
  const body = rows.map((row) => [...row, ...extraHeaders.map(() => 1)]);
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'PRECIO UNICO (CON IVA)', ...extraHeaders], ...body]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Completa la referencia y el precio con IVA.']]), 'INSTRUCCIONES');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}

describe('Price template preview through HTTP, live sessions and real ACL', () => {
  let app: INestApplication;
  let grants: { sourceId: string; actionId: string; scope: 'list' | 'global' | 'own' | 'team' | 'product'; resourceId?: string }[];
  let userActive: boolean;
  let userRole: string;
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
      roles: [{ role: { name: userRole } }],
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
    lista: { ...writesForModel(), findUnique: jest.fn(), findMany: jest.fn(async ({ where }: any) => [LIST, OTHER_LIST].filter((id) => where.id.in.includes(id)).map((id) => ({
      id, code: id === LIST ? 'LA' : 'LB', name: id === LIST ? 'Lista Alfa' : 'Lista Beta Secreta', isActive: true, archivedAt: null, deletionStatus: null, currency: 'COP',
    }))) },
    // Normalized SKU lookup (findProductMatchesBySkus) followed by the product read by id.
    $queryRaw: jest.fn(async (query: { values: unknown[] }) => {
      const wanted = new Set(query.values[0] as string[]);
      return products.filter((p) => wanted.has(p.sku.replace(/\s/g, '').toUpperCase())).map((p) => ({ id: p.id, sku: p.sku }));
    }),
    product: { ...writesForModel(), findMany: jest.fn(async ({ where }: any) => products.filter((p) => where.id.in.includes(p.id))) },
    priceList: { ...writesForModel(), findMany: jest.fn(async ({ where }: any) => where.code.in.includes('DPP_ORO_IVA') ? [{ id: TARIFF, code: 'DPP_ORO_IVA', isActive: true, currency: 'COP', validFrom: null, validUntil: null }] : []) },
    price: { ...writesForModel(), findMany: jest.fn(async ({ where }: any) => stored.filter((p) => where.productId.in.includes(p.productId) && where.priceListId.in.includes(p.priceListId))) },
    $transaction: jest.fn(),
  };
  const grantRow = (actionId: string) => ({ sourceId: 'src-1', actionId, scope: 'global' as const, resourceId: undefined as string | undefined });
  const listGrantRow = (actionId: string) => ({ sourceId: 'src-1', actionId, scope: 'list' as const, resourceId: LIST });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PriceImportController],
      providers: [PriceImportService, AclService, JwtStrategy,
        { provide: ConfigService, useValue: { get: () => SECRET } },
        { provide: PrismaService, useValue: prisma },
        // Modo legacy: la fachada de biblioteca comparte el mismo cliente de prueba.
        { provide: BibliotecaPrismaService, useValue: directLegacyProductLibrary(prisma as never) },
        LibraryAuditService,
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
    userRole = 'Supervisor';
    sessionActive = true;
    grants = ['prices:preview', 'prices:read', 'listas:read'].map((actionId) => grantRow(actionId));
    assignments = [];
  });

  afterEach(() => {
    for (const model of [prisma.price, prisma.product, prisma.lista, prisma.priceList]) {
      for (const method of writes) expect(model[method]).not.toHaveBeenCalled();
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  afterAll(async () => { await app.close(); });

  function upload(options: { token?: string | null; listaId?: string; buffer?: Buffer; fileName?: string; singlePriceTariffs?: string } = {}) {
    let req = request(app.getHttpServer()).post(endpoint);
    if (options.token !== null) req = req.auth(options.token ?? token, { type: 'bearer' });
    req = req.field('listaId', options.listaId ?? LIST);
    if (options.singlePriceTariffs !== undefined) req = req.field('singlePriceTariffs', options.singlePriceTariffs);
    return req.attach('file', options.buffer ?? workbook(), {
      filename: options.fileName ?? 'precios-fixture.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  it('allows the preview with the global panel grants (preview + read, plus the catalog dependency) and no Lista assignment', async () => {
    const response = await upload().expect(201);
    const result = response.body.data;
    expect(result).toMatchObject({ listaId: null, readOnly: true, currency: 'COP', taxIncluded: true, rounding: 'HALF_UP',
      summary: { rows: 2, validRows: 2, errorRows: 0, prices: 2, changedPrices: 1, unchangedPrices: 1, roundedPrices: 1 } });
    expect(result.rows[0].prices[0]).toMatchObject({ code: 'DPP_ORO_IVA', raw: '123456.5', rounded: '123457', previous: '100000', difference: '23457', change: 'changed' });
    // La autorización salió de los grants de BD, no de los claims del token.
    expect(grants.map((g) => g.actionId).sort()).toEqual(['listas:read', 'prices:preview', 'prices:read']);
    expect(result.rows[0]).toMatchObject({ productId: 'fixture-product-a', listaId: LIST, listaState: 'LISTA' });
  });

  it('works without any destination lista in the request (the field is optional and ignored)', async () => {
    const response = await request(app.getHttpServer()).post(endpoint).auth(token, { type: 'bearer' })
      .attach('file', workbook(), { filename: 'precios-fixture.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      .expect(201);
    expect(response.body.data.summary).toMatchObject({ rows: 2, validRows: 2, rowsInInaccessibleListas: 0 });
    expect(response.body.data.summary.byLista).toEqual([{ listaId: LIST, rows: 2, prices: 2 }]);
    expect(prisma.lista.findMany).not.toHaveBeenCalled();
  });

  it('works for a role that used to be rejected (Vendedor) and denies roles that used to pass when they hold no grants', async () => {
    userRole = 'Vendedor';
    await upload().expect(201);
    prisma.price.findMany.mockClear();
    for (const role of ['Admin Comercial', 'Supervisor']) {
      userRole = role;
      grants = [];
      const response = await upload();
      expect(response.status).toBe(403);
      expect(prisma.price.findMany).not.toHaveBeenCalled();
    }
  });

  it('a grant tied to one lista (or product) never opens the preview', async () => {
    grants = ['prices:preview', 'prices:read', 'listas:read'].map((actionId) => listGrantRow(actionId));
    await upload().expect(403);
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('logs only a domain summary and file hash rather than references, prices or binary content', async () => {
    await upload().expect(201);
    const domain = audit.log.mock.calls.find(([event]) => event.action === 'price-import-preview')?.[0];
    expect(domain).toMatchObject({ userId: PERSON, action: 'price-import-preview', entity: 'Price', result: 'SUCCESS' });
    expect(domain.entityId).toMatch(/^[a-f0-9]{64}$/);
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
    // La acción ausente se nombra; una dependencia ausente se señala en la acción raíz (prices:preview).
    const message = String(response.body.message);
    expect(message).toMatch(new RegExp(`Sin permiso (${missing}|prices:preview)`));
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('a Lista assignment does not replace the missing prices:read grant: stored prices are never disclosed', async () => {
    assignments = [{ userId: PERSON, resourceType: 'LISTA', resourceId: LIST, level: 'view_prices', isActive: true }];
    grants = grants.filter((grant) => grant.actionId !== 'prices:read');
    await upload().expect(403);
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('an explicit lista in the request is ignored: the global grant covers rows of every lista', async () => {
    const response = await upload({ listaId: OTHER_LIST, buffer: workbook([['FOREIGN-SECRET', 777]]) }).expect(201);
    expect(response.body.data.rows[0]).toMatchObject({ status: 'valid', productId: 'fixture-product-foreign' });
    expect(response.body.data.rows[0].prices[0]).toMatchObject({ previous: '876543210' });
    expect(JSON.stringify(response.body)).not.toMatch(/LISTA_FORBIDDEN/);
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

  it('covers SKUs of every old lista in one file without any lista lookup or lista name in the response', async () => {
    const response = await upload({ buffer: workbook([['FOREIGN-SECRET', 777], ['0001-A', 100001]]) }).expect(201);
    const [foreign, own] = response.body.data.rows;
    expect(foreign.status).toBe('valid');
    expect(own.status).toBe('valid');
    expect(response.body.data.summary).toMatchObject({ rowsInInaccessibleListas: 0, validRows: 2 });
    expect(JSON.stringify(response.body)).not.toMatch(/Lista Beta|Lista Alfa|LB"/);
    expect(prisma.lista.findMany).not.toHaveBeenCalled();
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
    expect(prisma.lista.findMany).not.toHaveBeenCalled();
  });

  it('rejects unknown DTO properties using the production whitelist', async () => {
    const response = await request(app.getHttpServer()).post(endpoint).auth(token, { type: 'bearer' }).send({ listaId: LIST, bypassAcl: true }).expect(400);
    expect(response.body.message).toContain('property bypassAcl should not exist');
  });

  it('rejects a missing file', async () => {
    const response = await request(app.getHttpServer()).post(endpoint).auth(token, { type: 'bearer' }).field('listaId', LIST).expect(400);
    expect(response.body.message).toContain('.xlsx');
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it.each([
    { fileName: 'fixture.xlsx', buffer: Buffer.from('not an Excel zip') },
    { fileName: 'fixture.csv', buffer: Buffer.from('REFERENCIA,DPP_ORO_IVA\n0001-A,123456') },
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

  describe('single price (supplier without tariff tiers)', () => {
    it('declares singlePriceTariffs in the DTO (the production whitelist does not reject it) and expands only to that selection', async () => {
      const response = await upload({ buffer: singleWorkbook(), singlePriceTariffs: 'DPP_ORO_IVA' }).expect(201);
      const result = response.body.data;
      expect(result.singlePrice).toEqual({ tariffs: ['DPP_ORO_IVA'] });
      expect(result.summary).toMatchObject({ rows: 2, validRows: 2, errorRows: 0, prices: 2, changedPrices: 1, unchangedPrices: 1 });
      expect(result.rows[0].prices).toEqual([expect.objectContaining({ code: 'DPP_ORO_IVA', raw: '123456.5', rounded: '123457', previous: '100000', change: 'changed' })]);
    });

    it('expands to the five tariffs when the field is absent; the unconfigured ones come back as TARIFF_UNAVAILABLE', async () => {
      const response = await upload({ buffer: singleWorkbook() }).expect(201);
      const result = response.body.data;
      expect(result.singlePrice.tariffs).toHaveLength(5);
      const unavailable = result.issues.filter((i: { code: string; row: number | null }) => i.code === 'TARIFF_UNAVAILABLE' && i.row === null)
        .map((i: { column: string }) => i.column).sort();
      expect(unavailable).toEqual(['CLIENTE_FINAL_IVA', 'DPP_PLATINO_IVA', 'INSTALADOR_IVA', 'TIENDA_IVA']);
      expect(result.summary.validRows).toBe(0);
    });

    it('rejects a blank or unknown selection with a Spanish 400 before reading any price', async () => {
      const blank = await upload({ buffer: singleWorkbook(), singlePriceTariffs: '' }).expect(400);
      expect(blank.body.message).toContain('Elige al menos un escalafón');
      const unknown = await upload({ buffer: singleWorkbook(), singlePriceTariffs: 'TIENDA_IVA,ORO_IVA' }).expect(400);
      expect(unknown.body.message).toContain('Escalafón no reconocido: ORO_IVA');
      expect(prisma.price.findMany).not.toHaveBeenCalled();
    });

    it('ignores the selection for a file with tariff columns', async () => {
      const response = await upload({ singlePriceTariffs: 'TIENDA_IVA' }).expect(201);
      expect(response.body.data.singlePrice).toBeNull();
      expect(response.body.data.rows[0].prices.map((p: { code: string }) => p.code)).toEqual(['DPP_ORO_IVA']);
    });

    it('refuses a file that mixes the single price with a tariff column', async () => {
      const response = await upload({ buffer: singleWorkbook(undefined, ['DPP_ORO_IVA']) }).expect(400);
      expect(response.body.message).toContain('columnas de escalafón');
      expect(prisma.price.findMany).not.toHaveBeenCalled();
    });

    it('allows exactly one more multipart field than before (listaId + singlePriceTariffs) and no more', async () => {
      const response = await request(app.getHttpServer()).post(endpoint).auth(token, { type: 'bearer' })
        .field('listaId', LIST).field('singlePriceTariffs', 'DPP_ORO_IVA').field('extra', 'x')
        .attach('file', singleWorkbook(), { filename: 'precios-fixture.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      expect(response.status).toBe(400);
      expect(prisma.price.findMany).not.toHaveBeenCalled();
    });

    it('logs a different file hash for each selection of the same single-price file', async () => {
      await upload({ buffer: singleWorkbook(), singlePriceTariffs: 'DPP_ORO_IVA' }).expect(201);
      await upload({ buffer: singleWorkbook(), singlePriceTariffs: 'DPP_ORO_IVA,TIENDA_IVA' }).expect(201);
      const hashes = audit.log.mock.calls.filter(([event]) => event.action === 'price-import-preview').map(([event]) => event.entityId);
      expect(hashes).toHaveLength(2);
      expect(new Set(hashes).size).toBe(2);
    });
  });

  describe('official template download (single-price flag)', () => {
    const route = '/api/prices/import/template/official';
    // Binary body: superagent only buffers text/JSON by default, so collect the bytes with a custom parser.
    const binaryParser = (res: any, callback: (error: Error | null, body: Buffer) => void) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    };
    const download = (query = '') => request(app.getHttpServer()).get(`${route}${query}`).auth(token, { type: 'bearer' })
      .buffer(true).parse(binaryParser as never);
    const header = (body: Buffer) => XLSX.utils.sheet_to_json<string[]>(XLSX.read(body, { type: 'buffer' }).Sheets.PLANTILLA, { header: 1 })[0];

    it('keeps serving the official template when the flag is absent or false', async () => {
      for (const query of ['', '?singlePrice=false']) {
        const response = await download(query).expect(200);
        expect(response.headers['content-disposition']).toMatch(/plantilla-precios-grupo-security-/);
        expect(header(response.body)).toHaveLength(6);
      }
    });

    it('serves the single-price template with singlePrice=true', async () => {
      const response = await download('?singlePrice=true').expect(200);
      expect(response.headers['content-disposition']).toMatch(/plantilla-precio-unico-grupo-security-/);
      expect(header(response.body)).toEqual(['REFERENCIA *', 'PRECIO UNICO (CON IVA)']);
    });

    it('declares the flag in the query DTO: other values and unknown parameters are rejected', async () => {
      await download('?singlePrice=maybe').expect(400);
      await download('?other=1').expect(400);
    });

    it('needs the same prices:preview grant for both templates', async () => {
      grants = grants.filter((g) => g.actionId !== 'prices:preview');
      await download('?singlePrice=true').expect(403);
      await download().expect(403);
    });

    it('zero grants: roles that used to pass get 403 (the old "no grants => allowed" rule is gone)', async () => {
      grants = [];
      for (const role of ['Admin Comercial', 'Supervisor']) {
        userRole = role;
        await download().expect(403);
        await download('?singlePrice=true').expect(403);
      }
    });
  });

  describe('templates, exports and revisions need no lista and only global grants', () => {
    const binaryParser = (res: any, callback: (error: Error | null, body: Buffer) => void) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    };
    const get = (url: string) => request(app.getHttpServer()).get(url).auth(token, { type: 'bearer' }).buffer(true).parse(binaryParser as never);

    it('the empty template is served without listaId (prices:preview)', async () => {
      const response = await get('/api/prices/import/template?mode=vacias').expect(200);
      expect(response.headers['content-disposition']).toMatch(/plantilla-precios-\d{4}-\d{2}-\d{2}\.xlsx/);
    });

    it('the empty template and the reference download are denied without their grant', async () => {
      grants = ['prices:read', 'listas:read'].map((a) => grantRow(a));
      await get('/api/prices/import/template?mode=vacias').expect(403);
      grants = ['prices:preview'].map((a) => grantRow(a));
      await get('/api/prices/import/template?mode=referencias').expect(403);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('the export needs prices:read and never a lista; a lista-tied grant is not enough', async () => {
      grants = ['prices:preview'].map((a) => grantRow(a));
      await get('/api/prices/import/export').expect(403);
      grants = ['prices:read', 'listas:read'].map((a) => listGrantRow(a));
      await get('/api/prices/import/export').expect(403);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it.each([
      ['GET', '/api/prices/import/revisions'],
      ['GET', '/api/prices/import/revisions/rev-1'],
      ['GET', '/api/prices/import/revisions/rev-1/file'],
      ['POST', '/api/prices/import/revisions/rev-1/apply'],
      ['DELETE', '/api/prices/import/revisions/rev-1'],
      ['GET', '/api/prices/import/profiles'],
      ['POST', '/api/prices/import/profiles/recognize'],
    ])('%s %s denies a caller with zero grants whatever the role (Admin Comercial, Supervisor)', async (method, url) => {
      grants = [];
      for (const role of ['Admin Comercial', 'Supervisor']) {
        userRole = role;
        const response = await request(app.getHttpServer())[method.toLowerCase() as 'get'](url).auth(token, { type: 'bearer' }).send({});
        expect(response.status).toBe(403);
      }
    });

    it('listing revisions needs no listaId (the filter is optional) but does need prices:read', async () => {
      grants = ['prices:preview'].map((a) => grantRow(a));
      await request(app.getHttpServer()).get('/api/prices/import/revisions').auth(token, { type: 'bearer' }).expect(403);
    });

    it('provider profiles need providers:read / providers:write as GLOBAL grants', async () => {
      grants = ['providers:read'].map((a) => grantRow(a));
      await request(app.getHttpServer()).post('/api/prices/import/profiles').auth(token, { type: 'bearer' }).send({}).expect(403);
      grants = ['providers:write', 'providers:read'].map((a) => listGrantRow(a));
      await request(app.getHttpServer()).get('/api/prices/import/profiles').auth(token, { type: 'bearer' }).expect(403);
    });
  });
});
