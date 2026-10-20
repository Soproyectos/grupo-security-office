import { createPrismaMock } from '../../../../__test__/mocks/prisma.mock';
import { NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { BatchExecutorService } from './batch-executor.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { HierarchyService } from '../../../../common/hierarchy/hierarchy.service';
import { AclService } from '../../../../common/acl/acl.service';
import { ProductsService } from '../../products.service';
import { ImportContext } from '../interfaces/import-context';

const mockPrisma = createPrismaMock();

/** Lista activa y no archivada (lo que resolveLista exige para el destino explícito). */
const activeLista = (id: string, overrides?: Record<string, unknown>) => ({
  id,
  defaultVisibility: false,
  isActive: true,
  archivedAt: null,
  ...overrides,
});

/**
 * Existing products are resolved by NORMALIZED SKU (findProductsBySkus): a raw
 * identity query returns the matching ids and product.findMany loads them.
 *
 * CAT-01 (5.2/5.3): tras el lookup, cada producto existente pasa por un
 * bloqueo `SELECT … FOR UPDATE` que devuelve `{ id, listaId }` — el mock
 * encadena las respuestas: la primera llamada es el lookup por SKU, las
 * siguientes el snapshot bajo bloqueo.
 */
const mockExistingProducts = (rows: Array<{ id: string; sku: string; [k: string]: unknown }>) => {
  mockPrisma.$queryRaw
    .mockResolvedValueOnce(rows.map((r) => ({ id: r.id, sku: r.sku })))
    .mockResolvedValue(rows.map((r) => ({ id: r.id, listaId: r.listaId ?? null })));
  mockPrisma.product.findMany.mockResolvedValue(rows);
};

describe('BatchExecutorService — Lista destino (listaId)', () => {
  let service: BatchExecutorService;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const normalizedRow = {
    rowIndex: 0,
    sku: 'SKU-1',
    name: 'Cámara IP',
    description: 'desc',
    categoryName: 'CCTV',
    brandName: 'Hikvision',
    prices: [],
    technicalSpecs: {},
    extraAttributes: {},
    isUpdate: false,
    nameIsFallback: false,
  };

  const makeCtx = (overrides?: Partial<ImportContext>): ImportContext => ({
    importId: 'import-1',
    userId: 'user-1',
    fileName: 'test.xlsx',
    fileSize: 1024,
    rawRows: [],
    headers: ['REFERENCIA', 'DESCRIPCION'],
    columnMapping: {
      entries: [
        { sourceColumn: 'REFERENCIA', targetField: 'sku', isRequired: true, confidence: 1.0 },
        { sourceColumn: 'DESCRIPCION', targetField: 'name', isRequired: true, confidence: 1.0 },
      ],
      confirmed: true,
    },
    ivaMode: 'with_iva',
    validatedRows: [],
    normalizedRows: [],
    pipelineErrors: [],
    startedAt: new Date(),
    currentStage: 'batch_execution',
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    service = new BatchExecutorService(
      mockPrisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );

    mockPrisma.category.findMany.mockResolvedValue([]);
    mockPrisma.brand.findMany.mockResolvedValue([]);
    mockPrisma.priceList.findMany.mockResolvedValue([]);
    (mockPrisma.category as any).findFirst = jest.fn().mockResolvedValue(null);
    (mockPrisma.brand as any).findFirst = jest.fn().mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.category.create.mockResolvedValue({ id: 'cat-1', name: 'CCTV', slug: 'cctv' });
    mockPrisma.brand.create.mockResolvedValue({ id: 'brand-1', name: 'Hikvision', slug: 'hikvision' });
    mockPrisma.product.create.mockResolvedValue({
      id: 'prod-1',
      sku: 'SKU-1',
      name: 'Cámara IP',
      listaId: 'lista-x',
      isVisible: false,
    });
  });

  it('crea productos asignados a la Lista del contexto (listaId)', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));

    const result = await service.execute([normalizedRow], makeCtx({ listaId: 'lista-x' }));

    expect(result.created).toBe(1);
    expect(mockPrisma.lista.findUnique).toHaveBeenCalledWith({
      where: { id: 'lista-x' },
      select: { id: true, defaultVisibility: true, isActive: true, archivedAt: true },
    });
    expect(mockPrisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ listaId: 'lista-x' }),
      }),
    );
    expect(mockPrisma.product.create.mock.calls[0][0].data).not.toHaveProperty('catalogId');
  });

  it('lanza NotFoundException si el listaId del contexto no existe', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(null);

    await expect(service.execute([normalizedRow], makeCtx({ listaId: 'lista-inexistente' }))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('asigna LISTA-GENERAL cuando el contexto no trae listaId', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-general-1', defaultVisibility: false });

    const result = await service.execute([normalizedRow], makeCtx());

    expect(result.created).toBe(1);
    expect(mockPrisma.lista.findUnique).toHaveBeenCalledWith({
      where: { code: 'LISTA-GENERAL' },
      select: { id: true, defaultVisibility: true },
    });
    expect(mockPrisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ listaId: 'lista-general-1' }),
      }),
    );
  });

  it('propaga defaultVisibility de la Lista como isVisible del producto creado', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-v', { defaultVisibility: true }));

    await service.execute([normalizedRow], makeCtx({ listaId: 'lista-v' }));

    expect(mockPrisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ listaId: 'lista-v', isVisible: true }),
      }),
    );
  });

  it('no asigna catalogId al producto creado (catálogo eliminado)', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));

    await service.execute([normalizedRow], makeCtx({ listaId: 'lista-x' }));

    expect(mockPrisma.product.create.mock.calls[0][0].data).not.toHaveProperty('catalogId');
  });

  it('actualización con nameIsFallback=true no sobrescribe el nombre real ya guardado (lista sin nombre/descripción)', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));
    mockExistingProducts([{ id: 'prod-existente', sku: 'SKU-1', listaId: 'lista-x' }]);

    const rowSinNombreReal = { ...normalizedRow, name: 'SKU-1', nameIsFallback: true };

    const result = await service.execute([rowSinNombreReal], makeCtx({ listaId: 'lista-x' }));

    expect(result.updated).toBe(1);
    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-existente' },
        data: expect.not.objectContaining({ name: expect.anything() }),
      }),
    );
  });

  it('actualización con nombre real (nameIsFallback=false) sí actualiza el nombre', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));
    mockExistingProducts([{ id: 'prod-existente', sku: 'SKU-1', listaId: 'lista-x' }]);

    const result = await service.execute([normalizedRow], makeCtx({ listaId: 'lista-x' }));

    expect(result.updated).toBe(1);
    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-existente' },
        data: expect.objectContaining({ name: 'Cámara IP' }),
      }),
    );
  });

  describe('identidad por SKU normalizado', () => {
    it('una fila IDS-E04HQHI-D actualiza el producto existente iDS-E04HQHI-D (no crea un duplicado)', async () => {
      mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));
      mockExistingProducts([{ id: 'prod-biblioteca', sku: 'iDS-E04HQHI-D', nameLockedAt: null, listaId: 'lista-x' }]);

      const row = { ...normalizedRow, sku: 'IDS-E04HQHI-D' };
      const result = await service.execute([row], makeCtx({ listaId: 'lista-x' }));

      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'prod-biblioteca' } }),
      );
      // The identity lookup is done on the normalized SKU.
      expect(mockPrisma.$queryRaw.mock.calls[0][0].values[0]).toEqual(['IDS-E04HQHI-D']);
    });

    it('conserva el nombre curado y bloqueado del producto existente aunque el SKU difiera en mayúsculas', async () => {
      mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));
      mockExistingProducts([
        {
          id: 'prod-curado',
          sku: 'iDS-E04HQHI-D',
          name: 'DVR 4CH 1080P eSSD 960GB AcuSense',
          description: null,
          categoryId: 'cat-1',
          brandId: 'brand-1',
          nameLockedAt: new Date('2026-10-02T00:00:00.000Z'),
          listaId: 'lista-x',
        },
      ]);

      const row = { ...normalizedRow, sku: 'IDS-E04HQHI-D', name: 'DVR 4 CH 1080p DISCO DURO eSSD 960gb' };
      const result = await service.execute([row], makeCtx({ listaId: 'lista-x' }));

      expect(result.updated).toBe(1);
      expect(mockPrisma.product.update.mock.calls[0][0].data).toEqual({ lastSeenAt: expect.any(Date) });
    });

    it('un SKU con espacios internos también coincide con el existente', async () => {
      mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));
      mockExistingProducts([{ id: 'prod-1', sku: 'DS-2CE16(2.8MM)', nameLockedAt: null, listaId: 'lista-x' }]);

      const row = { ...normalizedRow, sku: 'DS-2CE16 (2.8MM)' };
      const result = await service.execute([row], makeCtx({ listaId: 'lista-x' }));

      expect(result.updated).toBe(1);
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
    });
  });
});

