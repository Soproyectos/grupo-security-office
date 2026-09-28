import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AccessRequestsService } from './access-requests.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccessRequestDto, CustomerTypeEnum } from './dto/create-access-request.dto';
import { AccessRequestStatus } from './dto/update-access-request-status.dto';

describe('AccessRequestsService', () => {
  let service: AccessRequestsService;
  const mockConfig = { get: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockConfig.get.mockImplementation((key: string) => {
      if (key === 'ACCESS_REQUEST_IP_SALT') return 'test-salt';
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessRequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
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

    it('debe lanzar InternalServerErrorException si la DB falla en solicitud real', async () => {
      mockPrisma.accessRequest.create.mockRejectedValue(new Error('DB error'));

      await expect(service.createPublic(validDto, mockReq as any)).rejects.toThrow(
        InternalServerErrorException,
      );
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

    it('debe guardar ipHash null si ACCESS_REQUEST_IP_SALT no está configurado (fail-safe)', async () => {
      mockConfig.get.mockReturnValue(undefined);
      const capturedData = { data: null as any };
      mockPrisma.accessRequest.create.mockImplementation(({ data }) => {
        capturedData.data = data;
        return Promise.resolve({ id: 'req-1', ...data });
      });

      await service.createPublic(validDto, mockReq as any);

      expect(capturedData.data?.ipHash).toBeNull();
    });

    it('debe hashear con HMAC-SHA256 (salt distinta produce hash distinto)', async () => {
      const capture = async (salt: string) => {
        mockConfig.get.mockReturnValue(salt);
        const capturedData = { data: null as any };
        mockPrisma.accessRequest.create.mockImplementation(({ data }) => {
          capturedData.data = data;
          return Promise.resolve({ id: 'req-1', ...data });
        });
        await service.createPublic(validDto, mockReq as any);
        return capturedData.data?.ipHash;
      };

      const hashA = await capture('salt-a');
      const hashB = await capture('salt-b');

      expect(hashA).not.toBe(hashB);
    });

    it('debe usar req.ip (Express extrae de X-Forwarded-For/X-Real-IP via trust proxy)', async () => {
      const mockReqWithTrustProxy = {
        ip: '203.0.113.42', // Express calcula esto desde headers cuando trust proxy=1
        get: jest.fn(),
      };

      const capturedData = { data: null as any };
      mockPrisma.accessRequest.create.mockImplementation(({ data }) => {
        capturedData.data = data;
        return Promise.resolve({ id: 'req-1', ...data });
      });

      await service.createPublic(validDto, mockReqWithTrustProxy as any);

      // Debe hashear el IP que Express resolvió
      expect(capturedData.data?.ipHash).toBeDefined();
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

      await service.findAll(1, 20, AccessRequestStatus.APPROVED);

      expect(mockPrisma.accessRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: AccessRequestStatus.APPROVED },
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

      const result = await service.updateStatus(
        'req-1',
        AccessRequestStatus.APPROVED,
        'user-1',
      );

      expect(mockPrisma.accessRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: expect.objectContaining({
          status: AccessRequestStatus.APPROVED,
          reviewedById: 'user-1',
          reviewedAt: expect.any(Date),
        }),
      });
      expect(result.reviewedById).toBe('user-1');
    });

    it('debe lanzar NotFoundException si el id no existe (Prisma P2025)', async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      mockPrisma.accessRequest.update.mockRejectedValue(p2025);

      await expect(
        service.updateStatus('missing-id', AccessRequestStatus.APPROVED, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe propagar errores de Prisma distintos a P2025', async () => {
      const dbError = new Error('connection lost');
      mockPrisma.accessRequest.update.mockRejectedValue(dbError);

      await expect(
        service.updateStatus('req-1', AccessRequestStatus.APPROVED, 'user-1'),
      ).rejects.toThrow('connection lost');
    });
  });
});
