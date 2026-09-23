import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { AccessRequestsModule } from './access-requests.module';
import { AccessRequestsService } from './access-requests.service';
import { AccessRequestStatus } from './dto/update-access-request-status.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../../common/security/session.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';

/**
 * Integration coverage for AccessRequestsModule's controllers, boots a real
 * Nest app with the same global guards/pipes/filters/interceptor as main.ts
 * (ValidationPipe whitelist+forbidNonWhitelisted+transform, JwtAuthGuard,
 * PermissionsGuard, ThrottlerGuard, HttpExceptionFilter, TransformInterceptor),
 * proving the guard/pipe wiring end-to-end instead of bypassing it via `new`.
 *
 * AccessRequestsService and PrismaService are mocked; no real DB is used.
 * JWT verification is real (JwtStrategy + a real signed token), but its
 * PrismaService/SessionService dependencies are mocked so no DB is needed.
 */

const JWT_SECRET = 'test-integration-jwt-secret';
const MANAGE_PERMISSION = 'access_requests.manage';

function signToken(overrides: Partial<Record<string, unknown>> = {}): string {
  return jwt.sign(
    {
      sub: overrides.sub ?? randomUUID(),
      email: overrides.email ?? 'staff@grupo-security.com',
      name: overrides.name ?? 'Staff User',
      roles: overrides.roles ?? [],
      permissions: overrides.permissions ?? [],
      jti: overrides.jti ?? randomUUID(),
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

describe('AccessRequestsModule (integration)', () => {
  let app: INestApplication;
  let service: jest.Mocked<Pick<AccessRequestsService, 'findAll' | 'updateStatus' | 'createPublic'>>;
  let prisma: { user: { findUnique: jest.Mock } };
  let sessions: { isActive: jest.Mock };

  const configServiceMock: Pick<ConfigService, 'get'> = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === 'JWT_SECRET') return JWT_SECRET;
      return defaultValue;
    }) as any,
  };

  beforeAll(async () => {
    service = {
      findAll: jest.fn(),
      updateStatus: jest.fn(),
      createPublic: jest.fn(),
    };
    prisma = { user: { findUnique: jest.fn() } };
    sessions = { isActive: jest.fn().mockResolvedValue(true) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 600000, limit: 20 }]),
        AccessRequestsModule,
      ],
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: SessionService, useValue: sessions },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    })
      .overrideProvider(AccessRequestsService)
      .useValue(service)
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', isActive: true });
    sessions.isActive.mockResolvedValue(true);
  });

  const validUpdateBody = { status: AccessRequestStatus.APPROVED };
  const validUuid = '00000000-0000-4000-8000-000000000000';

  describe('staff endpoints — authentication', () => {
    it('GET /api/access-requests → 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/access-requests').expect(401);
    });

    it('PATCH /api/access-requests/:id/status → 401 without a token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/access-requests/${validUuid}/status`)
        .send(validUpdateBody)
        .expect(401);
    });
  });

  describe('staff endpoints — authorization', () => {
    it('GET /api/access-requests → 403 for an authenticated user without the manage permission', async () => {
      const token = signToken({ permissions: [] });

      await request(app.getHttpServer())
        .get('/api/access-requests')
        .set('Cookie', [`access_token=${token}`])
        .expect(403);
    });

    it('PATCH /api/access-requests/:id/status → 403 for an authenticated user without the manage permission', async () => {
      const token = signToken({ permissions: [] });

      await request(app.getHttpServer())
        .patch(`/api/access-requests/${validUuid}/status`)
        .set('Cookie', [`access_token=${token}`])
        .send(validUpdateBody)
        .expect(403);
    });

    it('GET /api/access-requests → 200 for a user with the manage permission', async () => {
      const token = signToken({ permissions: [MANAGE_PERMISSION] });
      service.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      const res = await request(app.getHttpServer())
        .get('/api/access-requests')
        .set('Cookie', [`access_token=${token}`])
        .expect(200);

      expect(res.body.data).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    });

    it('PATCH /api/access-requests/:id/status → 200 for a user with the manage permission', async () => {
      const token = signToken({ permissions: [MANAGE_PERMISSION] });
      service.updateStatus.mockResolvedValue({ id: validUuid, status: 'APPROVED' });

      const res = await request(app.getHttpServer())
        .patch(`/api/access-requests/${validUuid}/status`)
        .set('Cookie', [`access_token=${token}`])
        .send(validUpdateBody)
        .expect(200);

      expect(res.body.data).toEqual({ id: validUuid, status: 'APPROVED' });
    });
  });

  describe('staff endpoints — request validation', () => {
    it('PATCH with an invalid UUID param → 400', async () => {
      const token = signToken({ permissions: [MANAGE_PERMISSION] });

      await request(app.getHttpServer())
        .patch('/api/access-requests/not-a-uuid/status')
        .set('Cookie', [`access_token=${token}`])
        .send(validUpdateBody)
        .expect(400);
    });

    it('GET with status outside the enum → 400', async () => {
      const token = signToken({ permissions: [MANAGE_PERMISSION] });

      await request(app.getHttpServer())
        .get('/api/access-requests')
        .query({ status: 'NOT_A_STATUS' })
        .set('Cookie', [`access_token=${token}`])
        .expect(400);
    });

    it('GET with limit=101 → 400', async () => {
      const token = signToken({ permissions: [MANAGE_PERMISSION] });

      await request(app.getHttpServer())
        .get('/api/access-requests')
        .query({ limit: 101 })
        .set('Cookie', [`access_token=${token}`])
        .expect(400);
    });

    it('GET with page=0 → 400', async () => {
      const token = signToken({ permissions: [MANAGE_PERMISSION] });

      await request(app.getHttpServer())
        .get('/api/access-requests')
        .query({ page: 0 })
        .set('Cookie', [`access_token=${token}`])
        .expect(400);
    });
  });

  describe('public endpoint', () => {
    const validBody = {
      companyName: 'Acme Corp',
      nit: '1234567890',
      contactName: 'John Doe',
      email: 'john@acme.com',
      phone: '+57 301 555 0123',
      customerType: 'INSTALLER',
    };

    // Both the success-without-auth check and the 429-after-limit check share
    // one throttle window (route-level @Throttle({ default: { limit: 5,
    // ttl: 600000 } })), since ThrottlerGuard's storage persists across `it`s
    // for the lifetime of `app`. Combined into one test so the request count
    // against that shared window stays exact and order-independent.
    it('works without any auth token, then returns 429 once the 5-per-window throttle limit is exceeded', async () => {
      service.createPublic.mockResolvedValue({ received: true });

      for (let i = 0; i < 5; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/public/access-requests')
          .send(validBody)
          .expect(201);

        expect(res.body.data).toEqual({ received: true });
      }

      // 6th request from the same (unauthenticated) client must be denied.
      await request(app.getHttpServer())
        .post('/api/public/access-requests')
        .send(validBody)
        .expect(429);
    });
  });
});
