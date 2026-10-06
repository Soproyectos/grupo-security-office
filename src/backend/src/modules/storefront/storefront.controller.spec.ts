import 'reflect-metadata';
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorefrontController } from './storefront.controller';
import { PublicStorefrontController } from './public-storefront.controller';
import { StorefrontService } from './storefront.service';

describe('Storefront controllers', () => {
  let app: INestApplication;
  /** Usuario del JWT simulado; lo inyecta el guard de autenticación falso. */
  let currentUser: any;

  const storefrontService = {
    getContact: jest.fn(),
    getPublicContact: jest.fn(),
    updateContact: jest.fn(),
  };

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
  };

  const publicContact = {
    nationalPhone: contactRow.nationalPhone,
    whatsappPhone: contactRow.whatsappPhone,
    salesPhone: contactRow.salesPhone,
    email: contactRow.email,
    businessHoursShort: contactRow.businessHoursShort,
    businessHoursFull: contactRow.businessHoursFull,
    sellWithUsMessage: contactRow.sellWithUsMessage,
  };

  const validDto = { ...publicContact };

  /** Suplanta al JwtAuthGuard: fija `request.user` en vez de verificar el JWT. */
  const fakeJwtAuthGuard = {
    canActivate: (context: ExecutionContext) => {
      context.switchToHttp().getRequest().user = currentUser;
      return true;
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    currentUser = undefined;
    storefrontService.getContact.mockResolvedValue(contactRow);
    storefrontService.getPublicContact.mockResolvedValue(publicContact);
    storefrontService.updateContact.mockResolvedValue(contactRow);

    const moduleFixture = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60000, limit: 20 }],
        }),
      ],
      controllers: [StorefrontController, PublicStorefrontController],
      providers: [
        { provide: StorefrontService, useValue: storefrontService },
        // Mismo orden que `app.module.ts`: la autenticación corre ANTES que el
        // PermissionsGuard, porque este último lee `request.user`.
        { provide: APP_GUARD, useValue: fakeJwtAuthGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: APP_GUARD,
          useFactory: () => new PermissionsGuard(new Reflector()),
        },
      ],
    })
      // El `@UseGuards(JwtAuthGuard)` del controller también se suplanta.
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    // El interceptor global es el que envuelve la respuesta en `{ data }`; sin
    // él el spec probaría una forma de payload que el cliente nunca ve.
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/public/storefront/contact', () => {
    it('responde sin autenticación con los datos de contacto', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/public/storefront/contact')
        .expect(200);

      expect(response.body).toEqual({ data: publicContact });
      expect(storefrontService.getPublicContact).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/storefront/contact', () => {
    it('responde 403 y no consulta el service sin storefront:read', async () => {
      currentUser = { sub: 'u1', roles: ['Consulta'], permissions: ['products:read'] };

      await request(app.getHttpServer()).get('/api/storefront/contact').expect(403);

      expect(storefrontService.getContact).not.toHaveBeenCalled();
    });

    it('devuelve el registro con el permiso storefront:read', async () => {
      currentUser = { sub: 'u1', roles: ['Super Admin'], permissions: [] };

      const response = await request(app.getHttpServer()).get('/api/storefront/contact').expect(200);

      expect(response.body).toEqual({ data: contactRow });
    });
  });

  describe('PUT /api/storefront/contact', () => {
    it('responde 403 y no actualiza sin storefront:write', async () => {
      currentUser = { sub: 'u1', roles: ['Admin Comercial'], permissions: ['storefront:read'] };

      await request(app.getHttpServer()).put('/api/storefront/contact').send(validDto).expect(403);

      expect(storefrontService.updateContact).not.toHaveBeenCalled();
    });

    it('actualiza y responde 200 con el registro guardado', async () => {
      currentUser = { sub: 'u1', roles: ['Super Admin'], permissions: [] };

      const response = await request(app.getHttpServer())
        .put('/api/storefront/contact')
        .send(validDto)
        .expect(200);

      expect(response.body).toEqual({ data: contactRow });
      expect(storefrontService.updateContact).toHaveBeenCalledWith(
        expect.objectContaining({ nationalPhone: '576011234567' }),
        'u1',
      );
    });

    it('rechaza un teléfono que no está en E.164', async () => {
      currentUser = { sub: 'u1', roles: ['Super Admin'], permissions: [] };

      await request(app.getHttpServer())
        .put('/api/storefront/contact')
        .send({ ...validDto, nationalPhone: '+57 601 1234567' })
        .expect(400);

      expect(storefrontService.updateContact).not.toHaveBeenCalled();
    });

    it('rechaza un correo inválido', async () => {
      currentUser = { sub: 'u1', roles: ['Super Admin'], permissions: [] };

      await request(app.getHttpServer())
        .put('/api/storefront/contact')
        .send({ ...validDto, email: 'no-es-un-correo' })
        .expect(400);

      expect(storefrontService.updateContact).not.toHaveBeenCalled();
    });
  });
});