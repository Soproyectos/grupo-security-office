/**
 * IMP-02 backend — descarga de plantilla vacía/con referencias
 * (contrato IMP-02 §3/§5; ficha acceptance).
 *
 * RED observado: `buildPriceTemplate` y `PriceImportService.downloadTemplate`
 * no existen todavía.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { buildOfficialPriceTemplate, buildPriceTemplate, readPriceTemplate } from './price-template';
import { PriceImportService } from './price-import.service';
import { PRICE_IMPORT_TARIFFS } from './price-import.types';

describe('buildPriceTemplate — generador de plantilla (IMP-02 §3)', () => {
  it('genera PRECIOS+INSTRUCCIONES exactas con las tarifas seleccionadas en orden', () => {
    const buffer = buildPriceTemplate({ mode: 'vacias', tariffs: ['DPP_ORO_IVA', 'INSTALADOR_IVA'] });
    const wb = XLSX.read(buffer, { type: 'buffer', bookSheets: true });
    expect(wb.SheetNames).toEqual(['PRECIOS', 'INSTRUCCIONES']);
    const full = XLSX.read(buffer, { type: 'buffer' });
    const header = XLSX.utils.sheet_to_json<string[]>(full.Sheets.PRECIOS, { header: 1 })[0];
    // Orden PRICE_IMPORT_TARIFFS, no el orden de la petición.
    expect(header).toEqual(['REFERENCIA', 'INSTALADOR_IVA', 'DPP_ORO_IVA']);
  });

  it('la tarifa Oro es exactamente DPP_ORO_IVA y no aparece una ORO_IVA suelta', () => {
    const buffer = buildPriceTemplate({ mode: 'vacias', tariffs: [...PRICE_IMPORT_TARIFFS] });
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const header = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.PRECIOS, { header: 1 })[0];
    expect(header).toContain('DPP_ORO_IVA');
    expect(header).not.toContain('ORO_IVA');
  });

  it('mode=vacias deja 0 filas comerciales (solo encabezados)', () => {
    const buffer = buildPriceTemplate({ mode: 'vacias', tariffs: ['DPP_ORO_IVA'] });
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.PRECIOS, { header: 1 });
    expect(rows.length).toBe(1); // solo la fila 1
  });

  it('mode=referencias emite una fila por SKU con sus precios de referencia', () => {
    const buffer = buildPriceTemplate({
      mode: 'referencias',
      tariffs: ['DPP_ORO_IVA'],
      references: [{ sku: 'SKU-A', prices: { DPP_ORO_IVA: '100000' } }, { sku: 'SKU-B' }],
    });
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.PRECIOS) as Record<string, unknown>[];
    expect(rows.length).toBe(2);
    expect(rows[0]).toMatchObject({ REFERENCIA: 'SKU-A', DPP_ORO_IVA: 100000 });
    expect(rows[1].REFERENCIA).toBe('SKU-B');
    expect(rows[1].DPP_ORO_IVA).toBeUndefined();
  });

  it('el XLSX generado lo acepta readPriceTemplate sin modificación de hojas (acceptance backend 1)', () => {
    // readPriceTemplate viene de IMP-01; rellenamos una fila y debe validar.
    const buffer = buildPriceTemplate({ mode: 'referencias', tariffs: ['DPP_ORO_IVA'], references: [{ sku: 'SKU-A' }] });
    const wb = XLSX.read(buffer, { type: 'buffer' });
    XLSX.utils.sheet_add_json(wb.Sheets.PRECIOS, [{ REFERENCIA: 'SKU-A', DPP_ORO_IVA: 100000 }], { skipHeader: true, origin: 'A2' });
    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    // Import dinámico para no romper el ciclo de imports del spec.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readPriceTemplate } = require('./price-template');
    const parsed = readPriceTemplate(out);
    expect(parsed.tariffs).toEqual(['DPP_ORO_IVA']);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].sku).toBe('SKU-A');
    expect(parsed.rows[0].prices[0]).toMatchObject({ code: 'DPP_ORO_IVA', raw: '100000', rounded: '100000' });
  });
});

describe('PriceImportService.downloadTemplate — alcance y validación (IMP-02 §3)', () => {
  let prisma: any;
  let acl: any;
  let audit: any;
  let grants: { grantsForUser: jest.Mock };
  let service: PriceImportService;
  const LISTA = '00000000-0000-4000-8000-000000000001';
  const OTRA = '00000000-0000-4000-8000-000000000002';
  const ctx = { userId: 'u-1', roles: ['Supervisor'] };

  beforeEach(() => {
    prisma = {
      lista: { findUnique: jest.fn().mockResolvedValue({ id: LISTA, code: 'L-1', isActive: true, archivedAt: null, deletionStatus: null, currency: 'COP' }) },
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', sku: 'SKU-A' }]) },
      price: { findMany: jest.fn().mockResolvedValue([{ productId: 'p1', priceListId: 't1', value: '100000', currency: 'COP' }]) },
      priceList: { findMany: jest.fn().mockResolvedValue([{ id: 't1', code: 'DPP_ORO_IVA', isActive: true, currency: 'COP', validFrom: null, validUntil: null }]) },
    };
    acl = { assertListaAccess: jest.fn().mockResolvedValue(undefined), isListasAdmin: jest.fn().mockReturnValue(false) };
    audit = { log: jest.fn().mockResolvedValue({}) };
    grants = { grantsForUser: jest.fn().mockResolvedValue([]) };
    service = new PriceImportService(prisma, acl, audit, grants as any);
  });

  it('mode inválido → 400 sin consultar datos', async () => {
    await expect(service.downloadTemplate(LISTA, 'otracosa' as never, undefined, ctx)).rejects.toThrow(BadRequestException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('tariff desconocida → 400 (no se inventan tarifas)', async () => {
    await expect(service.downloadTemplate(LISTA, 'vacias', ['ORO_IVA'], ctx)).rejects.toThrow(BadRequestException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('lista inexistente → 404', async () => {
    prisma.lista.findUnique.mockResolvedValue(null);
    await expect(service.downloadTemplate(OTRA, 'vacias', undefined, ctx)).rejects.toThrow(NotFoundException);
  });

  it('mode=vacias no consulta productos (0 filas comerciales)', async () => {
    const result = await service.downloadTemplate(LISTA, 'vacias', undefined, ctx);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.fileName).toMatch(/^plantilla-precios-L-1-/);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    // el alcance de la lista se exige incluso para la vacía
    expect(acl.assertListaAccess).toHaveBeenCalledWith(LISTA, ctx, 'view_prices');
  });

  it('mode=referencias consulta SOLO productos de esa lista (acceptance backend 2)', async () => {
    await service.downloadTemplate(LISTA, 'referencias', ['DPP_ORO_IVA'], ctx);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ listaId: LISTA }) }),
    );
  });

  it('mode=referencias sin concession prices:read → solo SKUs, sin precios de referencia', async () => {
    // grants vacío → capa rol transicional; para probar la rama sin precios
    // mockeamos isListasAdmin=true (rol admin) pero sin concesión prices:read.
    acl.isListasAdmin.mockReturnValue(true);
    const result = await service.downloadTemplate(LISTA, 'referencias', ['DPP_ORO_IVA'], ctx);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require('xlsx');
    const wb = XLSX.read(result.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.PRECIOS) as Record<string, unknown>;
    expect((rows[0] as Record<string, unknown>).REFERENCIA).toBe('SKU-A');
    expect((rows[0] as Record<string, unknown>).DPP_ORO_IVA).toBeUndefined(); // sin prices:read no hay precios
  });

  it('auditoría con fileHash y SIN SKUs ni precios (patrón IMP-01)', async () => {
    await service.downloadTemplate(LISTA, 'referencias', ['DPP_ORO_IVA'], ctx);
    const event = audit.log.mock.calls[0][0];
    expect(event).toMatchObject({ action: 'price-template-download', entity: 'LISTA', entityId: LISTA });
    expect(event.newValues.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(event)).not.toMatch(/SKU-A|100000/);
  });
});

describe('PriceImportService.downloadTemplate — precios de referencia (P1)', () => {
  let prisma: any;
  let acl: any;
  let audit: any;
  let service: PriceImportService;
  const LISTA = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    prisma = {
      lista: { findUnique: jest.fn().mockResolvedValue({ id: LISTA, code: 'L-1', isActive: true, archivedAt: null, deletionStatus: null, currency: 'COP' }) },
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', sku: 'SKU-A' }]) },
      price: { findMany: jest.fn().mockResolvedValue([{ productId: 'p1', priceListId: 't1', value: '100000', currency: 'COP' }]) },
      priceList: { findMany: jest.fn().mockResolvedValue([{ id: 't1', code: 'DPP_ORO_IVA', isActive: true, currency: 'COP', validFrom: null, validUntil: null }]) },
    };
    acl = { assertListaAccess: jest.fn().mockResolvedValue(undefined), isListasAdmin: jest.fn().mockReturnValue(true) };
    audit = { log: jest.fn().mockResolvedValue({}) };
    const grants = {
      grantsForUser: jest.fn().mockResolvedValue([
        { sourceId: 's1', actionId: 'prices:read', scope: 'list' },
        { sourceId: 's1', actionId: 'listas:read', scope: 'list' },
      ]),
    };
    service = new PriceImportService(prisma, acl, audit, grants as any);
  });

  it('con concesión prices:read incluye el precio actual como referencia', async () => {
    const result = await service.downloadTemplate(LISTA, 'referencias', ['DPP_ORO_IVA'], { userId: 'u-1', roles: ['Supervisor'] });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require('xlsx');
    const wb = XLSX.read(result.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.PRECIOS) as Record<string, unknown>;
    expect((rows[0] as Record<string, unknown>).REFERENCIA).toBe('SKU-A');
    expect((rows[0] as Record<string, unknown>).DPP_ORO_IVA).toBe(100000);
  });
});

// ─── IMP-07 §3 (07A) — exportación de la lista solo con datos/tarifas autorizados ───
describe('PriceImportService.exportListaPrices — alcance y permisos (IMP-07 §3)', () => {
  let prisma: any;
  let acl: any;
  let audit: any;
  let service: PriceImportService;
  const LISTA = '00000000-0000-4000-8000-000000000001';
  const ctx = { userId: 'u-1', roles: ['Supervisor'] };

  function build(grantsRows: Array<{ sourceId: string; actionId: string; scope: string }>) {
    prisma = {
      lista: { findUnique: jest.fn().mockResolvedValue({ id: LISTA, code: 'L-1', isActive: true, archivedAt: null, deletionStatus: null, currency: 'COP' }) },
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', sku: 'SKU-A' }, { id: 'p2', sku: 'SKU-B' }]) },
      priceList: { findMany: jest.fn().mockResolvedValue([{ id: 't1', code: 'DPP_ORO_IVA', isActive: true, currency: 'COP' }]) },
      price: { findMany: jest.fn().mockResolvedValue([{ productId: 'p1', priceListId: 't1', value: '100000' }]) },
    };
    acl = { assertListaAccess: jest.fn().mockResolvedValue(undefined), isListasAdmin: jest.fn().mockReturnValue(false) };
    audit = { log: jest.fn().mockResolvedValue({}) };
    service = new PriceImportService(prisma, acl, audit, { grantsForUser: jest.fn().mockResolvedValue(grantsRows) } as any);
  }

  const readGrant = [
    { sourceId: 's1', actionId: 'prices:read', scope: 'list' },
    { sourceId: 's1', actionId: 'listas:read', scope: 'list' },
  ];

  function rowsOf(buffer: Buffer): Record<string, unknown>[] {
    const XLSX = require('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    return XLSX.utils.sheet_to_json(wb.Sheets.PRECIOS) as Record<string, unknown>[];
  }

  it('sin concesión prices:read → 403 sin consultar la lista', async () => {
    build([{ sourceId: 's1', actionId: 'listas:read', scope: 'list' }]);
    await expect(service.exportListaPrices(LISTA, ['DPP_ORO_IVA'], ctx)).rejects.toThrow(ForbiddenException);
    expect(prisma.lista.findUnique).not.toHaveBeenCalled();
  });

  it('solo SÍ exige prices:read: con esa concesión exporta sin necesitar prices:preview', async () => {
    build(readGrant);
    const result = await service.exportListaPrices(LISTA, ['DPP_ORO_IVA'], ctx);
    expect(result.fileName).toMatch(/^lista-L-1-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ listaId: LISTA }) }));
  });

  it('incluye solo la tarifa pedida y los precios vigentes de ESA lista (caso 3)', async () => {
    build(readGrant);
    const result = await service.exportListaPrices(LISTA, ['DPP_ORO_IVA'], ctx);
    const rows = rowsOf(result.buffer);
    expect(rows[0]).toMatchObject({ REFERENCIA: 'SKU-A', DPP_ORO_IVA: 100000 });
    expect(rows[1]).toMatchObject({ REFERENCIA: 'SKU-B' });
    expect(rows[1].DPP_ORO_IVA).toBeUndefined();
    const header = Object.keys(rows[0]);
    expect(header).toEqual(['REFERENCIA', 'DPP_ORO_IVA']); // sin tarifas no autorizadas
  });

  it('tarifa desconocida → 400 (no se inventan tarifas)', async () => {
    build(readGrant);
    await expect(service.exportListaPrices(LISTA, ['FANTASMA_IVA'], ctx)).rejects.toThrow(BadRequestException);
  });

  it('lista ajena → 403 (assertListaAccess)', async () => {
    build(readGrant);
    acl.assertListaAccess.mockRejectedValue(new ForbiddenException('ajena'));
    await expect(service.exportListaPrices(LISTA, ['DPP_ORO_IVA'], ctx)).rejects.toThrow(ForbiddenException);
  });

  it('auditoría price-list-export con fileHash y sin SKUs ni precios', async () => {
    build(readGrant);
    await service.exportListaPrices(LISTA, ['DPP_ORO_IVA'], ctx);
    const event = audit.log.mock.calls[0][0];
    expect(event).toMatchObject({ action: 'price-list-export', entity: 'LISTA', entityId: LISTA });
    expect(event.newValues.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(event)).not.toMatch(/SKU-A|100000/);
  });
});

describe('buildOfficialPriceTemplate — plantilla oficial sin lista', () => {
  it('tiene la hoja PLANTILLA, encabezados legibles con IVA y la guía', () => {
    const wb = XLSX.read(buildOfficialPriceTemplate(), { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['PLANTILLA', 'INSTRUCCIONES']);
    expect(XLSX.utils.sheet_to_json<string[]>(wb.Sheets.PLANTILLA, { header: 1 })[0]).toEqual([
      'REFERENCIA *', 'PRECIO INSTALADOR (CON IVA)', 'PRECIO TIENDA (CON IVA)', 'PRECIO DPP ORO (CON IVA)',
      'PRECIO DPP PLATINO (CON IVA)', 'PRECIO CLIENTE FINAL (CON IVA)',
    ]);
    expect(XLSX.utils.sheet_to_json<string[]>(wb.Sheets.INSTRUCCIONES, { header: 1 }).length).toBeGreaterThan(3);
  });

  it('ida y vuelta: el lector acepta el archivo descargado con filas ficticias rellenas', () => {
    const wb = XLSX.read(buildOfficialPriceTemplate(), { type: 'buffer' });
    XLSX.utils.sheet_add_aoa(wb.Sheets.PLANTILLA, [
      ['FIXTURE-A(2.8mm)', 1190.4, 1000, 900, 800, 1500],
      ['FIXTURE-B', 2000, null, null, null, 3000],
    ], { origin: 'A2' });
    const filled = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
    const parsed = readPriceTemplate(filled);
    expect(parsed.tariffs).toEqual([...PRICE_IMPORT_TARIFFS]);
    expect(parsed.ignoredColumns).toEqual([]);
    expect(parsed.rows.map((r) => [r.sku, r.status])).toEqual([['FIXTURE-A(2.8mm)', 'valid'], ['FIXTURE-B', 'valid']]);
  });

  it('el archivo vacío descargado se rechaza con un mensaje claro, no con un error técnico', () => {
    expect(() => readPriceTemplate(buildOfficialPriceTemplate())).toThrow(/vacía/);
  });
});

describe('PriceImportService.downloadOfficialTemplate', () => {
  it('exige prices:preview y no necesita lista', async () => {
    const audit = { log: jest.fn().mockResolvedValue({}) };
    const service = new PriceImportService({} as any, { isListasAdmin: jest.fn().mockReturnValue(true) } as any, audit as any, { grantsForUser: jest.fn().mockResolvedValue([]) } as any);
    const { buffer, fileName } = await service.downloadOfficialTemplate({ userId: 'u-1', roles: ['Super Admin'] });
    expect(buffer.length).toBeGreaterThan(0);
    expect(fileName).toMatch(/^plantilla-precios-grupo-security-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ entity: 'PRICE_TEMPLATE', result: 'SUCCESS' }));
  });
});
