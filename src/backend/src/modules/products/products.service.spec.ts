import { createPrismaMock } from '../../__test__/mocks/prisma.mock';
import * as XLSX from 'xlsx';

jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(false),
  hash: jest.fn().mockResolvedValue('$2b$10$mockhash')}));

import * as bcrypt from 'bcrypt';

const mockPrisma = createPrismaMock();
mockPrisma.price.deleteMany = jest.fn();
mockPrisma.$queryRawUnsafe = jest.fn();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma)}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AclService } from '../../common/acl/acl.service';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { AccessAssignmentsService } from '../../common/security/access-assignments.service';
import { ProductRevisionsService } from './product-revisions.service';

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

const mockFiles = {
  store: jest.fn().mockResolvedValue({ id: 'file-1', url: '/api/files/file-1' }),
  release: jest.fn().mockResolvedValue({ deleted: false }),
  get: jest.fn(),
  deleteByUrl: jest.fn().mockResolvedValue(undefined),
};

const mockGrants = { grantsForUser: jest.fn() };
const mockRevisions = { markPendingFromLive: jest.fn().mockResolvedValue(undefined) };
const grantRows = (...ids: string[]) => ids.map((actionId) => ({ sourceId: `s-${actionId}`, actionId, scope: 'global' }));

const mockAcl = {
  isSuperAdmin: jest.fn().mockReturnValue(false),
  isListasAdmin: jest.fn().mockReturnValue(false),
  levelsAtLeast: jest.fn().mockReturnValue(['manage']),
  getAllowedListaIds: jest.fn().mockResolvedValue([]),
  getUserLevel: jest.fn().mockResolvedValue(null),
  assertListaAccess: jest.fn().mockResolvedValue(undefined),
  assertProductAccess: jest.fn().mockResolvedValue(undefined),
  assertPriceAccess: jest.fn().mockResolvedValue(undefined),
  can: jest.fn().mockResolvedValue(false)};

const mockProduct = {
  id: 'prod-1',
  sku: 'CAM-001',
  name: 'Cámara IP',
  description: 'Cámara de seguridad',
  categoryId: 'cat-1',
  brandId: 'brand-1',
  technicalSpecs: { resolution: '4MP' },
  isActive: true,
  isVisible: true,
  publishStatus: 'borrador',
  publishedAt: null,
  publishAt: null,
  unpublishAt: null,
  publishedById: null,
  unpublishReason: null,
  createdAt: new Date(),
  updatedAt: new Date()};

