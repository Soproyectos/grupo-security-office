jest.mock('../../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PriceImportService } from './price-import.service';

const listaId = '00000000-0000-4000-8000-000000000001';
const otherListaId = '00000000-0000-4000-8000-000000000099';
const ctx: AccessContext = { userId: 'fixture-actor', roles: ['Admin Comercial'] };
const storageDir = path.join(os.tmpdir(), 'gs-imp04-test-storage');

function file(rows: unknown[][] = [['SKU-A', 100.5]]): Express.Multer.File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'ORO_IVA'], ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía ficticia']]), 'INSTRUCCIONES');
  return { originalname: 'fixture-precios.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) } as Express.Multer.File;
}

describe('IMP-04 — revisión de precios guardada y recuperable', () => {
  let service: PriceImportService;
  let prisma: any;
  let acl: any;
  let audit: any;
  let grantRows: { sourceId: string; actionId: string; scope: 'list' }[];
  let stored: any;

  beforeAll(async () => {
    process.env.PRICE_IMPORT_STORAGE_DIR = storageDir;
    await fs.rm(storageDir, { recursive: true, force: true });
  });
  afterAll(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
    delete process.env.PRICE_IMPORT_STORAGE_DIR;
  });

  beforeEach(() => {
    stored = null;
    prisma = {
      lista: {
        findUnique: jest.fn().mockResolvedValue({ id: listaId, isActive: true, archivedAt: null, deletionStatus: null, currency: 'COP' }),
      },
      priceList: { findMany: jest.fn().mockResolvedValue([{ id: 'tariff-oro', code: 'ORO_IVA', isActive: true, currency: 'COP', validFrom: null, validUntil: null }]) },
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'product-a', sku: 'SKU-A', listaId }]) },
      price: { findMany: jest.fn().mockResolvedValue([{ productId: 'product-a', priceListId: 'tariff-oro', listaId: null, value: 90, currency: 'COP' }]), create: jest.fn(), update: jest.fn() },
      assignment: { findMany: jest.fn().mockResolvedValue([]) },
      priceImportRevision: {
        findUnique: jest.fn(async () => stored),
        findMany: jest.fn(async () => (stored ? [stored] : [])),
        count: jest.fn(async () => (stored ? 1 : 0)),
        create: jest.fn(async ({ data }: any) => {
          stored = { ...data, id: 'rev-1', status: data.status ?? 'GUARDADA', createdAt: new Date('2026-10-17T00:00:00Z'), updatedAt: new Date() };
          return stored;
        }),
        update: jest.fn(async ({ data }: any) => { stored = { ...stored, ...data }; return stored; }),
      },
      priceImportRevisionRow: { createMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      priceImportRevisionPrice: { createMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    acl = { assertListaAccess: jest.fn().mockResolvedValue(undefined), isListasAdmin: jest.fn().mockReturnValue(false) };
    audit = { log: jest.fn().mockResolvedValue({}) };
    grantRows = ['prices:save', 'prices:preview', 'prices:read', 'prices:apply', 'listas:read'].map((actionId) => ({ sourceId: 's1', actionId, scope: 'list' as const }));
    service = new PriceImportService(prisma as PrismaService, acl as AclService, audit as AuditService,
      { grantsForUser: async () => grantRows } as any);
  });

  it('guarda la revisión (cabecera + filas + precios) sin tocar Price ni identidad', async () => {
    const header = await service.saveRevision(file(), listaId, 'key-12345678', ctx);
    expect(header).toMatchObject({ id: 'rev-1', listaId, status: 'GUARDADA', currency: 'COP', rounding: 'HALF_UP' });
    expect(header.fileAvailable).toBe(true);
    expect(prisma.priceImportRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ listaId, idempotencyKey: 'key-12345678', currency: 'COP' }),
    }));
    expect(prisma.priceImportRevisionRow.createMany).toHaveBeenCalled();
    expect(prisma.priceImportRevisionPrice.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ tariffCode: 'ORO_IVA', receivedValue: '100.5', roundedValue: '101', previousValue: '90', change: 'changed' })],
    }));
    expect(prisma.price.create).not.toHaveBeenCalled();
    expect(prisma.price.update).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'price-import-revision-save', entityId: listaId }));
  });

  it('guardar dos veces con la misma clave no duplica (idempotencia)', async () => {
    await service.saveRevision(file(), listaId, 'key-12345678', ctx);
    const second = await service.saveRevision(file(), listaId, 'key-12345678', ctx);
    expect(second.id).toBe('rev-1');
    expect(prisma.priceImportRevision.create).toHaveBeenCalledTimes(1);
  });

  it('misma clave con otro contenido produce 409', async () => {
    await service.saveRevision(file(), listaId, 'key-12345678', ctx);
    await expect(service.saveRevision(file([['SKU-A', 999]]), listaId, 'key-12345678', ctx)).rejects.toThrow(ConflictException);
  });

  it('exige una clave de idempotencia válida y el archivo', async () => {
    await expect(service.saveRevision(file(), listaId, 'corta', ctx)).rejects.toThrow(BadRequestException);
    await expect(service.saveRevision(undefined, listaId, 'key-12345678', ctx)).rejects.toThrow(BadRequestException);
  });

  it('sin concesión prices:save deniega el guardado (403)', async () => {
    grantRows = grantRows.filter((r) => r.actionId !== 'prices:save');
    await expect(service.saveRevision(file(), listaId, 'key-12345678', ctx)).rejects.toThrow(ForbiddenException);
    expect(prisma.priceImportRevision.create).not.toHaveBeenCalled();
  });

  it('recupera una revisión por id reconstruyendo filas y precios', async () => {
    await service.saveRevision(file(), listaId, 'key-12345678', ctx);
    prisma.priceImportRevisionRow.findMany.mockResolvedValue([{ revisionId: 'rev-1', rowNumber: 2, sku: 'SKU-A', status: 'valid', issues: [] }]);
    prisma.priceImportRevisionRow.count.mockResolvedValue(1);
    prisma.priceImportRevisionPrice.findMany.mockResolvedValue([
      { rowNumber: 2, sku: 'SKU-A', tariffCode: 'ORO_IVA', receivedValue: '100.5', roundedValue: '101', previousValue: '90', difference: '11', wasRounded: true, change: 'changed' },
    ]);
    const detail = await service.getRevision('rev-1', 1, 100, ctx);
    expect(detail).toMatchObject({ id: 'rev-1', totalRows: 1, page: 1 });
    expect(detail.rows[0]).toMatchObject({ row: 2, sku: 'SKU-A', status: 'valid' });
    expect(detail.rows[0].prices[0]).toMatchObject({ code: 'ORO_IVA', raw: '100.5', rounded: '101', previous: '90' });
  });

  it('tolera page/pageSize ausentes o inválidos (skip 0, sin NaN a Prisma)', async () => {
    await service.saveRevision(file(), listaId, 'key-12345678', ctx);
    prisma.priceImportRevisionRow.findMany.mockClear();
    await service.getRevision('rev-1', Number(undefined), Number(undefined), ctx);
    expect(prisma.priceImportRevisionRow.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100 }));
  });

  it('no consulta una revisión de una lista fuera de alcance (403)', async () => {
    stored = { id: 'rev-x', listaId: otherListaId, status: 'GUARDADA', fileName: 'x.xlsx', fileHash: 'h', fileSize: 1, idempotencyKey: 'k', policyVersion: 'p', parserVersion: 'v', trailerVersion: null, tariffs: [], summary: {}, createdById: null, createdAt: new Date() };
    prisma.priceImportRevision.findUnique.mockResolvedValue(stored);
    acl.assertListaAccess.mockRejectedValue(new ForbiddenException('ajena'));
    await expect(service.getRevision('rev-x', 1, 100, ctx)).rejects.toThrow(ForbiddenException);
  });

  it('404 cuando la revisión no existe', async () => {
    prisma.priceImportRevision.findUnique.mockResolvedValue(null);
    await expect(service.getRevision('nope', 1, 100, ctx)).rejects.toThrow(NotFoundException);
  });

  it('descarta una revisión pendiente y bloquea descartar una ya aplicada', async () => {
    await service.saveRevision(file(), listaId, 'key-12345678', ctx);
    const discarded = await service.discardRevision('rev-1', ctx);
    expect(discarded.status).toBe('DESCARTADA');
    stored = { ...stored, status: 'APLICADA' };
    await expect(service.discardRevision('rev-1', ctx)).rejects.toThrow(ConflictException);
  });

  // ———— IMP-05: aplicar ————
  const validRows = [{ revisionId: 'rev-1', rowNumber: 2, sku: 'SKU-A', status: 'valid', issues: [] }];
  const storedPrice = [{ rowNumber: 2, sku: 'SKU-A', tariffCode: 'ORO_IVA', priceListId: 'tariff-oro', receivedValue: '100.5', roundedValue: '101', previousValue: '90', difference: '11', wasRounded: true, change: 'changed' }];
  const seed = (over: Record<string, unknown> = {}) => {
    stored = { id: 'rev-1', listaId, status: 'GUARDADA', fileName: 'x.xlsx', fileHash: 'h', fileSize: 1, idempotencyKey: 'k', policyVersion: 'p', parserVersion: 'v', trailerVersion: null, tariffs: [], summary: {}, createdById: null, createdAt: new Date(), appliedAt: null, appliedResult: null, ...over };
    prisma.priceImportRevision.findUnique.mockResolvedValue(stored);
    prisma.priceImportRevision.update.mockImplementation(async ({ data }: any) => { stored = { ...stored, ...data, updatedAt: new Date() }; return stored; });
    prisma.priceImportRevisionRow.findMany.mockResolvedValue(validRows);
    prisma.priceImportRevisionPrice.findMany.mockResolvedValue(storedPrice);
    prisma.product.findMany.mockResolvedValue([{ id: 'product-a', sku: 'SKU-A', listaId }]);
    prisma.price.findMany.mockResolvedValue([{ id: 'price-1', productId: 'product-a', priceListId: 'tariff-oro', value: 90 }]);
    prisma.price.update.mockResolvedValue({});
    prisma.price.create.mockResolvedValue({});
  };

  it('sin concesión prices:read no se consulta el historial de la lista (403)', async () => {
    grantRows = grantRows.filter((r) => r.actionId !== 'prices:read');
    await expect(service.listRevisions(listaId, 1, 25, ctx)).rejects.toThrow(ForbiddenException);
  });

  it('el historial de una lista ajena no se lista (403)', async () => {
    acl.assertListaAccess.mockRejectedValue(new ForbiddenException('ajena'));
    await expect(service.listRevisions(otherListaId, 1, 25, ctx)).rejects.toThrow(ForbiddenException);
  });

  it('el archivo de una revisión ajena no se descarga (403) y 404 si el archivo ya no está', async () => {
    seed();
    acl.assertListaAccess.mockRejectedValue(new ForbiddenException('ajena'));
    await expect(service.getRevisionFile('rev-1', ctx)).rejects.toThrow(ForbiddenException);
    acl.assertListaAccess.mockResolvedValue(undefined);
    stored = { ...stored, fileHash: 'hash-inexistente-en-disco' };
    prisma.priceImportRevision.findUnique.mockResolvedValue(stored);
    await expect(service.getRevisionFile('rev-1', ctx)).rejects.toThrow(NotFoundException);
  });

  it('aplica el valor COP normalizado por la política compartida (misma regla que la edición manual)', async () => {
    seed();
    await service.applyRevision('rev-1', ctx);
    const call = prisma.price.update.mock.calls[0][0];
    // normalizeCopPrice(rounded='101') -> entero exacto '101' (política común IMP-03).
    expect(String(call.data.value)).toBe('101');
    expect(call.data.currency).toBe('COP');
  });

  it('aplica: actualiza el precio (90→101) y marca la revisión APLICADA sin tocar Product', async () => {
    seed();
    const result = await service.applyRevision('rev-1', ctx);
    expect(result).toMatchObject({ status: 'APLICADA', alreadyApplied: false, appliedPrices: 1, tariffs: ['ORO_IVA'] });
    expect(prisma.price.update).toHaveBeenCalledTimes(1);
    const call = prisma.price.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'price-1' });
    expect(String(call.data.value)).toBe('101');
    expect(call.data).toMatchObject({ currency: 'COP', listaId });
    expect(prisma.price.create).not.toHaveBeenCalled();
    expect(prisma.product.update).toBeUndefined();
    expect(prisma.priceImportRevision.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'APLICADA' }) }));
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'price-import-apply' }));
  });

  it('conflicto: si el precio cambió desde la revisión (versión esperada) NO aplica y avisa 409', async () => {
    seed();
    prisma.price.findMany.mockResolvedValue([{ id: 'price-1', productId: 'product-a', priceListId: 'tariff-oro', value: 95 }]);
    await expect(service.applyRevision('rev-1', ctx)).rejects.toThrow(ConflictException);
    expect(prisma.price.update).not.toHaveBeenCalled();
    expect(prisma.price.create).not.toHaveBeenCalled();
  });

  it('conflicto: si el precio previsto ya no existe o el producto salió de la lista', async () => {
    seed();
    prisma.price.findMany.mockResolvedValue([]);
    await expect(service.applyRevision('rev-1', ctx)).rejects.toThrow(ConflictException);
    seed();
    prisma.product.findMany.mockResolvedValue([]);
    await expect(service.applyRevision('rev-1', ctx)).rejects.toThrow(ConflictException);
  });

  it('reintento idempotente: ya APLICADA devuelve el resultado sin volver a escribir', async () => {
    seed({ status: 'APLICADA', appliedAt: new Date('2026-10-17T02:00:00Z'), appliedResult: { revisionId: 'rev-1', status: 'APLICADA', alreadyApplied: false, appliedRows: 1, appliedPrices: 1, tariffs: ['ORO_IVA'], appliedAt: '2026-10-17T02:00:00.000Z' } });
    const result = await service.applyRevision('rev-1', ctx);
    expect(result.alreadyApplied).toBe(true);
    expect(prisma.price.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sin concesión prices:apply deniega (403) aunque la revisión siga GUARDADA', async () => {
    seed();
    grantRows = grantRows.filter((r) => r.actionId !== 'prices:apply');
    await expect(service.applyRevision('rev-1', ctx)).rejects.toThrow(ForbiddenException);
    expect(prisma.price.update).not.toHaveBeenCalled();
  });

  it('revisión con filas en error: 409 y no aplica nada (exclusión expresa pendiente)', async () => {
    seed();
    prisma.priceImportRevisionRow.findMany.mockResolvedValue([{ revisionId: 'rev-1', rowNumber: 2, sku: 'SKU-A', status: 'error', issues: [{ code: 'INVALID_PRICE' }] }]);
    await expect(service.applyRevision('rev-1', ctx)).rejects.toThrow(ConflictException);
    expect(prisma.price.update).not.toHaveBeenCalled();
  });

  it('revisión descartada no se puede aplicar (409)', async () => {
    seed({ status: 'DESCARTADA' });
    await expect(service.applyRevision('rev-1', ctx)).rejects.toThrow(ConflictException);
  });
});
