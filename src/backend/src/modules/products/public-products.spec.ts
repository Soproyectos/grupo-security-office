import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as request from 'supertest';
import { fakePriceFindMany, FakePriceRow } from '../../__test__/helpers/fake-price-db';
import { PublicCatalogService } from './public-catalog.service';
import { PublicPricingService } from './public-pricing.service';
import { PublicProductsController } from './public-products.controller';
import { PublicProductSearchDto } from './dto/public-product-search.dto';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';

/** ConfigService hermético: no depende del process.env de quien corre la prueba. */
const makeConfig = (env: Record<string, string | undefined> = {}) =>
  ({ get: jest.fn((key: string) => env[key]) }) as any;

const mockProducts = [
  {
    id: 'prod-1',
    sku: 'DS-2CD2143G2',
    name: 'Cámara Domo 4K',
    category: { name: 'Cámaras IP', slug: 'camaras-ip' },
    brand: { name: 'Hikvision' },
    images: [{ url: '/api/files/img-1' }],
  },
  {
    id: 'prod-2',
    sku: 'ACC-BIO-01',
    name: 'Lector biométrico',
    category: { name: 'Control de Acceso', slug: 'control-de-acceso' },
    brand: { name: 'ZKTeco' },
    images: [],
  },
];

const PUBLIC_LIST = { code: 'CLIENTE_FINAL_IVA' };

