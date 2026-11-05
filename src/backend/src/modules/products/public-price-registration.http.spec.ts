import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import cookieParser = require('cookie-parser');
import { PublicProductsController } from './public-products.controller';
import { PublicProductDetailController } from './public-detail/public-product-detail.controller';
import { PublicCatalogService } from './public-catalog.service';
import { PublicProductDetailService } from './public-detail/public-product-detail.service';
import { StorefrontService } from '../storefront/storefront.service';

describe('Public product HTTP prices require a verified customer session', () => {
  let app: INestApplication;
  const cookie = 'b'.repeat(64);
  const product = { id: 'product-fixture', name: 'Ficha fixture', price: { value: 777, currency: 'COP' } };
  let session: jest.Mock;

  beforeAll(async () => {
    session = jest.fn().mockResolvedValue(null);
    const operational = {
      customerSession: { findUnique: session },
      storefrontSettings: { findUnique: jest.fn().mockResolvedValue({ id: 'default', data: { publicPriceListId: 'public-fixture' } }) },
    };
    const library = { client: { price: { findMany: jest.fn().mockResolvedValue([{ productId: product.id, priceListId: 'public-fixture', value: '100', currency: 'COP' }]) } } };
    const customers = new StorefrontService(operational as never, {} as never, {} as never, {} as never, library as never);
    const module = await Test.createTestingModule({
      controllers: [PublicProductsController, PublicProductDetailController],
      providers: [
        { provide: PublicCatalogService, useValue: { search: async () => ({ data: [product], meta: { total: 1, offset: 0, limit: 24 } }), getDetail: async () => product } },
        { provide: PublicProductDetailService, useValue: { findByIdOrSlug: async () => product } },
        { provide: StorefrontService, useValue: customers },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => { await app?.close(); });
  beforeEach(() => { session.mockResolvedValue(null); });

  const routes = ['/api/public/products', '/api/public/products/product-fixture', '/api/public/products/product-fixture/detail'];
  it.each(routes)('hides price at %s without registration, with malformed/unknown/expired cookies', async (route) => {
    for (const value of [undefined, 'invalid', cookie]) {
      let req = request(app.getHttpServer()).get(route);
      if (value) req = req.set('Cookie', `gs_customer_session=${value}`);
      const response = await req.expect(200).expect('Cache-Control', 'private, no-store').expect('Vary', 'Cookie');
      expect((response.body.data?.[0] ?? response.body).price).toBeNull();
      expect(JSON.stringify(response.body)).not.toContain('777');
    }
    session.mockResolvedValue({ expiresAt: new Date(Date.now() - 60_000), account: { emailVerifiedAt: new Date(), status: 'APPROVED' } });
    const response = await request(app.getHttpServer()).get(route).set('Cookie', `gs_customer_session=${cookie}`).expect(200);
    expect((response.body.data?.[0] ?? response.body).price).toBeNull();
  });

  it.each(routes)('returns the existing configured tariff at %s to a verified registered customer only', async (route) => {
    session.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000), account: { id: 'customer-fixture', emailVerifiedAt: new Date(), status: 'PENDING', priceListId: null } });
    const response = await request(app.getHttpServer()).get(route).set('Cookie', `gs_customer_session=${cookie}`).expect(200).expect('Cache-Control', 'private, no-store');
    expect((response.body.data?.[0] ?? response.body).price).toEqual({ value: 100, currency: 'COP' });
  });
});
