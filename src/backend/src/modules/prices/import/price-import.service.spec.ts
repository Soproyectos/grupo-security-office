jest.mock('../../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { createHash } from 'crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { AclService, AccessContext } from '../../../common/acl/acl.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { PriceImportService, computeImportFileHash } from './price-import.service';
import { buildPriceTemplate } from './price-template';
import { LEGACY_TARIFFS, LEGACY_TARIFF_CODES, createGrantsProvider, createPriceImportFake, type PriceImportFakeSeed } from './price-import.test-helpers';

const LISTA_A = '00000000-0000-4000-8000-0000000000a1';
const LISTA_B = '00000000-0000-4000-8000-0000000000b2';
const ctx: AccessContext = { userId: 'fixture-actor', roles: ['Consulta'] };
// `listas:read` still travels with the prices actions only because the (unchanged) action catalog lists it as a
// dependency of `prices:read`; the service itself no longer requires it (next slice drops it from the catalog).
const PREVIEW_ACTIONS = ['prices:preview', 'prices:read', 'listas:read'];

function file(rows: unknown[][] = [['SKU-A', 100.5]], headers = ['REFERENCIA', 'DPP_ORO_IVA']): Express.Multer.File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía ficticia']]), 'INSTRUCCIONES');
  return { originalname: 'fixture-precios.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) } as Express.Multer.File;
}

const baseSeed = (): PriceImportFakeSeed => ({
  listas: [{ id: LISTA_A, code: 'LA', name: 'Lista Alfa' }, { id: LISTA_B, code: 'LB', name: 'Lista Beta Secreta' }],
  products: [
    { id: 'product-a', sku: 'SKU-A', listaId: LISTA_A },
    { id: 'product-b', sku: 'SKU-B', listaId: LISTA_B },
    { id: 'product-free', sku: 'SKU-FREE', listaId: null },
  ],
  tariffs: [{ id: 'tariff-oro', code: 'DPP_ORO_IVA', name: 'DPP Oro (con IVA)' }],
  prices: [
    { productId: 'product-a', priceListId: 'tariff-oro', value: 90 },
    { productId: 'product-b', priceListId: 'tariff-oro', value: 876543 },
    { productId: 'product-free', priceListId: 'tariff-oro', value: 50 },
  ],
});

/** `withGrants`: global panel grants for the preview actions; false = a user with no grants at all. */
function build(seed: PriceImportFakeSeed = baseSeed(), withGrants = true) {
  const fake = createPriceImportFake(seed);
  const grants = createGrantsProvider();
  if (withGrants) grants.grant(...PREVIEW_ACTIONS);
  const acl = { assertListaAccess: jest.fn().mockResolvedValue(undefined), isListasAdmin: jest.fn().mockReturnValue(false) };
  const service = new PriceImportService(fake.prisma as PrismaService, acl as unknown as AclService, fake.audit as unknown as AuditService, grants as any);
  return { ...fake, grants, acl, service };
}

describe('Read-only price preview over mixed listas (R1)', () => {
  it('compares rounded final IVA prices without changing stored data and without a destination lista', async () => {
    const { service, prisma, audit, state } = build();
    const before = JSON.stringify([state.prices, state.products]);
    const result = await service.preview(file(), ctx);
    expect(result).toMatchObject({ readOnly: true, taxIncluded: true, rounding: 'HALF_UP', listaId: null, summary: { validRows: 1, changedPrices: 1, roundedPrices: 1 } });
    expect(result.rows[0]).toMatchObject({ productId: 'product-a', listaId: LISTA_A, listaState: 'LISTA', status: 'valid' });
    expect(result.rows[0].prices[0]).toMatchObject({ raw: '100.5', rounded: '101', previous: '90', difference: '11', change: 'changed' });
    expect(prisma.lista.findMany).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.price.update).not.toHaveBeenCalled();
    expect(prisma.price.create).not.toHaveBeenCalled();
    expect(JSON.stringify([state.prices, state.products])).toBe(before);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'price-import-preview', result: 'SUCCESS', entity: 'Price' }));
    const event = JSON.stringify(audit.log.mock.calls[0][0]);
    expect(event).not.toContain('SKU-A');
    expect(event).not.toContain('100.5');
  });

  it('preserves legacy decimal previous values in the comparison without rounding them silently', async () => {
    const seed = baseSeed();
    seed.prices![0].value = '90.75';
    const { service } = build(seed);
    const result = await service.preview(file([['SKU-A', 100]]), ctx);
    expect(result.rows[0].prices[0]).toMatchObject({ previous: '90.75', difference: '9.25' });
  });

  it('distinguishes a new tariff price from an unchanged price', async () => {
    const seed = baseSeed();
    seed.prices = [];
    expect((await build(seed).service.preview(file(), ctx)).summary.newPrices).toBe(1);
    const unchanged = baseSeed();
    unchanged.prices![0].value = 101;
    expect((await build(unchanged).service.preview(file(), ctx)).summary.unchangedPrices).toBe(1);
  });

  it('matches one SKU in each of two old listas in the same file with the global grant; no lista names are looked up', async () => {
    const { service, prisma } = build();
    const result = await service.preview(file([['SKU-A', 100], ['SKU-B', 876544]]), ctx);
    expect(result.summary).toMatchObject({ rows: 2, validRows: 2, rejectedRows: 0, rowsInInaccessibleListas: 0 });
    expect(result.summary.byLista).toEqual(expect.arrayContaining([
      { listaId: LISTA_A, rows: 1, prices: 1 },
      { listaId: LISTA_B, rows: 1, prices: 1 },
    ]));
    expect(result.rows.map((r) => r.listaId)).toEqual([LISTA_A, LISTA_B]);
    expect(prisma.lista.findMany).not.toHaveBeenCalled();
  });

  it('one global grant covers products of any lista and products without lista (no per-lista scoping, no LISTA_FORBIDDEN)', async () => {
    const { service, acl } = build();
    const result = await service.preview(file([['SKU-A', 100], ['SKU-B', 777], ['SKU-FREE', 60]]), ctx);
    expect(result.rows.map((r) => r.status)).toEqual(['valid', 'valid', 'valid']);
    expect(result.rows[2]).toMatchObject({ productId: 'product-free', listaId: null, listaState: 'SIN_LISTA' });
    expect(result.summary).toMatchObject({ validRows: 3, errorRows: 0, rowsInInaccessibleListas: 0, unlistedRows: 1 });
    expect(JSON.stringify(result)).not.toMatch(/LISTA_FORBIDDEN|LISTA_UNAVAILABLE/);
    expect(acl.assertListaAccess).not.toHaveBeenCalled();
  });

  it('grants tied to one lista (or to one product) never open the preview: 403 before reading anything', async () => {
    const { service, grants, prisma } = build(baseSeed(), false);
    grants.grantOnLista(LISTA_A, ...PREVIEW_ACTIONS);
    await expect(service.preview(file(), ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.priceList.findMany).not.toHaveBeenCalled();
  });

  it.each([['Admin Comercial'], ['Supervisor'], ['Operador']])('the role %s without grants is denied (roles never grant)', async (role) => {
    const { service, prisma } = build(baseSeed(), false);
    await expect(service.preview(file(), { userId: 'fixture-actor', roles: [role] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.priceList.findMany).not.toHaveBeenCalled();
  });

  it('a Vendedor (role that used to be rejected) previews with the global grants alone', async () => {
    const { service } = build();
    const result = await service.preview(file(), { userId: 'fixture-actor', roles: ['Vendedor'] });
    expect(result.summary.validRows).toBe(1);
  });

  it('matches SKUs ignoring case and inner spaces (same rule as the unique index)', async () => {
    const seed = baseSeed();
    seed.products![0].sku = 'IDS-E04HQHI-D';
    const { service } = build(seed);
    const single = await service.preview(file([['ids-e04hqhi- d', 100]]), ctx);
    expect(single.rows[0]).toMatchObject({ status: 'valid', productId: 'product-a' });
    const upper = await service.preview(file([['IDS-E04HQHI-D', 100]]), ctx);
    expect(upper.rows[0]).toMatchObject({ status: 'valid', productId: 'product-a' });
  });

  it('does not exempt Admin Comercial from an explicit product restriction (the role grants nothing)', async () => {
    const seed = baseSeed();
    seed.restrictions = [{ userId: ctx.userId!, resourceType: 'PRODUCT', resourceId: 'product-a', isActive: false }];
    const { service } = build(seed);
    const result = await service.preview(file(), { userId: ctx.userId!, roles: ['Admin Comercial'] });
    expect(result.rows[0].issues[0].code).toBe('REFERENCE_UNAVAILABLE');
  });

  it('keeps the explicit product restriction before reading saved prices', async () => {
    const seed = baseSeed();
    seed.restrictions = [{ userId: ctx.userId!, resourceType: 'PRODUCT', resourceId: 'product-a', isActive: false }];
    const { service, prisma } = build(seed);
    const result = await service.preview(file(), ctx);
    expect(result.rows[0].issues[0].code).toBe('REFERENCE_UNAVAILABLE');
    expect(result.rows[0].prices[0].previous).toBeNull();
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('rejects ambiguous normalized matches rather than choosing one', async () => {
    const seed = baseSeed();
    seed.products!.push({ id: 'product-dup', sku: 'sku-a', listaId: LISTA_A });
    const { service, prisma } = build(seed);
    const result = await service.preview(file(), ctx);
    expect(result.rows[0].issues[0].code).toBe('AMBIGUOUS_REFERENCE');
    expect(result.rows[0].prices[0].previous).toBeNull();
    expect(result.rows[0].productId).toBeNull();
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('reports an unknown SKU as pending without blocking the rest of the file', async () => {
    const { service, prisma } = build();
    const result = await service.preview(file([['SKU-A', 100], ['NO-SUCH-SKU', 5]]), ctx);
    expect(result.rows[0].status).toBe('valid');
    expect(result.rows[1]).toMatchObject({ status: 'error', listaState: 'UNKNOWN', resolution: 'PENDING_PRODUCT', productId: null, prices: [{ previous: null, difference: null }] });
    expect(result.rows[1].issues[0].code).toBe('UNKNOWN_REFERENCE');
    expect(result.summary).toMatchObject({ validRows: 1, errorRows: 1, rejectedRows: 1, unknownRows: 1, prices: 1 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it.each([
    [[{ id: 'tariff-oro', code: 'DPP_ORO_IVA', isActive: false }]],
    [[{ id: 'tariff-oro', code: 'DPP_ORO_IVA', currency: 'USD' }]],
    [[{ id: 'tariff-oro', code: 'DPP_ORO_IVA', validUntil: new Date('2000-01-01') }]],
  ])('rejects an inactive, non-COP, or expired tariff without silently creating or aliasing it: %#', async (tariffs) => {
    const seed = baseSeed();
    seed.tariffs = tariffs as any;
    const { service, prisma } = build(seed);
    const result = await service.preview(file(), ctx);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'TARIFF_UNAVAILABLE', column: 'DPP_ORO_IVA' }));
    expect(result.rows[0].prices[0].previous).toBeNull();
    expect(result.summary.validRows).toBe(0);
    expect(prisma.priceList.create).toBeUndefined();
  });

  it.each([[[]], [[{ id: 'wrong-tariff', code: 'ORO_IVA' }]]])('does not recognize an absent or aliased tariff: %#', async (tariffs) => {
    const seed = baseSeed();
    seed.tariffs = tariffs as any;
    const { service, prisma } = build(seed);
    await expect(service.preview(file(), ctx)).rejects.toThrow(/no es una tarifa de la plantilla/);
    expect(prisma.price.create).not.toHaveBeenCalled();
  });

  it.each([{ listaId: LISTA_B, currency: 'COP' }, { listaId: LISTA_A, currency: 'USD' }])('does not reveal a saved price with inconsistent list/currency: %p', async (stored) => {
    const seed = baseSeed();
    Object.assign(seed.prices![0], stored, { value: 999 });
    const { service } = build(seed);
    const result = await service.preview(file(), ctx);
    expect(result.rows[0].issues[0].code).toBe('STORED_PRICE_MISMATCH');
    expect(result.rows[0].prices[0].previous).toBeNull();
    expect(JSON.stringify(result)).not.toContain('999');
  });

  it.each([
    { isActive: false }, { archivedAt: new Date() }, { deletionStatus: 'REQUESTED' }, { currency: 'USD' },
  ])('the state of the old lista never blocks a row (Listas no longer exist): %p', async (state) => {
    const seed = baseSeed();
    Object.assign(seed.listas![0], state);
    const admin = { userId: 'fixture-admin', roles: ['Super Admin'] };
    const { service, prisma } = build(seed);
    const result = await service.preview(file([['SKU-A', 100], ['SKU-B', 200]]), admin);
    expect(result.rows.map((r) => r.status)).toEqual(['valid', 'valid']);
    expect(prisma.lista.findMany).not.toHaveBeenCalled();
    expect(prisma.price.findMany.mock.calls[0][0].where.productId.in.sort()).toEqual(['product-a', 'product-b']);
  });

  it('lets a Super Admin match every lista and unlisted product without grants', async () => {
    const { service } = build(baseSeed(), false);
    const admin = { userId: 'fixture-admin', roles: ['Super Admin'] };
    const result = await service.preview(file([['SKU-A', 100], ['SKU-B', 200], ['SKU-FREE', 60]]), admin);
    expect(result.summary).toMatchObject({ validRows: 3, rowsInInaccessibleListas: 0, unlistedRows: 1 });
  });

  it('requires explicit actions before parsing and denies a caller without a grants service', async () => {
    const { service, grants, prisma } = build();
    grants.revoke('prices:preview');
    await expect(service.preview(file(), ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.priceList.findMany).not.toHaveBeenCalled();
    const noGrants = new PriceImportService(prisma, { isListasAdmin: () => false } as any, { log: jest.fn() } as any);
    await expect(noGrants.preview(file(), ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a missing or non-xlsx file', async () => {
    const { service } = build();
    await expect(service.preview(undefined, ctx)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.preview({ originalname: 'x.csv', buffer: Buffer.from('a') } as Express.Multer.File, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('authorizeProductsByLista', () => {
  it('uses one fresh grant snapshot; only GLOBAL grants count (a grant on one lista covers nothing)', async () => {
    const { service, grants } = build(baseSeed(), false);
    grants.grantOnLista(LISTA_A, 'prices:read', 'listas:read');
    const products = [{ id: 'product-a', listaId: LISTA_A }, { id: 'product-b', listaId: LISTA_B }, { id: 'product-free', listaId: null }];
    expect([...(await service.authorizeProductsByLista(products, ctx, ['prices:read']))]).toEqual([]);
    expect(grants.grantsForUser).toHaveBeenCalledTimes(1);
    grants.grant('prices:read', 'listas:read');
    expect([...(await service.authorizeProductsByLista(products, ctx, ['prices:read']))].sort()).toEqual(['product-a', 'product-b', 'product-free']);
  });

  it('requires every action on the same resource', async () => {
    const { service } = build();
    const products = [{ id: 'product-a', listaId: LISTA_A }];
    expect((await service.authorizeProductsByLista(products, ctx, ['prices:read', 'prices:apply'])).size).toBe(0);
  });
});

describe('R3 large price change alert (strictly above the threshold, up or down)', () => {
  const previewWithPrevious = async (previous: number | string | null, next: number | string) => {
    const seed = baseSeed();
    seed.prices = previous === null ? [] : [{ productId: 'product-a', priceListId: 'tariff-oro', value: previous }];
    return (await build(seed).service.preview(file([['SKU-A', next]]), ctx));
  };

  it.each([
    // previous, new, expected percent, flagged
    [10000, 13000, '30.00', false],
    [10000, 13001, '30.01', true],
    [10000, 7000, '-30.00', false],
    [10000, 6999, '-30.01', true],
    [10000, 10001, '0.01', false],
    ['90.75', 118, '30.03', true],
    ['90.75', 117, '28.93', false],
    [1000, 100000, '9900.00', true],
  ])('previous %s -> new %s is %s%% and flagged=%s', async (previous, next, percent, flagged) => {
    const result = await previewWithPrevious(previous, next);
    const price = result.rows[0].prices[0];
    expect(price.changePercent).toBe(percent);
    expect(price.largeChange).toBe(flagged);
    expect(result.summary.largeChangePrices).toBe(flagged ? 1 : 0);
    expect(result.summary.largeChangeThresholdPct).toBe(30);
    // A flagged change never blocks the row.
    expect(result.rows[0].status).toBe('valid');
  });

  it('flags any change from a zero previous price and reports no percent', async () => {
    const result = await previewWithPrevious(0, 500);
    expect(result.rows[0].prices[0]).toMatchObject({ previous: '0', change: 'changed', changePercent: null, largeChange: true });
  });

  it('does not flag new prices or unchanged prices', async () => {
    const fresh = await previewWithPrevious(null, 500);
    expect(fresh.rows[0].prices[0]).toMatchObject({ change: 'new', changePercent: null, largeChange: false });
    const same = await previewWithPrevious(500, 500);
    expect(same.rows[0].prices[0]).toMatchObject({ change: 'unchanged', changePercent: '0.00', largeChange: false });
  });

  it('flags a ratio of 30.004% even though it displays as 30.00 (comparison is on the exact value)', async () => {
    const result = await previewWithPrevious(1000000, 1300004);
    expect(result.rows[0].prices[0]).toMatchObject({ changePercent: '30.00', largeChange: true });
  });

  it('honors the configured threshold override', async () => {
    process.env.PRICE_IMPORT_LARGE_CHANGE_PCT = '10';
    try {
      const result = await previewWithPrevious(10000, 11001);
      expect(result.rows[0].prices[0].largeChange).toBe(true);
      expect(result.summary.largeChangeThresholdPct).toBe(10);
    } finally {
      delete process.env.PRICE_IMPORT_LARGE_CHANGE_PCT;
    }
  });

  it('does not report a percent for a hidden previous price (explicitly restricted product)', async () => {
    const seed = baseSeed();
    seed.restrictions = [{ userId: ctx.userId!, resourceType: 'PRODUCT', resourceId: 'product-b', isActive: false }];
    const { service } = build(seed);
    const result = await service.preview(file([['SKU-B', 1]]), ctx);
    expect(result.rows[0].prices[0]).toMatchObject({ previous: null, changePercent: null, largeChange: false });
  });
});

describe('Existing price rules keep holding through the preview (regression)', () => {
  it.each([[0], [-5], ['abc'], [1e25]])('rejects the price %p and never applies it', async (value) => {
    const { service } = build();
    const result = await service.preview(file([['SKU-A', value]]), ctx);
    expect(result.rows[0].status).toBe('error');
    expect(result.summary.validRows).toBe(0);
    expect(result.summary.prices).toBe(0);
  });

  it('keeps the current price when a configured tariff cell is blank (no price entry for that tariff)', async () => {
    const seed = baseSeed();
    seed.tariffs!.push({ id: 'tariff-tienda', code: 'TIENDA_IVA', name: 'Tienda (con IVA)' });
    const { service } = build(seed);
    const result = await service.preview(file([['SKU-A', 100, null]], ['REFERENCIA', 'DPP_ORO_IVA', 'TIENDA_IVA']), ctx);
    expect(result.rows[0].prices.map((p) => p.code)).toEqual(['DPP_ORO_IVA']);
  });

  it('rounds final COP prices half up to whole pesos', async () => {
    const { service } = build();
    const result = await service.preview(file([['SKU-A', 100.5]]), ctx);
    expect(result.rows[0].prices[0]).toMatchObject({ raw: '100.5', rounded: '101', wasRounded: true });
    const down = await service.preview(file([['SKU-A', 100.49]]), ctx);
    expect(down.rows[0].prices[0]).toMatchObject({ rounded: '100' });
  });

  it('template v3 keeps the header and tariff order of the agreed columns', () => {
    const buffer = buildPriceTemplate({ mode: 'vacias', tariffs: [...LEGACY_TARIFFS].reverse() });
    const book = XLSX.read(buffer, { type: 'buffer' });
    const header = XLSX.utils.sheet_to_json<string[]>(book.Sheets.PRECIOS, { header: 1 })[0];
    expect(header).toEqual(['REFERENCIA', ...[...LEGACY_TARIFFS].reverse().map((t) => t.name)]);
  });
});

describe('Single-price files (supplier without tariff tiers)', () => {
  const SINGLE = 'PRECIO UNICO (CON IVA)';
  const singleFile = (rows: unknown[][] = [['SKU-A', 100]]) => file(rows, ['REFERENCIA', SINGLE]);
  const rawHash = (f: Express.Multer.File) => createHash('sha256').update(f.buffer).digest('hex');
  const previewHash = (audit: { log: jest.Mock }) => audit.log.mock.calls[0][0].entityId as string;

  it('expands the price to every currently available tariff by default', async () => {
    const seed = baseSeed();
    seed.tariffs!.push({ id: 'tariff-tienda', code: 'TIENDA_IVA', name: 'Tienda (con IVA)' });
    const { service } = build(seed);
    const result = await service.preview(singleFile(), ctx);
    expect(result.singlePrice).toEqual({ tariffs: ['TIENDA_IVA', 'DPP_ORO_IVA'] });
    expect(result.rows[0].prices.map((p) => p.code)).toEqual(['TIENDA_IVA', 'DPP_ORO_IVA']);
    expect(result.rows[0].status).toBe('valid');
    expect(result.summary).toMatchObject({ rows: 1, validRows: 1, errorRows: 0 });
  });

  it('compares the expanded row with the stored price of the selected tariff', async () => {
    const { service } = build();
    const result = await service.preview(singleFile([['SKU-A', 100.5]]), ctx, { singlePriceTariffs: ['DPP_ORO_IVA'] });
    expect(result.singlePrice).toEqual({ tariffs: ['DPP_ORO_IVA'] });
    expect(result.rows[0]).toMatchObject({ status: 'valid', productId: 'product-a', listaId: LISTA_A });
    expect(result.rows[0].prices).toEqual([expect.objectContaining({ code: 'DPP_ORO_IVA', raw: '100.5', rounded: '101', previous: '90', difference: '11', change: 'changed' })]);
    expect(result.summary).toMatchObject({ validRows: 1, prices: 1, changedPrices: 1 });
    expect(result.issues).toEqual([]);
  });

  it('applies the 30% large-change flag per tariff to the expanded rows', async () => {
    const seed = baseSeed();
    seed.tariffs = [{ id: 'tariff-tienda', code: 'TIENDA_IVA' }, { id: 'tariff-final', code: 'CLIENTE_FINAL_IVA' }];
    seed.prices = [
      { productId: 'product-a', priceListId: 'tariff-tienda', value: 100 },
      { productId: 'product-a', priceListId: 'tariff-final', value: 1000 },
    ];
    const { service } = build(seed);
    const result = await service.preview(singleFile([['SKU-A', 110]]), ctx, { singlePriceTariffs: ['CLIENTE_FINAL_IVA', 'TIENDA_IVA'] });
    expect(result.rows[0].status).toBe('valid');
    expect(result.rows[0].prices).toEqual([
      expect.objectContaining({ code: 'TIENDA_IVA', previous: '100', difference: '10', changePercent: '10.00', largeChange: false }),
      expect.objectContaining({ code: 'CLIENTE_FINAL_IVA', previous: '1000', difference: '-890', changePercent: '-89.00', largeChange: true }),
    ]);
    expect(result.summary).toMatchObject({ prices: 2, largeChangePrices: 1, largeChangeThresholdPct: 30 });
  });

  it('applies the same global-grant authorization to the expanded rows (no per-lista scoping)', async () => {
    const { service } = build();
    const result = await service.preview(singleFile([['SKU-A', 100], ['SKU-B', 777]]), ctx, { singlePriceTariffs: ['DPP_ORO_IVA'] });
    expect(result.rows.map((r) => r.status)).toEqual(['valid', 'valid']);
    expect(result.rows[1]).toMatchObject({ productId: 'product-b', prices: [expect.objectContaining({ previous: '876543' })] });
    expect(JSON.stringify(result)).not.toMatch(/LISTA_FORBIDDEN|Lista Beta/);
  });

  it('a grant tied to one lista never opens the single-price preview', async () => {
    const { service, grants } = build(baseSeed(), false);
    grants.grantOnLista(LISTA_A, ...PREVIEW_ACTIONS);
    await expect(service.preview(singleFile(), ctx, { singlePriceTariffs: ['DPP_ORO_IVA'] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an empty selection without reading prices and checks authorization before tariff reads', async () => {
    const { service, grants, prisma } = build();
    await expect(service.preview(singleFile(), ctx, { singlePriceTariffs: [] })).rejects.toThrow(/Elige al menos un escalafón/);
    expect(prisma.priceList.findMany).toHaveBeenCalled();
    expect(prisma.price.create).not.toHaveBeenCalled();
    expect(prisma.price.update).not.toHaveBeenCalled();
    grants.revoke('prices:preview');
    prisma.priceList.findMany.mockClear();
    await expect(service.preview(singleFile(), ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.priceList.findMany).not.toHaveBeenCalled();
  });

  it('reports singlePrice null for a normal file, ignoring any selection', async () => {
    const { service } = build();
    const result = await service.preview(file(), ctx, { singlePriceTariffs: ['TIENDA_IVA'] });
    expect(result.singlePrice).toBeNull();
    expect(result.rows[0].prices.map((p) => p.code)).toEqual(['DPP_ORO_IVA']);
  });

  it('keeps the sha256 of the bytes as the file hash of a normal file, whatever selection is sent', async () => {
    const { service, audit } = build();
    const normal = file();
    await service.preview(normal, ctx, { singlePriceTariffs: ['TIENDA_IVA'] });
    expect(previewHash(audit)).toBe(rawHash(normal));
  });

  it('gives the same single-price bytes a different file hash for each selection (order does not matter)', async () => {
    const f = singleFile();
    const seed = baseSeed();
    seed.tariffs!.push({ id: 'tariff-tienda', code: 'TIENDA_IVA', name: 'Tienda (con IVA)' });
    const hashes = new Set<string>();
    for (const selection of [undefined, ['DPP_ORO_IVA'], ['TIENDA_IVA', 'DPP_ORO_IVA'], ['DPP_ORO_IVA', 'TIENDA_IVA']] as const) {
      const { service, audit } = build(seed);
      await service.preview(f, ctx, selection ? { singlePriceTariffs: selection } : {});
      hashes.add(previewHash(audit));
    }
    // The default selects both configured tariffs; the one-tariff selection has a distinct hash.
    expect(hashes.size).toBe(2);
    expect(hashes.has(rawHash(f))).toBe(false);
  });

  it('computeImportFileHash: raw hash for normal files; sorted selection folded in for single price', () => {
    const buffer = Buffer.from('fixture');
    const raw = createHash('sha256').update(buffer).digest('hex');
    const all = computeImportFileHash(buffer, { tariffs: LEGACY_TARIFF_CODES });
    const some = computeImportFileHash(buffer, { tariffs: ['TIENDA_IVA', 'CLIENTE_FINAL_IVA'] });
    expect(computeImportFileHash(buffer, null)).toBe(raw);
    expect(new Set([raw, all, some]).size).toBe(3);
    expect(computeImportFileHash(buffer, { tariffs: ['CLIENTE_FINAL_IVA', 'TIENDA_IVA'] })).toBe(some);
    expect(some).toMatch(/^[a-f0-9]{64}$/);
  });
});
