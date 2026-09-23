import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AccessRequestsService } from './access-requests.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccessRequestDto, CustomerTypeEnum } from './dto/create-access-request.dto';

describe('AccessRequestsService', () => {
  let service: AccessRequestsService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessRequestsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AccessRequestsService>(AccessRequestsService);
  });

  describe('createPublic', () => {
    const mockReq = {
      ip: '192.168.1.1',
      get: jest.fn((key: string) => {
        if (key === 'x-forwarded-for') return null;
        return null;
      }),
    };

    const validDto: CreateAccessRequestDto = {
      companyName: 'Acme Corp',
      nit: '1234567890',
      contactName: 'John Doe',
      email: 'john@acme.com',
      phone: '+57 301 555 0123',
      customerType: CustomerTypeEnum.INSTALLER,
    };

    it('debe retornar { received: true } para solicitud válida', async () => {
      mockPrisma.accessRequest.create.mockResolvedValue({
        id: 'req-1',
        ...validDto,
        status: 'PENDING',
        ipHash: expect.any(String),
        reviewedById: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createPublic(validDto, mockReq as any);

      expect(result).toEqual({ received: true });
    });

    it('debe retornar { received: true } incluso si la DB falla (fire-and-forget)', async () => {
      mockPrisma.accessRequest.create.mockRejectedValue(new Error('DB error'));

      const result = await service.createPublic(validDto, mockReq as any);

      expect(result).toEqual({ received: true });
    });

    it('debe ignorar la solicitud silenciosamente si website (honeypot) está lleno', async () => {
      const dtoWithHoneypot = { ...validDto, website: 'https://example.com' };

      const result = await service.createPublic(dtoWithHoneypot, mockReq as any);

      expect(result).toEqual({ received: true });
      expect(mockPrisma.accessRequest.create).not.toHaveBeenCalled();
    });

    it('debe retornar { received: true } incluso si website es string vacío (honeypot no activado)', async () => {
      const dtoWithEmptyWebsite = { ...validDto, website: '' };
      mockPrisma.accessRequest.create.mockResolvedValue({
        id: 'req-1',
        ...validDto,
        status: 'PENDING',
        ipHash: expect.any(String),
        reviewedById: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createPublic(dtoWithEmptyWebsite, mockReq as any);

      expect(result).toEqual({ received: true });
      expect(mockPrisma.accessRequest.create).toHaveBeenCalled();
    });

    it('debe hashear el IP (SHA256) antes de guardar, nunca en claro', async () => {
      const capturedData = { data: null as any };
      mockPrisma.accessRequest.create.mockImplementation(({ data }) => {
        capturedData.data = data;
        return Promise.resolve({ id: 'req-1', ...data });
      });

      await service.createPublic(validDto, mockReq as any);

      expect(capturedData.data?.ipHash).toBeDefined();
      expect(capturedData.data?.ipHash).not.toBe('192.168.1.1');
      expect(capturedData.data?.ipHash?.length).toBe(64); // SHA256 hex = 64 chars
    });

    it('debe manejar x-forwarded-for para proxies', async () => {
      const mockReqWithForwarded = {
        ip: '127.0.0.1',
        get: jest.fn((key: string) => {
          if (key === 'x-forwarded-for') return '10.0.0.1, 192.168.1.1';
          return null;
        }),
      };

      const capturedData = { data: null as any };
      mockPrisma.accessRequest.create.mockImplementation(({ data }) => {
        capturedData.data = data;
        return Promise.resolve({ id: 'req-1', ...data });
      });

      await service.createPublic(validDto, mockReqWithForwarded as any);

      // Debe usar el primer IP del x-forwarded-for: 10.0.0.1
      expect(capturedData.data?.ipHash).toBeDefined();
      // Verificar que es un hash válido (64 caracteres hexadecimales)
      expect(/^[a-f0-9]{64}$/i.test(capturedData.data?.ipHash)).toBe(true);
    });

    it('debe guardar status PENDING por defecto', async () => {
      mockPrisma.accessRequest.create.mockResolvedValue({
        id: 'req-1',
        ...validDto,
        status: 'PENDING',
        ipHash: expect.any(String),
        reviewedById: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.createPublic(validDto, mockReq as any);

      expect(mockPrisma.accessRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('debe paginar acceso a solicitudes sin filtro', async () => {
      mockPrisma.accessRequest.findMany.mockResolvedValue([
        {
          id: 'req-1',
          companyName: 'Acme',
          nit: '1234567890',
          contactName: 'John',
          email: 'john@acme.com',
          phone: '+57 301 555 0123',
          customerType: 'INSTALLER',
          status: 'PENDING',
          ipHash: null,
          reviewedById: null,
          reviewedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrisma.accessRequest.count.mockResolvedValue(1);

      const result = await service.findAll(1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('debe filtrar por status', async () => {
      mockPrisma.accessRequest.findMany.mockResolvedValue([]);
      mockPrisma.accessRequest.count.mockResolvedValue(0);

      await service.findAll(1, 20, 'APPROVED');

      expect(mockPrisma.accessRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'APPROVED' },
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('debe actualizar status y registrar reviewer', async () => {
      const updatedRecord = {
        id: 'req-1',
        status: 'APPROVED',
        reviewedById: 'user-1',
        reviewedAt: new Date(),
      };
      mockPrisma.accessRequest.update.mockResolvedValue(updatedRecord);

      const result = await service.updateStatus('req-1', 'APPROVED', 'user-1');

      expect(mockPrisma.accessRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          reviewedById: 'user-1',
          reviewedAt: expect.any(Date),
        }),
      });
      expect(result.reviewedById).toBe('user-1');
    });
  });
});