describe('BatchExecutorService — Decisiones de secciones del wizard', () => {
  let service: BatchExecutorService;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const normalizedRowBase = {
    rowIndex: 0,
    sku: 'SKU-1',
    name: 'Cámara IP',
    description: 'desc',
    categoryName: 'cctv',
    brandName: 'Hikvision',
    prices: [],
    technicalSpecs: {},
    extraAttributes: {},
    isUpdate: false,
    nameIsFallback: false,
  };

  const makeRow = (overrides?: Partial<typeof normalizedRowBase>) => ({
    ...normalizedRowBase,
    ...overrides,
  });

  const makeCtx = (
    overrides?: Partial<ImportContext>,
  ): ImportContext => ({
    importId: 'import-1',
    userId: 'user-1',
    fileName: 'test.xlsx',
    fileSize: 1024,
    rawRows: [],
    headers: ['REFERENCIA', 'DESCRIPCION', 'CATEGORIA'],
    columnMapping: {
      entries: [
        { sourceColumn: 'REFERENCIA', targetField: 'sku', isRequired: true, confidence: 1.0 },
        { sourceColumn: 'DESCRIPCION', targetField: 'name', isRequired: true, confidence: 1.0 },
      ],
      confirmed: true,
    },
    ivaMode: 'with_iva',
    validatedRows: [],
    normalizedRows: [],
    pipelineErrors: [],
    startedAt: new Date(),
    currentStage: 'batch_execution',
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    service = new BatchExecutorService(
      mockPrisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );

    mockPrisma.category.findMany.mockResolvedValue([]);
    mockPrisma.brand.findMany.mockResolvedValue([]);
    mockPrisma.priceList.findMany.mockResolvedValue([]);
    (mockPrisma.category as any).findFirst = jest.fn().mockResolvedValue(null);
    (mockPrisma.brand as any).findFirst = jest.fn().mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.category.create.mockResolvedValue({ id: 'cat-1', name: 'CCTV', slug: 'cctv' });
    mockPrisma.brand.create.mockResolvedValue({ id: 'brand-1', name: 'Hikvision', slug: 'hikvision' });
    mockPrisma.product.create.mockResolvedValue({
      id: 'prod-1',
      sku: 'SKU-1',
      name: 'Cámara IP',
      listaId: 'lista-x',
      isVisible: false,
    });
  });

  it('aplica decisión create: usa targetName aunque la fila diga el valor fuente', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));

    const result = await service.execute(
      [makeRow({ categoryName: 'cctv' })],
      makeCtx({
        listaId: 'lista-x',
        sectionDecisions: { cctv: { targetName: 'CCTV', action: 'create' } },
      }),
    );

    expect(result.created).toBe(1);
    expect(mockPrisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'CCTV', slug: 'cctv' }),
      }),
    );
    expect(mockPrisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryId: 'cat-1' }),
      }),
    );
  });

  it('aplica decisión skip: producto en la categoría default "Sin categoría"', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));
    (mockPrisma.category as any).findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'cat-default', name: 'Sin categoría', slug: 'sin-categoria' });

    const result = await service.execute(
      [makeRow({ categoryName: 'cctv' })],
      makeCtx({
        listaId: 'lista-x',
        sectionDecisions: { cctv: { action: 'skip' } },
      }),
    );

    expect(result.created).toBe(1);
    expect(mockPrisma.category.create).not.toHaveBeenCalled();
    expect(mockPrisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryId: 'cat-default' }),
      }),
    );
  });

  it('sourceValue no mapeado: conserva el comportamiento original (crea con el valor de la fila)', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));

    const result = await service.execute(
      [makeRow({ categoryName: 'cctv' })],
      makeCtx({
        listaId: 'lista-x',
        sectionDecisions: { 'control-de-acceso': { targetName: 'Control de Acceso', action: 'create' } },
      }),
    );

    expect(result.created).toBe(1);
    expect(mockPrisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'cctv' }),
      }),
    );
  });

  it('create con targetName ya existente en BD reutiliza (no duplica)', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));
    mockPrisma.category.findMany.mockResolvedValue([
      { id: 'cat-existente', name: 'CCTV', slug: 'cctv' },
    ]);

    const result = await service.execute(
      [makeRow({ categoryName: 'cctv' })],
      makeCtx({
        listaId: 'lista-x',
        sectionDecisions: { cctv: { targetName: 'CCTV', action: 'create' } },
      }),
    );

    expect(result.created).toBe(1);
    expect(mockPrisma.category.create).not.toHaveBeenCalled();
    expect(mockPrisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryId: 'cat-existente' }),
      }),
    );
  });
});

