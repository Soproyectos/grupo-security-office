jest.mock('../../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PriceImportService } from './price-import.service';
import { createGrantsProvider, createPriceImportFake, type PriceImportFakeSeed } from './price-import.test-helpers';

const LISTA_A = '00000000-0000-4000-8000-0000000000a1';
const LISTA_B = '00000000-0000-4000-8000-0000000000b2';
const ctx: AccessContext = { userId: 'fixture-actor', roles: ['Admin Comercial'] };
const storageDir = path.join(os.tmpdir(), 'gs-b2-apply-test-storage');
const ALL = ['prices:save', 'prices:preview', 'prices:read', 'prices:apply', 'listas:read'];

function file(rows: unknown[][]): Express.Multer.File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'DPP_ORO_IVA'], ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía ficticia']]), 'INSTRUCCIONES');
  return { originalname: 'fixture-precios.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) } as Express.Multer.File;
}

const seed = (): PriceImportFakeSeed => ({
  listas: [{ id: LISTA_A, code: 'LA', name: 'Lista Alfa' }, { id: LISTA_B, code: 'LB', name: 'Lista Beta' }],
  products: [
    { id: 'product-a', sku: 'SKU-A', listaId: LISTA_A },
    { id: 'product-b', sku: 'SKU-B', listaId: LISTA_B },
    { id: 'product-free', sku: 'SKU-FREE', listaId: null },
  ],
  tariffs: [{ id: 'tariff-oro', code: 'DPP_ORO_IVA' }],
  prices: [
    { productId: 'product-a', priceListId: 'tariff-oro', value: 90, listaId: LISTA_A },
    { productId: 'product-b', priceListId: 'tariff-oro', value: 500, listaId: LISTA_B },
  ],
});

function serializationFailure(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock.', { code: 'P2034', clientVersion: 'test' });
}

