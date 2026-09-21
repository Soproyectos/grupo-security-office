jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
  genSalt: jest.fn(),
}));

import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../../common/security/session.service';

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-jwt-secret'),
};

describe('JwtStrategy', () => {
  let jwtStrategy: JwtStrategy;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: SessionService,
          // Por defecto la sesion esta viva; los tests que prueben revocacion
          // sobrescriben este mock.
          useValue: { isActive: jest.fn().mockResolvedValue(true), touch: jest.fn() },
        },
      ],
    }).compile();

    jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
  });

  describe('validate', () => {
    const validPayload = {
      sub: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      email: 'admin@grupo-security.com',
      name: 'Admin Principal',
      roles: ['Super Admin'],
      permissions: ['products:read'],
    };

    it('debe retornar datos del usuario con payload válido y usuario activo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: validPayload.sub,
        isActive: true,
      });

      const result = await jwtStrategy.validate(validPayload);

      expect(result).toEqual({
        sub: validPayload.sub,
        email: validPayload.email,
        name: validPayload.name,
        roles: validPayload.roles,
        permissions: validPayload.permissions,
      });
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: validPayload.sub },
        select: { id: true, isActive: true },
      });
    });

    it('debe lanzar UnauthorizedException cuando el usuario está inactivo', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: validPayload.sub,
        isActive: false,
      });

      await expect(jwtStrategy.validate(validPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(jwtStrategy.validate(validPayload)).rejects.toThrow(
        'Usuario no encontrado o inactivo',
      );
    });

    it('debe lanzar UnauthorizedException cuando el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(jwtStrategy.validate(validPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(jwtStrategy.validate(validPayload)).rejects.toThrow(
        'Usuario no encontrado o inactivo',
      );
    });
  });

  describe('extracción de token (jwtFromRequest)', () => {
    let jwtFromRequest: (req: any) => string | null;

    beforeEach(() => {
      jwtFromRequest = (jwtStrategy as any)._jwtFromRequest;
    });

    it('debe extraer token de la cookie access_token', () => {
      const token = jwtFromRequest({
        cookies: { access_token: 'cookie-token-value' },
      });
      expect(token).toBe('cookie-token-value');
    });

    it('debe extraer token del header Authorization con Bearer', () => {
      const token = jwtFromRequest({
        headers: { authorization: 'Bearer header-token-value' },
      });
      expect(token).toBe('header-token-value');
    });

    it('debe preferir cookie sobre header cuando ambos existen', () => {
      const token = jwtFromRequest({
        cookies: { access_token: 'cookie-token' },
        headers: { authorization: 'Bearer header-token' },
      });
      expect(token).toBe('cookie-token');
    });

    it('debe retornar null cuando no hay cookie ni header', () => {
      const token = jwtFromRequest({});
      expect(token).toBeNull();
    });

    it('debe retornar null si el header no tiene formato Bearer', () => {
      const token = jwtFromRequest({
        headers: { authorization: 'Basic some-base64' },
      });
      expect(token).toBeNull();
    });

    it('debe extraer token del header Cookie manualmente cuando req.cookies no existe', () => {
      const token = jwtFromRequest({
        headers: { cookie: 'access_token=manual-parsed-token; other=value' },
      });
      expect(token).toBe('manual-parsed-token');
    });

    it('debe decodificar el token del Cookie header con caracteres URL-encoded', () => {
      const token = jwtFromRequest({
        headers: { cookie: 'access_token=token%20with%20spaces; other=value' },
      });
      expect(token).toBe('token with spaces');
    });

    it('debe retornar null si el Cookie header no contiene access_token', () => {
      const token = jwtFromRequest({
        headers: { cookie: 'other_token=somevalue; session=abc' },
      });
      expect(token).toBeNull();
    });

    it('debe retornar null si req es null/undefined', () => {
      expect(jwtFromRequest(null)).toBeNull();
      expect(jwtFromRequest(undefined)).toBeNull();
    });
  });
});