describe('BatchExecutorService — Aislamiento de filas con SAVEPOINT', () => {
  let service: BatchExecutorService;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const makeRow = (overrides?: Record<string, unknown>) => ({
    rowIndex: 0,
    sku: 'SKU-1',
    name: 'Producto',
    description: 'desc',
    categoryName: 'cctv',
    brandName: 'Hikvision',
    prices: [],
    technicalSpecs: {},
    extraAttributes: {},
    isUpdate: false,
    nameIsFallback: false,
    ...overrides,
  });

  const makeCtx = (overrides?: Partial<ImportContext>): ImportContext => ({
    importId: 'import-1',
    userId: 'user-1',
    fileName: 'test.xlsx',
    fileSize: 1024,
    rawRows: [],
    headers: ['REFERENCIA', 'DESCRIPCION', 'CATEGORIA'],
    columnMapping: {
      entries: [
        { sourceColumn: 'REFERENCIA', targetField: 'sku', isRequired: true, confidence: 1.0 },
        { sourceColumn: 'DESCRIPCION', targetField: 'name', isRequired: true, confidence: 1.0 },
      ],
      confirmed: true,
    },
    ivaMode: 'with_iva',
    validatedRows: [],
    normalizedRows: [],
    pipelineErrors: [],
    startedAt: new Date(),
    currentStage: 'batch_execution',
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    service = new BatchExecutorService(
      mockPrisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );

    mockPrisma.category.findMany.mockResolvedValue([]);
    mockPrisma.brand.findMany.mockResolvedValue([]);
    mockPrisma.priceList.findMany.mockResolvedValue([]);
    (mockPrisma.category as any).findFirst = jest.fn().mockResolvedValue(null);
    (mockPrisma.brand as any).findFirst = jest.fn().mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));
    mockPrisma.brand.create.mockResolvedValue({ id: 'brand-1', name: 'Hikvision', slug: 'hikvision' });
  });

  it('un error real de Prisma en una fila no revierte ni bloquea las demás filas del lote', async () => {
    mockPrisma.category.create.mockResolvedValue({ id: 'cat-1', name: 'CCTV', slug: 'cctv' });
    let call = 0;
    mockPrisma.product.create.mockImplementation(async (args: any) => {
      call += 1;
      if (call === 2) {
        throw new Error('Unique constraint failed on the fields: (`sku`)');
      }
      return { id: `prod-${call}`, sku: args.data.sku, name: args.data.name, listaId: 'lista-x', isVisible: false };
    });

    const rows = [
      makeRow({ rowIndex: 0, sku: 'SKU-1' }),
      makeRow({ rowIndex: 1, sku: 'SKU-2' }),
      makeRow({ rowIndex: 2, sku: 'SKU-3' }),
    ];

    const result = await service.execute(rows, makeCtx({ listaId: 'lista-x' }));

    // Las filas 0 y 2 deben quedar creadas pese a que la fila 1 falló a nivel de BD.
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rowIndex).toBe(1);

    // Una fila exitosa libera su SAVEPOINT; la fila fallida lo revierte — nunca
    // se deja la transacción completa sin resolver un SAVEPOINT abierto.
    const raw = mockPrisma.$executeRawUnsafe.mock.calls.map((c: any[]) => c[0]);
    expect(raw.filter((sql: string) => sql === 'SAVEPOINT row_sp')).toHaveLength(3);
    expect(raw.filter((sql: string) => sql === 'RELEASE SAVEPOINT row_sp')).toHaveLength(2);
    expect(raw.filter((sql: string) => sql === 'ROLLBACK TO SAVEPOINT row_sp')).toHaveLength(1);
  });

  it('revierte la caché de categoría creada por una fila fallida, para que la siguiente fila no reuse un id revertido', async () => {
    mockPrisma.category.create
      .mockResolvedValueOnce({ id: 'cat-temp', name: 'Nueva', slug: 'nueva' })
      .mockResolvedValueOnce({ id: 'cat-final', name: 'Nueva', slug: 'nueva' });
    mockPrisma.product.create.mockImplementation(async (args: any) => {
      if (args.data.sku === 'SKU-FAIL') {
        throw new Error('violación de restricción simulada');
      }
      return { id: 'prod-x', sku: args.data.sku, name: args.data.name, listaId: 'lista-x', isVisible: false };
    });

    const rows = [
      makeRow({ rowIndex: 0, sku: 'SKU-FAIL', categoryName: 'Nueva' }),
      makeRow({ rowIndex: 1, sku: 'SKU-OK', categoryName: 'Nueva' }),
    ];

    const result = await service.execute(rows, makeCtx({ listaId: 'lista-x' }));

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    // La categoría "Nueva" se intenta crear dos veces: la primera (fila 0) se
    // revierte con el SAVEPOINT, así que la fila 1 no puede reusar `cat-temp`
    // desde el caché en memoria — debe volver a crearla.
    expect(mockPrisma.category.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.product.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryId: 'cat-final' }),
      }),
    );
  });
});

