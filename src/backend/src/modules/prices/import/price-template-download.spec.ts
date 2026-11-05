/**
 * IMP-02 backend — descarga de plantilla vacía/con referencias
 * (contrato IMP-02 §3/§5; ficha acceptance).
 *
 * RED observado: `buildPriceTemplate` y `PriceImportService.downloadTemplate`
 * no existen todavía.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { buildOfficialPriceTemplate, buildPriceTemplate, buildSinglePriceTemplate, readPriceTemplate } from './price-template';
import { PriceImportService } from './price-import.service';
import { LEGACY_TARIFFS, LEGACY_TARIFF_CODES } from './price-import.test-helpers';

/** Legacy tariffs (code + name) for the given codes, always in canonical order. */
const pick = (...codes: string[]) => LEGACY_TARIFFS.filter((t) => codes.includes(t.code));
const readLegacy = (buffer: Buffer) => readPriceTemplate(buffer, LEGACY_TARIFFS);

describe('buildPriceTemplate — generador de plantilla (IMP-02 §3)', () => {
  it('genera PRECIOS+INSTRUCCIONES exactas con las tarifas seleccionadas en orden', () => {
    const buffer = buildPriceTemplate({ mode: 'vacias', tariffs: pick('DPP_ORO_IVA', 'INSTALADOR_IVA') });
    const wb = XLSX.read(buffer, { type: 'buffer', bookSheets: true });
    expect(wb.SheetNames).toEqual(['PRECIOS', 'INSTRUCCIONES']);
    const full = XLSX.read(buffer, { type: 'buffer' });
    const header = XLSX.utils.sheet_to_json<string[]>(full.Sheets.PRECIOS, { header: 1 })[0];
    // Orden PRICE_IMPORT_TARIFFS, no el orden de la petición.
    expect(header).toEqual(['REFERENCIA', 'Instalador (con IVA)', 'DPP Oro (con IVA)']);
  });

  it('la tarifa Oro es exactamente DPP_ORO_IVA y no aparece una ORO_IVA suelta', () => {
    const buffer = buildPriceTemplate({ mode: 'vacias', tariffs: LEGACY_TARIFFS });
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const header = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.PRECIOS, { header: 1 })[0];
    expect(header).toContain('DPP Oro (con IVA)');
    expect(header).not.toContain('Oro (con IVA)');
  });

  it('mode=vacias deja 0 filas comerciales (solo encabezados)', () => {
    const buffer = buildPriceTemplate({ mode: 'vacias', tariffs: pick('DPP_ORO_IVA') });
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.PRECIOS, { header: 1 });
    expect(rows.length).toBe(1); // solo la fila 1
  });

  it('mode=referencias emite una fila por SKU con sus precios de referencia', () => {
    const buffer = buildPriceTemplate({
      mode: 'referencias',
      tariffs: pick('DPP_ORO_IVA'),
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
    const buffer = buildPriceTemplate({ mode: 'referencias', tariffs: pick('DPP_ORO_IVA'), references: [{ sku: 'SKU-A' }] });
    const wb = XLSX.read(buffer, { type: 'buffer' });
    XLSX.utils.sheet_add_json(wb.Sheets.PRECIOS, [{ REFERENCIA: 'SKU-A', DPP_ORO_IVA: 100000 }], { skipHeader: true, origin: 'A2' });
    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    // Import dinámico para no romper el ciclo de imports del spec.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const parsed = readLegacy(out);
    expect(parsed.tariffs).toEqual(['DPP_ORO_IVA']);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].sku).toBe('SKU-A');
    expect(parsed.rows[0].prices[0]).toMatchObject({ code: 'DPP_ORO_IVA', raw: '100000', rounded: '100000' });
  });
});

const g = (actionId: string, scope: 'global' | 'list' | 'product' = 'global', resourceId?: string) => ({ sourceId: `s-${actionId}`, actionId, scope, resourceId });

function xlsxRows(buffer: Buffer): Record<string, unknown>[] {
  const lib = require('xlsx');
  const wb = lib.read(buffer, { type: 'buffer' });
  return lib.utils.sheet_to_json(wb.Sheets.PRECIOS) as Record<string, unknown>[];
}

