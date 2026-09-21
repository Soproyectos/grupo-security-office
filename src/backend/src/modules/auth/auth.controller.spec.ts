import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaService } from '../../common/security/mfa.service';
import { SessionService } from '../../common/security/session.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { buildExpectedUserData } from '../../__test__/fixtures/auth.fixture';

const mockAuthService = {
  login: jest.fn(),
  verifyMfa: jest.fn(),
  completeEnrollment: jest.fn(),
  consumeChallenge: jest.fn(),
  getProfile: jest.fn(),
  logout: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'NODE_ENV') return 'test';
    return undefined;
  }),
};

describe('AuthController', () => {
  let app: INestApplication;
  let shouldGuardThrow: boolean;

  const mockGuard = {
    canActivate: jest.fn().mockImplementation((context: any) => {
      if (shouldGuardThrow) {
        throw new UnauthorizedException();
      }
      const req = context.switchToHttp().getRequest();
      req.user = {
        sub: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        email: 'admin@grupo-security.com',
        name: 'Admin Principal',
        roles: ['Super Admin'],
        permissions: ['products:read', 'products:write'],
      };
      return true;
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MfaService,
          useValue: {
            getState: jest.fn().mockResolvedValue({ enabled: false, confirmedAt: null }),
            isRequiredForRoles: jest.fn().mockReturnValue(false),
            remainingBackupCodes: jest.fn().mockResolvedValue(0),
            startEnrollment: jest.fn(),
            disable: jest.fn(),
          },
        },
        {
          provide: SessionService,
          useValue: {
            listActive: jest.fn().mockResolvedValue([]),
            revokeAllForUser: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    shouldGuardThrow = false;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('debe retornar 200 y cookie access_token con credenciales válidas', async () => {
      const expectedUser = buildExpectedUserData();
      mockAuthService.login.mockResolvedValue({
        status: 'COMPLETE',
        token: 'jwt-token-mock',
        user: expectedUser,
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@grupo-security.com', password: 'password123' })
        .expect(200);

      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toMatchObject({
        id: expectedUser.id,
        email: expectedUser.email,
        name: expectedUser.name,
      });
      expect(res.headers['set-cookie']).toBeDefined();
      const cookies = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']];
      expect(cookies.some((c: string) => c.startsWith('access_token='))).toBe(true);
      expect(mockAuthService.login).toHaveBeenCalledWith(
        'admin@grupo-security.com',
        'password123',
        expect.objectContaining({ ipAddress: expect.anything() }),
      );
    });

    it('debe retornar 401 con credenciales inválidas', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Credenciales inválidas'),
      );

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'wrong@test.com', password: 'wrongpassword' })
        .expect(401);

      expect(res.body).toHaveProperty('message');
    });

    it('debe retornar 400 con email inválido', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: '12345678' })
        .expect(400);
    });

    it('debe retornar 400 con password muy corto', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'short' })
        .expect(400);
    });

    it('debe retornar 400 con body vacío', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/auth/profile', () => {
    it('debe retornar 200 y datos del usuario autenticado', async () => {
      const expectedUser = buildExpectedUserData();
      mockAuthService.getProfile.mockResolvedValue(expectedUser);

      const res = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Cookie', 'access_token=valid-token')
        .expect(200);

      expect(res.body).toMatchObject({
        id: expectedUser.id,
        email: expectedUser.email,
        name: expectedUser.name,
      });
      expect(mockAuthService.getProfile).toHaveBeenCalledWith(
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      );
    });

    it('debe retornar 401 sin token', async () => {
      shouldGuardThrow = true;

      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('debe retornar 200 y limpiar la cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', 'access_token=valid-token')
        .expect(200);

      expect(res.body).toHaveProperty('message', 'Sesión cerrada exitosamente');
      expect(res.headers['set-cookie']).toBeDefined();
      const cookies = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie']
        : [res.headers['set-cookie']];
      expect(cookies.some((c: string) => c.includes('access_token='))).toBe(true);
    });
  });
});