describe('BatchExecutorService — Protección de identidad bloqueada (ADR-002)', () => {
  let service: BatchExecutorService;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const lockedProduct = {
    id: 'prod-locked',
    sku: 'SKU-1',
    name: 'Nombre Curado',
    description: 'Descripción curada',
    categoryId: 'cat-1',
    brandId: 'brand-1',
    nameLockedAt: new Date('2026-09-01T00:00:00Z'),
    listaId: 'lista-x',
  };

  const unlockedProduct = {
    id: 'prod-libre',
    sku: 'SKU-1',
    name: 'Nombre Técnico Original',
    description: 'Descripción original',
    categoryId: 'cat-1',
    brandId: 'brand-1',
    nameLockedAt: null as Date | null,
    listaId: 'lista-x',
  };

  const makeRow = (overrides?: Record<string, unknown>) => ({
    rowIndex: 0,
    sku: 'SKU-1',
    name: 'Nombre Curado',
    description: 'Descripción curada',
    categoryName: 'CCTV',
    brandName: 'Hikvision',
    prices: [] as Array<{
      priceListCode: string;
      priceListName: string;
      value: number;
      ivaMode: 'with_iva' | 'without_iva';
      currency: string;
    }>,
    technicalSpecs: {},
    extraAttributes: {},
    isUpdate: false,
    nameIsFallback: false,
    ...overrides,
  });

  const makeCtx = (overrides?: Partial<ImportContext>): ImportContext => ({
    importId: 'import-1',
    userId: 'user-1',
    fileName: 'test.xlsx',
    fileSize: 1024,
    rawRows: [],
    headers: ['REFERENCIA', 'NOMBRE'],
    columnMapping: {
      entries: [
        { sourceColumn: 'REFERENCIA', targetField: 'sku', isRequired: true, confidence: 1.0 },
        { sourceColumn: 'NOMBRE', targetField: 'name', isRequired: true, confidence: 1.0 },
      ],
      confirmed: true,
    },
    ivaMode: 'with_iva',
    validatedRows: [],
    normalizedRows: [],
    pipelineErrors: [],
    startedAt: new Date(),
    currentStage: 'batch_execution',
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    service = new BatchExecutorService(
      mockPrisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );

    mockPrisma.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'CCTV', slug: 'cctv' },
    ]);
    mockPrisma.brand.findMany.mockResolvedValue([
      { id: 'brand-1', name: 'Hikvision', slug: 'hikvision' },
    ]);
    mockPrisma.priceList.findMany.mockResolvedValue([]);
    (mockPrisma.category as any).findFirst = jest.fn().mockResolvedValue(null);
    (mockPrisma.brand as any).findFirst = jest.fn().mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-x'));
    mockPrisma.priceList.create.mockResolvedValue({ id: 'pl-1', code: 'INSTALADOR_IVA' });
    mockPrisma.price.findUnique.mockResolvedValue(null);
    mockPrisma.price.create.mockResolvedValue({ id: 'price-1' });
  });

  it('producto bloqueado: NO sobrescribe identidad, SÍ upserta precios y marca lastSeenAt', async () => {
    mockExistingProducts([lockedProduct]);

    const row = makeRow({
      prices: [
        { priceListCode: 'INSTALADOR_IVA', priceListName: 'Instalador (con IVA)', value: 110, ivaMode: 'with_iva', currency: 'COP' },
      ],
    });

    const result = await service.execute([row], makeCtx({ listaId: 'lista-x' }));

    expect(result.updated).toBe(1);
    expect(result.identityChangesDetected).toBe(0);

    // Solo se escribe lastSeenAt — ningún campo de identidad.
    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-locked' },
        data: { lastSeenAt: expect.any(Date) },
      }),
    );

    // Los precios sí se refrescan.
    expect(mockPrisma.price.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productId: 'prod-locked', value: 110 }),
      }),
    );
  });

  it('producto bloqueado con nombre entrante distinto: identityChangesDetected se incrementa y la identidad se conserva', async () => {
    mockExistingProducts([lockedProduct]);

    const row = makeRow({ name: 'Nombre Distinto De La Fila' });

    const result = await service.execute([row], makeCtx({ listaId: 'lista-x' }));

    expect(result.updated).toBe(1);
    expect(result.identityChangesDetected).toBe(1);

    // La identidad NO se sobrescribe pese al nombre distinto.
    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-locked' },
        data: { lastSeenAt: expect.any(Date) },
      }),
    );
    expect(mockPrisma.product.update.mock.calls[0][0].data).not.toHaveProperty('name');
  });

  it('producto sin bloqueo (nameLockedAt NULL): comportamiento previo (sobrescribe nombre) + lastSeenAt, contador en 0', async () => {
    mockExistingProducts([unlockedProduct]);

    const row = makeRow({ name: 'Nombre Nuevo De La Fila' });

    const result = await service.execute([row], makeCtx({ listaId: 'lista-x' }));

    expect(result.updated).toBe(1);
    expect(result.identityChangesDetected).toBe(0);
    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-libre' },
        data: expect.objectContaining({
          name: 'Nombre Nuevo De La Fila',
          lastSeenAt: expect.any(Date),
        }),
      }),
    );
  });
});
describe('BatchExecutorService — CAT-01 5.2: la carga masiva nunca mueve Product.listaId', () => {
  let service: BatchExecutorService;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const priceEntry = {
    priceListCode: 'INSTALADOR_IVA',
    priceListName: 'Instalador (con IVA)',
    value: 110,
    ivaMode: 'with_iva' as const,
    currency: 'COP',
  };

  const makeRow = (overrides?: Record<string, unknown>) => ({
    rowIndex: 0,
    sku: 'SKU-1',
    name: 'Cámara IP',
    description: 'desc',
    categoryName: 'CCTV',
    brandName: 'Hikvision',
    prices: [priceEntry],
    technicalSpecs: {},
    extraAttributes: {},
    isUpdate: false,
    nameIsFallback: false,
    ...overrides,
  });

  const makeCtx = (overrides?: Partial<ImportContext>): ImportContext => ({
    importId: 'import-1',
    userId: 'user-1',
    fileName: 'test.xlsx',
    fileSize: 1024,
    rawRows: [],
    headers: ['REFERENCIA', 'DESCRIPCION'],
    columnMapping: {
      entries: [
        { sourceColumn: 'REFERENCIA', targetField: 'sku', isRequired: true, confidence: 1.0 },
        { sourceColumn: 'DESCRIPCION', targetField: 'name', isRequired: true, confidence: 1.0 },
      ],
      confirmed: true,
    },
    ivaMode: 'with_iva',
    validatedRows: [],
    normalizedRows: [],
    pipelineErrors: [],
    startedAt: new Date(),
    currentStage: 'batch_execution',
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    service = new BatchExecutorService(
      mockPrisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );

    mockPrisma.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'CCTV', slug: 'cctv' },
    ]);
    mockPrisma.brand.findMany.mockResolvedValue([
      { id: 'brand-1', name: 'Hikvision', slug: 'hikvision' },
    ]);
    mockPrisma.priceList.findMany.mockResolvedValue([]);
    (mockPrisma.category as any).findFirst = jest.fn().mockResolvedValue(null);
    (mockPrisma.brand as any).findFirst = jest.fn().mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.price.findUnique.mockResolvedValue(null);
    mockPrisma.price.create.mockResolvedValue({ id: 'price-1' });
    mockPrisma.priceList.create.mockResolvedValue({ id: 'pl-1', code: 'INSTALADOR_IVA' });
    mockPrisma.lista.findUnique.mockResolvedValue(activeLista('lista-destino'));
  });

  it('producto existente en OTRA lista → conflicto OWNERSHIP sin escritura de precios ni de identidad', async () => {
    mockExistingProducts([
      { id: 'prod-ajeno', sku: 'SKU-1', nameLockedAt: null, listaId: 'lista-origen' },
    ]);

    const result = await service.execute([makeRow()], makeCtx({ listaId: 'lista-destino' }));

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rowIndex).toBe(0);
    expect(result.errors[0].sku).toBe('SKU-1');
    expect(result.errors[0].error).toMatch(/^OWNERSHIP:/);
    // Sin escritura de precios (el conflicto de pertenencia los bloquea).
    expect(mockPrisma.price.create).not.toHaveBeenCalled();
    expect(mockPrisma.price.update).not.toHaveBeenCalled();
    // Sin escritura de identidad ni de Product.listaId (nunca mueve el producto).
    expect(mockPrisma.product.update).not.toHaveBeenCalled();
    expect(mockPrisma.product.create).not.toHaveBeenCalled();
  });

  it('producto existente SIN lista → conflicto UNLINKED_TARGET; no se vincula (listas:link sin habilitar)', async () => {
    mockExistingProducts([
      { id: 'prod-suelto', sku: 'SKU-1', nameLockedAt: null, listaId: null },
    ]);

    const result = await service.execute([makeRow()], makeCtx({ listaId: 'lista-destino' }));

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/^UNLINKED_TARGET:/);
    // No se vincula: ninguna escritura sobre el producto ni sus precios.
    expect(mockPrisma.product.update).not.toHaveBeenCalled();
    expect(mockPrisma.product.create).not.toHaveBeenCalled();
    expect(mockPrisma.price.create).not.toHaveBeenCalled();
  });

  it('producto existente en la MISMA lista → actualiza identidad y upserta precios (control positivo)', async () => {
    mockExistingProducts([
      { id: 'prod-propio', sku: 'SKU-1', nameLockedAt: null, listaId: 'lista-destino' },
    ]);

    const result = await service.execute([makeRow()], makeCtx({ listaId: 'lista-destino' }));

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-propio' },
        data: expect.objectContaining({ name: 'Cámara IP' }),
      }),
    );
    expect(mockPrisma.price.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productId: 'prod-propio', value: 110 }),
      }),
    );
    // La actualización de un producto existente jamás escribe Product.listaId.
    expect(mockPrisma.product.update.mock.calls[0][0].data).not.toHaveProperty('listaId');
  });

  it('violación P2002 de SKU en una carga concurrente → error 409 CONFLICT conservando la unicidad', async () => {
    mockPrisma.product.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const result = await service.execute([makeRow()], makeCtx({ listaId: 'lista-destino' }));

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/^409 CONFLICT/);
  });
});

