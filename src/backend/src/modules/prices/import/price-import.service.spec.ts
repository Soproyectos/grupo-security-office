jest.mock('../../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PriceImportService } from './price-import.service';

const listaId = '00000000-0000-4000-8000-000000000001';
const ctx: AccessContext = { userId: 'fixture-actor', roles: ['Consulta'] };
function file(rows: unknown[][] = [['SKU-A', 100.5]], headers = ['REFERENCIA', 'ORO_IVA']): Express.Multer.File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía ficticia']]), 'INSTRUCCIONES');
  return { originalname: 'fixture-precios.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) } as Express.Multer.File;
}

describe('Read-only price preview with scoped repository queries', () => {
  let service: PriceImportService;
  let prisma: any;
  let acl: any;
  let audit: any;
  let grantRows: { sourceId: string; actionId: string; scope: 'list' }[];
  beforeEach(() => {
    const forbiddenWrite = jest.fn(() => { throw new Error('Business writes are forbidden during preview'); });
    const mutations = () => ({ create: forbiddenWrite, update: forbiddenWrite, upsert: forbiddenWrite, delete: forbiddenWrite, createMany: forbiddenWrite, updateMany: forbiddenWrite, deleteMany: forbiddenWrite });
    prisma = {
      lista: { ...mutations(), findUnique: jest.fn().mockResolvedValue({ id: listaId, isActive: true, archivedAt: null, deletionStatus: null, currency: 'COP' }) },
      priceList: { ...mutations(), findMany: jest.fn().mockResolvedValue([{ id: 'tariff-oro', code: 'ORO_IVA', isActive: true, currency: 'COP', validFrom: null, validUntil: null }]) },
      product: { ...mutations(), findMany: jest.fn().mockResolvedValue([{ id: 'product-a', sku: 'SKU-A', listaId }]) },
      price: { ...mutations(), findMany: jest.fn().mockResolvedValue([{ productId: 'product-a', priceListId: 'tariff-oro', listaId: null, value: new Prisma.Decimal('90'), currency: 'COP' }]) },
      assignment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    acl = { assertListaAccess: jest.fn().mockResolvedValue(undefined), isListasAdmin: jest.fn().mockReturnValue(false) };
    audit = { log: jest.fn().mockResolvedValue({}) };
    grantRows = ['prices:preview', 'prices:read', 'listas:read'].map((actionId) => ({ sourceId: 's1', actionId, scope: 'list' as const }));
    service = new PriceImportService(prisma as PrismaService, acl as AclService, audit as AuditService,
      { grantsForUser: async () => grantRows } as any);
  });

  it('compares rounded final IVA prices without changing stored data', async () => {
    const result = await service.preview(file(), listaId, ctx);
    expect(acl.assertListaAccess).toHaveBeenCalledWith(listaId, ctx, 'view_prices');
    expect(result).toMatchObject({ readOnly: true, taxIncluded: true, rounding: 'HALF_UP', summary: { validRows: 1, changedPrices: 1, roundedPrices: 1 } });
    expect(result.rows[0].prices[0]).toMatchObject({ raw: '100.5', rounded: '101', previous: '90', difference: '11', change: 'changed' });
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { listaId, sku: { in: ['SKU-A'], mode: 'insensitive' } } }));
    for (const model of ['product', 'price', 'priceList', 'lista']) expect(prisma[model].update).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'price-import-preview', result: 'SUCCESS', entityId: listaId }));
    const event = JSON.stringify(audit.log.mock.calls[0][0]);
    expect(event).not.toContain('SKU-A');
    expect(event).not.toContain('100.5');
  });

  it('preserves legacy decimal previous values in the comparison without rounding them silently', async () => {
    prisma.price.findMany.mockResolvedValue([{ productId: 'product-a', priceListId: 'tariff-oro', listaId, value: new Prisma.Decimal('90.75'), currency: 'COP' }]);
    const result = await service.preview(file([['SKU-A', 100]]), listaId, ctx);
    expect(result.rows[0].prices[0]).toMatchObject({ previous: '90.75', difference: '9.25' });
  });

  it('distinguishes a new tariff price from an unchanged price', async () => {
    prisma.price.findMany.mockResolvedValue([]);
    expect((await service.preview(file(), listaId, ctx)).summary.newPrices).toBe(1);
    prisma.price.findMany.mockResolvedValue([{ productId: 'product-a', priceListId: 'tariff-oro', listaId, value: new Prisma.Decimal('101'), currency: 'COP' }]);
    expect((await service.preview(file(), listaId, ctx)).summary.unchangedPrices).toBe(1);
  });

  it('treats unknown or foreign references alike without a global lookup or prior price leak', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    const result = await service.preview(file([['FOREIGN-SKU', 100]]), listaId, ctx);
    expect(result.rows[0]).toMatchObject({ status: 'error', prices: [{ previous: null, difference: null }] });
    expect(result.rows[0].issues[0].code).toBe('REFERENCE_UNAVAILABLE');
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.price.findMany).not.toHaveBeenCalled();
    expect(result.summary.prices).toBe(0);
  });

  it('excludes explicitly restricted products before querying saved prices', async () => {
    prisma.assignment.findMany.mockResolvedValue([{ resourceId: 'product-a' }]);
    const result = await service.preview(file(), listaId, ctx);
    expect(result.rows[0].issues[0].code).toBe('REFERENCE_UNAVAILABLE');
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('rejects ambiguous case-insensitive product matches rather than choosing one', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 'a', sku: 'SKU-A', listaId }, { id: 'b', sku: 'sku-a', listaId }]);
    const result = await service.preview(file(), listaId, ctx);
    expect(result.rows[0].issues[0].code).toBe('REFERENCE_UNAVAILABLE');
    expect(result.rows[0].prices[0].previous).toBeNull();
  });

  it.each([
    [],
    [{ id: 'wrong-tariff', code: 'DPP_ORO_IVA', isActive: true, currency: 'COP' }],
    [{ id: 'tariff-oro', code: 'ORO_IVA', isActive: false, currency: 'COP' }],
    [{ id: 'tariff-oro', code: 'ORO_IVA', isActive: true, currency: 'USD' }],
    [{ id: 'tariff-oro', code: 'ORO_IVA', isActive: true, currency: 'COP', validUntil: new Date('2000-01-01') }],
  ])('requires an exact active COP tariff without silently creating or aliasing it', async (...tariffs) => {
    prisma.priceList.findMany.mockResolvedValue(tariffs);
    const result = await service.preview(file(), listaId, ctx);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARIFF_UNAVAILABLE', column: 'ORO_IVA' }));
    expect(result.rows[0].prices[0].previous).toBeNull();
    expect(result.summary.validRows).toBe(0);
    expect(prisma.priceList.create).not.toHaveBeenCalled();
  });

  it.each([{ listaId: 'other-list', currency: 'COP' }, { listaId, currency: 'USD' }])('does not reveal a saved price with inconsistent list/currency: %p', async (stored) => {
    prisma.price.findMany.mockResolvedValue([{ productId: 'product-a', priceListId: 'tariff-oro', value: new Prisma.Decimal('999'), ...stored }]);
    const result = await service.preview(file(), listaId, ctx);
    expect(result.rows[0].issues[0].code).toBe('STORED_PRICE_MISMATCH');
    expect(result.rows[0].prices[0].previous).toBeNull();
  });

  it.each([
    { isActive: false }, { archivedAt: new Date() }, { deletionStatus: 'REQUESTED' }, { currency: 'USD' },
  ])('checks list state even when an administrator bypasses ACL: %p', async (state) => {
    prisma.lista.findUnique.mockResolvedValue({ id: listaId, isActive: true, archivedAt: null, currency: 'COP', ...state });
    await expect(service.preview(file(), listaId, { userId: 'fixture-admin', roles: ['Super Admin'] })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('requires explicit actions and propagates denied list scope before parsing', async () => {
    grantRows = grantRows.filter((g) => g.actionId !== 'prices:preview');
    await expect(service.preview(file(), listaId, ctx)).rejects.toBeInstanceOf(ForbiddenException);
    grantRows = ['prices:preview', 'prices:read', 'listas:read'].map((actionId) => ({ sourceId: 's1', actionId, scope: 'list' as const }));
    acl.assertListaAccess.mockRejectedValue(new NotFoundException());
    await expect(service.preview(file(), listaId, ctx)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.priceList.findMany).not.toHaveBeenCalled();
  });
});
