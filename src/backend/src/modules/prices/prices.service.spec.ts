import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();
(mockPrisma as any).accessGrant = { findMany: jest.fn() };

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PricesService } from './prices.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AclService } from '../../common/acl/acl.service';
import { AuditService } from '../audit/audit.service';

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

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

const mockPriceList = {
  id: 'pl-1',
  name: 'Lista Mayorista',
  code: 'MAYORISTA',
  currency: 'COP',
  isActive: true,
  validFrom: null,
  validUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPriceListWithCount = {
  ...mockPriceList,
  _count: { prices: 3 },
};

const mockPriceListWithPrices = {
  ...mockPriceList,
  prices: [
    {
      id: 'price-1',
      productId: 'prod-1',
      priceListId: 'pl-1',
      value: 1500000,
      currency: 'COP',
      validFrom: null,
      validUntil: null,
      product: { id: 'prod-1', sku: 'CAM-001', name: 'Cámara IP' },
    },
  ],
};

const mockPrice = {
  id: 'price-1',
  productId: 'prod-1',
  priceListId: 'pl-1',
  value: 1500000,
  currency: 'COP',
  validFrom: null,
  validUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPriceWithRelations = {
  ...mockPrice,
  product: { id: 'prod-1', sku: 'CAM-001', name: 'Cámara IP' },
  priceList: { id: 'pl-1', name: 'Lista Mayorista', code: 'MAYORISTA' },
};

describe('PricesService', () => {
  let service: PricesService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AclService, useValue: mockAcl },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<PricesService>(PricesService);
  });

  describe('findAllPriceLists', () => {
    it('debe listar listas de precio con conteo', async () => {
      mockPrisma.priceList.findMany.mockResolvedValue([mockPriceListWithCount]);

      const result = await service.findAllPriceLists();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Lista Mayorista');
      expect(result.data[0].priceCount).toBe(3);
    });
  });

  describe('findOnePriceList', () => {
    it('debe retornar lista de precio por id', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValue(mockPriceListWithPrices);

      const result = await service.findOnePriceList('pl-1');

      expect(result.name).toBe('Lista Mayorista');
      expect(result.prices).toHaveLength(1);
    });

    it('debe lanzar NotFoundException cuando la lista no existe', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValue(null);

      await expect(service.findOnePriceList('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createPriceList', () => {
    it('debe crear una lista de precio', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValue(null);
      mockPrisma.priceList.create.mockResolvedValue(mockPriceList);

      const dto = { name: 'Lista Mayorista', code: 'MAYORISTA' };
      const result = await service.createPriceList(dto);

      expect(result.name).toBe('Lista Mayorista');
      expect(result.code).toBe('MAYORISTA');
    });

    it('debe rechazar código duplicado con ConflictException', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValue(mockPriceList);

      const dto = { name: 'Otra Lista', code: 'MAYORISTA' };

      await expect(service.createPriceList(dto)).rejects.toThrow(ConflictException);
      await expect(service.createPriceList(dto)).rejects.toThrow('Ya existe una lista con ese código');
    });

    it('debe rechazar validUntil anterior a validFrom', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValue(null);

      const dto = { name: 'Lista', code: 'L1', validFrom: '2026-12-31', validUntil: '2026-01-01' };

      await expect(service.createPriceList(dto)).rejects.toThrow(BadRequestException);
      await expect(service.createPriceList(dto)).rejects.toThrow('no puede ser anterior');
    });

    it('debe rechazar moneda no permitida', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValue(null);

      const dto = { name: 'Lista', code: 'L1', currency: 'MXN' };

      await expect(service.createPriceList(dto)).rejects.toThrow(BadRequestException);
      await expect(service.createPriceList(dto)).rejects.toThrow('Moneda no permitida');
    });

    it('debe aceptar COP, USD y EUR', async () => {
      for (const currency of ['COP', 'USD', 'EUR']) {
        mockPrisma.priceList.findUnique.mockResolvedValue(null);
        mockPrisma.priceList.create.mockResolvedValue({ ...mockPriceList, currency });
        const result = await service.createPriceList({ name: 'Lista', code: `L-${currency}`, currency });
        expect(result.currency).toBe(currency);
      }
    });
  });

  describe('updatePriceList', () => {
    it('debe actualizar una lista de precio', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValueOnce(mockPriceList);
      mockPrisma.priceList.findUnique.mockResolvedValueOnce(null);
      mockPrisma.priceList.update.mockResolvedValue({ ...mockPriceList, name: 'Lista Minorista' });

      const dto = { name: 'Lista Minorista' };
      const result = await service.updatePriceList('pl-1', dto);

      expect(result.name).toBe('Lista Minorista');
    });

    it('debe lanzar NotFoundException si la lista no existe', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValue(null);

      await expect(service.updatePriceList('no-existe', { name: 'Nope' })).rejects.toThrow(NotFoundException);
    });

    it('debe rechazar validUntil anterior a validFrom en update', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValueOnce(mockPriceList);

      const dto = { validFrom: '2026-12-01', validUntil: '2026-11-01' };

      await expect(service.updatePriceList('pl-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('debe validar contra la fecha persistida cuando solo se envía una', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValueOnce({
        ...mockPriceList,
        validFrom: new Date('2026-01-01'),
        validUntil: null,
      });

      const dto = { validUntil: '2025-01-01' };

      await expect(service.updatePriceList('pl-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar moneda no permitida en update', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValueOnce(mockPriceList);

      const dto = { currency: 'MXN' };

      await expect(service.updatePriceList('pl-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('debe permitir fechas válidas en update', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValueOnce(mockPriceList);
      mockPrisma.priceList.update.mockResolvedValue({
        ...mockPriceList,
        validFrom: new Date('2026-01-01'),
        validUntil: new Date('2026-12-31'),
      });

      const result = await service.updatePriceList('pl-1', {
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
      });

      expect(result.name).toBe('Lista Mayorista');
    });
  });

  describe('togglePriceListActive', () => {
    it('debe alternar isActive', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValue(mockPriceList);
      mockPrisma.priceList.update.mockResolvedValue({ ...mockPriceList, isActive: false });

      const result = await service.togglePriceListActive('pl-1');

      expect(result.isActive).toBe(false);
      expect(mockPrisma.priceList.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });

    it('debe lanzar NotFoundException si la lista no existe', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValue(null);

      await expect(service.togglePriceListActive('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removePriceList', () => {
    it('debe eliminar una lista sin precios asociados', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValue({ ...mockPriceListWithCount, _count: { prices: 0 } });
      mockPrisma.priceList.delete.mockResolvedValue(mockPriceList);

      const result = await service.removePriceList('pl-1');

      expect(result.message).toBe('Lista de precios eliminada exitosamente');
    });

    it('debe lanzar ConflictException si la lista tiene precios', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValue(mockPriceListWithCount);

      await expect(service.removePriceList('pl-1')).rejects.toThrow(ConflictException);
      await expect(service.removePriceList('pl-1')).rejects.toThrow('No se puede eliminar una lista con precios asociados');
    });

    it('debe lanzar NotFoundException si la lista no existe', async () => {
      mockPrisma.priceList.findUnique.mockResolvedValue(null);

      await expect(service.removePriceList('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createPrice', () => {
    it('debe crear un precio para producto', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1' });
      mockPrisma.price.findUnique.mockResolvedValue(null);
      mockPrisma.price.create.mockResolvedValue(mockPriceWithRelations);

      const dto = { productId: 'prod-1', priceListId: 'pl-1', value: 1500000 };
      const result = await service.createPrice(dto);

      expect(result.value).toBe(1500000);
    });

    it('debe rechazar duplicado producto+lista con ConflictException', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1' });
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);

      const dto = { productId: 'prod-1', priceListId: 'pl-1', value: 1500000 };

      await expect(service.createPrice(dto)).rejects.toThrow(ConflictException);
      await expect(service.createPrice(dto)).rejects.toThrow('Ya existe un precio para este producto en esta lista');
    });

    it('debe lanzar NotFoundException si el producto no existe', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);

      const dto = { productId: 'no-existe', priceListId: 'pl-1', value: 1000 };

      await expect(service.createPrice(dto)).rejects.toThrow(NotFoundException);
    });

    it('debe rechazar crear precio con listaId distinto al del producto', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1' });
      mockPrisma.price.findUnique.mockResolvedValue(null);

      const dto = { productId: 'prod-1', priceListId: 'pl-1', value: 1500000, listaId: 'otra-lista' };

      await expect(service.createPrice(dto)).rejects.toThrow(ConflictException);
      await expect(service.createPrice(dto)).rejects.toThrow('no coincide con la Lista del producto');
    });

    it('debe asociar el listaId del producto al crear el precio', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1' });
      mockPrisma.price.findUnique.mockResolvedValue(null);
      mockPrisma.price.create.mockResolvedValue(mockPriceWithRelations);

      const dto = { productId: 'prod-1', priceListId: 'pl-1', value: 1500000 };

      await service.createPrice(dto as any);

      expect(mockPrisma.price.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ listaId: 'lista-prod' }) }),
      );
    });

    it('debe rechazar valor de precio negativo', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1' });
      mockPrisma.price.findUnique.mockResolvedValue(null);

      const dto = { productId: 'prod-1', priceListId: 'pl-1', value: -5000 };

      await expect(service.createPrice(dto as any)).rejects.toThrow(BadRequestException);
      await expect(service.createPrice(dto as any)).rejects.toThrow('no puede ser negativo');
    });

    it('debe rechazar 400 si la moneda del precio difiere de la tarifa', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1', currency: 'COP' });
      mockPrisma.price.findUnique.mockResolvedValue(null);

      const dto = { productId: 'prod-1', priceListId: 'pl-1', value: 1500000, currency: 'USD' };

      await expect(service.createPrice(dto as any)).rejects.toThrow(BadRequestException);
      await expect(service.createPrice(dto as any)).rejects.toThrow(
        'La moneda del precio (USD) no coincide con la moneda de la tarifa (COP)',
      );
      expect(mockPrisma.price.create).not.toHaveBeenCalled();
    });

    it('debe aceptar moneda igual a la de la tarifa', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1', currency: 'COP' });
      mockPrisma.price.findUnique.mockResolvedValue(null);
      mockPrisma.price.create.mockResolvedValue(mockPriceWithRelations);

      const dto = { productId: 'prod-1', priceListId: 'pl-1', value: 1500000, currency: 'COP' };

      const result = await service.createPrice(dto as any);
      expect(result.value).toBe(1500000);
    });

    it('debe heredar la moneda de la tarifa cuando el DTO no trae currency', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1', currency: 'USD' });
      mockPrisma.price.findUnique.mockResolvedValue(null);
      mockPrisma.price.create.mockResolvedValue({ ...mockPriceWithRelations, currency: 'USD' });

      await service.createPrice({ productId: 'prod-1', priceListId: 'pl-1', value: 1500000 } as any);

      expect(mockPrisma.price.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currency: 'USD' }) }),
      );
    });
  });

  describe('updatePrice', () => {
    it('debe actualizar un precio', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);
      mockPrisma.price.update.mockResolvedValue({ ...mockPriceWithRelations, value: 1600000 });

      const dto = { value: 1600000 };
      const result = await service.updatePrice('price-1', dto);

      expect(result.value).toBe(1600000);
    });

    it('debe lanzar NotFoundException si el precio no existe', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(null);

      await expect(service.updatePrice('no-existe', { value: 1000 })).rejects.toThrow(NotFoundException);
    });

    it('debe rechazar cambiar listaId del precio si no coincide con la Lista del producto', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });

      const dto = { listaId: 'otra-lista' };

      await expect(service.updatePrice('price-1', dto)).rejects.toThrow(ConflictException);
      await expect(service.updatePrice('price-1', dto)).rejects.toThrow('no coincide con la Lista del producto');
    });

    it('debe rechazar 400 si se cambia a una moneda distinta de la tarifa', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1', currency: 'COP' });
      mockPrisma.price.findMany.mockResolvedValue([]);

      const dto = { currency: 'USD' };

      await expect(service.updatePrice('price-1', dto)).rejects.toThrow(BadRequestException);
      await expect(service.updatePrice('price-1', dto)).rejects.toThrow(
        'La moneda del precio (USD) no coincide con la moneda de la tarifa (COP)',
      );
      expect(mockPrisma.price.update).not.toHaveBeenCalled();
    });
  });

  describe('removePrice', () => {
    it('debe eliminar un precio', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);
      mockPrisma.price.delete.mockResolvedValue(mockPrice);

      const result = await service.removePrice('price-1');

      expect(result.message).toBe('Precio eliminado exitosamente');
    });

    it('debe lanzar NotFoundException si el precio no existe', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(null);

      await expect(service.removePrice('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // --- Solapamiento de vigencias (checklist 21) ---
  describe('solapamiento de precios', () => {
    function existingOverlapping(overrides: Record<string, any> = {}) {
      return {
        id: 'price-x',
        productId: 'prod-1',
        priceListId: 'pl-2',
        listaId: 'lista-prod',
        value: 1000,
        currency: 'COP',
        validFrom: new Date('2026-01-01'),
        validUntil: new Date('2026-12-31'),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    }

    it('createPrice rechaza con 409 si la vigencia se solapa con otro precio de la misma Lista', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1' });
      mockPrisma.price.findUnique.mockResolvedValue(null);
      mockPrisma.price.findMany.mockResolvedValue([existingOverlapping()]);

      const dto = {
        productId: 'prod-1',
        priceListId: 'pl-1',
        value: 1500000,
        validFrom: '2026-06-01',
        validUntil: '2026-07-01',
      };

      await expect(service.createPrice(dto)).rejects.toThrow(ConflictException);
      await expect(service.createPrice(dto)).rejects.toThrow('se solapa con la vigencia del precio price-x');
      expect(mockPrisma.price.create).not.toHaveBeenCalled();
    });

    it('createPrice acepta cuando la vigencia no se solapa', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1' });
      mockPrisma.price.findUnique.mockResolvedValue(null);
      // Otro precio en 2027, sin solapamiento.
      mockPrisma.price.findMany.mockResolvedValue([
        existingOverlapping({ validFrom: new Date('2027-01-01'), validUntil: new Date('2027-12-31') }),
      ]);
      mockPrisma.price.create.mockResolvedValue(mockPriceWithRelations);

      const dto = {
        productId: 'prod-1',
        priceListId: 'pl-1',
        value: 1500000,
        validFrom: '2026-06-01',
        validUntil: '2026-07-01',
      };

      const result = await service.createPrice(dto as any);
      expect(result.value).toBe(1500000);
    });

    it('createPrice rechaza solapamiento con vigencia abierta (validUntil null)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1' });
      mockPrisma.price.findUnique.mockResolvedValue(null);
      mockPrisma.price.findMany.mockResolvedValue([
        existingOverlapping({ validFrom: new Date('2026-01-01'), validUntil: null }),
      ]);

      const dto = {
        productId: 'prod-1',
        priceListId: 'pl-1',
        value: 1500000,
        validFrom: '2026-06-01',
      };

      await expect(service.createPrice(dto)).rejects.toThrow(ConflictException);
      await expect(service.createPrice(dto)).rejects.toThrow('se solapa');
    });

    it('updatePrice rechaza con 409 si la nueva vigencia se solapa con otro precio', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);
      mockPrisma.price.findMany.mockResolvedValue([
        existingOverlapping({ id: 'price-y', priceListId: 'pl-1', validFrom: new Date('2026-05-01'), validUntil: new Date('2026-06-15') }),
      ]);

      const dto = { validFrom: '2026-06-01', validUntil: '2026-07-01' };

      await expect(service.updatePrice('price-1', dto)).rejects.toThrow(ConflictException);
      await expect(service.updatePrice('price-1', dto)).rejects.toThrow('se solapa con la vigencia del precio price-y');
    });

    it('updatePrice permite ampliar vigencia sin solapamiento', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);
      mockPrisma.price.findMany.mockResolvedValue([]);
      mockPrisma.price.update.mockResolvedValue({ ...mockPriceWithRelations, value: 1600000 });

      const result = await service.updatePrice('price-1', { value: 1600000 });
      expect(result.value).toBe(1600000);
    });
  });

  // --- IMP-03: COP unificado (redondeo HALF_UP y límite único) ---
  describe('IMP-03 COP en la API manual de precios', () => {
    it('createPrice redondea HALF_UP a entero COP', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1', currency: 'COP' });
      mockPrisma.price.findUnique.mockResolvedValue(null);
      mockPrisma.price.create.mockResolvedValue(mockPriceWithRelations);

      await service.createPrice({ productId: 'prod-1', priceListId: 'pl-1', value: 1500000.49 } as any);

      expect(mockPrisma.price.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ value: 1500000 }) }),
      );
    });

    it('createPrice redondea 0.50 a 1 y rechaza 0.49 con 400', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1', currency: 'COP' });
      mockPrisma.price.findUnique.mockResolvedValue(null);
      mockPrisma.price.create.mockResolvedValue(mockPriceWithRelations);

      await service.createPrice({ productId: 'prod-1', priceListId: 'pl-1', value: 0.5 } as any);
      expect(mockPrisma.price.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ value: 1 }) }),
      );

      await expect(service.createPrice({ productId: 'prod-1', priceListId: 'pl-1', value: 0.49 } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('createPrice rechaza el desbordamiento tras redondear (9999999999.5)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1', currency: 'COP' });
      mockPrisma.price.findUnique.mockResolvedValue(null);

      await expect(
        service.createPrice({ productId: 'prod-1', priceListId: 'pl-1', value: 9999999999.5 } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.price.create).not.toHaveBeenCalled();
    });

    it('createPrice no impone la precisión COP a otra moneda (USD)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: 'lista-prod' });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1', currency: 'USD' });
      mockPrisma.price.findUnique.mockResolvedValue(null);
      mockPrisma.price.create.mockResolvedValue(mockPriceWithRelations);

      await service.createPrice({ productId: 'prod-1', priceListId: 'pl-1', value: 123.45 } as any);

      expect(mockPrisma.price.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ value: 123.45, currency: 'USD' }) }),
      );
    });

    it('updatePrice redondea HALF_UP a entero COP', async () => {
      mockPrisma.price.findUnique.mockResolvedValue({ ...mockPrice, currency: 'COP' });
      mockPrisma.price.findMany.mockResolvedValue([]);
      mockPrisma.price.update.mockResolvedValue({ ...mockPriceWithRelations, value: 1600001 });

      await service.updatePrice('price-1', { value: 1600000.5 } as any);

      expect(mockPrisma.price.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ value: 1600001 }) }),
      );
    });
  });

  // --- Historial inmutable de precios (checklist 22) ---
  describe('historial inmutable de precios', () => {
    it('updatePrice audita con oldValues completos y newValues con origin manual', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);
      mockPrisma.price.findMany.mockResolvedValue([]);
      mockPrisma.price.update.mockResolvedValue({ ...mockPriceWithRelations, value: 1600000 });

      await service.updatePrice('price-1', { value: 1600000 }, { userId: 'admin-1', roles: [] });

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          entity: 'Price',
          entityId: 'price-1',
          oldValues: expect.objectContaining({
            value: 1500000,
            currency: 'COP',
            validFrom: null,
            validUntil: null,
          }),
          newValues: expect.objectContaining({
            value: 1600000,
            origin: 'manual',
          }),
        }),
      );
    });

    it('no borra ni edita logs existentes: audit solo crea registros', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);
      mockPrisma.price.findMany.mockResolvedValue([]);
      mockPrisma.price.update.mockResolvedValue(mockPriceWithRelations);

      await service.updatePrice('price-1', { value: 2000000 });

      // El único touch a audit es create (log), nunca deleteMany/update.
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled(); // se usa AuditService.log
      expect(mockPrisma.auditLog.findMany).not.toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledTimes(1);
    });
  });

  // --- ACL deny-by-default (AclService real) ---
  describe('ACL deny-by-default', () => {
    const LISTA_ID = 'list-1';
    const ADMIN = { userId: 'admin-1', roles: ['Super Admin'] };
    const VIEWER = { userId: 'pepito-1', roles: ['Operador'] }; // view sobre LISTA
    const EDIT_PRICES = { userId: 'price-editor', roles: ['Admin Comercial'] }; // edit_prices sobre LISTA
    const VIEW_PRICES = { userId: 'price-viewer', roles: ['Operador'] }; // view_prices sobre LISTA
    const NOAUTH = { userId: 'none-1', roles: ['Operador'] }; // sin assignments

    const grants: Record<string, { sourceId: string; actionId: string; scopeKind: 'list'; resourceId: string }[]> = {
      [VIEWER.userId]: [],
      [VIEW_PRICES.userId]: [],
      [EDIT_PRICES.userId]: [],
      [ADMIN.userId]: [],
      [NOAUTH.userId]: [],
    };
    const assignGrant = (userId: string, actionId: string) => {
      grants[userId].push({ sourceId: `${userId}-${actionId}`, actionId, scopeKind: 'list', resourceId: LISTA_ID });
    };
    let acl: AclService;
    let svc: PricesService;

    beforeEach(() => {
      acl = new AclService(mockPrisma as any);
      svc = new PricesService(mockPrisma as any, acl, mockAudit as any);
      for (const userId of Object.keys(grants)) grants[userId] = [];
      assignGrant(VIEWER.userId, 'listas:read');
      for (const actionId of ['listas:read', 'prices:read']) assignGrant(VIEW_PRICES.userId, actionId);
      for (const actionId of ['listas:read', 'prices:read', 'prices:apply']) assignGrant(EDIT_PRICES.userId, actionId);
      (mockPrisma as any).accessGrant.findMany.mockImplementation(async (args: any) =>
        grants[args?.where?.source?.userId] ?? [],
      );
      mockPrisma.assignment.findMany.mockImplementation(async (args: any) => {
        return [];
      });
      mockPrisma.lista.findUnique.mockResolvedValue({ id: LISTA_ID, code: 'LISTA-GENERAL', isActive: true, archivedAt: null });
    });

    it('findPricesByProduct: view sin concesión de prices:read no revela precios', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: LISTA_ID });
      await expect(svc.findPricesByProduct('prod-1', VIEWER)).rejects.toThrow(NotFoundException);
    });

    it('findPricesByProduct: edit_prices ve precios de su Lista', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: LISTA_ID });
      mockPrisma.price.findMany.mockResolvedValue([mockPriceWithRelations]);
      const res = await svc.findPricesByProduct('prod-1', EDIT_PRICES);
      expect(res.data).toHaveLength(1);
    });

    it('findPricesByProduct: view_prices ve precios de su Lista', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: LISTA_ID });
      mockPrisma.price.findMany.mockResolvedValue([mockPriceWithRelations]);
      const res = await svc.findPricesByProduct('prod-1', VIEW_PRICES);
      expect(res.data).toHaveLength(1);
    });

    it('createPrice: view_prices sin prices:apply no permite crear precio', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: LISTA_ID });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1' });
      mockPrisma.price.findUnique.mockResolvedValue(null);
      const dto = { productId: 'prod-1', priceListId: 'pl-1', value: 1500000 };
      await expect(svc.createPrice(dto, VIEW_PRICES)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.price.create).not.toHaveBeenCalled();
    });

    it('updatePrice: view_prices sin prices:apply no permite editar precio', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: LISTA_ID });
      await expect(svc.updatePrice('price-1', { value: 1600000 }, VIEW_PRICES)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.price.update).not.toHaveBeenCalled();
    });

    it('removePrice: view_prices sin prices:apply no permite eliminar precio', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: LISTA_ID });
      await expect(svc.removePrice('price-1', VIEW_PRICES)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.price.delete).not.toHaveBeenCalled();
    });

    it('updatePrice: edit_prices sigue pudiendo editar precios (sin regresión)', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: LISTA_ID });
      mockPrisma.price.update.mockResolvedValue({ ...mockPriceWithRelations, value: 1600000 });
      const res = await svc.updatePrice('price-1', { value: 1600000 }, EDIT_PRICES);
      expect(mockPrisma.price.update).toHaveBeenCalled();
      expect(res.value).toBe(1600000);
    });

    it('removePrice: edit_prices sigue pudiendo eliminar precios (sin regresión)', async () => {
      mockPrisma.price.findUnique.mockResolvedValue(mockPrice);
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: LISTA_ID });
      mockPrisma.price.delete.mockResolvedValue(mockPrice);
      const res = await svc.removePrice('price-1', EDIT_PRICES);
      expect(mockPrisma.price.delete).toHaveBeenCalledWith({ where: { id: 'price-1' } });
      expect(res.message).toContain('eliminado');
    });

    it('findPricesByProduct: usuario sin assignment recibe 404 (no revela existencia)', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: LISTA_ID });
      await expect(svc.findPricesByProduct('prod-1', NOAUTH)).rejects.toThrow(NotFoundException);
    });

    it('Admin Comercial sin grants no obtiene precios por su rol', async () => {
      const comercial = { userId: 'commercial-empty', roles: ['Admin Comercial'] };
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: LISTA_ID });
      await expect(svc.findPricesByProduct('prod-1', comercial)).rejects.toThrow(NotFoundException);
    });

    it('findPricesByPriceList: usuario sin assignment ve lista vacía (deny)', async () => {
      mockPrisma.price.findMany.mockResolvedValue([]);
      const res = await svc.findPricesByPriceList('pl-1', NOAUTH);
      expect(res.data).toHaveLength(0);
    });

    it('createPrice: view sin prices:apply no permite crear precio', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 'prod-1', listaId: LISTA_ID });
      mockPrisma.priceList.findUnique.mockResolvedValue({ id: 'pl-1' });
      mockPrisma.price.findUnique.mockResolvedValue(null);
      const dto = { productId: 'prod-1', priceListId: 'pl-1', value: 1500000 };
      await expect(svc.createPrice(dto, VIEWER)).rejects.toThrow(NotFoundException);
    });

    it('Super Admin evita filtrado (ve precios de la priceList sin scope)', async () => {
      mockPrisma.price.findMany.mockResolvedValue([mockPriceWithRelations]);
      const res = await svc.findPricesByPriceList('pl-1', ADMIN);
      expect(res.data).toHaveLength(1);
      const call = mockPrisma.price.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('product');
    });
  });
});
