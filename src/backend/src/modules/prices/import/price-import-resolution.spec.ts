jest.mock('../../../prisma/prisma.service', () => ({ PrismaService: class {} }));
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { AccessContext } from '../../../common/acl/acl.service';
import { AuditService } from '../../audit/audit.service';
import { PUBLIC_CATALOG_VISIBILITY } from '../../products/public-catalog-visibility';
import { ProductChangeService } from '../../products/product-change.service';
import { ProductsService } from '../../products/products.service';
import { PriceImportResolutionService } from './price-import-resolution.service';
import { PriceImportService } from './price-import.service';
import { createGrantsProvider, createPriceImportFake } from './price-import.test-helpers';

const LISTA = '00000000-0000-4000-8000-0000000000a1';
const ctx: AccessContext = { userId: 'fixture-actor', roles: ['Admin Comercial'] };
const storageDir = path.join(os.tmpdir(), 'gs-b3-resolution-test-storage');
const LISTA_ACTIONS = ['prices:save', 'prices:preview', 'prices:read', 'prices:apply', 'listas:read'];

function file(rows: unknown[][]): Express.Multer.File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['REFERENCIA', 'DPP_ORO_IVA'], ...rows]), 'PRECIOS');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía ficticia']]), 'INSTRUCCIONES');
  return { originalname: 'fixture-precios.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) } as Express.Multer.File;
}

