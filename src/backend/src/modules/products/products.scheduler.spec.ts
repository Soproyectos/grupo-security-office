import { Logger } from '@nestjs/common';
import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AclService } from '../../common/acl/acl.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';

const mockPrisma = createPrismaMock();
mockPrisma.price.deleteMany = jest.fn();

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
const mockFiles = {
  store: jest.fn().mockResolvedValue({ id: 'file-1', url: '/api/files/file-1' }),
  get: jest.fn(),
  deleteByUrl: jest.fn().mockResolvedValue(undefined),
};
const mockMasterKey = { validateMasterKey: jest.fn().mockResolvedValue(false) };

const mockAcl = {
  isSuperAdmin: jest.fn().mockReturnValue(false),
  levelsAtLeast: jest.fn().mockReturnValue(['manage']),
  getAllowedListaIds: jest.fn().mockResolvedValue([]),
  getUserLevel: jest.fn().mockResolvedValue(null),
  assertListaAccess: jest.fn().mockResolvedValue(undefined),
  assertProductAccess: jest.fn().mockResolvedValue(undefined),
  assertPriceAccess: jest.fn().mockResolvedValue(undefined),
  can: jest.fn().mockResolvedValue(false),
};

/** Producto en DRAFT con programación de publicación (publishAt vencido por defecto). */
function scheduledProduct(overrides: Record<string, any> = {}) {
  return {
    id: 'p1',
    sku: 'CAM-SCH',
    name: 'Cámara Programada',
    categoryId: 'cat-1',
    brandId: 'brand-1',
    listaId: 'lista-1',
    isActive: false,
    isVisible: false,
    publishStatus: 'borrador',
    lifecycleStatus: 'DRAFT',
    publishedAt: null,
    publishAt: new Date(Date.now() - 2 * 60 * 1000),
    unpublishAt: null,
    publishedById: null,
    unpublishReason: null,
    ...overrides,
  };
}