describe('IMP-05 — aplicar una revisión de listas mixtas (atómico)', () => {
  let fake: ReturnType<typeof createPriceImportFake>;
  let service: PriceImportService;
  let grants: ReturnType<typeof createGrantsProvider>;
  let acl: any;

  beforeAll(async () => {
    process.env.PRICE_IMPORT_STORAGE_DIR = storageDir;
    await fs.rm(storageDir, { recursive: true, force: true });
  });
  afterAll(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
    delete process.env.PRICE_IMPORT_STORAGE_DIR;
  });

  beforeEach(() => {
    fake = createPriceImportFake(seed());
    acl = { assertListaAccess: jest.fn().mockResolvedValue(undefined), isListasAdmin: jest.fn().mockReturnValue(false) };
    grants = createGrantsProvider();
    grants.grantOnLista(LISTA_A, ...ALL);
    grants.grantOnLista(LISTA_B, ...ALL);
    service = new PriceImportService(fake.prisma as PrismaService, acl as AclService, fake.audit as unknown as AuditService, grants as any);
  });

  /** Saves a revision through the real save flow and returns its id. */
  let keySeq = 0;
  const save = async (rows: unknown[][]) => (await service.saveRevision(file(rows), `key-apply-${String(++keySeq).padStart(4, '0')}`, ctx)).id;
  const priceOf = (productId: string) => fake.state.prices.find((p) => p.productId === productId && p.priceListId === 'tariff-oro');
  const rejects = async (promise: Promise<unknown>) => {
    try { await promise; } catch (error) { return error as ConflictException; }
    throw new Error('expected the call to be rejected');
  };
  const body = (error: ConflictException) => error.getResponse() as Record<string, any>;

  describe('camino feliz', () => {
    it('aplica filas de dos listas en una transacción Serializable, escribe Price con la lista de cada producto y no toca Product', async () => {
      const id = await save([['SKU-A', 100.5], ['SKU-B', 600]]);
      const result = await service.applyRevision(id, ctx);
      expect(result).toMatchObject({ revisionId: id, status: 'APLICADA', alreadyApplied: false, appliedRows: 2, appliedPrices: 2, tariffs: ['DPP_ORO_IVA'], unchangedPrices: 0, rejectedRows: 0, largeChangesConfirmed: false });
      expect(result.perLista).toEqual(expect.arrayContaining([
        { listaId: LISTA_A, code: 'LA', name: 'Lista Alfa', rows: 1, prices: 1 },
        { listaId: LISTA_B, code: 'LB', name: 'Lista Beta', rows: 1, prices: 1 },
      ]));
      expect(String(priceOf('product-a')!.value)).toBe('101');
      expect(priceOf('product-a')!.listaId).toBe(LISTA_A);
      expect(String(priceOf('product-b')!.value)).toBe('600');
      expect(fake.prisma.product.update).not.toHaveBeenCalled();
      expect(fake.state.revisions[0]).toMatchObject({ status: 'APLICADA', appliedById: ctx.userId });
      expect(fake.state.revisions[0].appliedResult).toMatchObject({ appliedPrices: 2, batchId: result.batchId });
      expect(fake.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
    });

    it('registra un ProductChange por precio cambiado y la auditoría DENTRO de la transacción', async () => {
      const id = await save([['SKU-A', 100], ['SKU-B', 600]]);
      const result = await service.applyRevision(id, ctx);
      expect(fake.state.productChanges).toHaveLength(2);
      expect(fake.state.productChanges[0]).toMatchObject({
        productId: 'product-a', sku: 'SKU-A', field: 'price:DPP_ORO_IVA', oldValue: '90', newValue: '100',
        source: 'PRICE_IMPORT', sourceRef: id, actorId: ctx.userId, batchId: result.batchId,
      });
      expect(new Set(fake.state.productChanges.map((c) => c.batchId)).size).toBe(1);
      expect(fake.audit.logTx).toHaveBeenCalledWith(fake.prisma, expect.objectContaining({
        action: 'price-import-apply', entityId: id,
        newValues: expect.objectContaining({ appliedPrices: 2, rejectedRows: 0, largeChangesConfirmed: false, batchId: result.batchId, perLista: expect.any(Array) }),
      }));
      expect(fake.audit.log).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'price-import-apply' }));
    });

    it('crea el precio faltante con historial de valor anterior nulo', async () => {
      fake.state.prices.splice(0, 1);
      const id = await save([['SKU-A', 100]]);
      await service.applyRevision(id, ctx);
      expect(fake.prisma.price.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productId: 'product-a', listaId: LISTA_A }) });
      expect(fake.state.productChanges[0]).toMatchObject({ oldValue: Prisma.DbNull, newValue: '100' });
    });

    it('SALTA los precios iguales: ni escritura ni historial', async () => {
      const id = await save([['SKU-A', 90], ['SKU-B', 600]]);
      const result = await service.applyRevision(id, ctx);
      expect(result).toMatchObject({ appliedRows: 1, appliedPrices: 1, unchangedPrices: 1 });
      expect(fake.prisma.price.update).toHaveBeenCalledTimes(1);
      expect(fake.state.productChanges.map((c) => c.productId)).toEqual(['product-b']);
    });

    it('bloquea los productos con FOR UPDATE en orden estable antes de escribir', async () => {
      const id = await save([['SKU-B', 600], ['SKU-A', 100]]);
      await service.applyRevision(id, ctx);
      const lockCall = fake.prisma.$queryRaw.mock.calls.map((c: any[]) => c[0]).find((q: any) => (q.strings ?? []).join('?').includes('FOR UPDATE'));
      expect(lockCall.values[0]).toEqual(['product-a', 'product-b']);
    });
  });

  describe('NOTHING_TO_APPLY', () => {
    it.each([
      ['solo precios iguales', [['SKU-A', 90]]],
      ['solo filas rechazadas', [['NO-SUCH', 5]]],
    ])('409 cuando hay %s y la revisión sigue pendiente', async (_name, rows) => {
      const id = await save(rows);
      const error = await rejects(service.applyRevision(id, ctx));
      expect(body(error)).toMatchObject({ code: 'NOTHING_TO_APPLY' });
      expect(fake.state.revisions[0].status).toBe('GUARDADA');
      expect(fake.state.productChanges).toHaveLength(0);
    });
  });

  describe('filas rechazadas', () => {
    const mixed = () => save([['SKU-A', 100], ['NO-SUCH', 5], ['SKU-FREE', 7]]);

    it('sin confirmación: 409 REJECTED_ROWS_UNACKNOWLEDGED con el número y una lista compacta, sin escribir nada', async () => {
      const id = await mixed();
      const error = await rejects(service.applyRevision(id, ctx));
      expect(body(error).code).toBe('REJECTED_ROWS_UNACKNOWLEDGED');
      expect(body(error).details).toMatchObject({ count: 2, rows: [
        { rowNumber: 3, sku: 'NO-SUCH', code: 'UNKNOWN_REFERENCE' },
        { rowNumber: 4, sku: 'SKU-FREE', code: 'LISTA_FORBIDDEN' },
      ] });
      expect(String(priceOf('product-a')!.value)).toBe('90');
      expect(fake.state.revisions[0].status).toBe('GUARDADA');
    });

    it.each([0, 1, 3])('un número distinto (%s) produce el mismo 409', async (wrong) => {
      const id = await mixed();
      const error = await rejects(service.applyRevision(id, ctx, { acknowledgeRejectedRows: wrong }));
      expect(body(error).code).toBe('REJECTED_ROWS_UNACKNOWLEDGED');
      expect(String(priceOf('product-a')!.value)).toBe('90');
    });

    it('con el número exacto aplica las filas válidas y deja las rechazadas sin aplicar', async () => {
      const id = await mixed();
      const result = await service.applyRevision(id, ctx, { acknowledgeRejectedRows: 2 });
      expect(result).toMatchObject({ appliedRows: 1, appliedPrices: 1, rejectedRows: 2 });
      expect(String(priceOf('product-a')!.value)).toBe('100');
      expect(fake.state.prices.some((p) => p.productId === 'product-free')).toBe(false);
    });

    it('una confirmación distinta de cero sin filas rechazadas también es un desajuste', async () => {
      const id = await save([['SKU-A', 100]]);
      const error = await rejects(service.applyRevision(id, ctx, { acknowledgeRejectedRows: 1 }));
      expect(body(error)).toMatchObject({ code: 'REJECTED_ROWS_UNACKNOWLEDGED', details: { count: 0 } });
      await expect(service.applyRevision(id, ctx, { acknowledgeRejectedRows: 0 })).resolves.toMatchObject({ appliedPrices: 1 });
    });

    it('las filas rechazadas de listas que no se pueden ver no se enumeran para quien no las subió', async () => {
      const id = await save([['SKU-A', 100], ['SKU-B', 700]]);
      // Make row 3 look like a LISTA_FORBIDDEN row of lista B for this revision.
      Object.assign(fake.state.revisionRows[1], { status: 'error', issues: [{ code: 'LISTA_FORBIDDEN' }] });
      const onlyA = createGrantsProvider();
      onlyA.grantOnLista(LISTA_A, ...ALL);
      const other = new PriceImportService(fake.prisma as PrismaService, acl as AclService, fake.audit as unknown as AuditService, onlyA as any);
      const error = await rejects(other.applyRevision(id, { userId: 'fixture-other', roles: ['Admin Comercial'] }));
      expect(body(error).details).toMatchObject({ count: 1, rows: [], hiddenRows: 1 });
      expect(JSON.stringify(body(error))).not.toContain('SKU-B');
    });
  });

  describe('cambios grandes', () => {
    it('sin confirmación: 409 LARGE_CHANGES_UNCONFIRMED con sku, tarifa, anterior, nuevo y porcentaje', async () => {
      const id = await save([['SKU-A', 200], ['SKU-B', 600]]);
      const error = await rejects(service.applyRevision(id, ctx));
      expect(body(error)).toMatchObject({ code: 'LARGE_CHANGES_UNCONFIRMED', details: { count: 1, changes: [
        { sku: 'SKU-A', tariffCode: 'DPP_ORO_IVA', previous: '90', new: '200', percent: '122.22' },
      ] } });
      expect(String(priceOf('product-b')!.value)).toBe('500');
    });

    it('confirmado: aplica y deja constancia en appliedResult', async () => {
      const id = await save([['SKU-A', 200]]);
      const result = await service.applyRevision(id, ctx, { confirmLargeChanges: true });
      expect(result.largeChangesConfirmed).toBe(true);
      expect(fake.state.revisions[0].appliedResult.largeChangesConfirmed).toBe(true);
      expect(fake.audit.logTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ newValues: expect.objectContaining({ largeChangesConfirmed: true }) }));
    });

    it('confirmLargeChanges no sustituye la confirmación de filas rechazadas', async () => {
      const id = await save([['SKU-A', 200], ['NO-SUCH', 5]]);
      const error = await rejects(service.applyRevision(id, ctx, { confirmLargeChanges: true }));
      expect(body(error).code).toBe('REJECTED_ROWS_UNACKNOWLEDGED');
    });
  });

  describe('conflictos de versión (nada se aplica)', () => {
    const untouched = (id: string) => {
      expect(fake.state.revisions.find((r) => r.id === id)!.status).toBe('GUARDADA');
      expect(fake.state.productChanges).toHaveLength(0);
      expect(fake.audit.logTx).not.toHaveBeenCalled();
    };

    it('PRICE_CHANGED: el precio cambió desde la revisión', async () => {
      const id = await save([['SKU-A', 100], ['SKU-B', 600]]);
      priceOf('product-a')!.value = 95;
      const error = await rejects(service.applyRevision(id, ctx));
      expect(body(error)).toMatchObject({ code: 'REVISION_CONFLICT', conflicts: [{ code: 'PRICE_CHANGED', sku: 'SKU-A', expected: '90', actual: '95' }] });
      expect(String(priceOf('product-b')!.value)).toBe('500');
      untouched(id);
    });

    it('PRICE_REMOVED: el precio previsto ya no existe', async () => {
      const id = await save([['SKU-A', 100]]);
      fake.state.prices.splice(0, 1);
      expect(body(await rejects(service.applyRevision(id, ctx))).conflicts[0]).toMatchObject({ code: 'PRICE_REMOVED', expected: '90', actual: null });
      untouched(id);
    });

    it('PRICE_CREATED_ELSEWHERE: apareció un precio donde no había ninguno', async () => {
      fake.state.prices.splice(0, 1);
      const id = await save([['SKU-A', 100]]);
      fake.state.prices.push({ id: 'price-x', productId: 'product-a', priceListId: 'tariff-oro', value: 80, currency: 'COP', listaId: LISTA_A });
      expect(body(await rejects(service.applyRevision(id, ctx))).conflicts[0]).toMatchObject({ code: 'PRICE_CREATED_ELSEWHERE', expected: null, actual: '80' });
      untouched(id);
    });

    it('MEMBERSHIP_CHANGED: el producto cambió de lista (sin revelar la lista nueva) o ya no existe', async () => {
      const id = await save([['SKU-A', 100]]);
      fake.state.products[0].listaId = LISTA_B;
      const error = await rejects(service.applyRevision(id, ctx));
      expect(body(error).conflicts[0]).toMatchObject({ code: 'MEMBERSHIP_CHANGED', expected: LISTA_A });
      expect(JSON.stringify(body(error))).not.toContain(LISTA_B);
      untouched(id);
      fake.state.products.splice(0, 1);
      expect(body(await rejects(service.applyRevision(id, ctx))).conflicts[0].code).toBe('MEMBERSHIP_CHANGED');
    });

    it('TARIFF_UNAVAILABLE si la revisión no guardó la tarifa', async () => {
      const id = await save([['SKU-A', 100]]);
      fake.state.revisionPrices[0].priceListId = null;
      expect(body(await rejects(service.applyRevision(id, ctx))).conflicts[0].code).toBe('TARIFF_UNAVAILABLE');
      untouched(id);
    });
  });

  describe('permisos por lista', () => {
    it('sin prices:apply sobre una de las listas: 409 LISTA_ACCESS_CHANGED para toda la aplicación', async () => {
      const id = await save([['SKU-A', 100], ['SKU-B', 600]]);
      grants.revoke('prices:apply');
      grants.grantOnLista(LISTA_A, 'prices:apply');
      const error = await rejects(service.applyRevision(id, ctx));
      expect(body(error)).toMatchObject({ code: 'REVISION_CONFLICT', details: { reason: 'LISTA_ACCESS_CHANGED' } });
      expect(JSON.stringify(body(error))).not.toMatch(/Lista Beta|LB|product-b/);
      expect(String(priceOf('product-a')!.value)).toBe('90');
      expect(fake.state.revisions[0].status).toBe('GUARDADA');
    });

    it('revocar prices:read de una lista tras revisar también cancela la aplicación', async () => {
      const id = await save([['SKU-A', 100], ['SKU-B', 600]]);
      grants.revoke('prices:read');
      grants.grantOnLista(LISTA_A, 'prices:read');
      // The general gate needs prices:read somewhere (kept on A); lista B no longer satisfies prices:apply's dependency.
      const error = await rejects(service.applyRevision(id, ctx));
      expect(body(error).details.reason).toBe('LISTA_ACCESS_CHANGED');
    });

    it('productos sin lista: exigen prices:apply y products:write con alcance global', async () => {
      const globalGrants = createGrantsProvider();
      globalGrants.grant('prices:save', 'prices:preview', 'prices:read', 'prices:apply', 'listas:read');
      const withGlobal = new PriceImportService(fake.prisma as PrismaService, acl as AclService, fake.audit as unknown as AuditService, globalGrants as any);
      const id = (await withGlobal.saveRevision(file([['SKU-FREE', 60]]), 'key-free-0001', ctx)).id;
      const error = await rejects(withGlobal.applyRevision(id, ctx));
      expect(body(error).details.reason).toBe('LISTA_ACCESS_CHANGED');
      globalGrants.grant('products:read', 'products:write');
      const result = await withGlobal.applyRevision(id, ctx);
      expect(result).toMatchObject({ appliedPrices: 1, perLista: [{ listaId: null, rows: 1, prices: 1 }] });
      expect(fake.state.prices.find((p) => p.productId === 'product-free')).toMatchObject({ listaId: null });
      expect(String(fake.state.prices.find((p) => p.productId === 'product-free')!.value)).toBe('60');
    });

    it('sin concesión prices:apply deniega (403) aunque la revisión siga GUARDADA', async () => {
      const id = await save([['SKU-A', 100]]);
      grants.revoke('prices:apply');
      fake.prisma.$transaction.mockClear();
      await expect(service.applyRevision(id, ctx)).rejects.toThrow(ForbiddenException);
      expect(fake.state.revisions[0].status).toBe('GUARDADA');
      expect(fake.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('un Super Admin aplica en cualquier lista sin concesiones', async () => {
      const id = await save([['SKU-B', 600]]);
      grants.grants.splice(0, grants.grants.length);
      const admin = { userId: 'fixture-admin', roles: ['Super Admin'] };
      await expect(service.applyRevision(id, admin)).resolves.toMatchObject({ appliedPrices: 1 });
    });
  });

  describe('estado de la revisión y concurrencia', () => {
    it('reintento idempotente: ya APLICADA devuelve el resultado guardado sin volver a escribir', async () => {
      const id = await save([['SKU-A', 100]]);
      const first = await service.applyRevision(id, ctx);
      fake.prisma.$transaction.mockClear();
      fake.prisma.price.update.mockClear();
      const second = await service.applyRevision(id, ctx);
      expect(second).toMatchObject({ alreadyApplied: true, appliedPrices: first.appliedPrices, batchId: first.batchId });
      expect(fake.prisma.$transaction).not.toHaveBeenCalled();
      expect(fake.prisma.price.update).not.toHaveBeenCalled();
      expect(fake.state.productChanges).toHaveLength(1);
    });

    it('el reintento de quien no ve una lista recibe el resultado sin su nombre ni su cuenta', async () => {
      const id = await save([['SKU-A', 100], ['SKU-B', 600]]);
      await service.applyRevision(id, ctx);
      const onlyA = createGrantsProvider();
      onlyA.grantOnLista(LISTA_A, ...ALL);
      const other = new PriceImportService(fake.prisma as PrismaService, acl as AclService, fake.audit as unknown as AuditService, onlyA as any);
      const replay = await other.applyRevision(id, { userId: 'fixture-other', roles: ['Admin Comercial'] });
      expect(replay.alreadyApplied).toBe(true);
      expect(replay.perLista!.map((l) => l.listaId)).toEqual([LISTA_A]);
      expect(JSON.stringify(replay)).not.toMatch(/Lista Beta/);
    });

    it('dos aplicaciones simultáneas escriben una sola vez y la segunda recibe el resultado guardado', async () => {
      const id = await save([['SKU-A', 100], ['SKU-B', 600]]);
      const [one, two] = await Promise.all([service.applyRevision(id, ctx), service.applyRevision(id, ctx)]);
      expect([one.alreadyApplied, two.alreadyApplied].sort()).toEqual([false, true]);
      expect(fake.state.productChanges).toHaveLength(2);
      expect(fake.prisma.price.update).toHaveBeenCalledTimes(2);
    });

    it('un fallo de serialización (P2034) se reintenta y el resultado es el esperado', async () => {
      const id = await save([['SKU-A', 100]]);
      fake.prisma.$transaction.mockClear();
      fake.prisma.$transaction.mockImplementationOnce(async () => { throw serializationFailure(); });
      await expect(service.applyRevision(id, ctx)).resolves.toMatchObject({ alreadyApplied: false, appliedPrices: 1 });
      expect(fake.prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(fake.state.productChanges).toHaveLength(1);
    });

    it('si el fallo persiste responde 409 reintentable APPLY_SERIALIZATION_CONFLICT', async () => {
      const id = await save([['SKU-A', 100]]);
      fake.prisma.$transaction.mockClear();
      fake.prisma.$transaction.mockImplementation(async () => { throw serializationFailure(); });
      const error = await rejects(service.applyRevision(id, ctx));
      expect(body(error).code).toBe('APPLY_SERIALIZATION_CONFLICT');
      expect(fake.prisma.$transaction).toHaveBeenCalledTimes(3);
      expect(String(priceOf('product-a')!.value)).toBe('90');
    });

    it('un error distinto de serialización no se reintenta', async () => {
      const id = await save([['SKU-A', 100]]);
      fake.prisma.$transaction.mockClear();
      fake.prisma.$transaction.mockImplementationOnce(async () => { throw new Error('boom'); });
      await expect(service.applyRevision(id, ctx)).rejects.toThrow('boom');
      expect(fake.prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('revisión descartada: 409; inexistente: 404', async () => {
      const id = await save([['SKU-A', 100]]);
      await service.discardRevision(id, ctx);
      expect(body(await rejects(service.applyRevision(id, ctx))).code).toBe('REVISION_DISCARDED');
      await expect(service.applyRevision('nope', ctx)).rejects.toThrow(NotFoundException);
    });
  });

  describe('atomicidad: todo o nada', () => {
    it('si el historial falla se deshacen precios y reclamo de la revisión', async () => {
      const id = await save([['SKU-A', 100], ['SKU-B', 600]]);
      fake.prisma.productChange.createMany.mockRejectedValueOnce(new Error('history down'));
      await expect(service.applyRevision(id, ctx)).rejects.toThrow('history down');
      expect(String(priceOf('product-a')!.value)).toBe('90');
      expect(String(priceOf('product-b')!.value)).toBe('500');
      expect(fake.state.revisions[0]).toMatchObject({ status: 'GUARDADA' });
      expect(fake.state.productChanges).toHaveLength(0);
    });

    it('si la auditoría falla se deshace todo lo escrito', async () => {
      const id = await save([['SKU-A', 100]]);
      fake.audit.logTx.mockRejectedValueOnce(new Error('audit down'));
      await expect(service.applyRevision(id, ctx)).rejects.toThrow('audit down');
      expect(String(priceOf('product-a')!.value)).toBe('90');
      expect(fake.state.productChanges).toHaveLength(0);
      expect(fake.state.revisions[0].status).toBe('GUARDADA');
      // The same revision can still be applied afterwards.
      await expect(service.applyRevision(id, ctx)).resolves.toMatchObject({ appliedPrices: 1 });
    });

    it('si la escritura de un precio falla no queda ningún precio parcial', async () => {
      const id = await save([['SKU-A', 100], ['SKU-B', 600]]);
      fake.prisma.price.update.mockImplementationOnce(async ({ data }: any) => { Object.assign(fake.state.prices[0], data); return {}; });
      fake.prisma.price.update.mockImplementationOnce(async () => { throw new Error('write failed'); });
      await expect(service.applyRevision(id, ctx)).rejects.toThrow('write failed');
      expect(String(priceOf('product-a')!.value)).toBe('90');
      expect(String(priceOf('product-b')!.value)).toBe('500');
    });
  });

  describe('revisiones heredadas de una sola lista', () => {
    const legacy = () => {
      fake.state.revisions.push({
        id: 'legacy-1', listaId: LISTA_A, createdById: ctx.userId, status: 'GUARDADA', fileName: 'old.xlsx', fileHash: 'h', fileSize: 1,
        idempotencyKey: 'k-legacy', policyVersion: 'p', parserVersion: 'v', trailerVersion: null, tariffs: [], summary: {}, createdAt: new Date(),
      });
      fake.state.revisionRows.push({ revisionId: 'legacy-1', rowNumber: 2, sku: 'SKU-A', status: 'valid', issues: [] });
      fake.state.revisionPrices.push({ revisionId: 'legacy-1', rowNumber: 2, sku: 'SKU-A', tariffCode: 'DPP_ORO_IVA', priceListId: 'tariff-oro', receivedValue: '100', roundedValue: '100', previousValue: '90', difference: '10', wasRounded: false, change: 'changed' });
    };

    it('se aplican resolviendo el SKU en la lista de la revisión', async () => {
      legacy();
      await expect(service.applyRevision('legacy-1', ctx)).resolves.toMatchObject({ appliedPrices: 1, perLista: [{ listaId: LISTA_A, rows: 1, prices: 1 }] });
      expect(String(priceOf('product-a')!.value)).toBe('100');
      expect(fake.state.productChanges[0]).toMatchObject({ productId: 'product-a', sourceRef: 'legacy-1' });
    });

    it('si el producto ya no está en la lista de la revisión: MEMBERSHIP_CHANGED', async () => {
      legacy();
      fake.state.products[0].listaId = LISTA_B;
      expect(body(await rejects(service.applyRevision('legacy-1', ctx))).conflicts[0].code).toBe('MEMBERSHIP_CHANGED');
    });
  });
});
