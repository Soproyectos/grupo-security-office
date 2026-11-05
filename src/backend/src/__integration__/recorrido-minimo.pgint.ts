/**
 * RECORRIDO MÍNIMO de la biblioteca en desarrollo (AppModule real, biblioteca PostgreSQL dedicada, base operativa separada):
 *
 *   cargar un lote pequeño → detectar duplicados y faltantes → consultar/editar una ficha →
 *   comparar y aplicar precios → consultar historial.
 *
 * Datos sintéticos; sesión JWT y permisos reales (usuario de compras con concesiones, vendedor sin ellas).
 * No se ejecuta con `jest` normal (.pgint.ts): lo lanza el ensayo aislado (GS_FASE=recorrido) o `npm run test:biblioteca:recorrido`
 * con las variables LIBRARY_* apuntando a una biblioteca de desarrollo/prueba ya migrada.
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
const VENDEDOR = { email: 'vendedor-recorrido@ejemplo.invalid', password: 'vendedor-sintetico-2026' };
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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

const sheet = (headers: string[], rows: Array<Array<string | number>>, name = 'Hoja1'): Buffer => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ...rows]), name);
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};
const priceBook = (rows: Array<[string, number]>): Buffer => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'DPP_ORO_IVA'], ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía ficticia']]), 'INSTRUCCIONES');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};
const show = (res: { status: number; body: unknown }) => `HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 600)}`;

describe('Recorrido mínimo de la biblioteca (desarrollo, datos sintéticos)', () => {
  let app: INestApplication;
  let ops: PrismaService;
  let lib: any;
  let cookie = '';
  let vendedorCookie = '';
  let listaId = '';
  let dppId = '';
  let existingId = '';
  const idsBySku: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  async function login(user: { email: string; password: string }): Promise<string> {
    const res = await http().post('/api/auth/login').send(user);
    expect(res.status).toBeLessThan(300);
    return ((res.headers['set-cookie'] as string[]).find((c) => c.startsWith('access_token=')) as string).split(';')[0];
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

    const compras = await ops.user.findUniqueOrThrow({ where: { email: COMPRAS.email } });
    const role = await ops.role.findUniqueOrThrow({ where: { name: 'Vendedor' } });
    await ops.user.create({ data: { email: VENDEDOR.email, name: 'Vendedor del recorrido', password: bcrypt.hashSync(VENDEDOR.password, 4), roles: { create: { roleId: role.id } } } });
    await ops.accessState.create({ data: { userId: compras.id } });
    const source = await ops.accessSource.create({ data: { userId: compras.id, kind: 'manual', catalogVersion: 'recorrido', grantedById: compras.id } });
    for (const actionId of withDependencies(GRANTED)) await ops.accessGrant.create({ data: { sourceId: source.id, actionId, scopeKind: 'global' } });

    // Referencias de catálogo del recorrido (marca, categoría y tarifa de venta DPP_ORO_IVA).
    await lib.brand.create({ data: { name: 'Hikvision', slug: 'hikvision' } });
    await lib.category.create({ data: { name: 'CCTV', slug: 'cctv' } });
    dppId = (await lib.priceList.create({ data: { name: 'Tarifa Oro', code: 'DPP_ORO_IVA', currency: 'COP' } })).id;

    cookie = await login(COMPRAS);
    vendedorCookie = await login(VENDEDOR);
  }, 120_000);

  afterAll(async () => { await app?.close(); });

  it('1. Lista de destino creada por API (solo en la biblioteca)', async () => {
    const res = await http().post('/api/listas').set('Cookie', cookie).send({ code: 'REC-LISTA', name: 'Lista del recorrido' });
    expect(res.status).toBe(201);
    listaId = res.body.data.id;
    // Un producto ya existente, para que el lote lo detecte como actualización.
    const brand = await lib.brand.findFirstOrThrow({ where: { name: 'Hikvision' } });
    const category = await lib.category.findFirstOrThrow({ where: { name: 'CCTV' } });
    existingId = (await lib.product.create({ data: { sku: 'REC-EXIST', name: 'Producto previo', brandId: brand.id, categoryId: category.id, listaId } })).id;
  });

  it('2. Lote pequeño: la vista previa detecta nuevos, existentes, duplicados y filas incompletas, y el vendedor no puede cargar', async () => {
    const file = sheet(
      ['SKU', 'Nombre', 'Categoría', 'Marca', 'Descripción'],
      [
        ['REC-001', 'Cámara domo A', 'CCTV', 'Hikvision', 'Domo de prueba'],
        ['REC-002', 'Cámara bala B', 'CCTV', 'Hikvision', ''],
        ['rec-001', 'Cámara domo A repetida', 'CCTV', 'Hikvision', ''],
        ['REC-003', '', 'CCTV', 'Hikvision', ''],
        ['REC-EXIST', 'Producto previo renombrado', 'CCTV', 'Hikvision', ''],
      ],
    );
    const denied = await http().post('/api/products/import/preview').set('Cookie', vendedorCookie).attach('file', file, { filename: 'lote.xlsx', contentType: XLSX_TYPE });
    expect(denied.status).toBe(403);

    const res = await http().post('/api/products/import/preview').set('Cookie', cookie).field('listaId', listaId).attach('file', file, { filename: 'lote.xlsx', contentType: XLSX_TYPE });
    expect(res.status).toBeLessThan(300);
    const preview = res.body.data;
    expect(preview.totalRows).toBe(5);
    expect(preview.breakdown.toUpdate).toBeGreaterThanOrEqual(1);
    expect(preview.breakdown.toCreate).toBeGreaterThanOrEqual(2);
    // Faltantes e incidencias quedan a la vista antes de escribir nada.
    expect(preview.validationErrors.length + preview.warnings.length).toBeGreaterThan(0);
    expect(await lib.product.count({ where: { sku: { startsWith: 'REC-0' } } })).toBe(0);

    const columnMappings = Object.entries(preview.columnMapping as Record<string, string>)
      .filter(([, target]) => target && target !== '__skip')
      .map(([sourceColumn, targetField]) => ({ sourceColumn, targetField }));
    expect(columnMappings.length).toBeGreaterThanOrEqual(4);

    const execute = await http().post('/api/products/import/execute').set('Cookie', cookie).send({ importId: preview.importId, columnMappings, listaId });
    expect(execute.status).toBe(201);
    let progress: any;
    for (let i = 0; i < 60; i++) {
      progress = (await http().get(`/api/products/import/progress/${preview.importId}`).set('Cookie', cookie)).body.data;
      if (progress && ['completed', 'failed', 'COMPLETED', 'FAILED'].includes(String(progress.status))) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(String(progress?.status).toLowerCase()).toBe('completed');

    // Resultado: sin duplicados por SKU normalizado, el existente se actualiza y la fila sin nombre ni descripción queda marcada como pendiente de enriquecimiento
    // (comportamiento vigente del pipeline: nombre provisional = SKU; ver «Decisión abierta» en el README de la biblioteca).
    const created = await lib.product.findMany({ where: { sku: { startsWith: 'REC-0', mode: 'insensitive' } }, orderBy: { sku: 'asc' } });
    expect(created.map((p: any) => p.sku.toUpperCase())).toEqual(['REC-001', 'REC-002', 'REC-003']);
    expect(created.find((p: any) => p.sku === 'REC-003').name).toBe('REC-003');
    expect(JSON.stringify(progress)).toMatch(/"pendingEnrichment":s*[1-9]/);
    for (const p of created) idsBySku[p.sku.toUpperCase()] = p.id;
    expect(created.every((p: any) => p.lifecycleStatus === 'DRAFT' && p.isVisible === false && p.listaId === listaId)).toBe(true);
    expect((await lib.product.findUniqueOrThrow({ where: { id: existingId } })).name).toBe('Producto previo renombrado');
    expect(await lib.libraryAuditEvent.count({ where: { action: 'IMPORT_PRODUCTS' } })).toBe(1);
    expect(await ops.product.count()).toBe(0);
  });

  it('3. Faltantes: el informe de validación los lista y se pueden registrar y gestionar con su evidencia', async () => {
    const id = idsBySku['REC-001'];
    const validation = await http().post(`/api/products/${id}/validation`).set('Cookie', cookie);
    expect(validation.status).toBe(200);
    const codes = (validation.body.data.issues as Array<{ code: string; severity: string }>).map((i) => `${i.severity}:${i.code}`);
    // Sin imagen principal bloquea; sin ficha técnica solo avisa (nunca bloquea).
    expect(codes).toEqual(expect.arrayContaining(['error:media.primary_image', 'warning:docs.datasheet_missing']));
    expect(validation.body.data.status).toBe('CON_PROBLEMAS');

    const gap = await http().put(`/api/library/products/${id}/review/gaps`).set('Cookie', cookie).send({ gapKey: 'datasheet', status: 'NO_ENCONTRADO', severity: 'AVISO', expectedOpenId: null });
    expect(gap.status).toBeLessThan(300);
    const evidence = await http().put(`/api/library/products/${id}/review/evidence`).set('Cookie', cookie).send({ fieldKey: 'catalog_name', level: 'DECLARADO', sourceKind: 'LISTA_PROVEEDOR', expectedId: null });
    expect(evidence.status).toBeLessThan(300);
    const review = await http().get(`/api/library/products/${id}/review`).set('Cookie', cookie);
    expect(review.status).toBe(200);
    expect(JSON.stringify(review.body)).toContain('datasheet');
    expect(JSON.stringify(review.body)).toContain('catalog_name');
    const gapId = gap.body.data.id ?? gap.body.data.gap?.id;
    if (gapId) expect((await http().post(`/api/library/products/${id}/review/gaps/${gapId}/resolve`).set('Cookie', cookie)).status).toBeLessThan(300);
    // El vendedor no gestiona faltantes.
    expect((await http().put(`/api/library/products/${id}/review/gaps`).set('Cookie', vendedorCookie).send({ gapKey: 'manual', status: 'PENDIENTE', severity: 'AVISO', expectedOpenId: null })).status).toBe(403);
  });

  it('4. Ficha: se consulta y se edita; la edición queda en el historial del producto', async () => {
    const id = idsBySku['REC-002'];
    const before = await http().get(`/api/products/${id}`).set('Cookie', cookie);
    expect(before.status).toBe(200);
    expect(before.body.data.sku).toBe('REC-002');
    const edit = await http().put(`/api/products/${id}`).set('Cookie', cookie).send({ description: 'Descripción editada en el recorrido' });
    expect(edit.status).toBeLessThan(300);
    const changes = await http().get(`/api/products/${id}/changes`).set('Cookie', cookie);
    expect(changes.status).toBe(200);
    expect(JSON.stringify(changes.body)).toContain('description');
    // La edición quedó en la biblioteca (borrador o producto), nunca en la base operativa.
    expect(await ops.productChange.count()).toBe(0);
    expect(await lib.productChange.count({ where: { productId: id } })).toBeGreaterThan(0);
  });

  it('5. Precios: comparar (vista previa), guardar la revisión y aplicarla con confirmaciones', async () => {
    await lib.price.create({ data: { productId: existingId, priceListId: dppId, value: '100', currency: 'COP', listaId } });
    const file = priceBook([['REC-EXIST', 110], ['REC-001', 5000], ['REC-NOEXISTE', 777]]);
    const attach = (r: any) => r.attach('file', file, { filename: 'precios.xlsx', contentType: XLSX_TYPE });

    const preview = await attach(http().post('/api/prices/import/preview').set('Cookie', cookie));
    expect(preview.status).toBeLessThan(300);
    const price = async (productId: string) => String((await lib.price.findFirstOrThrow({ where: { productId, priceListId: dppId } })).value);
    expect(await price(existingId)).toBe('100'); // la comparación no escribe

    const saved = await attach(http().post('/api/prices/import/revisions').set('Cookie', cookie).field('idempotencyKey', 'recorrido-key-0001'));
    expect(saved.status).toBeLessThan(300);
    const revisionId = saved.body.data.id;
    const detail = await http().get(`/api/prices/import/revisions/${revisionId}`).query({ page: 1, pageSize: 20 }).set('Cookie', cookie);
    expect(detail.status).toBe(200);

    const noAck = await http().post(`/api/prices/import/revisions/${revisionId}/apply`).set('Cookie', cookie).send({});
    expect(noAck.status).toBe(409);
    const applied = await http().post(`/api/prices/import/revisions/${revisionId}/apply`).set('Cookie', cookie).send({ acknowledgeRejectedRows: 1 });
    expect(applied.status).toBeLessThan(300);
    expect(await price(existingId)).toBe('110');
    expect(await price(idsBySku['REC-001'])).toBe('5000');
    expect(await ops.price.count()).toBe(0);
  });

  it('6. Historial: cambios de precio con actor, revisiones aplicadas y eventos de la biblioteca', async () => {
    const changes = await http().get(`/api/products/${existingId}/changes`).set('Cookie', cookie);
    expect(changes.status).toBe(200);
    const text = JSON.stringify(changes.body);
    expect(text).toContain('PRICE_IMPORT');
    expect(text).toContain('110');
    const history = await http().get('/api/prices/import/revisions').query({ listaId, page: 1, pageSize: 10 }).set('Cookie', cookie);
    expect(history.status).toBe(200);
    expect(JSON.stringify(history.body)).toContain('APLICADA');
    const actions = (await lib.libraryAuditEvent.findMany({ select: { action: true } })).map((e: any) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['LISTA_CREATED', 'IMPORT_PRODUCTS', 'PRICE_IMPORT_SAVED', 'PRICE_IMPORT_APPLIED']));
    expect(await ops.auditLog.count({ where: { entity: { in: ['LISTA', 'Product', 'Price'] } } })).toBe(0);
  });

  it('7. Estructura: proveedores y referencias cumplen las restricciones del modelo (FK, unicidad normalizada, principal única, tipo)', async () => {
    const profile = await lib.providerProfile.create({ data: { providerName: 'Proveedor del recorrido', sheet: 'Hoja1', tariffs: [], expectedColumns: [] } });
    expect(profile.isActive).toBe(true);
    const productId = idsBySku['REC-001'];
    const ok = await lib.providerEquivalence.create({ data: { providerProfileId: profile.id, productId, externalRef: 'ABC-1', normalizedRef: 'ABC-1', isPrimary: true } });
    expect(ok.refKind).toBe('PROVEEDOR');
    const base = { providerProfileId: profile.id, productId };
    // Misma referencia normalizada del mismo proveedor: rechazada.
    await expect(lib.providerEquivalence.create({ data: { ...base, externalRef: 'abc 1', normalizedRef: 'ABC-1' } })).rejects.toThrow();
    // Segunda referencia principal del mismo producto y proveedor: rechazada; no principal: permitida.
    await expect(lib.providerEquivalence.create({ data: { ...base, externalRef: 'ABC-2', normalizedRef: 'ABC-2', isPrimary: true } })).rejects.toThrow();
    await lib.providerEquivalence.create({ data: { ...base, externalRef: 'ABC-3', normalizedRef: 'ABC-3', refKind: 'EQUIVALENTE' } });
    // Tipo fuera del catálogo y producto inexistente: rechazados por la base.
    await expect(lib.providerEquivalence.create({ data: { ...base, externalRef: 'ABC-4', normalizedRef: 'ABC-4', refKind: 'OTRO' } })).rejects.toThrow();
    await expect(lib.providerEquivalence.create({ data: { providerProfileId: profile.id, productId: 'no-existe', externalRef: 'ABC-5', normalizedRef: 'ABC-5' } })).rejects.toThrow();
    // Un producto con referencias de proveedor no se borra en silencio (RESTRICT) y la API responde 409 claro.
    await expect(lib.product.delete({ where: { id: productId } })).rejects.toThrow();
    const blocked = await http().delete(`/api/products/${productId}`).set('Cookie', cookie).send({ confirm: true });
    expect(blocked.status).toBe(409);
    expect(JSON.stringify(blocked.body)).toContain('PRODUCT_HAS_PROVIDER_DATA');
    expect(await lib.product.count({ where: { id: productId } })).toBe(1);
    // Costos de compra: el importe debe ser positivo.
    await expect(lib.supplierCost.create({ data: { productId, providerProfileId: profile.id, amount: 0, taxIncluded: false } })).rejects.toThrow();
    await lib.supplierCost.create({ data: { productId, providerProfileId: profile.id, amount: 1234.5, taxIncluded: true } });
    expect(await lib.price.count({ where: { productId, priceListId: dppId } })).toBe(1); // el costo no toca las tarifas de venta
  });
});
