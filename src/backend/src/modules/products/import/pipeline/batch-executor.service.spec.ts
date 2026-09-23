import { createPrismaMock } from '../../../../__test__/mocks/prisma.mock';
import { NotFoundException } from '@nestjs/common';
import { BatchExecutorService } from './batch-executor.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { ImportContext } from '../interfaces/import-context';

const mockPrisma = createPrismaMock();

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
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', defaultVisibility: false });

    const result = await service.execute([normalizedRow], makeCtx({ listaId: 'lista-x' }));

    expect(result.created).toBe(1);
    expect(mockPrisma.lista.findUnique).toHaveBeenCalledWith({
      where: { id: 'lista-x' },
      select: { id: true, defaultVisibility: true },
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
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-v', defaultVisibility: true });

    await service.execute([normalizedRow], makeCtx({ listaId: 'lista-v' }));

    expect(mockPrisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ listaId: 'lista-v', isVisible: true }),
      }),
    );
  });

  it('no asigna catalogId al producto creado (catálogo eliminado)', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', defaultVisibility: false });

    await service.execute([normalizedRow], makeCtx({ listaId: 'lista-x' }));

    expect(mockPrisma.product.create.mock.calls[0][0].data).not.toHaveProperty('catalogId');
  });

  it('actualización con nameIsFallback=true no sobrescribe el nombre real ya guardado (lista sin nombre/descripción)', async () => {
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', defaultVisibility: false });
    mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod-existente', sku: 'SKU-1' }]);

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
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', defaultVisibility: false });
    mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod-existente', sku: 'SKU-1' }]);

    const result = await service.execute([normalizedRow], makeCtx({ listaId: 'lista-x' }));

    expect(result.updated).toBe(1);
    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-existente' },
        data: expect.objectContaining({ name: 'Cámara IP' }),
      }),
    );
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
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', defaultVisibility: false });

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
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', defaultVisibility: false });
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
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', defaultVisibility: false });

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
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', defaultVisibility: false });
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
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', defaultVisibility: false });
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
  };

  const unlockedProduct = {
    id: 'prod-libre',
    sku: 'SKU-1',
    name: 'Nombre Técnico Original',
    description: 'Descripción original',
    categoryId: 'cat-1',
    brandId: 'brand-1',
    nameLockedAt: null as Date | null,
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
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', defaultVisibility: false });
    mockPrisma.priceList.create.mockResolvedValue({ id: 'pl-1', code: 'INSTALADOR_IVA' });
    mockPrisma.price.findUnique.mockResolvedValue(null);
    mockPrisma.price.create.mockResolvedValue({ id: 'price-1' });
  });

  it('producto bloqueado: NO sobrescribe identidad, SÍ upserta precios y marca lastSeenAt', async () => {
    mockPrisma.product.findMany.mockResolvedValue([lockedProduct]);

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
    mockPrisma.product.findMany.mockResolvedValue([lockedProduct]);

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
    mockPrisma.product.findMany.mockResolvedValue([unlockedProduct]);

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