describe('PublicCatalogService.search', () => {
  let service: PublicCatalogService;
  let pricing: PublicPricingService;

  const build = (priceRows: FakePriceRow[] = [], env: Record<string, string | undefined> = {}) => {
    mockPrisma.price.findMany.mockImplementation(fakePriceFindMany(priceRows));
    pricing = new PublicPricingService(mockPrisma as any, makeConfig(env));
    service = new PublicCatalogService(mockPrisma as any, pricing);
  };

  beforeEach(() => {
    jest.resetAllMocks();
    mockPrisma.product.count.mockResolvedValue(0);
    build();
  });

  it('solo devuelve productos publicados con id, sku, nombre, imagen, categoría, marca y precio', async () => {
    mockPrisma.product.findMany.mockResolvedValue(mockProducts);
    mockPrisma.product.count.mockResolvedValue(2);
    build([{ productId: 'prod-1', value: '2450000.00', currency: 'COP', list: PUBLIC_LIST }]);

    const result = await service.search({ q: 'cámara', limit: 24 });

    expect(result).toEqual({
      data: [
        {
          id: 'prod-1',
          sku: 'DS-2CD2143G2',
          name: 'Cámara Domo 4K',
          imageUrl: '/api/files/img-1',
          categoryName: 'Cámaras IP',
          categorySlug: 'camaras-ip',
          brandName: 'Hikvision',
          price: { value: 2450000, currency: 'COP' },
        },
        {
          id: 'prod-2',
          sku: 'ACC-BIO-01',
          name: 'Lector biométrico',
          imageUrl: null,
          categoryName: 'Control de Acceso',
          categorySlug: 'control-de-acceso',
          brandName: 'ZKTeco',
          price: null,
        },
      ],
      meta: { total: 2, offset: 0, limit: 24 },
    });
  });

  it('consulta con el estado PUBLISHED y el término recortado sobre nombre y SKU', async () => {
    mockPrisma.product.findMany.mockResolvedValue([]);

    await service.search({ q: '  domo  ', limit: 10 });

    expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lifecycleStatus: 'PUBLISHED', catalogPublished: true,
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

    await service.search({ q: '   ' });

    expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { lifecycleStatus: 'PUBLISHED', catalogPublished: true },
        take: 24,
      }),
    );
  });

  it('resuelve los precios de la página en UNA consulta y solo con el código público', async () => {
    mockPrisma.product.findMany.mockResolvedValue(mockProducts);

    await service.search({ q: 'x' });

    expect(mockPrisma.price.findMany).toHaveBeenCalledTimes(1);
    const where = mockPrisma.price.findMany.mock.calls[0][0].where;
    expect(where.productId).toEqual({ in: ['prod-1', 'prod-2'] });
    expect(where.priceList.code).toBe('CLIENTE_FINAL_IVA');
    expect(where.priceList.isActive).toBe(true);
  });

  it('no consulta precios cuando no hay productos', async () => {
    mockPrisma.product.findMany.mockResolvedValue([]);

    await expect(service.search({ q: 'nada' })).resolves.toEqual({
      data: [],
      meta: { total: 0, offset: 0, limit: 24 },
    });
    expect(mockPrisma.price.findMany).not.toHaveBeenCalled();
  });

  it('devuelve price null (y el producto igual) si el precio venció o la lista está inactiva', async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockPrisma.product.findMany.mockResolvedValue(mockProducts);
    build([
      { productId: 'prod-1', value: '1000', list: PUBLIC_LIST, validUntil: past },
      { productId: 'prod-2', value: '2000', list: { ...PUBLIC_LIST, isActive: false } },
    ]);

    const result = await service.search({ q: 'x' });

    expect(result.data.map((item) => item.id)).toEqual(['prod-1', 'prod-2']);
    expect(result.data.map((item) => item.price)).toEqual([null, null]);
  });

  it('PUBLIC_PRICE_LIST_CODE cambia la lista de la que sale el precio', async () => {
    mockPrisma.product.findMany.mockResolvedValue([mockProducts[0]]);
    build(
      [
        { productId: 'prod-1', value: '111', list: PUBLIC_LIST },
        { productId: 'prod-1', value: '222', list: { code: 'PUBLICA_B' } },
      ],
      { PUBLIC_PRICE_LIST_CODE: 'PUBLICA_B' },
    );

    const result = await service.search({ q: 'x' });

    expect(result.data[0].price).toEqual({ value: 222, currency: 'COP' });
    expect(mockPrisma.price.findMany.mock.calls[0][0].where.priceList.code).toBe('PUBLICA_B');
  });

  it('no filtra listas internas, costos ni extraAttributes aunque la BD los tenga', async () => {
    // La BD "devuelve" campos internos aunque el select no los pida: el mapeo
    // explícito no debe propagarlos jamás.
    const dirtyProduct = {
      ...mockProducts[0],
      extraAttributes: { COSTO: 1_200_000, PLATINO: 1_500_000 },
      prices: [{ value: '1', priceList: { code: 'INSTALADOR_IVA' } }],
      listaId: 'lista-interna',
    };
    mockPrisma.product.findMany.mockResolvedValue([dirtyProduct]);
    build([
      { productId: 'prod-1', value: '1', list: { code: 'INSTALADOR_IVA' } },
      { productId: 'prod-1', value: '2', list: { code: 'TIENDA_IVA' } },
      { productId: 'prod-1', value: '3', list: { code: 'DPP_ORO_IVA' } },
      { productId: 'prod-1', value: '4', list: { code: 'DPP_PLATINO_IVA' } },
      { productId: 'prod-1', value: '5', list: { code: 'ORO_SIN_IVA' } },
      { productId: 'prod-1', value: '6', list: { code: 'INSTALLER_SIN_IVA' } },
      { productId: 'prod-1', value: '2450000', list: PUBLIC_LIST },
    ]);

    const result = await service.search({ q: 'cámara' });

    expect(result.data[0].price).toEqual({ value: 2450000, currency: 'COP' });
    expect(Object.keys(result.data[0]).sort()).toEqual([
      'brandName', 'categoryName', 'categorySlug', 'id', 'imageUrl', 'name', 'price', 'sku',
    ]);
    const serialized = JSON.stringify(result);
    for (const forbidden of ['extraAttributes', 'COSTO', 'PLATINO', 'INSTALADOR', 'TIENDA', 'DPP_', 'SIN_IVA', 'lista']) {
      expect(serialized).not.toContain(forbidden);
    }
    // Y la consulta nunca pide esos campos.
    const select = mockPrisma.product.findMany.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(['brand', 'category', 'id', 'images', 'name', 'publicRevisionId', 'sku']);
  });
});

