import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DEMO_STOREFRONT_CONTACT } from './storefront-contact.demo';

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

const contactRow = {
  id: 'sc-1',
  nationalPhone: '576011234567',
  whatsappPhone: '576011234567',
  salesPhone: '5761234567',
  email: 'serviciocliente@gruposecurity.example',
  businessHoursShort: 'lun a sáb 7:00 a. m. a 7:00 p. m.',
  businessHoursFull: 'lunes a sábado de 7:00 a.m. a 7:00 p.m.',
  sellWithUsMessage: 'Hola, quiero vender mis productos.',
  updatedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validDto = {
  nationalPhone: '576011234567',
  whatsappPhone: '576011234567',
  salesPhone: '5761234567',
  email: 'serviciocliente@gruposecurity.example',
  businessHoursShort: 'lun a sáb 7:00 a. m. a 7:00 p. m.',
  businessHoursFull: 'lunes a sábado de 7:00 a.m. a 7:00 p.m.',
  sellWithUsMessage: 'Hola, quiero vender mis productos.',
};

describe('StorefrontService', () => {
  let service: StorefrontService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockAudit.log.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorefrontService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<StorefrontService>(StorefrontService);
  });

  describe('getContact', () => {
    it('devuelve la fila del singleton', async () => {
      mockPrisma.storefrontContact.findFirst.mockResolvedValue(contactRow);

      await expect(service.getContact()).resolves.toEqual(contactRow);
    });

    it('lanza NotFoundException si no hay fila', async () => {
      mockPrisma.storefrontContact.findFirst.mockResolvedValue(null);

      await expect(service.getContact()).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getPublicContact', () => {
    it('devuelve solo los campos públicos, sin los metadatos de la fila', async () => {
      mockPrisma.storefrontContact.findFirst.mockResolvedValue(contactRow);

      const result = await service.getPublicContact();

      expect(result).toEqual({
        nationalPhone: '576011234567',
        whatsappPhone: '576011234567',
        salesPhone: '5761234567',
        email: 'serviciocliente@gruposecurity.example',
        businessHoursShort: 'lun a sáb 7:00 a. m. a 7:00 p. m.',
        businessHoursFull: 'lunes a sábado de 7:00 a.m. a 7:00 p.m.',
        sellWithUsMessage: 'Hola, quiero vender mis productos.',
      });
      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('updatedById');
    });

    it('cae a los valores demo si la tabla está vacía: la tienda no puede quedar en blanco', async () => {
      mockPrisma.storefrontContact.findFirst.mockResolvedValue(null);

      const result = await service.getPublicContact();

      expect(result.nationalPhone).toBe(DEMO_STOREFRONT_CONTACT.nationalPhone);
      expect(result.email).toBe(DEMO_STOREFRONT_CONTACT.email);
      expect(result.salesPhone).toBe(DEMO_STOREFRONT_CONTACT.salesPhone);
    });
  });

  describe('updateContact', () => {
    it('actualiza la fila y audita con valores anteriores y nuevos', async () => {
      const updated = { ...contactRow, email: 'nuevo@gruposecurity.example', updatedById: 'user-1' };
      mockPrisma.storefrontContact.findFirst.mockResolvedValue(contactRow);
      mockPrisma.storefrontContact.update.mockResolvedValue(updated);

      const result = await service.updateContact(
        { ...validDto, email: 'nuevo@gruposecurity.example' },
        'user-1',
      );

      expect(result.email).toBe('nuevo@gruposecurity.example');
      expect(mockPrisma.storefrontContact.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sc-1' } }),
      );
      expect(mockAudit.log).toHaveBeenCalledTimes(1);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'update-storefront-contact',
          entity: 'StorefrontContact',
          entityId: 'sc-1',
          result: 'SUCCESS',
          oldValues: expect.objectContaining({ email: 'serviciocliente@gruposecurity.example' }),
          newValues: expect.objectContaining({ email: 'nuevo@gruposecurity.example' }),
        }),
      );
    });

    it('deriva el WhatsApp de la línea nacional cuando no viene informado', async () => {
      mockPrisma.storefrontContact.findFirst.mockResolvedValue(contactRow);
      mockPrisma.storefrontContact.update.mockResolvedValue(contactRow);

      await service.updateContact({ ...validDto, whatsappPhone: undefined }, 'user-1');

      expect(mockPrisma.storefrontContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ whatsappPhone: validDto.nationalPhone }),
        }),
      );
    });

    it('crea la fila si la tabla está vacía y audita contra los valores demo', async () => {
      const created = { ...contactRow, email: validDto.email, updatedById: 'user-1' };
      mockPrisma.storefrontContact.findFirst.mockResolvedValue(null);
      mockPrisma.storefrontContact.create.mockResolvedValue(created);

      const result = await service.updateContact(validDto, 'user-1');

      expect(result.email).toBe(validDto.email);
      expect(mockPrisma.storefrontContact.update).not.toHaveBeenCalled();
      expect(mockPrisma.storefrontContact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: validDto.email, updatedById: 'user-1' }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: expect.objectContaining({
            email: DEMO_STOREFRONT_CONTACT.email,
          }),
        }),
      );
    });
  });
});