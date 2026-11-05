jest.mock('../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { ServiceUnavailableException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ProductsService } from './products.service';

/**
 * T06 productos — publicación, programación y borrado por la biblioteca con evento atómico.
 * Dobles explícitos (no es una prueba PostgreSQL); el flujo con revisiones/validación se prueba aparte.
 */
const ctx = { userId: 'fixture-actor', userName: 'Persona de publicación', roles: ['Super Admin'] } as never;
const FUTURE = new Date(Date.now() + 86_400_000);
const base = {
  id: 'p1', sku: 'SKU-1', name: 'Producto', listaId: 'l1', isActive: false, isVisible: false, lifecycleStatus: 'DRAFT',
  publishStatus: 'borrador', publishAt: null, unpublishAt: null, publishedAt: null, scheduledRevisionId: null, publicRevisionId: null,
};

function setup(opts: { mode?: 'legacy' | 'dedicated'; writesFrozen?: boolean; product?: Record<string, unknown>; references?: number } = {}) {
  const mode = opts.mode ?? 'dedicated';
  const order: string[] = [];
  const events: Array<Record<string, any>> = [];
  const product = { ...base, ...opts.product };
  const libTx: any = {
    product: {
      update: jest.fn(async ({ data }: any) => { order.push('library:product.update'); return { ...product, ...data }; }),
      delete: jest.fn(async () => { order.push('library:product.delete'); return {}; }),
      create: jest.fn(async ({ data }: any) => { order.push('library:product.create'); return { id: 'prod-new', ...data }; }),
    },
    category: { create: jest.fn(async ({ data }: any) => { order.push('library:category.create'); return { id: 'cat-new', ...data }; }) },
    brand: { create: jest.fn(async ({ data }: any) => { order.push('library:brand.create'); return { id: 'brand-new', ...data }; }) },
    price: { deleteMany: jest.fn(async () => { order.push('library:price.deleteMany'); return { count: 1 }; }) },
    productImage: { deleteMany: jest.fn(async () => { order.push('library:image.deleteMany'); return { count: 0 }; }) },
  };
  const client: any = {
    product: { findUnique: jest.fn(async () => product), findMany: jest.fn(async () => []) },
    lista: { findUnique: jest.fn(async () => ({ id: 'l1', isActive: true, archivedAt: null, deletionStatus: null })) },
    category: { findMany: jest.fn(async () => []) },
    providerEquivalence: { count: jest.fn(async () => opts.references ?? 0) },
    supplierCost: { count: jest.fn(async () => 0) },
    brand: { findMany: jest.fn(async () => []) },
    $queryRaw: jest.fn(async () => []),
    price: { count: jest.fn(async () => 1) },
    productImage: { count: jest.fn(async () => 1), findMany: jest.fn(async () => []) },
    publicationEvent: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(),
  };
  const library: any = {
    config: { mode, writesFrozen: opts.writesFrozen === true },
    client,
    assertWritesAllowed() {
      if (library.config.writesFrozen) throw new ServiceUnavailableException({ code: 'LIBRARY_WRITES_FROZEN', message: 'congelado' });
    },
    ownsTransaction: () => true,
    writeTransaction: async (work: (t: unknown) => Promise<unknown>) => { library.assertWritesAllowed(); return work(libTx); },
  };
  const libraryAudit = { append: jest.fn(async (_tx: unknown, event: Record<string, any>) => { order.push(`event:${event.action}`); events.push(event); return { id: 'e' }; }) };
  const audit = { log: jest.fn().mockResolvedValue({}) };
  const operational: any = { stock: { findUnique: jest.fn(async () => null), deleteMany: jest.fn(async () => ({ count: 1 })) }, auditLog: { count: jest.fn(async () => 0) } };
  const acl = { isListasAdmin: jest.fn(() => true), assertListaAccess: jest.fn(), assertProductAccess: jest.fn() };
  const changes = { record: jest.fn(async () => undefined) };
  const files = { deleteByUrl: jest.fn() };
  const service = new ProductsService(
    operational, acl as never, audit as never, files as never, undefined, undefined, undefined, changes as never, library, libraryAudit as never,
  );
  return { service, order, events, audit, libTx, client, library, operational };
}

describe('T06 productos — publicación con biblioteca dedicada', () => {
  it('publicar: estado, historial y evento en la misma transacción; sin AuditLog operativo', async () => {
    const { service, order, events, audit } = setup();
    const result = await service.transition('p1', { event: 'PUBLISH' } as never, ctx);
    expect(result).toMatchObject({ lifecycleStatus: 'PUBLISHED' });
    expect(order).toEqual(['library:product.update', 'event:PRODUCT_PUBLISH']);
    expect(events[0]).toMatchObject({ entityType: 'Product', entityId: 'p1', actor: { id: 'fixture-actor', name: 'Persona de publicación' }, summary: { from: 'DRAFT', event: 'PUBLISH' } });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('cancelar programación (publishAt null) deja evento de biblioteca', async () => {
    const { service, order, events } = setup({ product: { publishAt: FUTURE } });
    await service.publish('p1', { publishAt: null } as never, ctx);
    expect(order).toEqual(['library:product.update', 'event:PRODUCT_SCHEDULE_CANCELLED']);
    expect(events[0].summary).toMatchObject({ lifecycleStatus: 'DRAFT' });
  });

  it('programar escribe publishAt con su evento', async () => {
    const { service, order, events } = setup();
    await service.schedulePublication('p1', { publishAt: FUTURE.toISOString() } as never, ctx);
    expect(order).toEqual(['library:product.update', 'event:PRODUCT_SCHEDULED']);
    expect(events[0].summary).toMatchObject({ publishAt: FUTURE.toISOString() });
  });

  it('borrar: precios, imágenes, producto y evento en una sola transacción de biblioteca', async () => {
    const { service, order, events, audit } = setup();
    await service.remove('p1', { confirm: true } as never, ctx);
    expect(order).toEqual(['library:price.deleteMany', 'library:image.deleteMany', 'library:product.delete', 'event:PRODUCT_DELETED']);
    expect(events[0].summary).toMatchObject({ sku: 'SKU-1', precios: 1, imagenes: 1 });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('borrar en dedicado retira también el stock operativo (ya no hay cascada entre bases); en legacy lo hace la FK', async () => {
    const dedicated = setup();
    await dedicated.service.remove('p1', { confirm: true } as never, ctx);
    expect(dedicated.operational.stock.deleteMany).toHaveBeenCalledWith({ where: { productId: 'p1' } });
    const legacy = setup({ mode: 'legacy' });
    await legacy.service.remove('p1', { confirm: true } as never, ctx);
    expect(legacy.operational.stock.deleteMany).not.toHaveBeenCalled();
  });

  it('borrar con referencias de proveedor en dedicado responde 409 sin escribir', async () => {
    const { service, order } = setup({ references: 2 });
    await expect(service.remove('p1', { confirm: true } as never, ctx)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PRODUCT_HAS_PROVIDER_DATA' }) });
    expect(order).toEqual([]);
  });

  it('con congelación: publicar, programar y borrar responden 503 sin escribir', async () => {
    const { service, order } = setup({ writesFrozen: true });
    for (const op of [
      () => service.transition('p1', { event: 'PUBLISH' } as never, ctx),
      () => service.schedulePublication('p1', { publishAt: FUTURE.toISOString() } as never, ctx),
      () => service.remove('p1', { confirm: true } as never, ctx),
    ]) {
      await expect(op()).rejects.toMatchObject({ response: expect.objectContaining({ code: 'LIBRARY_WRITES_FROZEN' }) });
    }
    expect(order).toEqual([]);
  });

  it('el scheduler no publica nada mientras la biblioteca está congelada', async () => {
    const { service, client } = setup({ writesFrozen: true });
    const report = await service.handleLifecycleTick();
    expect(report).toMatchObject({ skipped: true, publishOk: 0 });
    expect(client.product.findMany).not.toHaveBeenCalled();
  });

  it('legacy: publicar conserva el AuditLog de siempre y no emite eventos de biblioteca', async () => {
    const { service, audit, events } = setup({ mode: 'legacy' });
    await service.transition('p1', { event: 'PUBLISH' } as never, ctx);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ entity: 'Product', entityId: 'p1' }));
    expect(events).toHaveLength(0);
  });

  it('importar Excel: categoría y marca desconocidas NO se crean; solo el producto (por clasificar) con su evento', async () => {
    const { service, order, events } = setup();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['SKU', 'Nombre', 'Categoría', 'Marca'], ['SKU-9', 'Cámara', 'CCTV', 'Hikvision']]), 'Hoja1');
    const result = await service.importFromExcel(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer, ctx);
    expect(result.created).toBe(1);
    expect(order).toEqual(['library:product.create', 'event:PRODUCT_CREATED']);
    expect(events[0]).toMatchObject({ entityType: 'Product', summary: { sku: 'SKU-9', source: 'EXCEL_IMPORT' } });
    expect(result.needsConfirmation.map((i) => i.code)).toEqual(['CATEGORY_NEEDS_CONFIRMATION', 'BRAND_NEEDS_CONFIRMATION']);
  });

  it('importar Excel con congelación: 503 antes de leer o escribir', async () => {
    const { service, order } = setup({ writesFrozen: true });
    await expect(service.importFromExcel(Buffer.from('x'), ctx)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'LIBRARY_WRITES_FROZEN' }) });
    expect(order).toEqual([]);
  });

  it('programación masiva: resumen agregado como evento de biblioteca (sin AuditLog)', async () => {
    const { service, events, audit } = setup();
    await service.schedulePublicationBulk(['p1'], { publishAt: FUTURE.toISOString() } as never, ctx);
    const batch = events.find((e) => e.action === 'BATCH_SCHEDULE_PUBLISH_BULK');
    expect(batch).toMatchObject({ entityType: 'Product', entityId: 'batch', summary: { succeeded: 1, total: 1, ids: ['p1'] } });
    expect(audit.log).not.toHaveBeenCalled();
  });
});
