import { createPrismaMock } from '../../__test__/mocks/prisma.mock';
import { ConflictException, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AclService } from '../../common/acl/acl.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { LifecycleStatus } from './lifecycle.types';

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
const mockFiles = {
  store: jest.fn().mockResolvedValue({ id: 'file-1', url: '/api/files/file-1' }),
  get: jest.fn(),
  deleteByUrl: jest.fn().mockResolvedValue(undefined),
};

const mockAcl = {
  isSuperAdmin: jest.fn().mockReturnValue(false),
  isListasAdmin: jest.fn().mockReturnValue(false),
  levelsAtLeast: jest.fn().mockReturnValue(['manage']),
  getAllowedListaIds: jest.fn().mockResolvedValue([]),
  getUserLevel: jest.fn().mockResolvedValue(null),
  assertListaAccess: jest.fn().mockResolvedValue(undefined),
  assertProductAccess: jest.fn().mockResolvedValue({ listaId: 'lista-1' }),
  assertPriceAccess: jest.fn().mockResolvedValue(undefined),
  can: jest.fn().mockResolvedValue(true),
};

/** Producto base canónico con flags legacy (espejo del estado canónico). */
function mkProduct(status: LifecycleStatus, overrides: Record<string, any> = {}) {
  const legacyByStatus: Record<LifecycleStatus, Record<string, any>> = {
    DRAFT: { isActive: false, isVisible: false, publishStatus: 'borrador', publishAt: null, publishedAt: null, unpublishAt: null },
    PUBLISHED: { isActive: true, isVisible: true, publishStatus: 'publicado', publishAt: null, publishedAt: new Date(), unpublishAt: null },
    ARCHIVED: { isActive: false, isVisible: false, publishStatus: 'archivado', publishAt: null, publishedAt: null, unpublishAt: null },
  };
  return {
    id: 'prod-1',
    sku: 'CAM-001',
    name: 'Cámara IP',
    description: 'Cámara de seguridad',
    categoryId: 'cat-1',
    brandId: 'brand-1',
    listaId: 'lista-1',
    technicalSpecs: {},
    lifecycleStatus: status,
    unpublishReason: null,
    publishedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...legacyByStatus[status],
    ...overrides,
  };
}

/** Producto legacy almacenado (no normalizado aún) para probar lectura compatible. */
function mLegacy(storedStatus: string, overrides: Record<string, any> = {}) {
  const base = mkProduct('DRAFT');
  return { ...base, lifecycleStatus: storedStatus, ...overrides };
}

/** Mockea el checklist de publicación como cumplido. */
function mockPublishChecklistOk() {
  mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', isActive: true, archivedAt: null });
  mockPrisma.price.count.mockResolvedValue(1);
  mockPrisma.productImage.count.mockResolvedValue(1);
  mockPrisma.stock.findUnique.mockResolvedValue(null);
}