describe('PublicProductsController', () => {
  let app: INestApplication;
  const catalogService = {
    search: jest.fn(),
    getDetail: jest.fn(),
  };
  const PRODUCT_ID = '3f2b8c1e-6a4d-4e0b-9d57-1c2a3b4c5d6e';

  beforeEach(async () => {
    jest.clearAllMocks();
    catalogService.getDetail.mockReset();
    catalogService.search.mockResolvedValue({
      data: mockProducts,
      meta: { total: 2, offset: 0, limit: 24 },
    });

    const moduleFixture = await Test.createTestingModule({
      controllers: [PublicProductsController],
      providers: [{ provide: PublicCatalogService, useValue: catalogService }],
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

    expect(catalogService.search).toHaveBeenCalledWith({ q: 'camara', limit: 5 });
  });

  it('devuelve la respuesta del servicio como { data: [...], meta }', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/public/products?q=camara')
      .expect(200);

    expect(response.body).toEqual({
      data: mockProducts,
      meta: { total: 2, offset: 0, limit: 24 },
    });
  });

  it('con el TransformInterceptor global el cable queda { data: { data, meta } }', async () => {
    const wrapped = (
      await Test.createTestingModule({
        controllers: [PublicProductsController],
        providers: [{ provide: PublicCatalogService, useValue: catalogService }],
      }).compile()
    ).createNestApplication();
    wrapped.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    wrapped.useGlobalInterceptors(new TransformInterceptor());
    await wrapped.init();
    try {
      const response = await request(wrapped.getHttpServer()).get('/api/public/products?q=camara').expect(200);

      expect(response.body).toEqual({
        data: { data: mockProducts, meta: { total: 2, offset: 0, limit: 24 } },
      });
    } finally {
      await wrapped.close();
    }
  });

  it('pasa category, offset y limit al servicio', async () => {
    await request(app.getHttpServer())
      .get('/api/public/products?category=camaras-ip&offset=48&limit=48')
      .expect(200);

    expect(catalogService.search).toHaveBeenCalledWith({ category: 'camaras-ip', offset: 48, limit: 48 });
  });

  it('rechaza offset negativo o no entero, category vacía y limit sobre el tope de 48', async () => {
    for (const query of ['offset=-1', 'offset=1.5', 'offset=abc', 'category=', 'limit=49', 'limit=2.5']) {
      await request(app.getHttpServer()).get(`/api/public/products?${query}`).expect(400);
    }
    expect(catalogService.search).not.toHaveBeenCalled();
  });

  it('marca el listado y el detalle como @Public (sin JWT)', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicProductsController.prototype.search)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicProductsController.prototype.detail)).toBe(true);
  });

  describe('GET /api/public/products/:id', () => {
    it('sirve el detalle sin JWT', async () => {
      catalogService.getDetail.mockResolvedValue({ id: PRODUCT_ID, name: 'Cámara Domo 4K' });

      const response = await request(app.getHttpServer())
        .get(`/api/public/products/${PRODUCT_ID}`)
        .expect(200);

      expect(catalogService.getDetail).toHaveBeenCalledWith(PRODUCT_ID);
      expect(response.body).toEqual({ id: PRODUCT_ID, name: 'Cámara Domo 4K' });
    });

    it('propaga el 404 del servicio (inexistente o no publicado)', async () => {
      catalogService.getDetail.mockRejectedValue(new NotFoundException('Producto no encontrado'));

      await request(app.getHttpServer()).get(`/api/public/products/${PRODUCT_ID}`).expect(404);
    });

    it('rechaza con 400 un id que no es UUID sin llamar al servicio', async () => {
      await request(app.getHttpServer()).get('/api/public/products/no-es-uuid').expect(400);
      await request(app.getHttpServer()).get('/api/public/products/1%20OR%201=1').expect(400);

      expect(catalogService.getDetail).not.toHaveBeenCalled();
    });
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
    const invalidLimit = plainToInstance(PublicProductSearchDto, { limit: '49' });
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