describe('R2 — resolución de referencias desconocidas', () => {
  let fake: ReturnType<typeof createPriceImportFake>;
  let grants: ReturnType<typeof createGrantsProvider>;
  let imports: PriceImportService;
  let resolution: PriceImportResolutionService;
  let key = 0;

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
      listas: [{ id: LISTA, code: 'LA', name: 'Lista Alfa' }],
      products: [{ id: 'product-a', sku: 'SKU-A', listaId: LISTA }],
      tariffs: [{ id: 'tariff-oro', code: 'DPP_ORO_IVA' }],
      prices: [{ productId: 'product-a', priceListId: 'tariff-oro', value: 90, listaId: LISTA }],
      brands: [{ id: 'brand-1', name: 'Marca' }, { id: 'brand-none', name: 'Sin marca' }],
      categories: [{ id: 'cat-1', name: 'Cat' }, { id: 'cat-none', name: 'Sin categoría' }],
    });
    grants = createGrantsProvider();
    grants.grantOnLista(LISTA, ...LISTA_ACTIONS);
    grants.grant(...LISTA_ACTIONS, 'products:read', 'products:write'); // GLOBAL, with the dependency chain
    const acl: any = { assertListaAccess: jest.fn().mockResolvedValue(undefined), isListasAdmin: jest.fn().mockReturnValue(false) };
    const audit = fake.audit as unknown as AuditService;
    const changes = new ProductChangeService(fake.prisma, acl, grants as any);
    imports = new PriceImportService(fake.prisma, acl, audit, grants as any, changes);
    const products = new ProductsService(fake.prisma, acl, audit, {} as never, undefined, grants as any, undefined, changes);
    resolution = new PriceImportResolutionService(fake.prisma, imports, products, changes, audit);
  });

  /** Saves and applies a revision whose unknown rows stay PENDING_PRODUCT. */
  async function appliedRevision(rows: unknown[][] = [['SKU-A', 100], ['New-1', 250], ['NEW-2', 300]], apply = true): Promise<string> {
    const id = (await imports.saveRevision(file(rows), `key-resolution-${String(++key).padStart(4, '0')}`, ctx)).id;
    if (apply) await imports.applyRevision(id, ctx, { acknowledgeRejectedRows: rows.length - 1 });
    return id;
  }
  const create = (rowNumber: number, over: Record<string, unknown> = {}) =>
    ({ rowNumber, action: 'CREATE' as const, name: ` Nombre ${rowNumber} `, brandId: 'brand-1', categoryId: 'cat-1', ...over });
  const rowOf = (n: number) => fake.state.revisionRows.find((r) => r.rowNumber === n)!;
  const unknownRows = () => fake.state.revisionRows.filter((r) => r.resolution === 'PENDING_PRODUCT');

  describe('GET unknown-references', () => {
    it('lists only UNKNOWN_REFERENCE rows with received prices, canCreate and the default brand/category', async () => {
      const id = await appliedRevision();
      const view = await resolution.listUnknownReferences(id, ctx);
      expect(view).toMatchObject({ revisionId: id, status: 'APLICADA', canCreate: true, total: 2, defaults: { brandId: 'brand-none', categoryId: 'cat-none' } });
      expect(view.items.map((i) => i.sku)).toEqual(['New-1', 'NEW-2']);
      expect(view.items[0]).toMatchObject({ canCreate: true, prices: [{ tariffCode: 'DPP_ORO_IVA', received: '250', value: '250' }] });
    });

    it('reports canCreate=false without GLOBAL products:write + prices:apply, and still lists for prices:read', async () => {
      const id = await appliedRevision();
      grants.revoke('products:write');
      const view = await resolution.listUnknownReferences(id, ctx);
      expect(view.canCreate).toBe(false);
      expect(view.items.every((i) => !i.canCreate)).toBe(true);
    });

    it('requires prices:read: a caller without it is refused', async () => {
      const id = await appliedRevision();
      grants.grants.splice(0, grants.grants.length);
      await expect(resolution.listUnknownReferences(id, ctx)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('never exposes LISTA_FORBIDDEN rows (they are not pending products)', async () => {
      fake.state.products.push({ id: 'product-x', sku: 'SKU-X', listaId: 'lista-secret' });
      const id = await appliedRevision([['SKU-A', 100], ['SKU-X', 5], ['New-1', 250]]);
      const view = await resolution.listUnknownReferences(id, ctx);
      expect(view.items.map((i) => i.sku)).toEqual(['New-1']);
      expect(JSON.stringify(view)).not.toMatch(/SKU-X|secret/);
    });

    it('a stranger who cannot see every lista of someone else\'s revision is refused', async () => {
      const id = await appliedRevision();
      await expect(resolution.listUnknownReferences(id, { userId: 'someone-else', roles: ['Admin Comercial'] })).resolves.toBeDefined(); // unknown rows tie to no lista
      grants.grants.splice(0, grants.grants.length);
      grants.grantOnLista(LISTA, 'prices:read', 'listas:read');
      fake.state.revisionRows.find((r) => r.sku === 'SKU-A')!.listaId = 'lista-other';
      fake.state.revisionRows.find((r) => r.sku === 'SKU-A')!.productId = 'product-other';
      await expect(resolution.listUnknownReferences(id, { userId: 'someone-else', roles: ['Admin Comercial'] })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('POST resolve — CREATE', () => {
    it('creates a hidden draft without lista, writes its prices and history, and resolves the row', async () => {
      const id = await appliedRevision();
      const { results } = await resolution.resolve(id, [create(3)], ctx);
      expect(results).toEqual([{ rowNumber: 3, status: 'CREATED', productId: expect.any(String) }]);
      const product = fake.state.products.find((p) => p.sku === 'New-1')! as Record<string, any>;
      expect(product).toMatchObject({
        name: 'Nombre 3', brandId: 'brand-1', categoryId: 'cat-1', listaId: null, lifecycleStatus: 'DRAFT', publishStatus: 'borrador', isActive: false, isVisible: false,
        extraAttributes: { importStatus: 'pending_enrichment', pendingReason: 'created_from_price_import', sourceRevisionId: id },
      });
      expect(product.extraAttributes).not.toHaveProperty('biblioteca');
      const price = fake.state.prices.find((p) => p.productId === product.id)!;
      expect(price).toMatchObject({ priceListId: 'tariff-oro', listaId: null, currency: 'COP' });
      expect(String(price.value)).toBe('250');
      expect(rowOf(3)).toMatchObject({ resolution: 'PRODUCT_CREATED', productId: product.id, resolvedById: 'fixture-actor' });
      expect(rowOf(3).resolvedAt).toBeInstanceOf(Date);

      const history = fake.state.productChanges.filter((c) => c.productId === product.id);
      expect(history.map((c) => c.field).sort()).toEqual(['brandId', 'categoryId', 'created', 'name', 'price:DPP_ORO_IVA', 'sku']);
      expect(history.find((c) => c.field === 'price:DPP_ORO_IVA')).toMatchObject({ oldValue: Prisma.DbNull, newValue: '250', source: 'PRICE_IMPORT', sourceRef: id, actorId: 'fixture-actor' });
      expect(history.find((c) => c.field === 'created')).toMatchObject({ source: 'PRICE_IMPORT', sourceRef: id });
      expect(fake.audit.logTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'price-import-create-draft', productId: product.id }));
    });

    it('the draft is excluded by the real public visibility predicate', async () => {
      const id = await appliedRevision();
      await resolution.resolve(id, [create(3)], ctx);
      const product = fake.state.products.find((p) => p.sku === 'New-1')! as Record<string, any>;
      const [byLifecycle, byLibrary] = (PUBLIC_CATALOG_VISIBILITY.OR as any[]);
      expect(byLifecycle).toEqual({ lifecycleStatus: 'PUBLISHED' });
      expect(product.lifecycleStatus === byLifecycle.lifecycleStatus).toBe(false);
      expect(byLibrary.extraAttributes.path).toEqual(['biblioteca']);
      expect(product.extraAttributes[byLibrary.extraAttributes.path[0]]).toBeUndefined();
    });

    it('requires products:write AND prices:apply with GLOBAL scope; nothing runs without them', async () => {
      const id = await appliedRevision();
      grants.revoke('products:write');
      await expect(resolution.resolve(id, [create(3)], ctx)).rejects.toBeInstanceOf(ForbiddenException);
      grants.grant('products:write');
      grants.revoke('prices:apply');
      grants.grantOnLista(LISTA, 'prices:apply'); // lista-scoped apply does not cover a product without lista
      grants.grant(...LISTA_ACTIONS.filter((a) => a !== 'prices:apply'));
      await expect(resolution.resolve(id, [create(3)], ctx)).rejects.toBeInstanceOf(ForbiddenException);
      expect(fake.state.products.find((p) => p.sku === 'New-1')).toBeUndefined();
      expect(unknownRows()).toHaveLength(2);
    });

    it('SKIP needs only read access over the revision', async () => {
      const id = await appliedRevision();
      grants.revoke('products:write');
      grants.revoke('prices:apply');
      const { results } = await resolution.resolve(id, [{ rowNumber: 3, action: 'SKIP' }], ctx);
      expect(results).toEqual([{ rowNumber: 3, status: 'SKIPPED' }]);
      expect(rowOf(3)).toMatchObject({ resolution: 'SKIPPED', resolvedById: 'fixture-actor' });
    });

    it('rejects a revision that is not applied yet', async () => {
      const id = await appliedRevision(undefined, false);
      const error = await resolution.resolve(id, [create(3)], ctx).catch((e) => e as ConflictException);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'REVISION_NOT_APPLIED' });
    });

    it('answers SKU_EXISTS when somebody created the SKU meanwhile (normalized), never duplicating it', async () => {
      const id = await appliedRevision();
      fake.state.products.push({ id: 'product-race', sku: 'new- 1', listaId: null });
      const { results } = await resolution.resolve(id, [create(3)], ctx);
      expect(results[0]).toMatchObject({ rowNumber: 3, status: 'FAILED', code: 'SKU_EXISTS' });
      expect(fake.state.products.filter((p) => /new-?\s?1/i.test(p.sku))).toHaveLength(1);
      expect(rowOf(3).resolution).toBe('PENDING_PRODUCT');
      expect(fake.state.prices.filter((p) => p.productId !== 'product-a')).toHaveLength(0);
    });

    it('maps a unique-index violation from a concurrent insert to SKU_EXISTS and rolls the claim back', async () => {
      const id = await appliedRevision();
      fake.prisma.product.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }));
      const { results } = await resolution.resolve(id, [create(3)], ctx);
      expect(results[0]).toMatchObject({ status: 'FAILED', code: 'SKU_EXISTS' });
      expect(rowOf(3).resolution).toBe('PENDING_PRODUCT');
      expect(fake.state.productChanges.filter((c) => c.sku === 'New-1')).toHaveLength(0);
    });

    it('is idempotent: repeating a request returns the previous outcome and creates nothing more', async () => {
      const id = await appliedRevision();
      const first = await resolution.resolve(id, [create(3), { rowNumber: 4, action: 'SKIP' }], ctx);
      const productsBefore = fake.state.products.length;
      const changesBefore = fake.state.productChanges.length;
      const second = await resolution.resolve(id, [create(3), { rowNumber: 4, action: 'SKIP' }], ctx);
      expect(second.results).toEqual(first.results);
      expect(fake.state.products).toHaveLength(productsBefore);
      expect(fake.state.productChanges).toHaveLength(changesBefore);
    });

    it('reports ROW_NOT_PENDING for rows that were never unknown references', async () => {
      const id = await appliedRevision();
      const { results } = await resolution.resolve(id, [create(2), create(99)], ctx);
      expect(results.map((r) => r.code)).toEqual(['ROW_NOT_PENDING', 'ROW_NOT_FOUND']);
    });

    it('fails with TARIFF_UNAVAILABLE when the tariff stopped being usable, and creates nothing', async () => {
      const id = await appliedRevision();
      fake.state.tariffs[0].isActive = false;
      const { results } = await resolution.resolve(id, [create(3)], ctx);
      expect(results[0]).toMatchObject({ status: 'FAILED', code: 'TARIFF_UNAVAILABLE' });
      expect(fake.state.products.find((p) => p.sku === 'New-1')).toBeUndefined();
      expect(rowOf(3).resolution).toBe('PENDING_PRODUCT');
    });

    it('revalidates the stored value with the COP policy', async () => {
      const id = await appliedRevision();
      fake.state.revisionPrices.find((p) => p.rowNumber === 3)!.roundedValue = '-5';
      const { results } = await resolution.resolve(id, [create(3)], ctx);
      expect(results[0]).toMatchObject({ status: 'FAILED', code: 'INVALID_PRICE' });
      expect(fake.state.products.find((p) => p.sku === 'New-1')).toBeUndefined();
    });

    it('transacts PER ITEM: a failing item does not roll back the others', async () => {
      const id = await appliedRevision();
      const { results } = await resolution.resolve(id, [create(3), create(4, { brandId: 'brand-missing' }), { rowNumber: 4, action: 'SKIP' } as never].slice(0, 2), ctx);
      expect(results.map((r) => r.status)).toEqual(['CREATED', 'FAILED']);
      expect(results[1].code).toBe('BRAND_NOT_FOUND');
      expect(fake.state.products.find((p) => p.sku === 'New-1')).toBeDefined();
      expect(fake.state.products.find((p) => p.sku === 'NEW-2')).toBeUndefined();
      expect(rowOf(3).resolution).toBe('PRODUCT_CREATED');
      expect(rowOf(4).resolution).toBe('PENDING_PRODUCT');
      expect(fake.prisma.$transaction.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('validates the request shape in the service: duplicate rows and empty/oversized batches', async () => {
      const id = await appliedRevision();
      await expect(resolution.resolve(id, [create(3), create(3)], ctx)).rejects.toBeInstanceOf(BadRequestException);
      await expect(resolution.resolve(id, [], ctx)).rejects.toBeInstanceOf(BadRequestException);
      await expect(resolution.resolve(id, Array.from({ length: 201 }, (_, i) => create(i + 3)), ctx)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rolls back everything of the item when the history write fails', async () => {
      const id = await appliedRevision();
      fake.prisma.productChange.createMany.mockRejectedValueOnce(new Error('history down'));
      const { results } = await resolution.resolve(id, [create(3)], ctx);
      expect(results[0]).toMatchObject({ status: 'FAILED', code: 'INTERNAL_ERROR' });
      expect(fake.state.products.find((p) => p.sku === 'New-1')).toBeUndefined();
      expect(rowOf(3).resolution).toBe('PENDING_PRODUCT');
    });
  });
});