describe('ProductsService — scheduler P6 (cron cada minuto, programación sobre DRAFT)', () => {
  let service: ProductsService;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.productChange.createMany.mockResolvedValue({ count: 0 });
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', isActive: true, archivedAt: null });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AclService, useValue: mockAcl },
        { provide: AuditService, useValue: mockAudit },
        { provide: FilesService, useValue: mockFiles },
        { provide: Object, useValue: mockMasterKey },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
  });

  describe('processScheduledPublishes', () => {
    it('publica los DRAFT con publishAt vencido aplicando PUBLISH (audit publish, sin SCHEDULED)', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', sku: 'CAM-SCH', name: 'Cámara Programada' },
      ]);
      mockPrisma.product.findUnique.mockResolvedValue(scheduledProduct());
      mockPrisma.price.count.mockResolvedValue(1);
      mockPrisma.productImage.count.mockResolvedValue(1);
      mockPrisma.stock.findUnique.mockResolvedValue(null);
      mockPrisma.product.update.mockResolvedValue(scheduledProduct({ lifecycleStatus: 'PUBLISHED' }));

      const result = await service.handleLifecycleTick();

      expect(result.skipped).toBe(false);
      expect(result.publishOk).toBe(1);
      expect(result.publishFailed).toHaveLength(0);
      // Query candidata condicional: solo DRAFT con publishAt <= now.
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            lifecycleStatus: 'DRAFT',
            publishAt: { lte: expect.any(Date) },
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'publish', entity: 'Product', entityId: 'p1' }),
      );
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1' },
          data: expect.objectContaining({ lifecycleStatus: 'PUBLISHED', isVisible: true }),
        }),
      );
    });

    it('checklist fallido → NO cambia estado, registra warn y cuenta en publishFailed', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', sku: 'CAM-SCH', name: 'Cámara Programada' },
      ]);
      mockPrisma.product.findUnique.mockResolvedValue(scheduledProduct());
      // Lista archivada + sin precios ni imágenes: fallan (a),(c),(d).
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', isActive: true, archivedAt: new Date() });
      mockPrisma.price.count.mockResolvedValue(0);
      mockPrisma.productImage.count.mockResolvedValue(0);
      mockPrisma.stock.findUnique.mockResolvedValue(null);

      const result = await service.processScheduledPublishes();

      expect(result.publishOk).toBe(0);
      expect(result.publishFailed).toHaveLength(1);
      expect(result.publishFailed[0].id).toBe('p1');
      expect(result.publishFailed[0].reasons).toMatch(/lista destino|precio vigente|imagen/);
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('[scheduler]'));
    });

    it('no procesa productos con publishAt futuro (query condicional excluye)', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      const result = await service.processScheduledPublishes();

      expect(result.publishOk).toBe(0);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            lifecycleStatus: 'DRAFT',
            publishAt: { lte: expect.any(Date) },
          }),
        }),
      );
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    it('idempotencia: un producto ya publicado (nuevo DRAFT sin publishAt) no se vuelve a procesar', async () => {
      mockPrisma.product.findMany
        .mockResolvedValueOnce([{ id: 'p1', sku: 'CAM-SCH', name: 'Cámara Programada' }]) // tick 1
        .mockResolvedValueOnce([]); // tick 2: PUBLISH dejó publishAt null, no matchea DRAFT+publishAt
      mockPrisma.product.findUnique.mockResolvedValue(scheduledProduct());
      mockPrisma.price.count.mockResolvedValue(1);
      mockPrisma.productImage.count.mockResolvedValue(1);
      mockPrisma.stock.findUnique.mockResolvedValue(null);
      mockPrisma.product.update.mockResolvedValue(scheduledProduct({ lifecycleStatus: 'PUBLISHED', publishAt: null }));

      const first = await service.handleLifecycleTick();
      const second = await service.handleLifecycleTick();

      expect(first.publishOk).toBe(1);
      expect(second.publishOk).toBe(0);
      expect(mockPrisma.product.update).toHaveBeenCalledTimes(1);
      expect(mockAudit.log).toHaveBeenCalledTimes(1);
    });

    it('scheduler ejecuta PUBLISH por vía interna (skipHumanAccessChecks=true) omitiendo RBAC/ACL humano', async () => {
      // La ruta pública (transition/doTransition con skipHumanAccessChecks=false) exige
      // RBAC y ACL. El scheduler la invoca con skipHumanAccessChecks=true y sin ctx,
      // por lo que un producto programado se publica incluso si el usuario humano no
      // tendría permiso (el scheduler no es humano). Se verifica que la transición
      // avanza hasta el checklist y update, sin depender de roles/ACL.
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', sku: 'CAM-SCH', name: 'Cámara Programada' },
      ]);
      mockPrisma.product.findUnique.mockResolvedValue(scheduledProduct());
      mockPrisma.price.count.mockResolvedValue(1);
      mockPrisma.productImage.count.mockResolvedValue(1);
      mockPrisma.stock.findUnique.mockResolvedValue(null);
      mockPrisma.product.update.mockResolvedValue(scheduledProduct({ lifecycleStatus: 'PUBLISHED' }));

      const result = await service.processScheduledPublishes();

      expect(result.publishOk).toBe(1);
      // Se ejecuta sin pasar ctx (undefined), lo que sumado a skipHumanAccessChecks=true
      // hace que RBAC y ACL se omitan explícitamente.
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lifecycleStatus: 'PUBLISHED' }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'publish', entityId: 'p1' }),
      );
    });
  });

  describe('no existe auto-despublicación por unpublishAt', () => {
    it('handleLifecycleTick no consulta unpublishAt ni produce unpublishOk', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);

      const result = await service.handleLifecycleTick();

      expect(result).not.toHaveProperty('unpublishOk');
      // No hubo query por PUBLISHED + unpublishAt (el reporte no incluye la rama).
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ lifecycleStatus: 'DRAFT' }),
        }),
      );
    });
  });

  describe('handleLifecycleTick — lock en memoria', () => {
    it('descarta el tick si el anterior aún corre (skipped: true, sin consultas)', async () => {
      (service as any).lifecycleTickRunning = true;

      const result = await service.handleLifecycleTick();

      expect(result.skipped).toBe(true);
      expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
    });

    it('libera el lock al terminar (finally)', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await service.handleLifecycleTick();

      expect((service as any).lifecycleTickRunning).toBe(false);
    });
  });
});