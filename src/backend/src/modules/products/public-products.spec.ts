import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as request from 'supertest';
import { ProductsService } from './products.service';
import { PublicProductsController } from './public-products.controller';
import { PublicProductSearchDto } from './dto/public-product-search.dto';

const mockProducts = [
  {
    id: 'prod-1',
    name: 'Cámara Domo 4K',
    category: { name: 'Cámaras IP', slug: 'camaras-ip' },
    images: [{ url: '/api/files/img-1' }],
  },
  {
    id: 'prod-2',
    name: 'Lector biométrico',
    category: { name: 'Control de Acceso', slug: 'control-de-acceso' },
    images: [],
  },
];

describe('ProductsService.searchPublic', () => {
  let service: ProductsService;

  beforeEach(() => {
    jest.resetAllMocks();

    // searchPublic solo toca PrismaService (la búsqueda no pasa por ACL,
    // auditoría ni archivos), así que las demás dependencias llegan como stub.
    service = new ProductsService(
      mockPrisma as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('solo devuelve productos publicados con id, nombre, imagen y categoría', async () => {
    mockPrisma.product.findMany.mockResolvedValue(mockProducts);

    const result = await service.searchPublic({ q: 'cámara', limit: 24 });

    expect(result).toEqual({
      data: [
        {
          id: 'prod-1',
          name: 'Cámara Domo 4K',
          imageUrl: '/api/files/img-1',
          categoryName: 'Cámaras IP',
          categorySlug: 'camaras-ip',
        },
        {
          id: 'prod-2',
          name: 'Lector biométrico',
          imageUrl: null,
          categoryName: 'Control de Acceso',
          categorySlug: 'control-de-acceso',
        },
      ],
    });
  });

  it('consulta con el estado PUBLISHED y el término recortado sobre nombre y SKU', async () => {
    mockPrisma.product.findMany.mockResolvedValue([]);

    await service.searchPublic({ q: '  domo  ', limit: 10 });

    expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lifecycleStatus: 'PUBLISHED',
          OR: [
            { name: { contains: 'domo', mode: 'insensitive' } },
            { sku: { contains: 'domo', mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
    );
  });

  it('usa el límite por defecto (24) y consulta sin término cuando q llega vacío', async () => {
    mockPrisma.product.findMany.mockResolvedValue([]);

    await service.searchPublic({ q: '   ' });

    expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { lifecycleStatus: 'PUBLISHED' },
        take: 24,
      }),
    );
  });
});

describe('PublicProductsController', () => {
  let app: INestApplication;
  const productsService = {
    searchPublic: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    productsService.searchPublic.mockResolvedValue({ data: mockProducts });

    const moduleFixture = await Test.createTestingModule({
      controllers: [PublicProductsController],
      providers: [{ provide: ProductsService, useValue: productsService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('sirve la búsqueda sin JWT y pasa q y limit al servicio', async () => {
    await request(app.getHttpServer())
      .get('/api/public/products?q=camara&limit=5')
      .expect(200);

    expect(productsService.searchPublic).toHaveBeenCalledWith({ q: 'camara', limit: 5 });
  });

  it('devuelve la respuesta del servicio como { data: [...] }', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/public/products?q=camara')
      .expect(200);

    expect(response.body).toEqual({ data: mockProducts });
  });

  it('rechaza un limit fuera del rango permitido', async () => {
    await request(app.getHttpServer())
      .get('/api/public/products?q=camara&limit=200')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/public/products?q=camara&limit=0')
      .expect(400);
  });

  it('rechaza parámetros no permitidos (whitelist estricto)', async () => {
    await request(app.getHttpServer())
      .get('/api/public/products?q=camara&categoryId=abc')
      .expect(400);
  });

  it('valida el DTO de búsqueda con class-validator', async () => {
    const valid = plainToInstance(PublicProductSearchDto, { q: 'cámara', limit: '24' });
    const invalidLimit = plainToInstance(PublicProductSearchDto, { limit: '51' });
    const invalidTerm = plainToInstance(PublicProductSearchDto, { q: 'x'.repeat(101) });

    const [validErrors, limitErrors, termErrors] = await Promise.all([
      validate(valid),
      validate(invalidLimit),
      validate(invalidTerm),
    ]);

    expect(validErrors).toHaveLength(0);
    expect(limitErrors.some((error) => error.property === 'limit')).toBe(true);
    expect(termErrors.some((error) => error.property === 'q')).toBe(true);
  });
});