function buildService(grantsRows: Array<{ sourceId: string; actionId: string; scope: string; resourceId?: string }>) {
  const prisma: any = {
    lista: { findUnique: jest.fn(), findMany: jest.fn() },
    product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', sku: 'SKU-A' }, { id: 'p2', sku: 'SKU-B' }]) },
    price: { findMany: jest.fn().mockResolvedValue([{ productId: 'p1', priceListId: 't1', value: '100000', currency: 'COP' }]) },
    priceList: { findMany: jest.fn().mockResolvedValue([{ id: 't1', code: 'DPP_ORO_IVA', isActive: true, currency: 'COP', validFrom: null, validUntil: null }]) },
  };
  const acl: any = { assertListaAccess: jest.fn(), isListasAdmin: jest.fn().mockReturnValue(true) };
  const audit: any = { log: jest.fn().mockResolvedValue({}) };
  const service = new PriceImportService(prisma, acl, audit, { grantsForUser: jest.fn().mockResolvedValue(grantsRows) } as any);
  return { prisma, acl, audit, service };
}

describe('PriceImportService.downloadTemplate — permisos globales y validación (IMP-02 §3)', () => {
  const ctx = { userId: 'u-1', roles: ['Vendedor'] };
  const previewGrants = [g('prices:preview'), g('prices:read'), g('listas:read')];

  it('mode inválido → 400 sin consultar datos', async () => {
    const { service, prisma } = buildService(previewGrants);
    await expect(service.downloadTemplate('otracosa' as never, undefined, ctx)).rejects.toThrow(BadRequestException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('tariff desconocida → 400 (no se inventan tarifas)', async () => {
    const { service, prisma } = buildService(previewGrants);
    await expect(service.downloadTemplate('vacias', ['ORO_IVA'], ctx)).rejects.toThrow(BadRequestException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('mode=vacias exige prices:preview, no consulta productos ni Listas (0 filas comerciales)', async () => {
    const { service, prisma, acl } = buildService([g('prices:preview'), g('prices:read'), g('listas:read')]);
    const result = await service.downloadTemplate('vacias', undefined, ctx);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.fileName).toMatch(/^plantilla-precios-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.lista.findUnique).not.toHaveBeenCalled();
    expect(acl.assertListaAccess).not.toHaveBeenCalled();
  });

  it('mode=referencias exige prices:read (no prices:preview) y lista TODO el catálogo, sin filtro por Lista', async () => {
    const { service, prisma, acl } = buildService([g('prices:read'), g('listas:read')]);
    const result = await service.downloadTemplate('referencias', ['DPP_ORO_IVA'], ctx);
    const where = prisma.product.findMany.mock.calls[0][0].where;
    expect(where ?? {}).not.toHaveProperty('listaId');
    const rows = xlsxRows(result.buffer);
    expect(rows[0]).toMatchObject({ REFERENCIA: 'SKU-A', DPP_ORO_IVA: 100000 });
    expect(rows[1].REFERENCIA).toBe('SKU-B');
    expect(prisma.lista.findUnique).not.toHaveBeenCalled();
    expect(acl.assertListaAccess).not.toHaveBeenCalled();
  });

  it.each([
    ['vacias', 'Admin Comercial'], ['vacias', 'Supervisor'], ['referencias', 'Admin Comercial'], ['referencias', 'Supervisor'],
  ] as const)('%s: un cargo que antes pasaba (%s) recibe 403 con cero concesiones (la regla "sin concesiones => permitido" ya no existe)', async (mode, role) => {
    const { service, prisma, audit } = buildService([]);
    await expect(service.downloadTemplate(mode, undefined, { userId: 'u-1', roles: [role] })).rejects.toThrow(ForbiddenException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('una concesión ligada a una Lista no basta: solo cuenta la global', async () => {
    const { service } = buildService([g('prices:preview', 'list', 'l-1'), g('prices:read', 'list', 'l-1'), g('listas:read', 'list', 'l-1')]);
    await expect(service.downloadTemplate('vacias', undefined, ctx)).rejects.toThrow(ForbiddenException);
    await expect(service.downloadTemplate('referencias', undefined, ctx)).rejects.toThrow(ForbiddenException);
  });

  it('Super Admin conserva su excepción sin concesiones', async () => {
    const { service } = buildService([]);
    await expect(service.downloadTemplate('vacias', undefined, { userId: 'u-1', roles: ['Super Admin'] })).resolves.toBeDefined();
  });

  it('auditoría con fileHash y SIN SKUs ni precios (patrón IMP-01)', async () => {
    const { service, audit } = buildService([g('prices:read'), g('listas:read')]);
    await service.downloadTemplate('referencias', ['DPP_ORO_IVA'], ctx);
    const event = audit.log.mock.calls[0][0];
    expect(event).toMatchObject({ action: 'price-template-download', entity: 'PRICE_TEMPLATE', entityId: 'referencias' });
    expect(event.newValues.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(event)).not.toMatch(/SKU-A|100000/);
  });
});

// ─── IMP-07 §3 (07A) — exportación del catálogo con prices:read global y sin Listas ───
describe('PriceImportService.exportPrices — permisos globales (IMP-07 §3)', () => {
  const ctx = { userId: 'u-1', roles: ['Vendedor'] };
  const readGrant = [g('prices:read'), g('listas:read')];

  it('sin concesión prices:read → 403 sin consultar productos', async () => {
    const { service, prisma } = buildService([g('listas:read')]);
    await expect(service.exportPrices(['DPP_ORO_IVA'], ctx)).rejects.toThrow(ForbiddenException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it.each(['Admin Comercial', 'Supervisor'])('cero concesiones: el cargo %s ya no exporta', async (role) => {
    const { service } = buildService([]);
    await expect(service.exportPrices(['DPP_ORO_IVA'], { userId: 'u-1', roles: [role] })).rejects.toThrow(ForbiddenException);
  });

  it('con prices:read global exporta sin prices:preview, sin Lista y sin ACL por Lista', async () => {
    const { service, prisma, acl } = buildService(readGrant);
    const result = await service.exportPrices(['DPP_ORO_IVA'], ctx);
    expect(result.fileName).toMatch(/^precios-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(prisma.product.findMany.mock.calls[0][0].where ?? {}).not.toHaveProperty('listaId');
    expect(prisma.lista.findUnique).not.toHaveBeenCalled();
    expect(acl.assertListaAccess).not.toHaveBeenCalled();
  });

  it('una concesión ligada a una Lista no basta', async () => {
    const { service } = buildService([g('prices:read', 'list', 'l-1'), g('listas:read', 'list', 'l-1')]);
    await expect(service.exportPrices(['DPP_ORO_IVA'], ctx)).rejects.toThrow(ForbiddenException);
  });

  it('incluye solo la tarifa pedida y los precios vigentes (caso 3)', async () => {
    const { service } = buildService(readGrant);
    const rows = xlsxRows((await service.exportPrices(['DPP_ORO_IVA'], ctx)).buffer);
    expect(rows[0]).toMatchObject({ REFERENCIA: 'SKU-A', DPP_ORO_IVA: 100000 });
    expect(rows[1]).toMatchObject({ REFERENCIA: 'SKU-B' });
    expect(rows[1].DPP_ORO_IVA).toBeUndefined();
    expect(Object.keys(rows[0])).toEqual(['REFERENCIA', 'DPP_ORO_IVA']);
  });

  it('tarifa desconocida → 400 (no se inventan tarifas)', async () => {
    const { service } = buildService(readGrant);
    await expect(service.exportPrices(['FANTASMA_IVA'], ctx)).rejects.toThrow(BadRequestException);
  });

  it('auditoría price-list-export con fileHash y sin SKUs ni precios', async () => {
    const { service, audit } = buildService(readGrant);
    await service.exportPrices(['DPP_ORO_IVA'], ctx);
    const event = audit.log.mock.calls[0][0];
    expect(event).toMatchObject({ action: 'price-list-export', entity: 'PRICE_EXPORT', entityId: 'catalog' });
    expect(event.newValues.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(event)).not.toMatch(/SKU-A|100000/);
  });
});

describe('buildOfficialPriceTemplate — plantilla oficial sin lista', () => {
  it('tiene la hoja PLANTILLA, encabezados legibles con IVA y la guía', () => {
    const wb = XLSX.read(buildOfficialPriceTemplate(LEGACY_TARIFFS), { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['PLANTILLA', 'INSTRUCCIONES']);
    expect(XLSX.utils.sheet_to_json<string[]>(wb.Sheets.PLANTILLA, { header: 1 })[0]).toEqual([
      'REFERENCIA *', 'PRECIO INSTALADOR (CON IVA)', 'PRECIO TIENDA (CON IVA)', 'PRECIO DPP ORO (CON IVA)',
      'PRECIO DPP PLATINO (CON IVA)', 'PRECIO CLIENTE FINAL (CON IVA)',
    ]);
    expect(XLSX.utils.sheet_to_json<string[]>(wb.Sheets.INSTRUCCIONES, { header: 1 }).length).toBeGreaterThan(3);
  });

  it('ida y vuelta: el lector acepta el archivo descargado con filas ficticias rellenas', () => {
    const wb = XLSX.read(buildOfficialPriceTemplate(LEGACY_TARIFFS), { type: 'buffer' });
    XLSX.utils.sheet_add_aoa(wb.Sheets.PLANTILLA, [
      ['FIXTURE-A(2.8mm)', 1190.4, 1000, 900, 800, 1500],
      ['FIXTURE-B', 2000, null, null, null, 3000],
    ], { origin: 'A2' });
    const filled = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
    const parsed = readLegacy(filled);
    expect(parsed.tariffs).toEqual(LEGACY_TARIFF_CODES);
    expect(parsed.ignoredColumns).toEqual([]);
    expect(parsed.rows.map((r) => [r.sku, r.status])).toEqual([['FIXTURE-A(2.8mm)', 'valid'], ['FIXTURE-B', 'valid']]);
  });

  it('el archivo vacío descargado se rechaza con un mensaje claro, no con un error técnico', () => {
    expect(() => readLegacy(buildOfficialPriceTemplate(LEGACY_TARIFFS))).toThrow(/vacía/);
  });

  it('la guía explica el precio único: una sola columna, sin mezclarla con las de escalafón', () => {
    const wb = XLSX.read(buildOfficialPriceTemplate(LEGACY_TARIFFS), { type: 'buffer' });
    const guide = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.INSTRUCCIONES, { header: 1 }).map((line) => line.join(' ')).join('\n');
    expect(guide).toContain('PRECIO UNICO (CON IVA)');
    expect(guide).toMatch(/No las mezcles/);
  });
});

describe('buildSinglePriceTemplate — plantilla de precio único sin lista', () => {
  it('tiene la hoja PLANTILLA con REFERENCIA y una sola columna de precio, y la guía', () => {
    const wb = XLSX.read(buildSinglePriceTemplate(), { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['PLANTILLA', 'INSTRUCCIONES']);
    expect(XLSX.utils.sheet_to_json<string[]>(wb.Sheets.PLANTILLA, { header: 1 })[0]).toEqual(['REFERENCIA *', 'PRECIO UNICO (CON IVA)']);
    const guide = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.INSTRUCCIONES, { header: 1 }).map((line) => line.join(' ')).join('\n');
    expect(guide).toContain('PRECIO UNICO (CON IVA)');
    expect(guide).toMatch(/no un precio de venta/);
  });

  it('ida y vuelta: el lector lo acepta como precio único con filas ficticias rellenas', () => {
    const wb = XLSX.read(buildSinglePriceTemplate(), { type: 'buffer' });
    XLSX.utils.sheet_add_aoa(wb.Sheets.PLANTILLA, [['FIXTURE-A(2.8mm)', 1190.4], ['FIXTURE-B', 2000]], { origin: 'A2' });
    const filled = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
    const parsed = readLegacy(filled);
    expect(parsed.singlePrice).toBe(true);
    expect(parsed.tariffs).toEqual(LEGACY_TARIFF_CODES);
    expect(parsed.rows.map((r) => [r.sku, r.status, r.prices.length])).toEqual([['FIXTURE-A(2.8mm)', 'valid', 5], ['FIXTURE-B', 'valid', 5]]);
  });

  it('el archivo vacío descargado se rechaza con un mensaje claro', () => {
    expect(() => readLegacy(buildSinglePriceTemplate())).toThrow(/vacía/);
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

  it('la variante de precio único usa su propio nombre y modo en la auditoría, con el mismo permiso', async () => {
    const audit = { log: jest.fn().mockResolvedValue({}) };
    const service = new PriceImportService({} as any, { isListasAdmin: jest.fn().mockReturnValue(true) } as any, audit as any, { grantsForUser: jest.fn().mockResolvedValue([]) } as any);
    const { buffer, fileName } = await service.downloadOfficialTemplate({ userId: 'u-1', roles: ['Super Admin'] }, { singlePrice: true });
    expect(fileName).toMatch(/^plantilla-precio-unico-grupo-security-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(XLSX.utils.sheet_to_json<string[]>(XLSX.read(buffer, { type: 'buffer' }).Sheets.PLANTILLA, { header: 1 })[0]).toEqual(['REFERENCIA *', 'PRECIO UNICO (CON IVA)']);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      entity: 'PRICE_TEMPLATE', result: 'SUCCESS', newValues: { mode: 'oficial-precio-unico', fileHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
    }));
    // Sin la opción, la descarga sigue siendo la oficial por escalafón.
    const official = await service.downloadOfficialTemplate({ userId: 'u-1', roles: ['Super Admin'] }, {});
    expect(official.fileName).toMatch(/^plantilla-precios-grupo-security-/);
  });

  it('con prices:preview global lo descarga un cargo que antes estaba rechazado (Vendedor); con cero concesiones, ninguno', async () => {
    const audit = { log: jest.fn().mockResolvedValue({}) };
    const withGrant = new PriceImportService({} as any, {} as any, audit as any, { grantsForUser: jest.fn().mockResolvedValue([{ sourceId: 's-1', actionId: 'prices:preview', scope: 'global' }, { sourceId: 's-2', actionId: 'prices:read', scope: 'global' }, { sourceId: 's-3', actionId: 'listas:read', scope: 'global' }]) } as any);
    await expect(withGrant.downloadOfficialTemplate({ userId: 'u-9', roles: ['Vendedor'] })).resolves.toMatchObject({ fileName: expect.stringMatching(/^plantilla-precios-grupo-security-/) });
    const none = new PriceImportService({} as any, {} as any, audit as any, { grantsForUser: jest.fn().mockResolvedValue([]) } as any);
    for (const role of ['Admin Comercial', 'Supervisor', 'Vendedor']) {
      await expect(none.downloadOfficialTemplate({ userId: 'u-9', roles: [role] })).rejects.toThrow(ForbiddenException);
      await expect(none.downloadOfficialTemplate({ userId: 'u-9', roles: [role] }, { singlePrice: true })).rejects.toThrow(ForbiddenException);
    }
  });

  it('ambas variantes exigen prices:preview: sin esa concesión no se descarga ni se audita nada', async () => {
    const audit = { log: jest.fn().mockResolvedValue({}) };
    const grants = { grantsForUser: jest.fn().mockResolvedValue([{ sourceId: 's-1', actionId: 'listas:read', scope: 'global' }]) };
    const service = new PriceImportService({} as any, { isListasAdmin: jest.fn().mockReturnValue(false) } as any, audit as any, grants as any);
    const caller = { userId: 'u-1', roles: ['Supervisor'] };
    await expect(service.downloadOfficialTemplate(caller)).rejects.toThrow(ForbiddenException);
    await expect(service.downloadOfficialTemplate(caller, { singlePrice: true })).rejects.toThrow(ForbiddenException);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