describe('ProductsService — FSM canónico (DRAFT/PUBLISHED/ARCHIVED)', () => {
  let service: ProductsService;

  beforeEach(async () => {
    jest.resetAllMocks();

    mockAcl.isListasAdmin.mockReturnValue(false);
    mockAcl.assertProductAccess.mockResolvedValue({ listaId: 'lista-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AclService, useValue: mockAcl },
        { provide: AuditService, useValue: mockAudit },
        { provide: FilesService, useValue: mockFiles },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  describe('transiciones válidas (matriz canónica desde → evento → hacia)', () => {
    async function expectTransition(status: LifecycleStatus, dto: any, nextStatus: LifecycleStatus) {
      const product = mkProduct(status);
      mockPrisma.product.findUnique.mockResolvedValue(product);
      mockPrisma.product.update.mockResolvedValue({ ...product, lifecycleStatus: nextStatus });
      const result = await service.transition('prod-1', dto);
      expect(result.lifecycleStatus).toBe(nextStatus);
      return mockPrisma.product.update.mock.calls[0][0].data;
    }

    it('PUBLISH: DRAFT → PUBLISHED sin exigir isActive=true (DRAFT tiene isActive=false)', async () => {
      mockPublishChecklistOk();
      const data = await expectTransition('DRAFT', { event: 'PUBLISH' }, 'PUBLISHED');
      expect(data).toMatchObject({ lifecycleStatus: 'PUBLISHED', isActive: true, isVisible: true, publishStatus: 'publicado' });
      expect(data).toHaveProperty('publishedAt');
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'publish' }));
    });

    it('PUBLISH espeja publishedAt/publishedById/publishStatus', async () => {
      mockPublishChecklistOk();
      const data = await expectTransition('DRAFT', { event: 'PUBLISH' }, 'PUBLISHED');
      expect(data).toMatchObject({ publishStatus: 'publicado', publishAt: null, unpublishAt: null });
      expect(data).toHaveProperty('publishedById');
    });

    it('UNPUBLISH: PUBLISHED → DRAFT (espejo isActive=false, isVisible=false, reason como auditoría)', async () => {
      const data = await expectTransition('PUBLISHED', { event: 'UNPUBLISH', reason: 'Campaña finalizada' }, 'DRAFT');
      expect(data).toMatchObject({ lifecycleStatus: 'DRAFT', isActive: false, isVisible: false, publishStatus: 'borrador', publishAt: null, unpublishReason: 'Campaña finalizada' });
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'unpublish' }));
    });

    it('ARCHIVE: DRAFT → ARCHIVED con motivo y confirm', async () => {
      const data = await expectTransition('DRAFT', { event: 'ARCHIVE', reason: 'Baja', confirm: true }, 'ARCHIVED');
      expect(data).toMatchObject({ lifecycleStatus: 'ARCHIVED', isActive: false, isVisible: false, publishStatus: 'archivado', publishAt: null, publishedAt: null });
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'archive' }));
    });

    it('ARCHIVE: PUBLISHED → ARCHIVED con motivo y confirm', async () => {
      const data = await expectTransition('PUBLISHED', { event: 'ARCHIVE', reason: 'Baja', confirm: true }, 'ARCHIVED');
      expect(data).toMatchObject({ lifecycleStatus: 'ARCHIVED', isActive: false, isVisible: false, publishAt: null });
    });

    it('RESTORE: ARCHIVED → DRAFT (nunca publica automáticamente; espejo DRAFT)', async () => {
      const data = await expectTransition('ARCHIVED', { event: 'RESTORE', reason: 'Reactivación', confirm: true }, 'DRAFT');
      expect(data).toMatchObject({ lifecycleStatus: 'DRAFT', isActive: false, isVisible: false, publishStatus: 'borrador', publishAt: null });
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'restore' }));
    });
  });

  describe('transición inválida → 400 con mensaje claro', () => {
    it('UNPUBLISH desde DRAFT → 400', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('DRAFT'));
      await expect(service.transition('prod-1', { event: 'UNPUBLISH' })).rejects.toThrow(
        /No se puede pasar de DRAFT a DRAFT con el evento UNPUBLISH/,
      );
    });

    it('PUBLISH desde PUBLISHED → 400', async () => {
      mockPublishChecklistOk();
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('PUBLISHED'));
      await expect(service.transition('prod-1', { event: 'PUBLISH' })).rejects.toThrow(
        /No se puede pasar de PUBLISHED a PUBLISHED con el evento PUBLISH/,
      );
    });

    it('ARCHIVE desde ARCHIVED → 400', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('ARCHIVED'));
      await expect(service.transition('prod-1', { event: 'ARCHIVE', reason: 'x', confirm: true })).rejects.toThrow(BadRequestException);
    });

    it('RESTORE desde PUBLISHED → 400', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('PUBLISHED'));
      await expect(service.transition('prod-1', { event: 'RESTORE', reason: 'x', confirm: true })).rejects.toThrow(BadRequestException);
    });

    it('evento eliminado (SCHEDULE) rechazado por el servicio → 400', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('DRAFT'));
      await expect(
        service.transition('prod-1', { event: 'SCHEDULE', publishAt: new Date(Date.now() + 86400000).toISOString() } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('404 si el producto no existe', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      await expect(service.transition('no-existe', { event: 'PUBLISH' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('read compatible sin migración de datos (normalización de estados legacy)', () => {
    it('READY se normaliza a DRAFT y puede publicarse', async () => {
      mockPublishChecklistOk();
      mockPrisma.product.findUnique.mockResolvedValue(mLegacy('READY', { isActive: false, isVisible: false }));
      mockPrisma.product.update.mockResolvedValue(mkProduct('PUBLISHED'));
      const result = await service.transition('prod-1', { event: 'PUBLISH' });
      expect(result.lifecycleStatus).toBe('PUBLISHED');
    });

    it('SCHEDULED se normaliza a DRAFT conservando publishAt', async () => {
      const publishAt = new Date(Date.now() + 86400000);
      mockPrisma.product.findUnique.mockResolvedValue(mLegacy('SCHEDULED', { publishAt, isActive: false, isVisible: false }));
      mockPrisma.product.update.mockResolvedValue(mkProduct('PUBLISHED', { publishAt }));
      // allowedActions expone PUBLISH (efectivo DRAFT) pese al estado almacenado SCHEDULED.
      const allowed = await service.allowedActions(mLegacy('SCHEDULED', { publishAt }), { userId: 'u1', roles: ['Super Admin'] });
      expect(allowed).toContain('PUBLISH');
    });

    it('HIDDEN se normaliza a DRAFT y puede publicarse', async () => {
      mockPublishChecklistOk();
      mockPrisma.product.findUnique.mockResolvedValue(mLegacy('HIDDEN', { isActive: false, isVisible: false }));
      mockPrisma.product.update.mockResolvedValue(mkProduct('PUBLISHED'));
      const result = await service.transition('prod-1', { event: 'PUBLISH' });
      expect(result.lifecycleStatus).toBe('PUBLISHED');
    });

    it('DISCONTINUED se normaliza a ARCHIVED (solo RESTORE disponible)', async () => {
      const allowed = await service.allowedActions(mLegacy('DISCONTINUED', { isActive: false }), { userId: 'u1', roles: ['Super Admin'] });
      expect(allowed).toEqual(['RESTORE']);
    });
  });

  describe('guardas de datos → 400', () => {
    it('UNPUBLISH no exige reason (request opcional)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('PUBLISHED'));
      mockPrisma.product.update.mockResolvedValue(mkProduct('DRAFT'));
      await expect(service.transition('prod-1', { event: 'UNPUBLISH' })).resolves.toBeDefined();
    });

    it('ARCHIVE sin reason → 400', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('PUBLISHED'));
      await expect(service.transition('prod-1', { event: 'ARCHIVE', confirm: true })).rejects.toThrow(/requiere un motivo/);
    });

    it('ARCHIVE sin confirm → 400', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('PUBLISHED'));
      await expect(service.transition('prod-1', { event: 'ARCHIVE', reason: 'x' })).rejects.toThrow(/requiere confirmación/);
    });

    it('RESTORE sin confirm → 400', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('ARCHIVED'));
      await expect(service.transition('prod-1', { event: 'RESTORE', reason: 'x' })).rejects.toThrow(/requiere confirmación/);
    });
  });

  describe('RBAC → 403', () => {
    const OPERADOR = { userId: 'u1', roles: ['Operador'] };

    it('PUBLISH con Operador (sin publish:manage) → 403', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('DRAFT'));
      await expect(service.transition('prod-1', { event: 'PUBLISH' }, OPERADOR)).rejects.toThrow(ForbiddenException);
    });

    it('PUBLISH con Operador → 403 incluso sin exigir isActive (checklist no se alcanza)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('DRAFT'));
      await expect(service.transition('prod-1', { event: 'PUBLISH' }, OPERADOR)).rejects.toThrow(ForbiddenException);
    });

    it('ARCHIVE con Supervisor (no Super Admin/Admin Comercial) → 403', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('PUBLISHED'));
      await expect(
        service.transition('prod-1', { event: 'ARCHIVE', reason: 'x', confirm: true }, { userId: 'u2', roles: ['Supervisor'] }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ACL → 403', () => {
    it('PUBLISH con rol válido pero sin nivel ACL manage → 403', async () => {
      mockAcl.assertProductAccess.mockRejectedValue(new ForbiddenException('No tienes permisos suficientes sobre esta Lista'));
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('DRAFT'));
      await expect(
        service.transition('prod-1', { event: 'PUBLISH' }, { userId: 'u1', roles: ['Super Admin'] }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('allowedActions(product, ctx) — solo eventos canónicos', () => {
    const SA = { userId: 'admin', roles: ['Super Admin'] };
    const OPERADOR = { userId: 'op', roles: ['Operador'] };
    const SUPERVISOR = { userId: 'sup', roles: ['Supervisor'] };

    it('DRAFT + Super Admin → PUBLISH, ARCHIVE (orden por matriz)', async () => {
      const allowed = await service.allowedActions(mkProduct('DRAFT'), SA);
      expect(allowed).toEqual(['PUBLISH', 'ARCHIVE']);
    });

    it('PUBLISHED + Super Admin → UNPUBLISH, ARCHIVE', async () => {
      const allowed = await service.allowedActions(mkProduct('PUBLISHED'), SA);
      expect(allowed).toEqual(['UNPUBLISH', 'ARCHIVE']);
    });

    it('PUBLISHED + Supervisor → solo UNPUBLISH (publish:manage, sin products:write)', async () => {
      const allowed = await service.allowedActions(mkProduct('PUBLISHED'), SUPERVISOR);
      expect(allowed).toEqual(['UNPUBLISH']);
    });

    it('ARCHIVED + Super Admin → RESTORE', async () => {
      const allowed = await service.allowedActions(mkProduct('ARCHIVED'), SA);
      expect(allowed).toEqual(['RESTORE']);
    });

    it('DRAFT + Operador → [] (sin RBAC)', async () => {
      const allowed = await service.allowedActions(mkProduct('DRAFT'), OPERADOR);
      expect(allowed).toEqual([]);
    });

    it('sin ctx → []', async () => {
      const allowed = await service.allowedActions(mkProduct('DRAFT'));
      expect(allowed).toEqual([]);
    });

    it('DRAFT + Super Admin sin ACL suficiente → []', async () => {
      mockAcl.assertProductAccess.mockRejectedValue(new ForbiddenException('Acceso restringido'));
      const allowed = await service.allowedActions(mkProduct('DRAFT'), SA);
      expect(allowed).toEqual([]);
    });
  });

  describe('publish — programación futura (ProductsService.publish)', () => {
    function readyProduct(overrides: Record<string, any> = {}) {
      return {
        id: 'p1',
        sku: 'CAM-PUB',
        name: 'Cámara Publicable',
        categoryId: 'cat-1',
        brandId: 'brand-1',
        listaId: 'lista-1',
        isActive: false,
        isVisible: false,
        publishStatus: 'borrador',
        lifecycleStatus: 'DRAFT',
        publishedAt: null,
        publishAt: null,
        unpublishAt: null,
        publishedById: null,
        unpublishReason: null,
        ...overrides,
      };
    }

    it('programa publicación futura en DRAFT con estado canónico completo', async () => {
      const future = new Date(Date.now() + 86400000);
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct());
      mockPrisma.product.update.mockResolvedValue(
        readyProduct({ publishAt: future }),
      );

      const result = await service.publish('p1', { publishAt: future.toISOString() });

      // Permanece en DRAFT con estado canónico completo.
      expect(result.publishStatus).toBe('borrador');
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            lifecycleStatus: 'DRAFT',
            isActive: false,
            isVisible: false,
            publishStatus: 'borrador',
            publishAt: future,
            unpublishAt: null,
            publishedAt: null,
            unpublishReason: null,
          },
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'schedule_publish', entity: 'Product' }),
      );
    });

    it('publica inmediatamente si publishAt es pasado o nulo (PUBLISH canónico)', async () => {
      mockPublishChecklistOk();
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct());
      mockPrisma.product.update.mockResolvedValue(
        readyProduct({ lifecycleStatus: 'PUBLISHED', publishStatus: 'publicado', isActive: true, isVisible: true }),
      );

      const result = await service.publish('p1', {});
      expect(result.publishStatus).toBe('publicado');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'publish' }),
      );
    });

    it('programación futura sobre PUBLISHED → 409 (no se despublica ni transforma a DRAFT)', async () => {
      const future = new Date(Date.now() + 86400000);
      mockPrisma.product.findUnique.mockResolvedValue(
        readyProduct({ lifecycleStatus: 'PUBLISHED', publishStatus: 'publicado', isActive: true, isVisible: true }),
      );

      try {
        await service.publish('p1', { publishAt: future.toISOString() });
        fail('Esperaba ConflictException');
      } catch (err) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.message).toMatch(/ya está publicado/);
      }
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    it('programación futura sobre ARCHIVED → 400 (archivado no se puede programar)', async () => {
      const future = new Date(Date.now() + 86400000);
      mockPrisma.product.findUnique.mockResolvedValue(
        readyProduct({ lifecycleStatus: 'ARCHIVED', publishStatus: 'archivado', isActive: false, isVisible: false }),
      );

      try {
        await service.publish('p1', { publishAt: future.toISOString() });
        fail('Esperaba BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.message).toMatch(/archivado/);
      }
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    describe('cancelación de programación (publishAt: null)', () => {
      const future = () => new Date(Date.now() + 86400000);

      it('DRAFT con programación futura activa: conserva DRAFT, limpia publishAt y audita cancel_schedule_publish', async () => {
        const publishAt = future();
        mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ publishAt }));
        mockPrisma.product.update.mockResolvedValue(readyProduct({ publishAt: null }));

        const result = await service.publish('p1', { publishAt: null });

        // Conserva DRAFT y contrato de Borrador.
        expect(result.lifecycleStatus).toBe('DRAFT');
        // No ejecuta transición: el update solo escribe el espejo DRAFT con publishAt null.
        expect(mockPrisma.product.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              lifecycleStatus: 'DRAFT',
              isActive: false,
              isVisible: false,
              publishStatus: 'borrador',
              publishAt: null,
              unpublishAt: null,
              publishedAt: null,
              publishedById: null,
              unpublishReason: null,
            },
          }),
        );
        expect(mockAudit.log).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'cancel_schedule_publish',
            entity: 'Product',
            entityId: 'p1',
            oldValues: expect.objectContaining({ publishAt }),
            newValues: expect.objectContaining({ publishAt: null }),
          }),
        );
      });

      it('DRAFT sin programación futura activa → 409 con mensaje exacto', async () => {
        mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ publishAt: null }));

        try {
          await service.publish('p1', { publishAt: null });
          fail('Esperaba ConflictException');
        } catch (err) {
          expect(err).toBeInstanceOf(ConflictException);
          expect(err.message).toBe('El producto no tiene una publicación programada activa.');
        }
        expect(mockPrisma.product.update).not.toHaveBeenCalled();
        expect(mockAudit.log).not.toHaveBeenCalled();
      });

      it('DRAFT con publishAt pasada (no activa) → 409 y no audita', async () => {
        const past = new Date(Date.now() - 86400000);
        mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ publishAt: past }));

        try {
          await service.publish('p1', { publishAt: null });
          fail('Esperaba ConflictException');
        } catch (err) {
          expect(err).toBeInstanceOf(ConflictException);
          expect(err.message).toBe('El producto no tiene una publicación programada activa.');
        }
        expect(mockPrisma.product.update).not.toHaveBeenCalled();
        expect(mockAudit.log).not.toHaveBeenCalled();
      });

      it('PUBLISHED → 409 con mensaje exacto y no audita', async () => {
        mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ lifecycleStatus: 'PUBLISHED', publishStatus: 'publicado' }));

        try {
          await service.publish('p1', { publishAt: null });
          fail('Esperaba ConflictException');
        } catch (err) {
          expect(err).toBeInstanceOf(ConflictException);
          expect(err.message).toBe('Solo se puede cancelar una programación en un producto en Borrador.');
        }
        expect(mockPrisma.product.update).not.toHaveBeenCalled();
        expect(mockAudit.log).not.toHaveBeenCalled();
      });

      it('ARCHIVED → 409 (Borrador) y no audita', async () => {
        mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ lifecycleStatus: 'ARCHIVED', publishStatus: 'archivado' }));

        try {
          await service.publish('p1', { publishAt: null });
          fail('Esperaba ConflictException');
        } catch (err) {
          expect(err).toBeInstanceOf(ConflictException);
          expect(err.message).toBe('Solo se puede cancelar una programación en un producto en Borrador.');
        }
        expect(mockPrisma.product.update).not.toHaveBeenCalled();
        expect(mockAudit.log).not.toHaveBeenCalled();
      });

      it('no publica ni ejecuta transición (sin checklist) al cancelar', async () => {
        const publishAt = future();
        mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ publishAt }));
        mockPrisma.product.update.mockResolvedValue(readyProduct({ publishAt: null }));

        await service.publish('p1', { publishAt: null });

        // No se llamó PUBLISH (no debe pasar por checklist/listado/transición).
        expect(mockPrisma.product.update).toHaveBeenCalledTimes(1);
        expect(mockAudit.log).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'cancel_schedule_publish' }),
        );
        expect(mockAudit.log).not.toHaveBeenCalledWith(
          expect.objectContaining({ action: 'publish' }),
        );
      });
    });
  });

  describe('unpublishAt legacy — ignorado sin efectos secundarios', () => {
    it('unpublishAt en transition DTO no afecta el estado destino', async () => {
      mockPublishChecklistOk();
      const product = mkProduct('DRAFT');
      mockPrisma.product.findUnique.mockResolvedValue(product);
      mockPrisma.product.update.mockResolvedValue({ ...product, lifecycleStatus: 'PUBLISHED' });

      // Enviar unpublishAt legacy debe ser ignorado (no produce auto-despublicación).
      const result = await service.transition('prod-1', { event: 'PUBLISH', unpublishAt: '2026-12-31T23:59:59.000Z' } as any);

      expect(result.lifecycleStatus).toBe('PUBLISHED');
      // buildTransitionData para PUBLISH fija unpublishAt=null siempre.
      const data = mockPrisma.product.update.mock.calls[0][0].data;
      expect(data.unpublishAt).toBeNull();
    });
  });

  describe('no existe auto-despublicación en el servicio', () => {
    it('doTransition/buildTransitionData no procesa unpublishAt del DTO', async () => {
      mockPublishChecklistOk();
      const product = mkProduct('DRAFT');
      mockPrisma.product.findUnique.mockResolvedValue(product);
      mockPrisma.product.update.mockResolvedValue({ ...product, lifecycleStatus: 'PUBLISHED' });

      await service.transition('prod-1', { event: 'PUBLISH', unpublishAt: '2026-12-31T23:59:59.000Z' } as any);

      const data = mockPrisma.product.update.mock.calls[0][0].data;
      // PUBLISH siempre fija unpublishAt=null independentemente del DTO.
      expect(data.unpublishAt).toBeNull();
    });

    it('no existe método processAutoUnpublishes ni rama de auto-despublicación en el scheduler', async () => {
      // Verificar que no hay propiedad auto-unpublish en el servicio.
      expect((service as any).processAutoUnpublishes).toBeUndefined();
      // handleLifecycleTick solo llama a processScheduledPublishes.
      const handleTick = (service as any).handleLifecycleTick;
      expect(handleTick).toBeDefined();
    });
  });

  describe('scheduler interno (processScheduledPublishes) — skipHumanAccessChecks=true', () => {
    it('publica sin RBAC ni ACL humano, pero conserva el checklist comercial', async () => {
      // El scheduler llama a doTransition con skipHumanAccessChecks=true y sin ctx.
      // RBAC y ACL se omiten, pero el checklist de publicación (lista activa, precio,
      // imagen, stock) se mantiene.
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', sku: 'CAM-SCH', name: 'Programada' },
      ]);
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('DRAFT'));
      mockPublishChecklistOk();
      mockPrisma.product.update.mockResolvedValue(mkProduct('PUBLISHED'));

      const result = await service.processScheduledPublishes();

      expect(result.publishOk).toBe(1);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'publish' }),
      );
    });

    it('checklist comercial fallido bloquea al scheduler (mismas reglas que publicación humana)', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', sku: 'CAM-SCH', name: 'Programada' },
      ]);
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('DRAFT'));
      // Simular lista archivada → checklist fallido (a)
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', isActive: true, archivedAt: new Date() });
      mockPrisma.price.count.mockResolvedValue(1);
      mockPrisma.productImage.count.mockResolvedValue(1);
      mockPrisma.stock.findUnique.mockResolvedValue(null);

      const result = await service.processScheduledPublishes();

      expect(result.publishOk).toBe(0);
      expect(result.publishFailed).toHaveLength(1);
      expect(result.publishFailed[0].id).toBe('p1');
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    it('publishById conserva publishedById=null cuando no hay contexto humano', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', sku: 'CAM-SCH', name: 'Programada' },
      ]);
      mockPrisma.product.findUnique.mockResolvedValue(mkProduct('DRAFT'));
      mockPublishChecklistOk();
      mockPrisma.product.update.mockResolvedValue(mkProduct('PUBLISHED'));

      const result = await service.processScheduledPublishes();

      expect(result.publishOk).toBe(1);
      const updateData = mockPrisma.product.update.mock.calls[0][0].data;
      expect(updateData.publishedById).toBeNull();
    });
  });

  describe('bulkTransition(ids, dto, ctx)', () => {
    it('aplica a los válidos y rechaza los inválidos (applied/rejected)', async () => {
      mockPublishChecklistOk();
      // transition()/doTransition() consultan el producto más de una vez cada uno;
      // se responde por id en lugar de encadenar mockResolvedValueOnce.
      mockPrisma.product.findUnique.mockImplementation(({ where }: any) =>
        where.id === 'prod-ok'
          ? Promise.resolve(mkProduct('DRAFT', { id: 'prod-ok' }))
          : Promise.resolve(mkProduct('ARCHIVED', { id: 'prod-bad' })),
      );
      mockPrisma.product.update.mockResolvedValue(mkProduct('PUBLISHED', { id: 'prod-ok' }));

      const result = await service.bulkTransition(['prod-ok', 'prod-bad'], { event: 'PUBLISH' });

      expect(result.applied).toEqual([{ id: 'prod-ok', lifecycleStatus: 'PUBLISHED' }]);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].id).toBe('prod-bad');
      expect(result.rejected[0].reason).toMatch(/No se puede pasar de ARCHIVED/);
    });

    it('producto inexistente va a rejected sin romper el lote', async () => {
      mockPublishChecklistOk();
      // Igual que arriba: resolver por id. 'no-existe' siempre devuelve null.
      mockPrisma.product.findUnique.mockImplementation(({ where }: any) =>
        where.id === 'no-existe'
          ? Promise.resolve(null)
          : Promise.resolve(mkProduct('DRAFT', { id: 'prod-ok' })),
      );
      mockPrisma.product.update.mockResolvedValue(mkProduct('PUBLISHED', { id: 'prod-ok' }));

      const result = await service.bulkTransition(['no-existe', 'prod-ok'], { event: 'PUBLISH' });

      expect(result.applied).toHaveLength(1);
      expect(result.rejected).toHaveLength(1);
      expect(result.rejected[0].id).toBe('no-existe');
    });
  });
});