describe('BatchExecutorService — CAT-01 C7: lista destino archivada/inactiva denegada al inicio', () => {
  let service: BatchExecutorService;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const normalizedRow = {
    rowIndex: 0,
    sku: 'SKU-1',
    name: 'Cámara IP',
    description: 'desc',
    categoryName: 'CCTV',
    brandName: 'Hikvision',
    prices: [],
    technicalSpecs: {},
    extraAttributes: {},
    isUpdate: false,
    nameIsFallback: false,
  };

  const makeCtx = (overrides?: Partial<ImportContext>): ImportContext => ({
    importId: 'import-1',
    userId: 'user-1',
    fileName: 'test.xlsx',
    fileSize: 1024,
    rawRows: [],
    headers: ['REFERENCIA'],
    columnMapping: {
      entries: [{ sourceColumn: 'REFERENCIA', targetField: 'sku', isRequired: true, confidence: 1.0 }],
      confirmed: true,
    },
    ivaMode: 'with_iva',
    validatedRows: [],
    normalizedRows: [],
    pipelineErrors: [],
    startedAt: new Date(),
    currentStage: 'batch_execution',
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    service = new BatchExecutorService(
      mockPrisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
    mockPrisma.category.findMany.mockResolvedValue([]);
    mockPrisma.brand.findMany.mockResolvedValue([]);
    mockPrisma.priceList.findMany.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.category.create.mockResolvedValue({ id: 'cat-1', name: 'CCTV', slug: 'cctv' });
    mockPrisma.brand.create.mockResolvedValue({ id: 'brand-1', name: 'Hikvision', slug: 'hikvision' });
    mockPrisma.product.create.mockResolvedValue({
      id: 'prod-1',
      sku: 'SKU-1',
      name: 'Cámara IP',
      listaId: 'lista-general-1',
      isVisible: false,
    });
  });

  it('lista destino archivada → NotFoundException antes de procesar filas (caso 5.2)', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(
      activeLista('lista-arch', { isActive: false, archivedAt: new Date() }),
    );

    await expect(
      service.execute([normalizedRow], makeCtx({ listaId: 'lista-arch' })),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.product.create).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('lista destino inactiva (sin archivar) → NotFoundException (mismo patrón que ACL: se oculta la existencia)', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue(
      activeLista('lista-inactiva', { isActive: false }),
    );

    await expect(
      service.execute([normalizedRow], makeCtx({ listaId: 'lista-inactiva' })),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(mockPrisma.product.create).not.toHaveBeenCalled();
  });

  it('la regla de archivada aplica al destino EXPLÍCITO; el fallback LISTA-GENERAL conserva solo existencia', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-general-1', defaultVisibility: false });

    const result = await service.execute([normalizedRow], makeCtx());

    expect(result.created).toBe(1);
    expect(mockPrisma.lista.findUnique).toHaveBeenCalledWith({
      where: { code: 'LISTA-GENERAL' },
      select: { id: true, defaultVisibility: true },
    });
  });
});

/**
 * CAT-01 unidad B — concurrencia real (caso 5.3, contrato CAT-01 §5).
 *
 * Aceptación que acredita esta unidad (ficha, textual):
 *   «Concurrencia entre vínculo manual/cargas conserva unicidad y eventos.»
 *   «Carga a otra lista, incluida archivada, no mueve producto.»
 *
 * Ejecuta contra PostgreSQL DESECHABLE `grupo_security_tanda_t09` con
 * DATABASE_URL INLINE (nunca `.env`, que apunta a Neon de PRODUCCIÓN):
 *
 *   docker exec gs-tanda-db psql -U postgres -d postgres \
 *     -c "CREATE DATABASE grupo_security_tanda_t09;"
 *   DATABASE_URL='postgresql://postgres:tanda-test-2026@localhost:54331/grupo_security_tanda_t09?schema=public' \
 *     npx prisma migrate deploy --schema prisma/schema.prisma
 *
 * Dos PrismaClient = dos conexiones/pools reales: las promesas compiten de
 * verdad por las filas de `products` (bloqueo FOR UPDATE) y por el índice
 * único `products_sku_normalized_key`. Fixtures 100 % ficticias con prefijo
 * `T09-`, limpiadas en afterAll. Nunca toca la base viva de la API.
 */
jest.setTimeout(120_000);

describe('BatchExecutorService — CAT-01 5.3: concurrencia con PostgreSQL desechable', () => {
  const DATABASE_URL =
    'postgresql://postgres:tanda-test-2026@localhost:54331/grupo_security_tanda_t09?schema=public';

  // Dos clientes = dos conexiones reales independientes.
  const prismaA = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const prismaB = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  const auditA = new AuditService(prismaA as never, new HierarchyService(prismaA as never));
  const auditB = new AuditService(prismaB as never, new HierarchyService(prismaB as never));
  const aclB = new AclService(prismaB as never);
  // Vínculo manual: la misma ruta de escritura que usa PUT /api/products/:id
  // (ProductsService.update → prisma.product.update), con Super Admin (bypass ACL).
  const filesStub = { deleteByUrl: jest.fn().mockResolvedValue(undefined) };
  const productsManual = new ProductsService(
    prismaB as never,
    aclB as never,
    auditB as never,
    filesStub as never,
  );

  const svcA = new BatchExecutorService(prismaA as never, auditA as never);
  const svcB = new BatchExecutorService(prismaB as never, auditB as never);

  let userAId = '';
  let userBId = '';
  let adminId = '';
  let catId = '';
  let brandId = '';
  let catName = '';
  let brandName = '';

  const createdListaCodes: string[] = [];
  const createdPriceListCodes: string[] = [];

  const ADMIN = { userId: '', roles: ['Super Admin'] };

  const makeRow = (sku: string, priceListCode: string) => ({
    rowIndex: 0,
    sku,
    name: `Producto ${sku}`,
    description: 'carrera t09',
    categoryName: catName,
    brandName,
    prices: [
      {
        priceListCode,
        priceListName: priceListCode,
        value: 777,
        ivaMode: 'with_iva' as const,
        currency: 'COP',
      },
    ],
    technicalSpecs: {},
    extraAttributes: {},
    isUpdate: false,
    nameIsFallback: false,
  });

  const makeCtx = (listaId: string, userId: string, importId: string): ImportContext => ({
    importId,
    userId,
    fileName: 't09-race.xlsx',
    fileSize: 10,
    rawRows: [],
    headers: ['REFERENCIA'],
    columnMapping: {
      entries: [{ sourceColumn: 'REFERENCIA', targetField: 'sku', isRequired: true, confidence: 1.0 }],
      confirmed: true,
    },
    ivaMode: 'with_iva',
    validatedRows: [],
    normalizedRows: [],
    pipelineErrors: [],
    startedAt: new Date(),
    currentStage: 'batch_execution',
    listaId,
  });

  async function createLista(label: string) {
    const code = `T09-${label}-${Date.now()}`;
    createdListaCodes.push(code);
    return prismaA.lista.create({ data: { code, name: `Lista T09 ${label}` } });
  }

  async function createPriceList(label: string) {
    const code = `T09-PL-${label}-${Date.now()}`;
    createdPriceListCodes.push(code);
    return prismaA.priceList.create({ data: { name: code, code } });
  }

  beforeAll(async () => {
    await prismaA.$connect();
    await prismaB.$connect();
    ADMIN.userId = (
      await prismaA.user.create({
        data: {
          email: `t09-spec-admin-${Date.now()}@example.test`,
          name: 'T09 fixture admin',
          password: 'x'.repeat(20),
          isActive: true,
        },
        select: { id: true },
      })
    ).id;
    adminId = ADMIN.userId;
    userAId = (
      await prismaA.user.create({
        data: {
          email: `t09-spec-a-${Date.now()}@example.test`,
          name: 'T09 actor carga A',
          password: 'x'.repeat(20),
          isActive: true,
        },
        select: { id: true },
      })
    ).id;
    userBId = (
      await prismaA.user.create({
        data: {
          email: `t09-spec-b-${Date.now()}@example.test`,
          name: 'T09 actor carga B',
          password: 'x'.repeat(20),
          isActive: true,
        },
        select: { id: true },
      })
    ).id;
    catName = `T09 cat ${Date.now()}`;
    brandName = `T09 brand ${Date.now()}`;
    const category = await prismaA.category.create({
      data: { name: catName, slug: `t09-cat-${Date.now()}` },
    });
    catId = category.id;
    const brand = await prismaA.brand.create({
      data: { name: brandName, slug: `t09-brand-${Date.now()}` },
    });
    brandId = brand.id;
  });

  afterAll(async () => {
    await prismaA.auditLog.deleteMany({
      where: { entityId: { startsWith: 't09-import-' } },
    });
    await prismaA.price.deleteMany({ where: { product: { sku: { startsWith: 'T09-' } } } });
    await prismaA.product.deleteMany({ where: { sku: { startsWith: 'T09-' } } });
    await prismaA.lista.deleteMany({ where: { code: { startsWith: 'T09-' } } });
    await prismaA.priceList.deleteMany({ where: { code: { startsWith: 'T09-' } } });
    await prismaA.category.deleteMany({ where: { id: catId } });
    await prismaA.brand.deleteMany({ where: { id: brandId } });
    await prismaA.user.deleteMany({ where: { email: { startsWith: 't09-spec-' } } });
    await prismaA.$disconnect();
    await prismaB.$disconnect();
  });

  it('dos cargas simultáneas por el mismo SKU nuevo en listas distintas: exactamente una gana, la otra recibe 409/OWNERSHIP y ambos eventos quedan auditados', async () => {
    const [listaB, listaC, pl] = await Promise.all([
      createLista('RACE-B'),
      createLista('RACE-C'),
      createPriceList('RACE'),
    ]);
    const sku = `T09-RACE-SKU-${Date.now()}`;
    const rowB = makeRow(sku, pl.code);
    const rowC = makeRow(sku, pl.code);

    const [resA, resB] = await Promise.all([
      svcA.execute([rowB], makeCtx(listaB.id, userAId, 't09-import-race-a')),
      svcB.execute([rowC], makeCtx(listaC.id, userBId, 't09-import-race-b')),
    ]);

    // Exactamente una carga crea el producto; la otra queda como conflicto.
    const winners = [resA, resB].filter((r) => r.created === 1);
    const losers = [resA, resB].filter((r) => r.created === 0);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].skipped).toBe(1);
    // El perdedor recibe la semántica 409: o la carrera de CREATE (P2002→409
    // CONFLICT) o, si su lectura fue posterior, el gate OWNERSHIP.
    expect(losers[0].errors[0].error).toMatch(/^(409 CONFLICT|OWNERSHIP):/);

    // Unicidad conservada: un solo producto y el índice normalizado intacto.
    const products = await prismaA.product.findMany({ where: { sku } });
    expect(products).toHaveLength(1);
    expect([listaB.id, listaC.id]).toContain(products[0].listaId);
    await expect(
      prismaA.product.create({
        data: { sku: `${sku.toLowerCase()} `, name: 'Clon T09', categoryId: catId, brandId },
      }),
    ).rejects.toThrow();

    // Ambos eventos en auditoría con actor y resultado.
    const logs = await prismaA.auditLog.findMany({
      where: {
        action: 'IMPORT_PRODUCTS',
        entityId: { in: ['t09-import-race-a', 't09-import-race-b'] },
      },
    });
    expect(logs).toHaveLength(2);
    const byEntity = new Map(logs.map((l) => [l.entityId, l]));
    expect(byEntity.get('t09-import-race-a')!.userId).toBe(userAId);
    expect(byEntity.get('t09-import-race-b')!.userId).toBe(userBId);
    const nvA = byEntity.get('t09-import-race-a')!.newValues as Record<string, number>;
    const nvB = byEntity.get('t09-import-race-b')!.newValues as Record<string, number>;
    expect(nvA.created + nvB.created).toBe(1);
    expect(nvA.skipped + nvB.skipped).toBe(1);
  });

  it('vínculo manual (PUT /products/:id {listaId}) vs carga sobre el mismo producto: la carga nunca mueve listaId y no escribe precios si perdió la lectura', async () => {
    const [listaA, listaD, plManual] = await Promise.all([
      createLista('MANUAL-A'),
      createLista('MANUAL-D'),
      createPriceList('MANUAL'),
    ]);
    const sku = `T09-MANUAL-SKU-${Date.now()}`;
    const product = await prismaA.product.create({
      data: {
        sku,
        name: 'Producto manual T09',
        categoryId: catId,
        brandId,
        listaId: listaA.id,
        isActive: true,
      },
    });

    // Compiten a la vez: el vínculo manual reasigna a D; la carga apunta a A.
    const [manualRes, batchRes] = await Promise.all([
      productsManual.update(product.id, { listaId: listaD.id } as never, ADMIN),
      svcA.execute([makeRow(sku, plManual.code)], makeCtx(listaA.id, userAId, 't09-import-manual-batch')),
    ]);

    // El vínculo manual gana siempre su escritura (acción explícita).
    expect(manualRes.listaId).toBe(listaD.id);

    // La carga jamás mueve Product.listaId: el producto queda donde lo puso el
    // vínculo manual, y un solo producto existe para ese SKU normalizado.
    const finalProduct = await prismaA.product.findUnique({ where: { id: product.id } });
    expect(finalProduct!.listaId).toBe(listaD.id);
    expect(
      await prismaA.product.count({
        where: { sku: { in: [sku, sku.toLowerCase()] } },
      }),
    ).toBe(1);

    // Exclusión mutua: los precios de la carga existen IFF la carga leyó al
    // producto aún en la lista A (updated=1). Si perdió la carrera, OWNERSHIP
    // sin escritura de precios.
    const racePrices = await prismaA.price.count({
      where: { productId: product.id, priceListId: plManual.id },
    });
    expect(batchRes.created).toBe(0);
    expect(batchRes.updated + batchRes.skipped).toBe(1);
    expect((batchRes.updated === 1)).toBe(racePrices === 1);
    if (batchRes.updated === 0) {
      expect(batchRes.errors[0].error).toMatch(/^OWNERSHIP:/);
    }

    // El evento de la carga queda en auditoría con actor y resultado.
    const log = await prismaA.auditLog.findFirst({
      where: { action: 'IMPORT_PRODUCTS', entityId: 't09-import-manual-batch' },
    });
    expect(log).not.toBeNull();
    expect(log!.userId).toBe(userAId);
    const nv = log!.newValues as Record<string, number>;
    expect(nv.created).toBe(0);
    expect(nv.updated + nv.skipped).toBe(1);
  });

  it('lista destino archivada en ejecución real: la carga se deniega con 404 y no escribe nada', async () => {
    const listaArch = await createLista('ARCHIVED');
    await prismaA.lista.update({
      where: { id: listaArch.id },
      data: { archivedAt: new Date(), isActive: false },
    });

    await expect(
      svcA.execute(
        [makeRow(`T09-ARCH-SKU-${Date.now()}`, 'T09-PL-NONE')],
        makeCtx(listaArch.id, userAId, 't09-import-archived'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(await prismaA.product.count({ where: { listaId: listaArch.id } })).toBe(0);
  });
});
