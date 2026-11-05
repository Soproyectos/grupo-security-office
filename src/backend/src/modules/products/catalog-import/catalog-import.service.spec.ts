import * as XLSX from 'xlsx';
import { existsSync, readFileSync } from 'fs';
import { Test } from '@nestjs/testing';
import { CatalogImportService } from './catalog-import.service';
import { CatalogImportModule } from './catalog-import.module';
import { CatalogImportController } from './catalog-import.controller';
import { BibliotecaPrismaService } from '../../../prisma/biblioteca-prisma.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AclService } from '../../../common/acl/acl.service';
import { LibraryAuditService } from '../../library-audit/library-audit.service';
import { ProductRevisionsService } from '../product-revisions.service';

function workbook(rows: unknown[][]): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Carga');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function workbookWithProductsSheet(): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Guía'], ['Use la hoja Productos']]), 'Guía');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['SKU', 'Nombre', 'Marca', 'Categoría', 'Subcategoría', 'Características_filtros'],
    ['CAM-01', 'Cámara IP', 'Marca Nueva', 'CCTV', 'Cámaras IP', '{"resolucion":"4MP"}'],
  ]), 'Productos');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function setup() {
  const session = { create: jest.fn(async ({ data }: any) => ({ data })), findUnique: jest.fn(), update: jest.fn() };
  const client = {
    brand: { findMany: jest.fn(async () => []), findUnique: jest.fn(), create: jest.fn() },
    category: { findMany: jest.fn(async () => []), findUnique: jest.fn(), create: jest.fn() },
    product: { findMany: jest.fn(async () => []), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    productChange: { create: jest.fn() }, importSession: session, $queryRaw: jest.fn(async () => []),
  };
  const library = { client, writeTransaction: jest.fn(async (fn: (tx: any) => unknown) => fn(client)), assertWritesAllowed: jest.fn(), config: { mode: 'legacy' } } as unknown as BibliotecaPrismaService;
  return { service: new CatalogImportService(library, { append: jest.fn() } as unknown as LibraryAuditService), client, session, library };
}

describe('CatalogImportService', () => {
  it('serializa claves de árbol como tuplas JSON sin NUL ni colisiones por separador', async () => {
    const { service, session } = setup();
    const result = await service.preview(workbook([
      ['CATEGORIA', 'SUBCATEGORIA'],
      ['D|E', 'C'],
      ['D', 'E|F'],
      ['["root","A"]', 'Sub/Árbol'],
    ]), 'categorias.xlsx', 'categories', { id: 'user-1', roles: ['Admin Comercial'] });
    const serialized = JSON.stringify(session.create.mock.calls[0][0].data);
    expect(result.summary).toEqual({ total: 3, valid: 3, invalid: 0, creates: 3, updates: 0 });
    expect(result.proposedCategories).toHaveLength(6);
    expect(new Set(result.proposedCategories.map((category: any) => category.key)).size).toBe(6);
    expect(serialized).not.toContain('\\u0000');
    expect(serialized).not.toContain('\0');
  });

  it('rechaza una celda con NUL en español antes de guardar la sesión', async () => {
    const { service, session } = setup();
    const input = Buffer.from(`CATEGORIA,SUBCATEGORIA\nCCTV,Cámara${String.fromCharCode(0)} IP`, 'utf8');
    await expect(service.preview(input, 'categorias.csv', 'categories', { id: 'user-1', roles: ['Admin Comercial'] }))
      .rejects.toMatchObject({ status: 400, response: expect.objectContaining({ code: 'CATALOG_IMPORT_NULL_CHARACTER', message: expect.stringContaining('fila 2, columna “SUBCATEGORIA”') }) });
    expect(session.create).not.toHaveBeenCalled();
  });

  it('serializa el archivo real de 9 categorías y 66 subcategorías cuando se solicita la regresión local', async () => {
    const actualPath = process.env.CATALOG_IMPORT_CATEGORIES_FILE;
    if (!actualPath || !existsSync(actualPath)) return;
    const { service, session } = setup();
    const result = await service.preview(readFileSync(actualPath), actualPath, 'categories', { id: 'user-1', roles: ['Admin Comercial'] });
    const serialized = JSON.stringify(session.create.mock.calls[0][0].data);
    expect(result.summary.total).toBe(66);
    expect(result.proposedCategories).toHaveLength(75);
    expect(serialized).not.toContain('\\u0000');
    expect(serialized).not.toContain('\0');
  });

  it('compone Controller, servicio y revisiones con dependencias de biblioteca simuladas', async () => {
    const library = { client: {}, config: { mode: 'legacy' }, assertWritesAllowed: jest.fn(), writeTransaction: jest.fn() };
    const module = await Test.createTestingModule({ imports: [CatalogImportModule] })
      .overrideProvider(BibliotecaPrismaService).useValue(library)
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(AclService).useValue({})
      .overrideProvider(LibraryAuditService).useValue({ append: jest.fn() })
      .compile();
    expect(module.get(CatalogImportController)).toBeDefined();
    expect(module.get(CatalogImportService)).toBeDefined();
    expect(module.get(ProductRevisionsService)).toBeDefined();
    await module.close();
  });

  it('preview no crea marcas, categorías ni productos', async () => {
    const { service, client, session } = setup();
    const result = await service.preview(workbook([
      ['SKU', 'Nombre', 'Marca', 'Categoría', 'Subcategoría'],
      ['CAM-01', 'Cámara IP 4MP', 'Marca Nueva', 'CCTV', 'Cámaras IP'],
    ]), 'catalogo.xlsx', 'products', { id: 'user-1', roles: ['Admin Comercial'] });
    expect(result.summary).toMatchObject({ total: 1, valid: 1, invalid: 0, creates: 1, updates: 0 });
    // Product rows never propose new taxonomy: unknown labels are reported on the row for later confirmation.
    expect(result.proposedBrands).toEqual([]);
    expect(result.proposedCategories).toEqual([]);
    expect((result.rows[0] as any).needsConfirmation).toEqual([
      { code: 'BRAND_NEEDS_CONFIRMATION', label: 'Marca Nueva' },
      { code: 'CATEGORY_NEEDS_CONFIRMATION', label: 'CCTV > Cámaras IP' },
    ]);
    expect(session.create).toHaveBeenCalledTimes(1);
    expect(client.brand.create).not.toHaveBeenCalled();
    expect(client.category.create).not.toHaveBeenCalled();
    expect(client.product.create).not.toHaveBeenCalled();
  });

  it('elige la hoja Productos sobre Guía y reconoce Características_filtros', async () => {
    const { service } = setup();
    const result = await service.preview(workbookWithProductsSheet(), 'catalogo.xlsx', 'products', { id: 'user-1', roles: ['Admin Comercial'] });
    expect(result.columns).toContain('Características_filtros');
    expect(result.summary).toMatchObject({ total: 1, valid: 1, invalid: 0, creates: 1, updates: 0 });
  });

  it('invalida todas las filas con SKU normalizado duplicado con un código claro', async () => {
    const { service } = setup();
    const result = await service.preview(workbook([
      ['SKU', 'Nombre', 'Marca', 'Categoría', 'Subcategoría'],
      ['AB- 12', 'Producto uno', '', 'CCTV', 'Cámaras'],
      ['ab-12', 'Producto dos', '', 'CCTV', 'Cámaras'],
    ]), 'catalogo.xlsx', 'products', { id: 'user-1', roles: ['Admin Comercial'] });
    expect(result.rows.map((row: any) => row.action)).toEqual(['invalid', 'invalid']);
    expect(result.rows.map((row: any) => row.code)).toEqual(['DUPLICATE_SKU_IN_FILE', 'DUPLICATE_SKU_IN_FILE']);
    expect(result.rows.every((row: any) => row.issues.some((issue: string) => issue.includes('SKU duplicado')))).toBe(true);
  });

  it('propone (sin escribir) el cambio de marca de una ficha con nombre bloqueado', async () => {
    const { service, client } = setup();
    const updatedAt = new Date('2026-10-01T00:00:00.000Z');
    client.brand.findMany.mockResolvedValue([{ id: 'brand-new', name: 'Otra marca', slug: 'otra-marca' }] as never);
    client.category.findMany.mockResolvedValue([
      { id: 'cat-root', name: 'CCTV', parentId: null, slug: 'cctv' },
      { id: 'cat-leaf', name: 'Cámaras IP', parentId: 'cat-root', slug: 'cctv-camaras-ip' },
    ] as never);
    client.$queryRaw.mockResolvedValue([{ id: 'product-1', sku: 'CAM-01' }] as never);
    client.product.findMany.mockResolvedValue([{
      id: 'product-1', sku: 'CAM-01', name: 'Cámara IP', description: null, brandId: 'brand-old', categoryId: 'cat-leaf',
      technicalSpecs: null, extraAttributes: null, nameLockedAt: updatedAt, updatedAt,
    }] as never);
    const result = await service.preview(workbook([
      ['SKU', 'Nombre', 'Marca', 'Categoría', 'Subcategoría'],
      ['CAM-01', 'Cámara IP', 'Otra marca', 'CCTV', 'Cámaras IP'],
    ]), 'catalogo.xlsx', 'products', { id: 'user-1', roles: ['Admin Comercial'] });
    expect(result.rows[0]).toMatchObject({ action: 'proposed', code: 'PROPOSED_PROTECTED', protectedBy: ['NAME_LOCKED'] });
    expect((result.rows[0] as any).proposals).toEqual([{ field: 'brand', before: 'brand-old', after: 'Otra marca' }]);
    expect(result.proposedBrands).toEqual([]);
    expect(result.proposedCategories).toEqual([]);
  });

  it('rechaza columnas de precios sin ejecutar lecturas o escrituras del dominio', async () => {
    const { service, session } = setup();
    await expect(service.preview(workbook([
      ['SKU', 'Nombre', 'Marca', 'Categoría', 'Subcategoría', 'Precio instalador'],
      ['CAM-01', 'Cámara IP', 'Marca', 'CCTV', 'Cámaras', '500000'],
    ]), 'catalogo.xlsx', 'products', { id: 'user-1', roles: ['Admin Comercial'] })).rejects.toMatchObject({ status: 400 });
    expect(session.create).not.toHaveBeenCalled();
  });

  it('rechaza una preview de otro usuario antes de transacción o escrituras', async () => {
    const { service, session, library } = setup();
    session.findUnique.mockResolvedValue({ id: 'preview-1', userId: 'owner', data: { namespace: 'catalog-import' } });
    await expect(service.execute('preview-1', true, { id: 'other', roles: ['Admin Comercial'] })).rejects.toMatchObject({ status: 400 });
    expect(library.writeTransaction).not.toHaveBeenCalled();
  });

  it('exige confirmación explícita y rol CRUD antes de crear estructura', async () => {
    const { service, session, library } = setup();
    session.findUnique.mockResolvedValue({ id: 'preview-1', userId: 'owner', data: {
      namespace: 'catalog-import', kind: 'brands', expiresAt: new Date(Date.now() + 60_000).toISOString(),
      rows: [{ row: 2, name: 'Nueva', action: 'create', issues: [] }], proposedBrands: [{ key: 'nueva', name: 'Nueva' }], proposedCategories: [], payloads: [],
    } });
    await expect(service.execute('preview-1', false, { id: 'owner', roles: ['Admin Comercial'] })).rejects.toMatchObject({ status: 400 });
    await expect(service.execute('preview-1', true, { id: 'owner', roles: ['Operador'] })).rejects.toMatchObject({ status: 403 });
    expect(library.writeTransaction).not.toHaveBeenCalled();
  });

  it('no inicia apply si todas las filas son inválidas', async () => {
    const { service, session, library } = setup();
    session.findUnique.mockResolvedValue({ id: 'preview-1', userId: 'owner', data: {
      namespace: 'catalog-import', kind: 'products', expiresAt: new Date(Date.now() + 60_000).toISOString(),
      rows: [{ row: 2, action: 'invalid', issues: ['Fila inválida'] }], proposedBrands: [], proposedCategories: [], payloads: [],
    } });
    await expect(service.execute('preview-1', false, { id: 'owner', roles: ['Operador'] })).rejects.toMatchObject({ status: 400 });
    expect(library.writeTransaction).not.toHaveBeenCalled();
  });
  it('encuentra el encabezado bajo título y descripción, ignora Decision/Motivo/Evidencia y acepta Categoria sin tilde', async () => {
    const { service } = setup();
    const result = await service.preview(workbook([
      ['Productos'],
      ['Revisión semántica por lote'],
      ['SKU', 'Nombre', 'Marca', 'Categoria', 'Subcategoria', 'Decision', 'Motivo', 'Evidencia'],
      ['AB-1', 'Producto uno', '', '', '', 'PENDIENTE', 'sin datos', 'n/a'],
      ['AB-2', 'Rótulo de lista', '', '', '', 'ROTULO', '', ''],
      ['AB-3', 'Producto restringido', '', '', '', 'RESTRINGIDO', '', ''],
    ]), 'maestro.xlsx', 'products', { id: 'user-1', roles: ['Admin Comercial'] });
    expect(result.columns).toEqual(['SKU', 'Nombre', 'Marca', 'Categoria', 'Subcategoria', 'Decision', 'Motivo', 'Evidencia']);
    expect(result.rows.map((row: any) => [row.row, row.action, row.code])).toEqual([[4, 'create', 'CREATE_DRAFT'], [5, 'skip', 'SKIPPED_HEADING_ROW'], [6, 'create', 'CREATE_DRAFT']]);
    expect((result.rows[1] as any).reason).toContain('rótulo');
    expect((result.rows[0] as any).missing).toEqual(['brand', 'subcategory']);
    expect(result.summary).toMatchObject({ total: 3, invalid: 0, creates: 2, skipped: 1 });
  });

  it('una fila sin marca, categoría ni subcategoría no se rechaza: queda como borrador por clasificar', async () => {
    const { service } = setup();
    const result = await service.preview(workbook([
      ['SKU', 'Nombre', 'Marca', 'Categoría', 'Subcategoría'],
      ['X-1', 'Sin clasificar', '', '', ''],
    ]), 'catalogo.xlsx', 'products', { id: 'user-1', roles: ['Admin Comercial'] });
    expect(result.rows[0]).toMatchObject({ action: 'create', issues: [] });
    expect((result.rows[0] as any).needsConfirmation).toBeUndefined();
  });
});
