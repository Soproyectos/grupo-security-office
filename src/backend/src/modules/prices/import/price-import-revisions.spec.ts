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
import { createGrantsProvider, createPriceImportFake } from './price-import.test-helpers';

const LISTA_A = '00000000-0000-4000-8000-0000000000a1';
const LISTA_B = '00000000-0000-4000-8000-0000000000b2';
const ctx: AccessContext = { userId: 'fixture-actor', roles: ['Admin Comercial'] };
const other: AccessContext = { userId: 'fixture-other', roles: ['Admin Comercial'] };
const storageDir = path.join(os.tmpdir(), 'gs-imp04-test-storage');
const ACTIONS = ['prices:save', 'prices:preview', 'prices:read', 'prices:apply', 'listas:read'];

function file(rows: unknown[][] = [['SKU-A', 100.5]]): Express.Multer.File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'ORO_IVA'], ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía ficticia']]), 'INSTRUCCIONES');
  return { originalname: 'fixture-precios.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) } as Express.Multer.File;
}

describe('IMP-04 — revisión de precios guardada y recuperable (listas mixtas)', () => {
  let fake: ReturnType<typeof createPriceImportFake>;
  let service: PriceImportService;
  let acl: any;
  let grants: ReturnType<typeof createGrantsProvider>;
  const serviceFor = (g: ReturnType<typeof createGrantsProvider>) =>
    new PriceImportService(fake.prisma as PrismaService, acl as AclService, fake.audit as unknown as AuditService, g as any);

  beforeAll(async () => {
    process.env.PRICE_IMPORT_STORAGE_DIR = storageDir;
    await fs.rm(storageDir, { recursive: true, force: true });
  });
  afterAll(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
    delete process.env.PRICE_IMPORT_STORAGE_DIR;
  });

  beforeEach(() => {
    fake = createPriceImportFake({
      listas: [{ id: LISTA_A, code: 'LA', name: 'Lista Alfa' }, { id: LISTA_B, code: 'LB', name: 'Lista Beta Secreta' }],
      products: [
        { id: 'product-a', sku: 'SKU-A', listaId: LISTA_A },
        { id: 'product-b', sku: 'SKU-B', listaId: LISTA_B },
        { id: 'product-free', sku: 'SKU-FREE', listaId: null },
      ],
      tariffs: [{ id: 'tariff-oro', code: 'ORO_IVA' }],
      prices: [
        { productId: 'product-a', priceListId: 'tariff-oro', value: 90 },
        { productId: 'product-b', priceListId: 'tariff-oro', value: 500 },
      ],
    });
    acl = { assertListaAccess: jest.fn().mockResolvedValue(undefined), isListasAdmin: jest.fn().mockReturnValue(false) };
    grants = createGrantsProvider();
    grants.grantOnLista(LISTA_A, ...ACTIONS);
    grants.grantOnLista(LISTA_B, ...ACTIONS);
    service = serviceFor(grants);
  });

  it('guarda la revisión (cabecera + filas + precios) sin tocar Price ni identidad y con listaId nulo', async () => {
    const header = await service.saveRevision(file(), 'key-12345678', ctx);
    expect(header).toMatchObject({ id: 'rev-1', listaId: null, status: 'GUARDADA', currency: 'COP', rounding: 'HALF_UP' });
    expect(header.fileAvailable).toBe(true);
    expect(fake.prisma.priceImportRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ listaId: null, idempotencyKey: 'key-12345678', createdById: ctx.userId, currency: 'COP' }),
    }));
    expect(fake.state.revisionRows[0]).toMatchObject({ rowNumber: 2, sku: 'SKU-A', status: 'valid', productId: 'product-a', listaId: LISTA_A, resolution: null });
    expect(fake.state.revisionPrices[0]).toMatchObject({
      tariffCode: 'ORO_IVA', receivedValue: '100.5', roundedValue: '101', previousValue: '90', change: 'changed', productId: 'product-a', largeChange: false,
    });
    expect(fake.prisma.price.create).not.toHaveBeenCalled();
    expect(fake.prisma.price.update).not.toHaveBeenCalled();
    expect(fake.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'price-import-revision-save', entity: 'Price', entityId: 'rev-1' }));
  });

  it('ignora cualquier lista destino y guarda la lista de cada fila, también la de filas rechazadas (solo interna)', async () => {
    grants.revoke('prices:read');
    grants.grantOnLista(LISTA_A, 'prices:read');
    const mixed = file([['SKU-A', 100], ['SKU-B', 600], ['NO-SUCH', 5], ['SKU-FREE', 7]]);
    const header = await service.saveRevision(mixed, 'key-mixed-001', ctx);
    expect(header.listaId).toBeNull();
    const byRow = new Map(fake.state.revisionRows.map((r) => [r.sku, r]));
    expect(byRow.get('SKU-A')).toMatchObject({ status: 'valid', listaId: LISTA_A, productId: 'product-a' });
    expect(byRow.get('SKU-B')).toMatchObject({ status: 'error', listaId: LISTA_B, productId: 'product-b' });
    expect(byRow.get('SKU-B')!.issues[0].code).toBe('LISTA_FORBIDDEN');
    expect(byRow.get('NO-SUCH')).toMatchObject({ status: 'error', productId: null, listaId: null, resolution: 'PENDING_PRODUCT' });
    expect(byRow.get('SKU-FREE')).toMatchObject({ status: 'error', productId: 'product-free', listaId: null });
    expect(header.summary).toMatchObject({ validRows: 1, rejectedRows: 3, unknownRows: 1, rowsInInaccessibleListas: 2 });
  });

  it('guardar dos veces con la misma clave, archivo y persona no duplica (idempotencia)', async () => {
    await service.saveRevision(file(), 'key-12345678', ctx);
    const second = await service.saveRevision(file(), 'key-12345678', ctx);
    expect(second.id).toBe('rev-1');
    expect(fake.prisma.priceImportRevision.create).toHaveBeenCalledTimes(1);
  });

  it('la misma clave y archivo de OTRA persona produce 409 y nunca la cabecera ajena', async () => {
    await service.saveRevision(file(), 'key-12345678', ctx);
    await expect(service.saveRevision(file(), 'key-12345678', other)).rejects.toThrow(ConflictException);
    expect(fake.prisma.priceImportRevision.create).toHaveBeenCalledTimes(1);
  });

  it('misma clave con otro contenido produce 409', async () => {
    await service.saveRevision(file(), 'key-12345678', ctx);
    await expect(service.saveRevision(file([['SKU-A', 999]]), 'key-12345678', ctx)).rejects.toThrow(ConflictException);
  });

  it('exige una clave de idempotencia válida y el archivo', async () => {
    await expect(service.saveRevision(file(), 'corta', ctx)).rejects.toThrow(BadRequestException);
    await expect(service.saveRevision(undefined, 'key-12345678', ctx)).rejects.toThrow(BadRequestException);
  });

  it('sin concesión prices:save deniega el guardado (403)', async () => {
    grants.revoke('prices:save');
    await expect(service.saveRevision(file(), 'key-12345678', ctx)).rejects.toThrow(ForbiddenException);
    expect(fake.prisma.priceImportRevision.create).not.toHaveBeenCalled();
  });

  it('guarda el porcentaje y la alerta de cambio grande, y acota un cambio extremo a DECIMAL(9,2)', async () => {
    await service.saveRevision(file([['SKU-A', 200]]), 'key-large-001', ctx);
    expect(fake.state.revisionPrices[0]).toMatchObject({ changePercent: '122.22', largeChange: true });
    fake.state.prices[0].value = 1;
    await service.saveRevision(file([['SKU-A', 99999999]]), 'key-extreme-1', ctx);
    expect(fake.state.revisionPrices[1].changePercent).toBe('9999999.99');
    expect(fake.state.revisionPrices[1].largeChange).toBe(true);
  });

  describe('lecturas', () => {
    const seedMixed = async () => {
      await service.saveRevision(file([['SKU-A', 100], ['SKU-B', 600], ['NO-SUCH', 5]]), 'key-mixed-001', ctx);
    };

    it('recupera una revisión por id reconstruyendo filas, listas y precios', async () => {
      await seedMixed();
      const detail = await service.getRevision('rev-1', 1, 100, ctx);
      expect(detail).toMatchObject({ id: 'rev-1', totalRows: 3, page: 1, rowsInInaccessibleListas: 0 });
      expect(detail.rows[0]).toMatchObject({ row: 2, sku: 'SKU-A', status: 'valid', listaId: LISTA_A, listaState: 'LISTA' });
      expect(detail.rows[0].prices[0]).toMatchObject({ code: 'ORO_IVA', raw: '100', rounded: '100', previous: '90', change: 'changed', largeChange: false });
      expect(detail.rows[2]).toMatchObject({ sku: 'NO-SUCH', listaState: 'UNKNOWN', resolution: 'PENDING_PRODUCT' });
      expect(detail.byLista).toEqual(expect.arrayContaining([
        { listaId: LISTA_A, code: 'LA', name: 'Lista Alfa', rows: 1, prices: 1 },
        { listaId: LISTA_B, code: 'LB', name: 'Lista Beta Secreta', rows: 1, prices: 1 },
      ]));
    });

    it('NUNCA devuelve filas, precios ni nombres de listas sin prices:read: solo la cuenta', async () => {
      await seedMixed();
      const onlyA = createGrantsProvider();
      onlyA.grantOnLista(LISTA_A, ...ACTIONS);
      const detail = await serviceFor(onlyA).getRevision('rev-1', 1, 100, other);
      expect(detail.rowsInInaccessibleListas).toBe(1);
      expect(detail.totalRows).toBe(2);
      expect(detail.rows.map((r) => r.sku)).toEqual(['SKU-A', 'NO-SUCH']);
      expect(detail.byLista.map((l) => l.listaId)).toEqual([LISTA_A]);
      expect(detail.summary.byLista!.map((l) => l.listaId)).toEqual([LISTA_A]);
      expect(detail.summary.rowsInInaccessibleListas).toBe(1);
      const body = JSON.stringify(detail);
      expect(body).not.toMatch(/Lista Beta|SKU-B|product-b|LB"/);
      expect(body).not.toContain(LISTA_B);
    });

    it('niega (403) a quien no es el creador y no ve ninguna lista de la revisión', async () => {
      await service.saveRevision(file([['SKU-A', 100], ['SKU-B', 600]]), 'key-mixed-002', ctx);
      const nobody = createGrantsProvider();
      nobody.grant('prices:read', 'listas:read');
      // Global grants would see everything; a grant on another lista sees nothing here.
      const stranger = createGrantsProvider();
      stranger.grantOnLista('00000000-0000-4000-8000-0000000000c3', ...ACTIONS);
      await expect(serviceFor(stranger).getRevision('rev-1', 1, 100, other)).rejects.toThrow(ForbiddenException);
      expect((await serviceFor(nobody).getRevision('rev-1', 1, 100, other)).totalRows).toBe(2);
      expect((await serviceFor(stranger).getRevision('rev-1', 1, 100, ctx)).rows).toEqual([]);
    });

    it('sigue leyendo una revisión heredada de una sola lista (sin instantánea por fila)', async () => {
      fake.state.revisions.push({
        id: 'legacy-1', listaId: LISTA_A, createdById: 'someone', status: 'APLICADA', fileName: 'old.xlsx', fileHash: 'h', fileSize: 1,
        idempotencyKey: 'k-legacy', policyVersion: 'p', parserVersion: 'v', trailerVersion: null, tariffs: [], summary: { rows: 1 },
        createdAt: new Date(), appliedAt: new Date(), appliedResult: { revisionId: 'legacy-1', status: 'APLICADA', alreadyApplied: false, appliedRows: 1, appliedPrices: 1, tariffs: ['ORO_IVA'], appliedAt: 'x' },
      });
      fake.state.revisionRows.push({ revisionId: 'legacy-1', rowNumber: 2, sku: 'SKU-A', status: 'valid', issues: [] });
      fake.state.revisionPrices.push({ revisionId: 'legacy-1', rowNumber: 2, sku: 'SKU-A', tariffCode: 'ORO_IVA', receivedValue: '100', roundedValue: '100', previousValue: '90', difference: '10', wasRounded: false, change: 'changed' });
      const detail = await service.getRevision('legacy-1', 1, 100, ctx);
      expect(detail).toMatchObject({ listaId: LISTA_A, totalRows: 1, appliedResult: { appliedPrices: 1 } });
      expect(detail.rows[0]).toMatchObject({ sku: 'SKU-A', listaId: LISTA_A, listaState: 'LISTA' });
      expect(detail.rows[0].prices[0]).toMatchObject({ code: 'ORO_IVA', previous: '90', changePercent: null, largeChange: false });
      expect(acl.assertListaAccess).toHaveBeenCalledWith(LISTA_A, ctx, 'view_prices');
    });

    it('tolera page/pageSize ausentes o inválidos y pagina en servidor', async () => {
      await seedMixed();
      const first = await service.getRevision('rev-1', Number(undefined), Number(undefined), ctx);
      expect(first).toMatchObject({ page: 1, pageSize: 100 });
      const paged = await service.getRevision('rev-1', 2, 2, ctx);
      expect(paged.rows.map((r) => r.sku)).toEqual(['NO-SUCH']);
      expect(paged.totalRows).toBe(3);
    });

    it('no consulta una revisión heredada de una lista fuera de alcance (403)', async () => {
      fake.state.revisions.push({ id: 'rev-x', listaId: LISTA_B, status: 'GUARDADA', fileName: 'x.xlsx', fileHash: 'h', fileSize: 1, idempotencyKey: 'k', policyVersion: 'p', parserVersion: 'v', trailerVersion: null, tariffs: [], summary: {}, createdById: null, createdAt: new Date() });
      acl.assertListaAccess.mockRejectedValue(new ForbiddenException('ajena'));
      await expect(service.getRevision('rev-x', 1, 100, ctx)).rejects.toThrow(ForbiddenException);
    });

    it('404 cuando la revisión no existe', async () => {
      await expect(service.getRevision('nope', 1, 100, ctx)).rejects.toThrow(NotFoundException);
    });

    it('lista las revisiones con filas en la lista y las heredadas por revision.listaId, con cabeceras saneadas', async () => {
      await seedMixed();
      await service.saveRevision(file([['SKU-B', 600]]), 'key-only-b-01', ctx);
      const page = await service.listRevisions(LISTA_A, 1, 25, ctx);
      expect(fake.prisma.priceImportRevision.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { OR: [{ listaId: LISTA_A }, { rows: { some: { listaId: LISTA_A } } }] },
      }));
      expect(page.items.map((r) => r.id)).toEqual(['rev-1']);
      const onlyA = createGrantsProvider();
      onlyA.grantOnLista(LISTA_A, ...ACTIONS);
      const sanitized = await serviceFor(onlyA).listRevisions(LISTA_A, 1, 25, ctx);
      expect(JSON.stringify(sanitized)).not.toMatch(/Lista Beta/);
      expect(sanitized.items[0].summary.rowsInInaccessibleListas).toBe(1);
    });

    it('sin concesión prices:read no se consulta el historial de la lista (403)', async () => {
      grants.revoke('prices:read');
      await expect(service.listRevisions(LISTA_A, 1, 25, ctx)).rejects.toThrow(ForbiddenException);
    });

    it('el historial de una lista ajena no se lista (403)', async () => {
      acl.assertListaAccess.mockRejectedValue(new ForbiddenException('ajena'));
      await expect(service.listRevisions(LISTA_B, 1, 25, ctx)).rejects.toThrow(ForbiddenException);
    });

    it('el archivo de una revisión mixta solo lo baja su creador o quien ve todas sus listas; 404 si ya no está', async () => {
      await seedMixed();
      expect((await service.getRevisionFile('rev-1', ctx)).fileName).toBe('fixture-precios.xlsx');
      const onlyA = createGrantsProvider();
      onlyA.grantOnLista(LISTA_A, ...ACTIONS);
      await expect(serviceFor(onlyA).getRevisionFile('rev-1', other)).rejects.toThrow(ForbiddenException);
      expect((await serviceFor(grants).getRevisionFile('rev-1', other)).buffer.length).toBeGreaterThan(0);
      fake.state.revisions[0].fileHash = 'hash-inexistente-en-disco';
      await expect(service.getRevisionFile('rev-1', ctx)).rejects.toThrow(NotFoundException);
    });

    it('el archivo de una revisión heredada de una lista ajena no se descarga (403)', async () => {
      fake.state.revisions.push({ id: 'legacy-2', listaId: LISTA_B, status: 'GUARDADA', fileName: 'x.xlsx', fileHash: 'h', fileSize: 1, idempotencyKey: 'k2', policyVersion: 'p', parserVersion: 'v', trailerVersion: null, tariffs: [], summary: {}, createdById: null, createdAt: new Date() });
      acl.assertListaAccess.mockRejectedValue(new ForbiddenException('ajena'));
      await expect(service.getRevisionFile('legacy-2', ctx)).rejects.toThrow(ForbiddenException);
    });

    it('descarta una revisión pendiente y bloquea descartar una ya aplicada', async () => {
      await seedMixed();
      const discarded = await service.discardRevision('rev-1', ctx);
      expect(discarded.status).toBe('DESCARTADA');
      fake.state.revisions[0].status = 'APLICADA';
      await expect(service.discardRevision('rev-1', ctx)).rejects.toThrow(ConflictException);
    });

    it('descartar una revisión mixta exige ser su creador o ver todas sus listas', async () => {
      await seedMixed();
      const onlyA = createGrantsProvider();
      onlyA.grantOnLista(LISTA_A, ...ACTIONS);
      await expect(serviceFor(onlyA).discardRevision('rev-1', other)).rejects.toThrow(ForbiddenException);
    });
  });
});
