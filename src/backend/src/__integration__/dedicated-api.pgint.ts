/**
 * Integración API (AppModule real) con biblioteca PostgreSQL DEDICADA y base operativa separada, autenticación y permisos REALES.
 *
 * No se ejecuta con `jest` normal (extensión .pgint.ts): la lanza el ensayo aislado de la VPS con
 *   jest --runInBand --testRegex '.*\.pgint\.ts$' dedicated-api
 * contra dos PostgreSQL desechables (NODE_ENV=test, LIBRARY_DATABASE_MODE=dedicated). Datos sintéticos únicamente.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as cookieParser from 'cookie-parser';
import * as XLSX from 'xlsx';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';
import { getActionDefinition } from '../common/security/access-catalog';
import { BibliotecaPrismaService } from '../prisma/biblioteca-prisma.service';
import { PrismaService } from '../prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

const COMPRAS = { email: 'compras@gruposecurity.co', password: process.env.SEED_COMPRAS_PASSWORD as string };
const VENDEDOR = { email: 'vendedor-prueba@ejemplo.invalid', password: 'vendedor-sintetico-2026' };
const PRICE_SECRET = '9876543';
const GRANTED = [
  'listas:read', 'listas:create', 'listas:update', 'products:read', 'products:write', 'products:publish', 'products:validate',
  'prices:read', 'prices:apply', 'prices:preview', 'prices:save', 'providers:read', 'providers:write',
];

function withDependencies(ids: string[]): string[] {
  const out = new Set<string>();
  const visit = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    for (const dep of getActionDefinition(id)?.dependencies ?? []) visit(dep);
  };
  ids.forEach(visit);
  return [...out];
}

describe('API con biblioteca dedicada, sesión y permisos reales', () => {
  let app: INestApplication;
  let ops: PrismaService;
  let lib: any;
  let comprasCookie = '';
  let vendedorCookie = '';
  let listaId = '';
  const ids = { brand: '', category: '', priceList: '', product: '', ghostProduct: '', ghostLista: '', dppTariff: '', product2: '' };

  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  function xlsx(rows: Array<[string, number]>): Buffer {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'DPP_ORO_IVA'], ...rows]), 'PRECIOS');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía ficticia']]), 'INSTRUCCIONES');
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
  const priceOf = async (productId: string) => String((await lib.price.findFirstOrThrow({ where: { productId, priceListId: ids.dppTariff } })).value);

  async function login(user: { email: string; password: string }): Promise<string> {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send(user);
    expect(res.status).toBeLessThan(300);
    const cookie = (res.headers['set-cookie'] as string[]).find((c) => c.startsWith('access_token='));
    expect(cookie).toBeTruthy();
    return (cookie as string).split(';')[0];
  }

  beforeAll(async () => {
    expect(process.env.LIBRARY_DATABASE_MODE).toBe('dedicated');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    ops = app.get(PrismaService);
    lib = app.get(BibliotecaPrismaService).client;

    // Usuarios: compras (Admin Comercial, sembrado) con concesiones; vendedor sin ninguna.
    const compras = await ops.user.findUniqueOrThrow({ where: { email: COMPRAS.email } });
    const role = await ops.role.findUniqueOrThrow({ where: { name: 'Vendedor' } });
    await ops.user.create({ data: { email: VENDEDOR.email, name: 'Vendedor de prueba', password: bcrypt.hashSync(VENDEDOR.password, 4), roles: { create: { roleId: role.id } } } });
    await ops.accessState.create({ data: { userId: compras.id } });
    const source = await ops.accessSource.create({ data: { userId: compras.id, kind: 'manual', catalogVersion: 'prueba', grantedById: compras.id } });
    for (const actionId of withDependencies(GRANTED)) await ops.accessGrant.create({ data: { sourceId: source.id, actionId, scopeKind: 'global' } });

    // Datos de catálogo SOLO en la biblioteca; un producto/Lista "fantasma" solo en las tablas viejas de la base operativa.
    const brand = await lib.brand.create({ data: { name: 'Marca API fixture', slug: 'api-fixture' } });
    const category = await lib.category.create({ data: { name: 'Categoría API fixture', slug: 'api-fixture' } });
    const tariff = await lib.priceList.create({ data: { name: 'Tarifa API fixture', code: 'API_FIXTURE', currency: 'COP' } });
    Object.assign(ids, { brand: brand.id, category: category.id, priceList: tariff.id });
    const oBrand = await ops.brand.create({ data: { name: 'Marca vieja fantasma', slug: 'ghost-brand' } });
    const oCategory = await ops.category.create({ data: { name: 'Categoría vieja fantasma', slug: 'ghost-category' } });
    const oLista = await ops.lista.create({ data: { code: 'GHOST-LISTA', name: 'Lista vieja fantasma' } });
    const ghost = await ops.product.create({ data: { sku: 'GHOST-OLD-DB', name: 'Producto fantasma base vieja', brandId: oBrand.id, categoryId: oCategory.id, listaId: oLista.id, lifecycleStatus: 'PUBLISHED', isActive: true, isVisible: true } });
    ids.ghostProduct = ghost.id;
    ids.ghostLista = oLista.id;

    comprasCookie = await login(COMPRAS);
    vendedorCookie = await login(VENDEDOR);
  }, 120_000);

  afterAll(async () => { await app?.close(); });

  it('sin sesión: las rutas administrativas responden 401', async () => {
    expect((await request(app.getHttpServer()).get('/api/listas')).status).toBe(401);
    expect((await request(app.getHttpServer()).post('/api/listas').send({ code: 'X1', name: 'x' })).status).toBe(401);
  });

  it('vendedor sin concesiones: no lee ni crea Listas, no publica', async () => {
    const http = request(app.getHttpServer());
    expect((await http.get('/api/listas').set('Cookie', vendedorCookie)).status).toBe(403);
    expect((await http.post('/api/listas').set('Cookie', vendedorCookie).send({ code: 'VEND-LISTA', name: 'No debe existir' })).status).toBe(403);
    expect(await lib.lista.count({ where: { code: 'VEND-LISTA' } })).toBe(0);
    expect((await http.post(`/api/products/${ids.ghostProduct}/transition`).set('Cookie', vendedorCookie).send({ event: 'UNPUBLISH', reason: 'prueba' })).status).toBeGreaterThanOrEqual(403);
  });

  it('compras con concesiones: crea una Lista y queda SOLO en la biblioteca, con su evento', async () => {
    const res = await request(app.getHttpServer()).post('/api/listas').set('Cookie', comprasCookie).send({ code: 'API-LISTA-1', name: 'Lista API 1' });
    expect(res.status).toBe(201);
    listaId = res.body.data.id;
    expect(await lib.lista.count({ where: { id: listaId } })).toBe(1);
    expect(await ops.lista.count({ where: { id: listaId } })).toBe(0);
    const event = await lib.libraryAuditEvent.findFirst({ where: { action: 'LISTA_CREATED', entityId: listaId } });
    expect(event?.actorId).toBeTruthy();
    expect(await ops.auditLog.count({ where: { entity: 'LISTA', entityId: listaId } })).toBe(0);
  });

  it('las guardas y lecturas de Listas usan la biblioteca (no la base vieja)', async () => {
    const http = request(app.getHttpServer());
    const list = await http.get('/api/listas').set('Cookie', comprasCookie);
    expect(list.status).toBe(200);
    const codes = JSON.stringify(list.body);
    expect(codes).toContain('API-LISTA-1');
    expect(codes).not.toContain('GHOST-LISTA');
    expect((await http.get(`/api/listas/${listaId}`).set('Cookie', comprasCookie)).status).toBe(200);
    // Una Lista que solo existe en la base vieja no se encuentra por la API.
    expect([403, 404]).toContain((await http.get(`/api/listas/${ids.ghostLista}`).set('Cookie', comprasCookie)).status);
  });

  it('publicar por API: solo con permiso; el estado, historial y evento quedan en la biblioteca', async () => {
    const product = await lib.product.create({ data: { sku: 'API-PROD-1', name: 'Producto API 1', brandId: ids.brand, categoryId: ids.category, listaId } });
    ids.product = product.id;
    await lib.price.create({ data: { productId: product.id, priceListId: ids.priceList, value: PRICE_SECRET, currency: 'COP', listaId } });
    await lib.productImage.create({ data: { productId: product.id, url: `/uploads/${product.id}.png`, isPrimary: true } });
    const http = request(app.getHttpServer());

    const denied = await http.post(`/api/products/${product.id}/transition`).set('Cookie', vendedorCookie).send({ event: 'PUBLISH' });
    expect(denied.status).toBeGreaterThanOrEqual(403);
    expect((await lib.product.findUniqueOrThrow({ where: { id: product.id } })).lifecycleStatus).toBe('DRAFT');

    const ok = await http.post(`/api/products/${product.id}/transition`).set('Cookie', comprasCookie).send({ event: 'PUBLISH' });
    expect(ok.status).toBeLessThan(300);
    const published = await lib.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(published.lifecycleStatus).toBe('PUBLISHED');
    expect(published.publicRevisionId).toBeTruthy();
    expect(await lib.productChange.count({ where: { productId: product.id, source: 'LIFECYCLE' } })).toBeGreaterThan(0);
    expect(await lib.publicationEvent.count({ where: { productId: product.id, action: 'PUBLISH', result: 'ok' } })).toBe(1);
    expect(await lib.libraryAuditEvent.count({ where: { action: 'PRODUCT_PUBLISH', entityId: product.id } })).toBe(1);
    expect(await ops.auditLog.count({ where: { entity: 'Product', entityId: product.id } })).toBe(0);
  });

  it('catálogo público: ve el producto de la biblioteca, no ve el precio sin sesión de cliente y nunca el producto de la base vieja', async () => {
    const http = request(app.getHttpServer());
    const search = await http.get('/api/public/products').query({ q: 'API-PROD-1' });
    expect(search.status).toBe(200);
    const body = JSON.stringify(search.body);
    expect(body).toContain('API-PROD-1');
    expect(body).not.toContain(PRICE_SECRET);
    const ghost = await http.get('/api/public/products').query({ q: 'GHOST-OLD-DB' });
    expect(JSON.stringify(ghost.body)).not.toContain('GHOST-OLD-DB');
    expect((await http.get(`/api/public/products/${ids.ghostProduct}`)).status).toBe(404);
  });

  it('el listado administrativo de productos lee la biblioteca y no la base vieja', async () => {
    const res = await request(app.getHttpServer()).get('/api/products').query({ search: 'GHOST' }).set('Cookie', comprasCookie);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('GHOST-OLD-DB');
    const mine = await request(app.getHttpServer()).get('/api/products').query({ search: 'API-PROD-1' }).set('Cookie', comprasCookie);
    expect(JSON.stringify(mine.body)).toContain('API-PROD-1');
  });

  it('importación de precios por API: vista previa, revisión idempotente, aplicación con confirmaciones, concurrencia e historial', async () => {
    const http = request(app.getHttpServer());
    const dpp = await lib.priceList.create({ data: { name: 'Tarifa Oro API', code: 'DPP_ORO_IVA', currency: 'COP' } });
    ids.dppTariff = dpp.id;
    const p2 = await lib.product.create({ data: { sku: 'API-PROD-2', name: 'Producto API 2', brandId: ids.brand, categoryId: ids.category, listaId } });
    ids.product2 = p2.id;
    await lib.price.create({ data: { productId: p2.id, priceListId: dpp.id, value: '100', currency: 'COP', listaId } });
    const file = xlsx([['API-PROD-2', 110], ['API-PROD-1', 5000], ['API-DESCONOCIDO', 777]]);
    const attach = (r: any) => r.attach('file', file, { filename: 'precios.xlsx', contentType: XLSX_TYPE });

    // El vendedor no puede ni previsualizar.
    expect((await attach(http.post('/api/prices/import/preview').set('Cookie', vendedorCookie))).status).toBe(403);

    // Vista previa: no escribe precios.
    const preview = await attach(http.post('/api/prices/import/preview').set('Cookie', comprasCookie));
    expect(preview.status).toBeLessThan(300);
    expect(await priceOf(p2.id)).toBe('100');

    // Guardar es idempotente por clave.
    const save = await attach(http.post('/api/prices/import/revisions').set('Cookie', comprasCookie).field('idempotencyKey', 'api-key-000001'));
    expect(save.status).toBeLessThan(300);
    const revisionId = save.body.data.id;
    const replay = await attach(http.post('/api/prices/import/revisions').set('Cookie', comprasCookie).field('idempotencyKey', 'api-key-000001'));
    expect(replay.body.data.id).toBe(revisionId);
    expect(await lib.priceImportRevision.count()).toBe(1);
    expect(await ops.priceImportRevision.count()).toBe(0);

    // Aplicar exige reconocer las filas rechazadas; dos aplicaciones simultáneas producen un solo efecto.
    const noAck = await http.post(`/api/prices/import/revisions/${revisionId}/apply`).set('Cookie', comprasCookie).send({});
    expect(noAck.status).toBe(409);
    expect(JSON.stringify(noAck.body)).toContain('REJECTED_ROWS_UNACKNOWLEDGED');
    expect(await priceOf(p2.id)).toBe('100');
    const apply = () => http.post(`/api/prices/import/revisions/${revisionId}/apply`).set('Cookie', comprasCookie).send({ acknowledgeRejectedRows: 1 });
    const results = await Promise.all([apply(), apply()]);
    expect(results.every((r) => r.status < 300)).toBe(true);
    expect(results.filter((r) => r.body.data.alreadyApplied === false)).toHaveLength(1);
    expect(await priceOf(p2.id)).toBe('110');
    expect(await priceOf(ids.product)).toBe('5000');
    expect(await lib.libraryAuditEvent.count({ where: { action: 'PRICE_IMPORT_APPLIED', entityId: revisionId } })).toBe(1);
    expect(await ops.price.count()).toBe(0);
    expect(await ops.productChange.count()).toBe(0);

    // Cambio grande (110 → 1000): exige confirmación explícita.
    const big = await http.post('/api/prices/import/revisions').set('Cookie', comprasCookie).field('idempotencyKey', 'api-key-000002').attach('file', xlsx([['API-PROD-2', 1000]]), { filename: 'grande.xlsx', contentType: XLSX_TYPE });
    expect(big.status).toBeLessThan(300);
    const bigId = big.body.data.id;
    const unconfirmed = await http.post(`/api/prices/import/revisions/${bigId}/apply`).set('Cookie', comprasCookie).send({});
    expect(unconfirmed.status).toBe(409);
    expect(JSON.stringify(unconfirmed.body)).toContain('LARGE_CHANGES_UNCONFIRMED');
    expect(await priceOf(p2.id)).toBe('110');
    const confirmed = await http.post(`/api/prices/import/revisions/${bigId}/apply`).set('Cookie', comprasCookie).send({ confirmLargeChanges: true });
    expect(confirmed.status).toBeLessThan(300);
    expect(await priceOf(p2.id)).toBe('1000');

    // Historial: ambas revisiones aplicadas, leídas de la biblioteca.
    const history = await http.get('/api/prices/import/revisions').query({ listaId, page: 1, pageSize: 10 }).set('Cookie', comprasCookie);
    expect(history.status).toBe(200);
    expect(JSON.stringify(history.body)).toContain(revisionId);
    expect(JSON.stringify(history.body)).toContain(bigId);
    expect((await lib.priceImportRevision.findMany({ select: { status: true } })).every((r: any) => r.status === 'APLICADA')).toBe(true);

    // Referencias desconocidas: quedan pendientes, se crean como borrador sin duplicar y el reintento devuelve lo mismo.
    const unknown = await http.get(`/api/prices/import/revisions/${revisionId}/unknown-references`).set('Cookie', comprasCookie);
    expect(unknown.status).toBe(200);
    const item = unknown.body.data.items.find((i: any) => i.sku === 'API-DESCONOCIDO');
    expect(item).toBeTruthy();
    const body = { items: [{ rowNumber: item.rowNumber, action: 'CREATE', name: 'Creado desde importación', brandId: ids.brand, categoryId: ids.category }] };
    const resolve = () => http.post(`/api/prices/import/revisions/${revisionId}/unknown-references/resolve`).set('Cookie', comprasCookie).send(body);
    const first = await resolve();
    expect(first.status).toBeLessThan(300);
    expect(first.body.data.results[0].status).toBe('CREATED');
    const again = await resolve();
    expect(again.body.data.results[0]).toMatchObject({ status: 'CREATED', productId: first.body.data.results[0].productId });
    expect(await lib.product.count({ where: { sku: 'API-DESCONOCIDO' } })).toBe(1);
    const draft = await lib.product.findFirstOrThrow({ where: { sku: 'API-DESCONOCIDO' } });
    expect(draft.listaId).toBeNull();
    expect(draft.isVisible).toBe(false);
    expect(await priceOf(draft.id)).toBe('777');
    expect(await ops.product.count({ where: { sku: 'API-DESCONOCIDO' } })).toBe(0);
  });

  it('la base vieja no recibió escrituras accidentales: solo quedan los datos fantasma sembrados a propósito', async () => {
    expect(await ops.product.count()).toBe(1);
    expect(await ops.lista.count()).toBe(1);
    expect(await ops.price.count()).toBe(0);
    expect(await ops.productImage.count()).toBe(0);
    expect(await ops.productChange.count()).toBe(0);
    expect(await ops.productRevision.count()).toBe(0);
    expect(await ops.publicationEvent.count()).toBe(0);
  });
});