const mockProductWithRelations = {
  ...mockProduct,
  category: { id: 'cat-1', name: 'CCTV', slug: 'cctv' },
  brand: { id: 'brand-1', name: 'Hikvision', slug: 'hikvision' },
  images: [{ id: 'img-1', url: 'img.jpg', isPrimary: true }],
  prices: [
    { id: 'price-1', value: 1500000, priceList: { id: 'pl-1', name: 'Lista 1', code: 'L1' } },
  ]};

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockGrants.grantsForUser.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.productChange.createMany.mockResolvedValue({ count: 0 });

    // Sin coincidencias de SKU normalizado por defecto (helper findProductsBySkus).
    mockPrisma.$queryRaw.mockResolvedValue([]);

    // Fallback LISTA-GENERAL para crear/update sin listaId explícito.
    mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', code: 'LISTA-GENERAL', defaultVisibility: false });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AclService, useValue: mockAcl },
        { provide: AuditService, useValue: mockAudit },
        { provide: FilesService, useValue: mockFiles },
        { provide: AccessAssignmentsService, useValue: mockGrants },
        { provide: ProductRevisionsService, useValue: mockRevisions },
      ]}).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  describe('findAll', () => {
    it('debe listar productos con filtros básicos', async () => {
      mockPrisma.product.findMany.mockResolvedValue([mockProductWithRelations]);
      mockPrisma.product.count.mockResolvedValue(1);

      const result = await service.findAll({ skip: 0, take: 50 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].sku).toBe('CAM-001');
      expect(result.meta.total).toBe(1);
    });

    it('debe filtrar por categoryId y brandId', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll({ categoryId: 'cat-1', brandId: 'brand-1' });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: 'cat-1', brandId: 'brand-1' })}),
      );
    });

    it('categoryIds incluye productos asignados a la subcategoría al seleccionar la raíz', async () => {
      mockPrisma.category.findMany.mockResolvedValue([{ id: 'cat-1' }]);
      mockPrisma.product.findMany.mockResolvedValue([mockProductWithRelations]);
      mockPrisma.product.count.mockResolvedValue(1);

      const result = await service.findAll({ categoryIds: ['root-a'] });

      expect(result.data.map((product) => product.categoryId)).toEqual(['cat-1']);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ categoryId: { in: ['root-a', 'cat-1'] } }),
      }));
      expect(mockPrisma.product.count).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ categoryId: { in: ['root-a', 'cat-1'] } }),
      }));
    });

    it('una raíz distinta no incluye productos de una hoja ajena', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      const result = await service.findAll({ categoryIds: ['root-b'] });

      expect(result.data).toHaveLength(0);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ categoryId: { in: ['root-b'] } }),
      }));
      expect(mockPrisma.product.count).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ categoryId: { in: ['root-b'] } }),
      }));
    });

    it('une categorías seleccionadas en OR y deduplica una hoja repetida por su padre', async () => {
      mockPrisma.category.findMany.mockResolvedValue([{ id: 'cat-1' }, { id: 'cat-1' }]);
      mockPrisma.product.findMany.mockResolvedValue([mockProductWithRelations]);
      mockPrisma.product.count.mockResolvedValue(1);

      await service.findAll({ categoryIds: ['root-a', 'cat-1', 'root-a'] });

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
        where: { parentId: { in: ['root-a', 'cat-1'] } },
        select: { id: true },
      });
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ categoryId: { in: ['root-a', 'cat-1'] } }),
      }));
      expect(mockPrisma.product.count).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ categoryId: { in: ['root-a', 'cat-1'] } }),
      }));
    });
  });

  describe('findOne', () => {
    it('debe retornar producto por id', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductWithRelations);

      const result = await service.findOne('prod-1');

      expect(result.id).toBe('prod-1');
    });

    it('debe lanzar NotFoundException cuando el producto no existe', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(service.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('debe crear un producto válido', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.product.create.mockResolvedValue(mockProductWithRelations);

      const dto = {
        sku: 'CAM-001',
        name: 'Cámara IP',
        description: 'Cámara de seguridad',
        categoryId: 'cat-1',
        brandId: 'brand-1',
        technicalSpecs: { resolution: '4MP' }};

      const result = await service.create(dto);

      expect(result.sku).toBe('CAM-001');
      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ listaId: 'lista-1' })}),
      );
    });

    it('debe rechazar SKU duplicado con ConflictException', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: mockProduct.id, sku: mockProduct.sku }]);
      mockPrisma.product.findMany.mockResolvedValue([mockProduct]);

      const dto = {
        sku: 'CAM-001',
        name: 'Duplicado',
        categoryId: 'cat-1',
        brandId: 'brand-1'};

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow('Ya existe un producto con ese SKU');
    });

    it('rechaza crear un producto cuyo SKU solo difiere en mayúsculas/espacios de uno existente', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: mockProduct.id, sku: mockProduct.sku }]);
      mockPrisma.product.findMany.mockResolvedValue([mockProduct]);

      await expect(
        service.create({ sku: 'cam- 001', name: 'Duplicado', categoryId: 'cat-1', brandId: 'brand-1' }),
      ).rejects.toThrow('Ya existe un producto con ese SKU');
      expect(mockPrisma.$queryRaw.mock.calls[0][0].values[0]).toEqual(['CAM-001']);
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
    });

    it('debe lanzar NotFoundException si la categoría no existe', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.findUnique.mockResolvedValue(null);

      const dto = {
        sku: 'CAM-002',
        name: 'Test',
        categoryId: 'cat-no-existe',
        brandId: 'brand-1'};

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('debe persistir extraAttributes y nunca escribe precios (prices[] se rechaza aparte)', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.product.create.mockResolvedValue(mockProductWithRelations);
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

      const dto = {
        sku: 'CAM-003',
        name: 'Cámara IP',
        categoryId: 'cat-1',
        brandId: 'brand-1',
        extraAttributes: { garantia: '1 año', ip: '127.0.0.1' }};

      await service.create(dto as any);

      // extraAttributes legacy se migra a array de SpecFieldDto
      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            extraAttributes: expect.arrayContaining([
              expect.objectContaining({ key: 'garantia', type: 'TEXT', value: '1 año' }),
              expect.objectContaining({ key: 'ip', type: 'TEXT', value: '127.0.0.1' }),
            ])
          })}),
      );
      expect(mockPrisma.price.upsert).not.toHaveBeenCalled();
    });

    it('debe persistir documents al crear un producto', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.product.create.mockResolvedValue(mockProductWithRelations);

      const dto = {
        sku: 'CAM-DOC',
        name: 'Cámara',
        categoryId: 'cat-1',
        brandId: 'brand-1',
        documents: [
          { name: 'ficha-tecnica.pdf', url: '/uploads/doc-1.pdf', type: 'application/pdf', size: 204800 },
        ]};

      await service.create(dto as any);

      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ documents: dto.documents })}),
      );
    });

    it('rechaza prices[] al crear (400) sin escribir nada', async () => {
      const dto = {
        sku: 'CAM-004',
        name: 'Cámara',
        categoryId: 'cat-1',
        brandId: 'brand-1',
        prices: [{ priceListId: 'pl-1', value: 1000 }]};

      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto as any)).rejects.toThrow('Los precios solo se cambian por carga masiva o desde la ficha del producto.');
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
      expect(mockPrisma.price.upsert).not.toHaveBeenCalled();
    });

    it('debe asociar el listaId enviado al crear un producto', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null); // sku libre
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', code: 'LISTA-X', defaultVisibility: false });
      mockPrisma.product.create.mockResolvedValue(mockProductWithRelations);

      const dto = {
        sku: 'CAM-010',
        name: 'Cámara',
        categoryId: 'cat-1',
        brandId: 'brand-1',
        listaId: 'lista-x'};

      await service.create(dto as any);

      expect(mockPrisma.lista.findUnique).toHaveBeenCalledWith({ where: { id: 'lista-x' }, select: { id: true, defaultVisibility: true } });
      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ listaId: 'lista-x' }) }),
      );
    });

    it('debe rechazar crear producto con listaId inexistente', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null); // sku libre
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.lista.findUnique.mockResolvedValue(null); // lista no existe

      const dto = {
        sku: 'CAM-011',
        name: 'Cámara',
        categoryId: 'cat-1',
        brandId: 'brand-1',
        listaId: 'lista-inexistente'};

      await expect(service.create(dto as any)).rejects.toThrow('Lista no encontrada');
    });

    it('debe usar LISTA-GENERAL como fallback cuando no se envía listaId', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null); // sku libre
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', code: 'LISTA-GENERAL', defaultVisibility: false });
      mockPrisma.product.create.mockResolvedValue(mockProductWithRelations);

      const dto = { sku: 'CAM-012', name: 'Cámara', categoryId: 'cat-1', brandId: 'brand-1' };

      await service.create(dto as any);

      expect(mockPrisma.lista.findUnique).toHaveBeenCalledWith({ where: { code: 'LISTA-GENERAL' }, select: { id: true, defaultVisibility: true } });
      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ listaId: 'lista-1' }) }),
      );
    });

    it('crea en DRAFT ignorando defaultVisibility de la Lista (isVisible siempre false)', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null); // sku libre
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-v', code: 'LISTA-VISIBLE', defaultVisibility: true });
      mockPrisma.product.create.mockResolvedValue(mockProductWithRelations);

      const dto = { sku: 'CAM-013', name: 'Cámara', categoryId: 'cat-1', brandId: 'brand-1', listaId: 'lista-v', isVisible: true };

      await service.create(dto as any);

      // El contrato canónico fija DRAFT → isActive=false, isVisible=false (ignora input legacy).
      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ listaId: 'lista-v', isVisible: false, isActive: false, lifecycleStatus: 'DRAFT' })}),
      );
    });

    it('debe respetar isVisible explícito aunque la Lista tenga defaultVisibility opuesto', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null); // sku libre
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-v', code: 'LISTA-VISIBLE', defaultVisibility: true });
      mockPrisma.product.create.mockResolvedValue(mockProductWithRelations);

      const dto = { sku: 'CAM-014', name: 'Cámara', categoryId: 'cat-1', brandId: 'brand-1', listaId: 'lista-v', isVisible: false };

      await service.create(dto as any);

      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ listaId: 'lista-v', isVisible: false })}),
      );
    });

    it('publishStatus="listo" legacy se acepta en DTO pero el producto nace en DRAFT', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.product.create.mockResolvedValue(mockProductWithRelations);

      await service.create({ sku: 'CAM-LISTO', name: 'Listo', categoryId: 'cat-1', brandId: 'brand-1', publishStatus: 'listo' } as any);

      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lifecycleStatus: 'DRAFT', isActive: false, isVisible: false }),
        }),
      );
    });

    it('publishStatus="publicado" legacy se acepta en DTO pero el producto nace en DRAFT', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.product.create.mockResolvedValue(mockProductWithRelations);

      await service.create({ sku: 'CAM-PUB', name: 'Publicado', categoryId: 'cat-1', brandId: 'brand-1', publishStatus: 'publicado' } as any);

      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lifecycleStatus: 'DRAFT', isActive: false, isVisible: false }),
        }),
      );
    });

    it('publishStatus="archivado" legacy se acepta en DTO pero el producto nace en DRAFT', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.product.create.mockResolvedValue(mockProductWithRelations);

      await service.create({ sku: 'CAM-ARCH', name: 'Archivado', categoryId: 'cat-1', brandId: 'brand-1', publishStatus: 'archivado' } as any);

      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lifecycleStatus: 'DRAFT', isActive: false, isVisible: false }),
        }),
      );
    });
  });

  describe('update', () => {
    it('debe actualizar un producto', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(mockProduct);
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.product.update.mockResolvedValue({ ...mockProductWithRelations, name: 'Cámara IP Pro' });

      const dto = { name: 'Cámara IP Pro' };
      const result = await service.update('prod-1', dto);

      expect(result.name).toBe('Cámara IP Pro');
    });

    it('debe lanzar NotFoundException si el producto no existe', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(service.update('no-existe', { name: 'Nope' })).rejects.toThrow(NotFoundException);
    });

    it('rechaza cambiar el SKU a uno que solo difiere en mayúsculas de otro producto', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(mockProduct);
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'otro', sku: 'CAM-777' }]);
      mockPrisma.product.findMany.mockResolvedValue([{ id: 'otro', sku: 'CAM-777' }]);

      await expect(service.update('prod-1', { sku: 'cam-777' })).rejects.toThrow(ConflictException);
    });

    it('permite cambiar solo las mayúsculas del SKU del propio producto', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(mockProduct);
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.product.update.mockResolvedValue({ ...mockProductWithRelations, sku: 'cam-001' });

      await service.update('prod-1', { sku: 'cam-001' });

      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(mockPrisma.product.update).toHaveBeenCalled();
    });

    it('debe actualizar extraAttributes y nunca escribe precios', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(mockProduct);
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.product.update.mockResolvedValue({ ...mockProductWithRelations, name: 'Cámara IP Pro' });
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

      const dto = {
        name: 'Cámara IP Pro',
        extraAttributes: { garantia: '2 años' }};

      const result = await service.update('prod-1', dto as any);

      expect(result.name).toBe('Cámara IP Pro');
      // extraAttributes legacy se migra a array de SpecFieldDto
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            extraAttributes: expect.arrayContaining([
              expect.objectContaining({ key: 'garantia', type: 'TEXT', value: '2 años' }),
            ])
          })}),
      );
      expect(mockPrisma.price.upsert).not.toHaveBeenCalled();
    });

    it('rechaza prices[] al actualizar (400) sin escribir nada', async () => {
      await expect(
        service.update('prod-1', { name: 'X', prices: [{ priceListId: 'pl-1', value: 2000000 }] } as any),
      ).rejects.toThrow('Los precios solo se cambian por carga masiva o desde la ficha del producto.');
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
      expect(mockPrisma.price.upsert).not.toHaveBeenCalled();
    });

    it('debe persistir documents al actualizar un producto', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(mockProduct);
      mockPrisma.product.update.mockResolvedValue({ ...mockProductWithRelations, documents: [] });

      const dto = {
        documents: [{ name: 'manual.pdf', url: '/uploads/doc-2.pdf', type: 'application/pdf', size: 51200 }]};

      await service.update('prod-1', dto as any);

      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ documents: dto.documents })}),
      );
    });
  });

  describe('toggleVisibility (adaptador legacy: DRAFTâ†’PUBLISH, PUBLISHEDâ†’UNPUBLISH, ARCHIVEDâ†’400)', () => {
    it('DRAFT → ejecuta PUBLISH (isVisible pasará a true sin producir HIDDEN)', async () => {
      // Producto DRAFT con Lista asociada (listId exige existencia real en DB).
      mockPrisma.product.findUnique.mockResolvedValue({
        ...mockProduct,
        listaId: 'lista-1',
        lifecycleStatus: 'DRAFT',
        isActive: false,
        isVisible: false,
        publishStatus: 'borrador',
      });
      // Checklist comercial cumplido: lista activa, precio vigente, imagen y sin stock bloqueante.
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', isActive: true, archivedAt: null });
      mockPrisma.price.count.mockResolvedValue(1);
      mockPrisma.productImage.count.mockResolvedValue(1);
      mockPrisma.stock.findUnique.mockResolvedValue(null);
      mockPrisma.product.update.mockResolvedValue({
        ...mockProduct,
        listaId: 'lista-1',
        lifecycleStatus: 'PUBLISHED',
        isActive: true,
        isVisible: true,
        publishStatus: 'publicado',
      });

      const result = await service.toggleVisibility('prod-1');

      expect(result.lifecycleStatus).toBe('PUBLISHED');
      expect(result.isActive).toBe(true);
      expect(result.isVisible).toBe(true);
      expect(result.publishStatus).toBe('publicado');
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lifecycleStatus: 'PUBLISHED', isActive: true, isVisible: true, publishStatus: 'publicado' })}),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'publish', entity: 'Product', entityId: 'prod-1' }),
      );
    });

    it('PUBLISHED â†’ ejecuta UNPUBLISH (DRAFT, sin producir HIDDEN)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ ...mockProduct, publishStatus: 'publicado', isVisible: true, lifecycleStatus: 'PUBLISHED' });
      mockPrisma.product.update.mockResolvedValue({ ...mockProduct, lifecycleStatus: 'DRAFT', isVisible: false, isActive: false });

      const result = await service.toggleVisibility('prod-1');

      expect(result.lifecycleStatus).toBe('DRAFT');
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lifecycleStatus: 'DRAFT', isVisible: false, isActive: false })}),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'unpublish', entity: 'Product', entityId: 'prod-1' }),
      );
    });

    it('ARCHIVED â†’ 400 (no se alterna)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ ...mockProduct, lifecycleStatus: 'ARCHIVED', isActive: false, isVisible: false });

      await expect(service.toggleVisibility('prod-1')).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException si el producto no existe', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(service.toggleVisibility('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleActive (removido del servicio: el controller responde 410 Gone)', () => {
    it('no existe el método en ProductsService (el endpoint legacy responde 410 en controller)', async () => {
      expect((service as any).toggleActive).toBeUndefined();
    });
  });

  describe('remove (borrado físico P4)', () => {
    function noData() {
      mockPrisma.price.count.mockResolvedValue(0);
      mockPrisma.productImage.count.mockResolvedValue(0);
      mockPrisma.productImage.findMany.mockResolvedValue([]);
      mockPrisma.stock.findUnique.mockResolvedValue(null);
      mockPrisma.auditLog.count.mockResolvedValue(0);
    }

    it('debe eliminar un producto sin datos asociados con confirm: true y auditar delete', async () => {
      noData();
      mockPrisma.product.findUnique.mockResolvedValue(mockProduct);
      mockPrisma.productImage.findMany.mockResolvedValue([
        { id: 'img-1', url: '/api/files/img-1' },
        { id: 'img-2', url: '/api/files/img-2' },
      ]);
      mockPrisma.price.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.productImage.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.product.delete.mockResolvedValue(mockProduct);

      const result = await service.remove('prod-1', { confirm: true });

      expect(result.message).toBe('Producto eliminado exitosamente');
      expect(mockPrisma.price.deleteMany).toHaveBeenCalledWith({ where: { productId: 'prod-1' } });
      expect(mockPrisma.productImage.deleteMany).toHaveBeenCalledWith({ where: { productId: 'prod-1' } });
      expect(mockFiles.deleteByUrl).toHaveBeenCalledWith('/api/files/img-1');
      expect(mockFiles.deleteByUrl).toHaveBeenCalledWith('/api/files/img-2');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          entity: 'Product',
          entityId: 'prod-1',
          oldValues: expect.objectContaining({ sku: 'CAM-001', name: 'Cámara IP' })}),
      );
    });

    it('debe lanzar NotFoundException si el producto no existe', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      await expect(service.remove('no-existe', { confirm: true })).rejects.toThrow(NotFoundException);
    });

    it('400 si falta confirm: true', async () => {
      noData();
      mockPrisma.product.findUnique.mockResolvedValue(mockProduct);

      await expect(service.remove('prod-1', {})).rejects.toThrow(BadRequestException);
      await expect(service.remove('prod-1', {})).rejects.toThrow(/confirm/);
      expect(mockPrisma.product.delete).not.toHaveBeenCalled();
    });

    it('403 sin la concesion products:delete (el cargo no concede)', async () => {
      noData();
      mockPrisma.product.findUnique.mockResolvedValue(mockProduct);
      const ctx = { userId: 'u1', roles: ['Operador'] };

      await expect(service.remove('prod-1', { confirm: true }, ctx)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.product.delete).not.toHaveBeenCalled();
    });

    it('no consulta el ACL de la Lista: Super Admin borra aunque el ACL de Lista denegara', async () => {
      noData();
      mockPrisma.product.findUnique.mockResolvedValue({ ...mockProduct, listaId: 'lista-1' });
      mockAcl.assertProductAccess.mockRejectedValue(new ForbiddenException('ACL denegado'));
      const ctx = { userId: 'u1', roles: ['Super Admin'] };

      await expect(service.remove('prod-1', { confirm: true }, ctx)).resolves.toBeDefined();
      expect(mockAcl.assertProductAccess).not.toHaveBeenCalled();
      expect(mockPrisma.product.delete).toHaveBeenCalled();
    });

    it('409 si hay datos asociados y falta masterKey â†’ borrado exitoso (master key no implementado)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ ...mockProduct, listaId: 'lista-1' });
      mockPrisma.price.count.mockResolvedValue(1);
      mockPrisma.productImage.count.mockResolvedValue(0);
      mockPrisma.productImage.findMany.mockResolvedValue([]);
      mockPrisma.stock.findUnique.mockResolvedValue(null);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const ctx = { userId: 'u1', roles: ['Super Admin'] };
      const result = await service.remove('prod-1', { confirm: true }, ctx);

      expect(result.message).toBe('Producto eliminado exitosamente');
    });

    it('403 si hay datos asociados y la masterKey es incorrecta â†’ borrado exitoso (master key no implementado)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ ...mockProduct, listaId: 'lista-1' });
      mockPrisma.price.count.mockResolvedValue(1);
      mockPrisma.productImage.count.mockResolvedValue(0);
      mockPrisma.productImage.findMany.mockResolvedValue([]);
      mockPrisma.stock.findUnique.mockResolvedValue(null);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const ctx = { userId: 'u1', roles: ['Super Admin'] };
      const result = await service.remove('prod-1', { confirm: true}, ctx);

      expect(result.message).toBe('Producto eliminado exitosamente');
    });

    it('200 con datos asociados + masterKey correcta + confirm, y audita delete', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        ...mockProduct,
        listaId: 'lista-1',
        lifecycleStatus: 'PUBLISHED',
        publishStatus: 'publicado'});
      mockPrisma.price.count.mockResolvedValue(1);
      mockPrisma.productImage.count.mockResolvedValue(1);
      mockPrisma.stock.findUnique.mockResolvedValue({ id: 'stock-1', availableQty: 3 });
      mockPrisma.auditLog.count.mockResolvedValue(2);
      mockPrisma.productImage.findMany.mockResolvedValue([]);
      mockPrisma.price.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.productImage.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.product.delete.mockResolvedValue(mockProduct);

      mockGrants.grantsForUser.mockResolvedValue(grantRows('products:read', 'products:delete'));
      const ctx = { userId: 'u1', roles: ['Vendedor'] };
      const result = await service.remove('prod-1', { confirm: true}, ctx);

      expect(result.message).toBe('Producto eliminado exitosamente');
      
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          action: 'delete',
          entity: 'Product',
          entityId: 'prod-1',
          oldValues: expect.objectContaining({
            sku: 'CAM-001',
            name: 'Cámara IP',
            lifecycleStatus: 'PUBLISHED',
            isActive: true,
            isVisible: true,
            publishStatus: 'publicado'})}),
      );
      expect(mockPrisma.product.delete).toHaveBeenCalledWith({ where: { id: 'prod-1' } });
    });


    it('DELETE válido desde distintos estados FSM (publicado/oculto/archivado)', async () => {
      for (const status of ['PUBLISHED', 'HIDDEN', 'ARCHIVED']) {
        noData();
        mockPrisma.product.findUnique.mockResolvedValue({ ...mockProduct, listaId: 'lista-1', lifecycleStatus: status });
        mockPrisma.productImage.findMany.mockResolvedValue([]);
        mockPrisma.price.deleteMany.mockResolvedValue({ count: 0 });
        mockPrisma.productImage.deleteMany.mockResolvedValue({ count: 0 });
        mockPrisma.product.delete.mockResolvedValue(mockProduct);

        const ctx = { userId: 'u1', roles: ['Super Admin'] };
        const result = await service.remove('prod-1', { confirm: true }, ctx);
        expect(result.message).toBe('Producto eliminado exitosamente');
      }
    });
  });

  // --- Publicación: estados, programación, validaciones y lazy unpublish ---
  describe('publish', () => {
    function readyProduct(overrides: Record<string, any> = {}) {
      return {
        id: 'p1',
        sku: 'CAM-PUB',
        name: 'Cámara Publicable',
        categoryId: 'cat-1',
        brandId: 'brand-1',
        listaId: 'lista-1',
        isActive: true,
        isVisible: false,
        publishStatus: 'borrador',
        publishedAt: null,
        publishAt: null,
        unpublishAt: null,
        publishedById: null,
        unpublishReason: null,
        ...overrides};
    }

    it('publica un producto que cumple todos los requisitos', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct());
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', isActive: true, archivedAt: null });
      mockPrisma.price.count.mockResolvedValue(1);
      mockPrisma.productImage.count.mockResolvedValue(1);
      mockPrisma.stock.findUnique.mockResolvedValue(null);
      mockPrisma.product.update.mockResolvedValue(readyProduct({ publishStatus: 'publicado' }));

      const result = await service.publish('p1', {});

      expect(result.publishStatus).toBe('publicado');
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishStatus: 'publicado',
            publishAt: null,
            publishedById: null})}),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'publish', entity: 'Product', entityId: 'p1' }),
      );
    });

    it('rechaza publicación con 400 listando TODOS los requisitos incumplidos', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ isActive: false }));
      // Sin precios ni imágenes: fallan (c),(d). El estado no se bloquea por isActive: la FSM ya
      // validó que el producto es DRAFT publicable. Ninguna regla consulta Listas.
      mockPrisma.price.count.mockResolvedValue(0);
      mockPrisma.productImage.count.mockResolvedValue(0);
      mockPrisma.stock.findUnique.mockResolvedValue(null);

      await expect(service.publish('p1', {})).rejects.toThrow(BadRequestException);
      await expect(service.publish('p1', {})).rejects.toThrow(/precio vigente.*imagen/);
      expect(mockPrisma.lista.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    it('no bloquea la publicación por una Lista archivada o inactiva (las Listas ya no existen)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct());
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', isActive: false, archivedAt: new Date() });
      mockPrisma.price.count.mockResolvedValue(1);
      mockPrisma.productImage.count.mockResolvedValue(1);
      mockPrisma.stock.findUnique.mockResolvedValue(null);
      mockPrisma.product.update.mockResolvedValue(readyProduct({ publishStatus: 'publicado' }));

      const result = await service.publish('p1', {});

      expect(result.publishStatus).toBe('publicado');
      expect(mockPrisma.lista.findUnique).not.toHaveBeenCalled();
    });

    it('rechaza publicar un producto ya publicado con 409', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ publishStatus: 'publicado' }));

      await expect(service.publish('p1', {})).rejects.toThrow(ConflictException);
      await expect(service.publish('p1', {})).rejects.toThrow('ya está publicado');
    });

    it('no bloquea por stock cuando no existe registro de stock (decisión documentada)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct());
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', isActive: true, archivedAt: null });
      mockPrisma.price.count.mockResolvedValue(1);
      mockPrisma.productImage.count.mockResolvedValue(1);
      mockPrisma.stock.findUnique.mockResolvedValue(null);
      mockPrisma.product.update.mockResolvedValue(readyProduct({ publishStatus: 'publicado' }));

      const result = await service.publish('p1', {});
      expect(result.publishStatus).toBe('publicado');
    });

    it('bloquea por stock cuando existe registro con availableQty <= 0', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct());
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', isActive: true, archivedAt: null });
      mockPrisma.price.count.mockResolvedValue(1);
      mockPrisma.productImage.count.mockResolvedValue(1);
      mockPrisma.stock.findUnique.mockResolvedValue({ productId: 'p1', availableQty: 0, reservedQty: 0 });

      await expect(service.publish('p1', {})).rejects.toThrow(BadRequestException);
      await expect(service.publish('p1', {})).rejects.toThrow(/stock/);
    });

    it('programa publicación futura dejando el producto en DRAFT y persistiendo estado canónico completo', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct());
      const future = new Date(Date.now() + 86400000);
      mockPrisma.product.update.mockResolvedValue(readyProduct({ publishAt: future }));

      const result = await service.publish('p1', { publishAt: future.toISOString() });

      // Permanece en DRAFT; se persiste estado canónico completo. Sin estado SCHEDULED.
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

    it('publica con un precio vigente del producto (importado con listaId null) en una sola consulta, sin filtrar por Lista', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct());
      mockPrisma.price.count.mockResolvedValueOnce(1);
      mockPrisma.productImage.count.mockResolvedValue(1);
      mockPrisma.stock.findUnique.mockResolvedValue(null);
      mockPrisma.product.update.mockResolvedValue(readyProduct({ publishStatus: 'publicado' }));

      const result = await service.publish('p1', {});

      expect(result.publishStatus).toBe('publicado');
      expect(mockPrisma.price.count).toHaveBeenCalledTimes(1);
      const priceWhere = mockPrisma.price.count.mock.calls[0][0].where;
      expect(priceWhere).toMatchObject({ productId: 'p1' });
      expect(priceWhere).not.toHaveProperty('listaId');
      expect(priceWhere.AND[0].OR[1].validFrom.lte).toBeInstanceOf(Date);
      expect(priceWhere.AND[1].OR[1].validUntil.gt).toEqual(priceWhere.AND[0].OR[1].validFrom.lte);
    });

    it('sigue bloqueando (400) cuando el producto no tiene ningún precio vigente', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct());
      mockPrisma.price.count.mockResolvedValue(0);
      mockPrisma.productImage.count.mockResolvedValue(1);
      mockPrisma.stock.findUnique.mockResolvedValue(null);

      await expect(service.publish('p1', {})).rejects.toThrow(BadRequestException);
      await expect(service.publish('p1', {})).rejects.toThrow(/precio vigente/);
    });

    it('rechaza 409 si PUBLISHED y se intenta programar publicación futura (no se despublica)', async () => {
      const future = new Date(Date.now() + 86400000);
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ lifecycleStatus: 'PUBLISHED', publishStatus: 'publicado', isActive: true, isVisible: true }));

      await expect(service.publish('p1', { publishAt: future.toISOString() })).rejects.toThrow(ConflictException);
      await expect(service.publish('p1', { publishAt: future.toISOString() })).rejects.toThrow(/ya está publicado/);
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    it('rechaza 400 si ARCHIVED y se intenta programar publicación futura', async () => {
      const future = new Date(Date.now() + 86400000);
      mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ lifecycleStatus: 'ARCHIVED', publishStatus: 'archivado', isActive: false, isVisible: false }));

      await expect(service.publish('p1', { publishAt: future.toISOString() })).rejects.toThrow(BadRequestException);
      await expect(service.publish('p1', { publishAt: future.toISOString() })).rejects.toThrow(/archivado/);
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    describe('cancelación de programación (publishAt: null)', () => {
      const future = () => new Date(Date.now() + 86400000);

      it('DRAFT con programación futura activa: conserva DRAFT, limpia publishAt y audita cancel_schedule_publish', async () => {
        const publishAt = future();
        mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ lifecycleStatus: 'DRAFT', publishAt }));
        mockPrisma.product.update.mockResolvedValue(readyProduct({ lifecycleStatus: 'DRAFT', publishAt: null }));

        const result = await service.publish('p1', { publishAt: null });

        expect(result.lifecycleStatus).toBe('DRAFT');
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

      it('DRAFT sin programación futura activa → 409 con mensaje exacto y sin auditoría', async () => {
        mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ lifecycleStatus: 'DRAFT', publishAt: null }));

        await expect(service.publish('p1', { publishAt: null })).rejects.toThrow(ConflictException);
        await expect(service.publish('p1', { publishAt: null })).rejects.toThrow(
          'El producto no tiene una publicación programada activa.',
        );
        expect(mockPrisma.product.update).not.toHaveBeenCalled();
        expect(mockAudit.log).not.toHaveBeenCalled();
      });

      it('PUBLISHED → 409 (Borrador) y sin auditoría', async () => {
        mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ lifecycleStatus: 'PUBLISHED', publishStatus: 'publicado', isActive: true, isVisible: true }));

        await expect(service.publish('p1', { publishAt: null })).rejects.toThrow(ConflictException);
        await expect(service.publish('p1', { publishAt: null })).rejects.toThrow(
          'Solo se puede cancelar una programación en un producto en Borrador.',
        );
        expect(mockPrisma.product.update).not.toHaveBeenCalled();
        expect(mockAudit.log).not.toHaveBeenCalled();
      });

      it('ARCHIVED → 409 (Borrador) y sin auditoría', async () => {
        mockPrisma.product.findUnique.mockResolvedValue(readyProduct({ lifecycleStatus: 'ARCHIVED', publishStatus: 'archivado', isActive: false, isVisible: false }));

        await expect(service.publish('p1', { publishAt: null })).rejects.toThrow(ConflictException);
        await expect(service.publish('p1', { publishAt: null })).rejects.toThrow(
          'Solo se puede cancelar una programación en un producto en Borrador.',
        );
        expect(mockPrisma.product.update).not.toHaveBeenCalled();
        expect(mockAudit.log).not.toHaveBeenCalled();
      });
    });
  });

  describe('unpublish', () => {
    it('despublica a borrador con razón y audita', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        ...mockProduct,
        id: 'p1',
        listaId: 'lista-1',
        publishStatus: 'publicado'});
      mockPrisma.product.update.mockResolvedValue({ ...mockProduct, id: 'p1', publishStatus: 'borrador' });

      const result = await service.unpublish('p1', { reason: 'Campaña finalizada' });

      expect(result.publishStatus).toBe('borrador');
      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ publishStatus: 'borrador', unpublishReason: 'Campaña finalizada' })}),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'unpublish',
          entity: 'Product',
          entityId: 'p1',
          newValues: expect.objectContaining({ publishStatus: 'borrador', unpublishReason: 'Campaña finalizada' })}),
      );
    });

    it('lanza 404 si el producto no existe', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      await expect(service.unpublish('no-existe', {})).rejects.toThrow(NotFoundException);
    });
  });

  // La auto-despublicación por unpublishAt fue eliminada del contrato: findOne/findAll
  // ya no despublican en runtime ni consultan unpublishAt para reglas comerciales.

  describe('findPublishScheduled', () => {
    it('lista productos programados (DRAFT con publishAt) entre from y to', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', sku: 'CAM-001', name: 'Cámara', publishAt: new Date('2026-09-01'), unpublishAt: null, lista: { id: 'l1', name: 'Lista 1', code: 'L1' } },
      ]);

      const result = await service.findPublishScheduled('2026-08-01', '2026-10-01');

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('sku', 'CAM-001');
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ lifecycleStatus: 'DRAFT' })}),
      );
    });
  });

  // --- Regresión post-Catalog (entidad eliminada) ---
  describe('catálogo eliminado (regresión)', () => {
    it('findAll no filtra por catalogId', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll({ catalogId: 'id-antiguo' } as any);

      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('catalogId');
    });

    it('findAll filtra por search', async () => {
      // Para search > 2 chars usa fuzzy search con $queryRawUnsafe
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: BigInt(0) }]) // count
        .mockResolvedValueOnce([]); // products
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.brand.findMany.mockResolvedValue([]);
      mockPrisma.productImage.findMany.mockResolvedValue([]);
      mockPrisma.price.findMany.mockResolvedValue([]);

      await service.findAll({ search: 'cámara' });

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('findAll: card image falls back to the first image when none is flagged primary', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll({ skip: 0, take: 20 });

      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.include.images).toEqual({
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
        take: 1,
      });
      // No `where: { isPrimary: true }` filter: a product with photos must never lose its card image.
      expect(call.include.images).not.toHaveProperty('where');
    });

    it('findAll search: attaches image and prices by product id', async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: BigInt(2) }])
        .mockResolvedValueOnce([
          { id: 'p-a', sku: 'A', categoryId: 'cat-1', brandId: 'brand-1' },
          { id: 'p-b', sku: 'B', categoryId: 'cat-1', brandId: 'brand-1' },
        ]);
      mockPrisma.category.findMany.mockResolvedValue([{ id: 'cat-1', name: 'CCTV', slug: 'cctv' }]);
      mockPrisma.brand.findMany.mockResolvedValue([{ id: 'brand-1', name: 'Hikvision', slug: 'hikvision' }]);
      mockPrisma.productImage.findMany.mockResolvedValue([
        // p-a: no image flagged primary -> lowest sortOrder wins
        { productId: 'p-a', url: '/api/files/a2', isPrimary: false, sortOrder: 1 },
        { productId: 'p-a', url: '/api/files/a1', isPrimary: false, sortOrder: 0 },
        // p-b: primary wins over a lower sortOrder
        { productId: 'p-b', url: '/api/files/b2', isPrimary: false, sortOrder: 0 },
        { productId: 'p-b', url: '/api/files/b1', isPrimary: true, sortOrder: 5 },
      ]);
      mockPrisma.price.findMany.mockResolvedValue([
        { id: 'price-a', productId: 'p-a', value: 123, priceList: { id: 'pl-a', name: 'Lista A', code: 'A' } },
      ]);
      mockPrisma.stock.findMany.mockResolvedValue([]);
      mockPrisma.assignment.findMany.mockResolvedValue([]);

      const result = await service.findAll({ search: 'DVR turbo' });

      const byId = Object.fromEntries(result.data.map((p: any) => [p.id, p]));
      expect(byId['p-a'].images.map((i: any) => i.url)).toEqual(['/api/files/a1']);
      expect(byId['p-b'].images.map((i: any) => i.url)).toEqual(['/api/files/b1']);
      // Category and brand are looked up by their own ids, not by product ids.
      expect(byId['p-a'].category).toEqual({ id: 'cat-1', name: 'CCTV', slug: 'cctv' });
      expect(byId['p-a'].brand?.name).toBe('Hikvision');
      expect(byId['p-a'].prices.map((price: any) => price.id)).toEqual(['price-a']);
      expect(byId['p-b'].prices).toEqual([]);
      expect(mockPrisma.category.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['cat-1'] } });
      expect(mockPrisma.productImage.findMany.mock.calls[0][0].where).toEqual({
        productId: { in: ['p-a', 'p-b'] },
      });
    });

    it('findAll filtra por isVisible e isActive', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll({ isVisible: true, isActive: true });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isVisible: true, isActive: true })}),
      );
    });

    it('findAll con activeListaOnly restringe a Listas activas (rama Prisma)', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll({ activeListaOnly: true });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            lista: { isActive: true, archivedAt: null },
          })}),
      );
    });

    it('findAll sin activeListaOnly no agrega el filtro de Lista (rama Prisma)', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);

      await service.findAll({ skip: 0, take: 50 });

      const where = mockPrisma.product.findMany.mock.calls[0][0].where;
      expect(where.lista).toBeUndefined();
    });

    it('findAll con activeListaOnly aplica EXISTS sobre listas en la rama de fuzzy search', async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: BigInt(0) }])
        .mockResolvedValueOnce([]);
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.brand.findMany.mockResolvedValue([]);
      mockPrisma.productImage.findMany.mockResolvedValue([]);
      mockPrisma.price.findMany.mockResolvedValue([]);

      await service.findAll({ search: 'camara', activeListaOnly: true });

      const [countSql] = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(countSql).toContain('EXISTS (SELECT 1 FROM "listas" l');
      expect(countSql).toContain('l."isActive" = true');
      expect(countSql).toContain('l."archivedAt" IS NULL');
    });

    it('findAll sin activeListaOnly no agrega el EXISTS en la rama de fuzzy search', async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ count: BigInt(0) }])
        .mockResolvedValueOnce([]);
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.brand.findMany.mockResolvedValue([]);
      mockPrisma.productImage.findMany.mockResolvedValue([]);
      mockPrisma.price.findMany.mockResolvedValue([]);

      await service.findAll({ search: 'camara' });

      const [countSql] = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(countSql).not.toContain('FROM "listas" l');
    });

    describe('fuzzy search con filtros (parámetros enlazados, sin inyección SQL)', () => {
      const injected = "x' OR '1'='1";
      const validCategory = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
      const validBrand = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

      beforeEach(() => {
        mockPrisma.$queryRawUnsafe
          .mockResolvedValueOnce([{ count: BigInt(0) }])
          .mockResolvedValueOnce([]);
        mockPrisma.category.findMany.mockResolvedValue([]);
        mockPrisma.brand.findMany.mockResolvedValue([]);
        mockPrisma.productImage.findMany.mockResolvedValue([]);
        mockPrisma.price.findMany.mockResolvedValue([]);
      });

      const calls = () => {
        const [countSql, ...countArgs] = mockPrisma.$queryRawUnsafe.mock.calls[0];
        const [selectSql, ...selectArgs] = mockPrisma.$queryRawUnsafe.mock.calls[1];
        return { countSql, countArgs, selectSql, selectArgs };
      };

      it('búsqueda de más de dos caracteres sin filtros: solo término, LIMIT y OFFSET enlazados', async () => {
        await service.findAll({ search: 'camara', take: 10, skip: 20 });
        const { countSql, countArgs, selectSql, selectArgs } = calls();

        expect(countArgs).toEqual(['camara']);
        expect(selectArgs).toEqual(['camara', 10, 20]);
        expect(countSql).not.toContain('"categoryId"');
        expect(selectSql).toContain('LIMIT $2 OFFSET $3');
      });

      it.each(['%', '_'])('búsqueda literal de símbolo %s, incluso con un carácter', async (term) => {
        await service.findAll({ search: term, take: 10, skip: 0 });
        const { countSql, countArgs, selectSql, selectArgs } = calls();

        expect(countArgs).toEqual([term]);
        expect(selectArgs).toEqual([term, 10, 0]);
        expect(countSql).toContain('POSITION(LOWER($1) IN LOWER(COALESCE(p."name", \'\'))) > 0');
        expect(selectSql).toContain('POSITION(LOWER($1) IN LOWER(COALESCE(p."catalogName", \'\'))) > 0');
        expect(countSql).toContain('POSITION(NULLIF(regexp_replace(upper($1)');
        expect(selectSql).toContain('POSITION(NULLIF(regexp_replace(upper($1)');
        expect(countSql).not.toContain('LIKE');
        expect(countSql).toContain('OR POSITION(LOWER($1) IN LOWER(COALESCE(p."description", \'\'))) > 0');
        expect(selectSql).toContain('OR POSITION(LOWER($1) IN LOWER(COALESCE(p."description", \'\'))) > 0');
        const getSearchClause = (sql: string) => sql.match(/AND \(\n        POSITION\(LOWER\(\$1\)[\s\S]+?\n      \)/)?.[0];
        expect(getSearchClause(selectSql)).toBe(getSearchClause(countSql));
        expect(selectSql).not.toContain('similarity(');
      });

      it('normaliza SKU ignorando separadores y conserva el término como parámetro', async () => {
        const term = 'IDS-E04HQHI-D';
        await service.findAll({ search: term, take: 5, skip: 0 });
        const { countSql, countArgs, selectSql, selectArgs } = calls();

        expect(countArgs).toEqual([term]);
        expect(selectArgs).toEqual([term, 5, 0]);
        expect(countSql).toContain("regexp_replace(upper(COALESCE(p.\"sku\", '')), '[^A-Z0-9]', '', 'g')");
        expect(selectSql).toContain("regexp_replace(upper(COALESCE(p.\"sku\", '')), '[^A-Z0-9]', '', 'g')");
        expect(countSql).not.toContain(term);
        expect(selectSql).not.toContain(term);
      });

      it('reintenta sin pg_trgm solo ante similarity ausente y memoriza el fallback', async () => {
        const term = 'IDSE04HQHID';
        const pgTrgmError = {
          code: 'P2010',
          meta: { code: '42883', message: 'function similarity(text,text) does not exist' },
        };
        const warn = jest.spyOn((service as any).logger, 'warn');
        mockPrisma.$queryRawUnsafe.mockReset()
          .mockRejectedValueOnce(pgTrgmError)
          .mockResolvedValueOnce([{ count: BigInt(1) }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ count: BigInt(1) }])
          .mockResolvedValueOnce([]);

        await service.findAll({
          search: term, categoryId: validCategory, brandId: validBrand,
          isVisible: true, isActive: false, take: 5, skip: 10,
        });
        await service.findAll({ search: 'ANOTHER-LONG-QUERY', take: 3, skip: 2 });

        const calls = mockPrisma.$queryRawUnsafe.mock.calls;
        expect(calls).toHaveLength(5);
        expect(calls[0][0]).toContain('similarity(');
        for (const [sql] of calls.slice(1)) {
          expect(sql).not.toContain('similarity(');
          expect(sql).toContain("regexp_replace(upper(COALESCE(p.\"sku\", '')), '[^A-Z0-9]', '', 'g')");
        }
        expect(calls[1][0]).toContain('p."categoryId" = $2');
        expect(calls[1][0]).toContain('p."brandId" = $3');
        expect(calls[1][0]).toContain('p."isVisible" = $4::boolean');
        expect(calls[1][0]).toContain('p."isActive" = $5::boolean');
        expect(calls[1].slice(1)).toEqual([term, validCategory, validBrand, true, false]);
        expect(calls[2][0]).toContain('LIMIT $6 OFFSET $7');
        expect(calls[2].slice(1)).toEqual([term, validCategory, validBrand, true, false, 5, 10]);
        expect(calls[3].slice(1)).toEqual(['ANOTHER-LONG-QUERY']);
        expect(calls[4][0]).toContain('LIMIT $2 OFFSET $3');
        expect(calls[4].slice(1)).toEqual(['ANOTHER-LONG-QUERY', 3, 2]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).not.toHaveBeenCalledWith(expect.stringContaining(term));
        warn.mockRestore();
      });

      it.each([
        ['another missing PostgreSQL function', { code: 'P2010', meta: { code: '42883', message: 'function other(text,text) does not exist' } }],
        ['another database error', { code: 'P2024', meta: { code: '42883', message: 'function similarity(text,text) does not exist' } }],
      ])('propaga %s without retrying', async (_label, error) => {
        mockPrisma.$queryRawUnsafe.mockReset().mockRejectedValueOnce(error);

        await expect(service.findAll({ search: 'long query' })).rejects.toBe(error);

        expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
        expect(mockPrisma.$queryRawUnsafe.mock.calls[0][0]).toContain('similarity(');
      });

      it('categoryId válido solo: se enlaza como $2 (COUNT) y LIMIT/OFFSET pasan a $3/$4 (SELECT)', async () => {
        await service.findAll({ search: 'camara', take: 10, skip: 0, categoryId: validCategory });
        const { countSql, countArgs, selectSql, selectArgs } = calls();

        expect(countSql).toContain('"categoryId" = $2');
        expect(countSql).not.toContain(validCategory);
        expect(countArgs).toEqual(['camara', validCategory]);
        expect(selectSql).toContain('"categoryId" = $2');
        expect(selectSql).toContain('LIMIT $3 OFFSET $4');
        expect(selectArgs).toEqual(['camara', validCategory, 10, 0]);
      });

      it('categoryIds agrega los hijos con parámetros seguros en COUNT y SELECT antes de paginar', async () => {
        mockPrisma.category.findMany.mockResolvedValue([{ id: 'leaf-a' }]);
        mockPrisma.$queryRawUnsafe
          .mockResolvedValueOnce([{ count: BigInt(1) }])
          .mockResolvedValueOnce([mockProductWithRelations]);
        mockPrisma.brand.findMany.mockResolvedValue([]);
        mockPrisma.productImage.findMany.mockResolvedValue([]);
        mockPrisma.price.findMany.mockResolvedValue([]);

        await service.findAll({ search: 'camara', categoryIds: ['root-a'], take: 10, skip: 20 });

        const [[countSql, ...countArgs], [selectSql, ...selectArgs]] = mockPrisma.$queryRawUnsafe.mock.calls;
        expect(countSql).toContain('p."categoryId" IN ($2, $3)');
        expect(selectSql).toContain('p."categoryId" IN ($2, $3)');
        expect(countArgs).toEqual(['camara', 'root-a', 'leaf-a']);
        expect(selectArgs).toEqual(['camara', 'root-a', 'leaf-a', 10, 20]);
        expect(countSql.match(/p\."categoryId" IN \(\$2, \$3\)/)?.[0]).toBe(
          selectSql.match(/p\."categoryId" IN \(\$2, \$3\)/)?.[0],
        );
      });

      it('brandId válido solo: se enlaza como parámetro', async () => {
        await service.findAll({ search: 'camara', take: 10, skip: 0, brandId: validBrand });
        const { countSql, countArgs, selectArgs } = calls();

        expect(countSql).toContain('"brandId" = $2');
        expect(countSql).not.toContain(validBrand);
        expect(countArgs).toEqual(['camara', validBrand]);
        expect(selectArgs).toEqual(['camara', validBrand, 10, 0]);
      });

      it('categoryId y brandId combinados con isActive/isVisible: orden de parámetros estable', async () => {
        await service.findAll({
          search: 'camara', take: 5, skip: 5,
          categoryId: validCategory, brandId: validBrand, isVisible: true, isActive: false,
        });
        const { countSql, countArgs, selectSql, selectArgs } = calls();

        expect(countSql).toContain('"categoryId" = $2');
        expect(countSql).toContain('"brandId" = $3');
        expect(countSql).toContain('"isVisible" = $4::boolean');
        expect(countSql).toContain('"isActive" = $5::boolean');
        expect(countArgs).toEqual(['camara', validCategory, validBrand, true, false]);
        expect(selectSql).toContain('LIMIT $6 OFFSET $7');
        expect(selectArgs).toEqual(['camara', validCategory, validBrand, true, false, 5, 5]);
      });

      it.each([
        ['comilla y OR', "x' OR '1'='1"],
        ['punto y coma', "x'; DROP TABLE products; --"],
        ['comentario SQL', "x'--"],
        ['comillas dobles', 'x" OR "1"="1'],
        ['UNION', "x' UNION SELECT * FROM users --"],
      ])('entrada malformada en categoryId/brandId (%s) no entra en el texto SQL', async (_name, payload) => {
        await service.findAll({ search: 'camara', categoryId: payload, brandId: payload });
        const { countSql, countArgs, selectSql, selectArgs } = calls();

        expect(countSql).not.toContain(payload);
        expect(selectSql).not.toContain(payload);
        expect(countSql).not.toMatch(/DROP|UNION/);
        expect(selectSql).not.toMatch(/DROP|UNION/);
        expect(countArgs).toEqual(['camara', payload, payload]);
        expect(selectArgs.slice(0, 3)).toEqual(['camara', payload, payload]);
      });

      it('con ctx y products:read global: no agrega ningun filtro por Lista (ni getAllowedListaIds)', async () => {
        mockGrants.grantsForUser.mockResolvedValue(grantRows('products:read'));

        await service.findAll(
          { search: 'camara', take: 10, skip: 0, categoryId: validCategory },
          { userId: 'u1', roles: ['Vendedor'] } as any,
        );
        const { countSql, countArgs, selectArgs } = calls();

        expect(countSql).not.toContain('listaId" = ANY');
        expect(countSql).not.toContain('1=0');
        expect(countArgs).toEqual(['camara', validCategory]);
        expect(selectArgs).toEqual(['camara', validCategory, 10, 0]);
        expect(mockAcl.getAllowedListaIds).not.toHaveBeenCalled();
      });

      it('con ctx sin products:read: 403 (no una lista vacia) y sin consultar la base', async () => {
        await expect(
          service.findAll({ search: 'camara' }, { userId: 'u1', roles: ['Admin Comercial'] } as any),
        ).rejects.toThrow(ForbiddenException);
        expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
      });
    });

    it('findOne no incluye la relación catalog en el include', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductWithRelations);

      await service.findOne('prod-1');

      const call = mockPrisma.product.findUnique.mock.calls[0][0];
      expect(call.include).not.toHaveProperty('catalog');
    });

    it('create no persiste catalogId', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', code: 'LISTA-GENERAL', defaultVisibility: false });
      mockPrisma.product.create.mockResolvedValue(mockProductWithRelations);

      await service.create({
        sku: 'CAM-X',
        name: 'X',
        categoryId: 'cat-1',
        brandId: 'brand-1',
        catalogId: 'id-antiguo'} as any);

      const call = mockPrisma.product.create.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('catalogId');
    });

    it('update no persiste catalogId', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(mockProduct);
      mockPrisma.product.findUnique.mockResolvedValueOnce(null); // sku check
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'CCTV' });
      mockPrisma.brand.findUnique.mockResolvedValue({ id: 'brand-1', name: 'Hikvision' });
      mockPrisma.product.update.mockResolvedValue(mockProductWithRelations);

      await service.update('prod-1', { name: 'X', catalogId: 'id-antiguo' } as any);

      const call = mockPrisma.product.update.mock.calls[0][0];
      expect(call.data).not.toHaveProperty('catalogId');
    });

    it('update reasigna listaId al actualizar', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(mockProduct);
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-nueva', defaultVisibility: false });
      mockPrisma.product.update.mockResolvedValue({ ...mockProductWithRelations, listaId: 'lista-nueva' });

      await service.update('prod-1', { listaId: 'lista-nueva' });

      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ listaId: 'lista-nueva' }) }),
      );
    });

    it('update rechaza listaId inexistente', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(mockProduct);
      mockPrisma.lista.findUnique.mockResolvedValue(null);

      await expect(service.update('prod-1', { listaId: 'no-existe' })).rejects.toThrow('Lista no encontrada');
    });

    it('bloquea con 400 intentos de cambiar estado vía PUT (FSM es la única vía)', async () => {
      await expect(service.update('prod-1', { isActive: true } as any)).rejects.toThrow(BadRequestException);
      await expect(service.update('prod-1', { publishStatus: 'publicado' } as any)).rejects.toThrow(
        /POST \/transition/,
      );
      await expect(service.update('prod-1', { publishAt: '2026-12-01' } as any)).rejects.toThrow(
        /POST \/transition/,
      );
      expect(mockPrisma.product.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('findTrending', () => {
    it('retorna productos tendencia activos y visibles', async () => {
      mockPrisma.product.findMany.mockResolvedValue([mockProductWithRelations]);
      mockPrisma.product.count.mockResolvedValue(1);

      const res = await service.findTrending({ take: 5 });

      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(1);
    });

    it('usa caché: una segunda llamada sin forceReload no consulta la BD', async () => {
      mockPrisma.product.findMany.mockResolvedValue([mockProductWithRelations]);
      mockPrisma.product.count.mockResolvedValue(1);

      await service.findTrending({ take: 5 });
      await service.findTrending({ take: 5 });

      expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(1);
    });

    it('forceReload vuelve a consultar la BD', async () => {
      mockPrisma.product.findMany.mockResolvedValue([mockProductWithRelations]);
      mockPrisma.product.count.mockResolvedValue(1);

      await service.findTrending({ take: 5 });
      await service.findTrending({ take: 5, forceReload: true });

      expect(mockPrisma.product.findMany).toHaveBeenCalledTimes(2);
    });

    describe('fuzzy search con categoryId (parámetro enlazado, sin inyección SQL)', () => {
      const injectedCategoryId = "cat-1' OR '1'='1";

      beforeEach(() => {
        mockPrisma.$queryRawUnsafe
          .mockResolvedValueOnce([{ count: BigInt(0) }])
          .mockResolvedValueOnce([]);
        mockPrisma.category.findMany.mockResolvedValue([]);
        mockPrisma.brand.findMany.mockResolvedValue([]);
        mockPrisma.productImage.findMany.mockResolvedValue([]);
        mockPrisma.price.findMany.mockResolvedValue([]);
      });

      it('enlaza categoryId como $3 en el SELECT y $2 en el COUNT, sin interpolarlo en el SQL', async () => {
        await service.findTrending({ take: 5, search: 'camara', categoryId: injectedCategoryId });

        expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
        const [countSql, ...countArgs] = mockPrisma.$queryRawUnsafe.mock.calls[0];
        const [selectSql, ...selectArgs] = mockPrisma.$queryRawUnsafe.mock.calls[1];

        expect(countSql).toContain('"categoryId" = $2');
        expect(countSql).not.toContain(injectedCategoryId);
        expect(countArgs).toEqual(['camara', injectedCategoryId]);

        expect(selectSql).toContain('"categoryId" = $3');
        expect(selectSql).not.toContain(injectedCategoryId);
        expect(selectArgs).toEqual(['camara', 5, injectedCategoryId]);
      });

      it('sin categoryId no agrega filtro de categoría ni parámetros extra', async () => {
        await service.findTrending({ take: 5, search: 'camara' });

        const [countSql, ...countArgs] = mockPrisma.$queryRawUnsafe.mock.calls[0];
        const [selectSql, ...selectArgs] = mockPrisma.$queryRawUnsafe.mock.calls[1];

        expect(countSql).not.toContain('"categoryId"');
        expect(countArgs).toEqual(['camara']);
        expect(selectSql).not.toContain('"categoryId"');
        expect(selectArgs).toEqual(['camara', 5]);
      });
    });
  });

  describe('importFromExcel', () => {
    function buildXlsxBuffer(rows: (string | number)[][]): Buffer {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    }

    beforeEach(() => {
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.brand.findMany.mockResolvedValue([]);
      mockPrisma.category.create.mockResolvedValue({ id: 'cat-1', name: 'CCTV', slug: 'cctv' });
      mockPrisma.brand.create.mockResolvedValue({ id: 'brand-1', name: 'Hikvision', slug: 'hikvision' });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', code: 'LISTA-GENERAL', defaultVisibility: false });
      mockPrisma.product.findUnique.mockResolvedValue(null);
    });

    it('importa productos válidos asociados a LISTA-GENERAL sin catalogId', async () => {
      mockPrisma.product.create.mockResolvedValue({ id: 'prod-1', sku: 'SKU-1' });

      const buffer = buildXlsxBuffer([
        ['SKU', 'Nombre', 'Categoría', 'Marca'],
        ['SKU-1', 'Cámara IP', 'CCTV', 'Hikvision'],
      ]);

      const result = await service.importFromExcel(buffer);

      expect(result.created).toBe(1);
      expect(mockPrisma.product.create.mock.calls[0][0].data).not.toHaveProperty('catalogId');
      expect(mockPrisma.product.create.mock.calls[0][0].data).toHaveProperty('listaId', 'lista-1');
    });

    it('rechaza un archivo vacío (solo encabezados)', async () => {
      const buffer = buildXlsxBuffer([['SKU', 'Nombre']]);

      await expect(service.importFromExcel(buffer)).rejects.toThrow('El archivo está vacío');
    });

    it('salta filas sin SKU', async () => {
      const buffer = buildXlsxBuffer([
        ['SKU', 'Nombre', 'Categoría', 'Marca'],
        ['', 'Cámara', 'CCTV', 'Hikvision'],
      ]);

      const result = await service.importFromExcel(buffer);

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors[0].error).toBe('SKU vacío');
    });

    it('salta filas sin nombre', async () => {
      const buffer = buildXlsxBuffer([
        ['SKU', 'Nombre', 'Categoría', 'Marca'],
        ['SKU-1', '', 'CCTV', 'Hikvision'],
      ]);

      const result = await service.importFromExcel(buffer);

      expect(result.skipped).toBe(1);
      expect(result.errors[0].error).toBe('Nombre vacío');
    });

    it('salta SKU ya existente (aunque difiera en mayúsculas)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'existing', sku: 'sku-1' }]);
      mockPrisma.product.findMany.mockResolvedValue([{ id: 'existing', sku: 'sku-1' }]);

      const buffer = buildXlsxBuffer([
        ['SKU', 'Nombre', 'Categoría', 'Marca'],
        ['SKU-1', 'Cámara', 'CCTV', 'Hikvision'],
      ]);

      const result = await service.importFromExcel(buffer);

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors[0].error).toBe('SKU ya existe');
    });

    it('NO crea categoría ni marca inexistentes: el producto entra por clasificar y la fila lo informa', async () => {
      (mockPrisma.category as any).findFirst = jest.fn().mockResolvedValue(null);
      (mockPrisma.brand as any).findFirst = jest.fn().mockResolvedValue(null);
      mockPrisma.product.create.mockResolvedValue({ id: 'prod-1', sku: 'SKU-1' });

      const buffer = buildXlsxBuffer([
        ['SKU', 'Nombre', 'Categoría', 'Marca'],
        ['SKU-1', 'Cámara', 'CCTV', 'Hikvision'],
      ]);

      const result = await service.importFromExcel(buffer);

      expect(result.created).toBe(1);
      expect(mockPrisma.category.create).not.toHaveBeenCalled();
      expect(mockPrisma.brand.create).not.toHaveBeenCalled();
      const data = mockPrisma.product.create.mock.calls[0][0].data;
      expect(data.brandId).toBeNull();
      expect(data.categoryId).toBeNull();
      expect(result.needsConfirmation).toEqual([
        { row: 2, sku: 'SKU-1', code: 'CATEGORY_NEEDS_CONFIRMATION', label: 'CCTV' },
        { row: 2, sku: 'SKU-1', code: 'BRAND_NEEDS_CONFIRMATION', label: 'Hikvision' },
      ]);
    });

    it('deriva el nombre desde una descripción extensa de DVR sin columna Nombre', async () => {
      mockPrisma.product.create.mockResolvedValue({ id: 'prod-2', sku: 'DS-7204HGHI-M1T' });

      const buffer = buildXlsxBuffer([
        ['SKU', 'Descripción', 'Categoría', 'Marca'],
        [
          'DS-7204HGHI-M1T',
          'DVR Lite Mini 1U H.265 de 4 canales y 1080p metalico Compatible con la tecnología de detección de movimiento de todos los canales Compresión de vídeo H.265 Pro+/H.265 Pro/H.265 Pro',
          'CCTV',
          'Hikvision',
        ],
      ]);

      const result = await service.importFromExcel(buffer);

      expect(result.created).toBe(1);
      const data = mockPrisma.product.create.mock.calls[0][0].data;
      expect(data.sku).toBe('DS-7204HGHI-M1T');
      expect(data.name).toBe('DVR Lite Mini 1U H.265 de 4 canales y 1080p metalico');
      expect(data.name).not.toContain('DS-7204HGHI-M1T');
      // description conserva el texto completo normalizado (incluye la parte técnica cortada del nombre).
      expect(data.description).toContain('DVR Lite Mini 1U H.265 de 4 canales y 1080p metalico');
      expect(data.description).toContain('Compatible');
      expect(data.description).toContain('Compresión');
    });

    it('conserva el nombre explícito y guarda la descripción completa por separado', async () => {
      mockPrisma.product.create.mockResolvedValue({ id: 'prod-3', sku: 'SKU-2' });

      const buffer = buildXlsxBuffer([
        ['SKU', 'Nombre', 'Descripción', 'Categoría', 'Marca'],
        ['SKU-2', 'Cámara IP 4MP', 'Cámara IP 4MP con visión nocturna', 'CCTV', 'Hikvision'],
      ]);

      const result = await service.importFromExcel(buffer);

      expect(result.created).toBe(1);
      const data = mockPrisma.product.create.mock.calls[0][0].data;
      expect(data.name).toBe('Cámara IP 4MP');
      expect(data.name).not.toContain('SKU-2');
      expect(data.description).toBe('Cámara IP 4MP con visión nocturna');
    });

    it('usa la descripción completa (limitada a 120 chars sin partir palabras) cuando no hay frase de corte', async () => {
      mockPrisma.product.create.mockResolvedValue({ id: 'prod-4', sku: 'SKU-LARGO' });

      const longDescription =
        'Cámara de seguridad IP Hikvision con resolución 4MP, lente motorizado 2.8-12mm, ' +
        'casco IP67, alimentación PoE, socket múltiple, doble tarjeta SD y arranque rápido para ' +
        'la vigilancia perimetral de recintos amplios en exteriores';

      const buffer = buildXlsxBuffer([
        ['SKU', 'Descripción', 'Categoría', 'Marca'],
        ['SKU-LARGO', longDescription, 'CCTV', 'Hikvision'],
      ]);

      const result = await service.importFromExcel(buffer);

      expect(result.created).toBe(1);
      const data = mockPrisma.product.create.mock.calls[0][0].data;
      expect(data.name.length).toBeLessThanOrEqual(120);
      expect(data.name).not.toContain('SKU-LARGO');
      // No termina en espacio/puntuación: no quedó una palabra partida en la cola.
      expect(data.name).toMatch(/[a-zA-Z0-9]$/);
    });

    it('quita el artefacto de encabezado TITLE HIKVISION TURBO sin dejarlo en el nombre', async () => {
      mockPrisma.product.create.mockResolvedValue({ id: 'prod-5', sku: 'SKU-5' });

      const buffer = buildXlsxBuffer([
        ['SKU', 'Descripción', 'Categoría', 'Marca'],
        ['SKU-5', 'TITLE HIKVISION TURBO DVR Lite Mini 1U H.265 de 4 canales', 'CCTV', 'Hikvision'],
      ]);

      const result = await service.importFromExcel(buffer);

      expect(result.created).toBe(1);
      const data = mockPrisma.product.create.mock.calls[0][0].data;
      expect(data.name).toContain('DVR Lite Mini');
      expect(data.name).not.toContain('TITLE');
      expect(data.name).not.toContain('HIKVISION TURBO');
    });

    it('omite la fila cuando la descripción es solo el encabezado (sin contenido útil)', async () => {
      const buffer = buildXlsxBuffer([
        ['SKU', 'Descripción', 'Categoría', 'Marca'],
        ['SKU-6', 'TITLE HIKVISION TURBO', 'CCTV', 'Hikvision'],
      ]);

      const result = await service.importFromExcel(buffer);

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
    });

    it('no reemplaza el nombre de un SKU ya existente (la fila se omite y no se actualiza)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'existing-1', sku: 'SKU-1' }]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'existing-1', sku: 'SKU-1', name: 'Nombre Pre-existente' },
      ]);

      const buffer = buildXlsxBuffer([
        ['SKU', 'Descripción', 'Categoría', 'Marca'],
        ['SKU-1', 'DVR Lite Mini 1U H.265 de 4 canales y 1080p metalico', 'CCTV', 'Hikvision'],
      ]);

      const result = await service.importFromExcel(buffer);

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors[0].error).toBe('SKU ya existe');
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
    });

    it('omite la fila sin nombre ni descripción sin crear un producto incompleto', async () => {
      mockPrisma.product.create.mockResolvedValue({ id: 'prod-8', sku: 'SKU-8' });

      const buffer = buildXlsxBuffer([
        ['SKU', 'Nombre', 'Descripción', 'Categoría', 'Marca'],
        ['SKU-8', '', '', 'CCTV', 'Hikvision'],
      ]);

      const result = await service.importFromExcel(buffer);

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
    });
  });

  // --- Autorizacion por concesiones de panel (deny-by-default, sin Listas) ---
  describe('autorizacion por concesiones (deny-by-default)', () => {
    const ADMIN = { userId: 'admin-1', roles: ['Super Admin'] };
    const READER = { userId: 'reader-1', roles: ['Operador'] };
    const NOAUTH = { userId: 'none-1', roles: ['Admin Comercial'] };

    beforeEach(() => {
      mockGrants.grantsForUser.mockImplementation(async (userId: string) =>
        userId === READER.userId ? grantRows('products:read') : []);
    });

    it('findAll: con products:read global ve todo (sin filtro de Lista); sin concesion 403', async () => {
      mockPrisma.product.findMany.mockResolvedValue([mockProduct]);
      mockPrisma.product.count.mockResolvedValue(1);

      const authed = await service.findAll({ skip: 0, take: 50 }, READER);
      expect(authed.data).toHaveLength(1);
      expect(mockPrisma.product.findMany.mock.calls[0][0].where).not.toHaveProperty('listaId');

      await expect(service.findAll({ skip: 0, take: 50 }, NOAUTH)).rejects.toThrow(ForbiddenException);
    });

    it('findAll: Super Admin ve todo (sin filtro de listaId)', async () => {
      mockPrisma.product.findMany.mockResolvedValue([mockProduct]);
      mockPrisma.product.count.mockResolvedValue(1);

      const res = await service.findAll({ skip: 0, take: 50 }, ADMIN);
      expect(res.data).toHaveLength(1);
      const call = mockPrisma.product.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('listaId');
    });

    it('findOne: sin concesion 403 (no 404); con products:read ve el producto aunque tenga Lista', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ ...mockProductWithRelations, listaId: 'list-1' });
      await expect(service.findOne('prod-1', NOAUTH)).rejects.toThrow(ForbiddenException);
      const res = await service.findOne('prod-1', READER);
      expect(res.id).toBe('prod-1');
      expect(mockAcl.assertProductAccess).not.toHaveBeenCalled();
    });

    it('lector sin publish: toggleVisibility 403', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({
        ...mockProduct,
        listaId: 'list-1',
        publishStatus: 'publicado',
        isVisible: true,
        lifecycleStatus: 'PUBLISHED'});
      await expect(service.toggleVisibility('prod-1', READER)).rejects.toThrow(ForbiddenException);
    });

    it('create: lector sin products:write no puede crear producto', async () => {
      const dto = { sku: 'NEW-1', name: 'X', categoryId: 'cat-1', brandId: 'brand-1', listaId: 'list-1' };
      await expect(service.create(dto as any, READER)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
    });
  });

  describe('stockStatus calculado (Tanda 1C)', () => {
    it('findAll: in_stock con availableQty > 0', async () => {
      mockPrisma.product.findMany.mockResolvedValue([mockProductWithRelations]);
      mockPrisma.product.count.mockResolvedValue(1);
      mockPrisma.stock.findMany.mockResolvedValue([{ id: 's1', productId: 'prod-1', availableQty: 5 }]);

      const res = await service.findAll({ skip: 0, take: 50 });
      expect(res.data[0].stockStatus).toBe('in_stock');
    });

    it('findAll: out_of_stock con availableQty 0', async () => {
      mockPrisma.product.findMany.mockResolvedValue([mockProductWithRelations]);
      mockPrisma.product.count.mockResolvedValue(1);
      mockPrisma.stock.findMany.mockResolvedValue([{ id: 's1', productId: 'prod-1', availableQty: 0 }]);

      const res = await service.findAll({ skip: 0, take: 50 });
      expect(res.data[0].stockStatus).toBe('out_of_stock');
    });

    it('findAll: no_stock_data sin registro de stock', async () => {
      mockPrisma.product.findMany.mockResolvedValue([mockProductWithRelations]);
      mockPrisma.product.count.mockResolvedValue(1);
      mockPrisma.stock.findMany.mockResolvedValue([]);

      const res = await service.findAll({ skip: 0, take: 50 });
      expect(res.data[0].stockStatus).toBe('no_stock_data');
    });

    it('findOne: incluye stockStatus calculado', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(mockProductWithRelations);
      mockPrisma.stock.findUnique.mockResolvedValue({ id: 's1', productId: 'prod-1', availableQty: 8 });

      const res = await service.findOne('prod-1');
      expect(res.stockStatus).toBe('in_stock');
    });
  });

  // --- PATCH de imágenes (Tanda 1C): alt y principal ---
  describe('updateImage (PATCH imágenes)', () => {
    const image = {
      id: 'img-1',
      productId: 'prod-1',
      url: '/uploads/img-1.png',
      alt: 'Cámara IP',
      isPrimary: false,
      type: 'PRINCIPAL',
      sortOrder: 0};

    it('actualiza el alt de la imagen y audita', async () => {
      mockPrisma.productImage.findUnique.mockResolvedValue(image);
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
      mockPrisma.productImage.update.mockResolvedValue({ ...image, alt: 'Cámara IP frontal' });

      const result = await service.updateImage('img-1', { alt: 'Cámara IP frontal' });

      expect(result.alt).toBe('Cámara IP frontal');
      expect(mockPrisma.productImage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'img-1' },
          data: { alt: 'Cámara IP frontal' }}),
      );
      expect(mockPrisma.productImage.updateMany).not.toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          entity: 'ProductImage',
          entityId: 'img-1',
          oldValues: expect.objectContaining({ isPrimary: false }),
          newValues: expect.objectContaining({ alt: 'Cámara IP frontal' })}),
      );
    });

    it('marca como principal y desmarca las demás imágenes del producto', async () => {
      mockPrisma.productImage.findUnique.mockResolvedValue(image);
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
      mockPrisma.productImage.update.mockResolvedValue({ ...image, isPrimary: true });

      const result = await service.updateImage('img-1', { isPrimary: true });

      expect(result.isPrimary).toBe(true);
      expect(mockPrisma.productImage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: 'prod-1', isPrimary: true },
          data: { isPrimary: false }}),
      );
      expect(mockPrisma.productImage.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isPrimary: true }) }),
      );
    });

    it.each(['COMPLEMENTARIA', 'PORTADA'] as const)('persiste type=%s sin alterar isPrimary', async (type) => {
      mockPrisma.productImage.findUnique.mockResolvedValue(image);
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
      mockPrisma.productImage.update.mockResolvedValue({ ...image, type });

      const result = await service.updateImage('img-1', { type });

      expect(result).toEqual(expect.objectContaining({ type, isPrimary: false }));
      expect(mockPrisma.productImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { type },
      });
      expect(mockPrisma.productImage.updateMany).not.toHaveBeenCalled();
      expect(mockRevisions.markPendingFromLive).toHaveBeenCalledWith('prod-1');
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({
        oldValues: expect.objectContaining({ type: 'PRINCIPAL' }),
        newValues: expect.objectContaining({ type }),
      }));
    });

    it('dedicated: incluye la revisión pendiente en la transacción de biblioteca', async () => {
      mockPrisma.productImage.findUnique.mockResolvedValue(image);
      mockPrisma.productImage.update.mockResolvedValue({ ...image, type: 'COMPLEMENTARIA' });
      const dedicatedLibrary = {
        config: { mode: 'dedicated' },
        assertWritesAllowed: jest.fn(),
        client: mockPrisma,
        ownsTransaction: jest.fn().mockReturnValue(true),
        writeTransaction: jest.fn(async (work: any) => work(mockPrisma)),
      };
      (service as any).library = dedicatedLibrary;
      (service as any).appendLibraryEvent = jest.fn();

      await service.updateImage('img-1', { type: 'COMPLEMENTARIA' });

      expect(mockRevisions.markPendingFromLive).toHaveBeenCalledWith(
        'prod-1', mockPrisma, { id: undefined },
      );
      expect(dedicatedLibrary.writeTransaction).toHaveBeenCalledTimes(1);
    });

    it('lanza 404 si la imagen no existe', async () => {
      mockPrisma.productImage.findUnique.mockResolvedValue(null);

      await expect(service.updateImage('no-existe', { alt: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('revisión pendiente tras cambios de imágenes', () => {
    it('uploadImage marca pendiente después de crear la imagen', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      mockFiles.store.mockResolvedValue({ id: 'file-new', url: '/api/files/file-new' });
      mockPrisma.productImage.create.mockResolvedValue({ id: 'img-new', productId: 'prod-1', type: 'PRINCIPAL' });
      const file = {
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        mimetype: 'image/png',
        size: 4,
        originalname: 'frente.png',
      };

      await service.uploadImage('prod-1', file as any);

      expect(mockRevisions.markPendingFromLive).toHaveBeenCalledWith('prod-1');
    });

    it('deleteImage marca pendiente después de quitar la referencia viva', async () => {
      mockFiles.release.mockResolvedValue({ deleted: false });
      mockPrisma.productImage.findUnique.mockResolvedValue({
        id: 'img-1', productId: 'prod-1', url: '/uploads/img-1.png',
      });

      await service.deleteImage('img-1');

      expect(mockPrisma.productImage.delete).toHaveBeenCalledWith({ where: { id: 'img-1' } });
      expect(mockRevisions.markPendingFromLive).toHaveBeenCalledWith('prod-1');
    });
  });
  describe('Fase 3B — Lista completa (publicar/programar/cancelar)', () => {
    const baseCtx = { userId: 'user-1', roles: ['Admin Comercial'] };

    it('publicar Lista PENDING_DELETION: bloquea con LISTA_PENDIENTE_ELIMINACION', async () => {
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', isActive: true, archivedAt: null, deletionStatus: 'PENDING_DELETION' });
      await expect(service.publishListaProducts('lista-x', baseCtx)).rejects.toThrow(ConflictException);
    });

    it('programar Lista PENDING_DELETION: bloquea con LISTA_PENDIENTE_ELIMINACION', async () => {
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', isActive: true, archivedAt: null, deletionStatus: 'PENDING_DELETION' });
      await expect(
        service.scheduleListaProducts('lista-x', { publishAt: '2099-01-01T00:00:00.000Z' }, baseCtx),
      ).rejects.toThrow(ConflictException);
    });

    it('cancelar Lista PENDING_DELETION: bloquea con LISTA_PENDIENTE_ELIMINACION', async () => {
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-x', isActive: true, archivedAt: null, deletionStatus: 'PENDING_DELETION' });
      await expect(service.cancelListaSchedules('lista-x', baseCtx)).rejects.toThrow(ConflictException);
    });

    it('publicar Lista solo procesa productos de su listaId (no elegibles → SKIPPED)', async () => {
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-a', isActive: true, archivedAt: null });
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', sku: 'SKU1' },
        { id: 'p2', sku: 'SKU2' },
      ]);
      mockPrisma.product.findUnique.mockImplementation(async ({ where }) => {
        if (where.id === 'p1') return { id: 'p1', sku: 'SKU1', listaId: 'lista-a', lifecycleStatus: 'PUBLISHED', publishStatus: 'publicado', isActive: true, isVisible: true };
        return { id: 'p2', sku: 'SKU2', listaId: 'lista-a', lifecycleStatus: 'ARCHIVED', publishStatus: 'archivado', isActive: false, isVisible: false };
      });
      const r = await service.publishListaProducts('lista-a', baseCtx);
      expect(r.processed).toBe(2);
      expect(r.succeeded).toBe(0);
      expect(r.skipped).toBe(2);
      expect(r.failed).toBe(0);
      expect(r.results.every((x) => x.status === 'SKIPPED')).toBe(true);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ listaId: 'lista-a' }) }),
      );
    });

    it('programar Lista: programa DRAFT, omite PUBLISHED, y audita WARNING en resultado parcial', async () => {
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-a', isActive: true, archivedAt: null });
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', sku: 'SKU1' },
        { id: 'p2', sku: 'SKU2' },
      ]);
      mockPrisma.product.findUnique.mockImplementation(async ({ where }) => {
        if (where.id === 'p1') return { id: 'p1', sku: 'SKU1', listaId: 'lista-a', lifecycleStatus: 'DRAFT', publishStatus: 'borrador', isActive: false, isVisible: false };
        return { id: 'p2', sku: 'SKU2', listaId: 'lista-a', lifecycleStatus: 'PUBLISHED', publishStatus: 'publicado', isActive: true, isVisible: true };
      });
      mockPrisma.product.update.mockResolvedValue({ id: 'p1', sku: 'SKU1' });
      const r = await service.scheduleListaProducts('lista-a', { publishAt: '2099-01-01T00:00:00.000Z' }, { userId: 'user-1', roles: ['Super Admin'] }); // per-product publish needs a grant or Super Admin
      expect(r.succeeded).toBe(1);
      expect(r.skipped).toBe(1);
      expect(r.failed).toBe(0);
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ result: 'WARNING', entity: 'LISTA', entityId: 'lista-a' }));
    });

    it('cancelar programación de Lista sin programaciones: devuelve resultado vacío válido', async () => {
      mockPrisma.lista.findUnique.mockResolvedValue({ id: 'lista-a', isActive: true, archivedAt: null });
      mockPrisma.product.findMany.mockResolvedValue([]);
      const r = await service.cancelListaSchedules('lista-a', baseCtx);
      expect(r).toEqual({
        listaId: 'lista-a',
        processed: 0,
        succeeded: 0,
        skipped: 0,
        failed: 0,
        results: [],
      });
    });
  });
});
