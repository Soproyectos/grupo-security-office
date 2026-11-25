import { Controller, Get, INestApplication, Post, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { AuthController } from '../../modules/auth/auth.controller';
import { BrandsController } from '../../modules/brands/brands.controller';
import { CategoriesController } from '../../modules/categories/categories.controller';
import { PublicCategoriesController } from '../../modules/categories/public-categories.controller';
import { FilesController } from '../../modules/files/files.controller';
import { ProductsController } from '../../modules/products/products.controller';
import { PublicProductDetailController } from '../../modules/products/public-detail/public-product-detail.controller';
import { PublicCatalogKeySpecFacetsController } from '../../modules/products/public-catalog-key-spec-facets.controller';
import { PublicProductsController } from '../../modules/products/public-products.controller';
import { StorefrontController } from '../../modules/storefront/storefront.controller';
import { SubcategoriesController } from '../../modules/subcategories/subcategories.controller';
import { applyTrustProxy } from '../http/trust-proxy';
import { CatalogRead, CatalogSearch, CATALOG_SEARCH_LIMIT } from './throttle-policy';

// Claves de metadata de @nestjs/throttler v6 (SkipThrottle / Throttle con el limitador `default`).
const SKIP = 'THROTTLER:SKIPdefault';
const LIMIT = 'THROTTLER:LIMITdefault';

type Ctor = { prototype: object; name: string };
const proto = (controller: Ctor) => controller.prototype as Record<string, unknown>;
const handlers = (controller: Ctor) =>
  Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor' && typeof proto(controller)[name] === 'function')
    .map((name) => ({ name, fn: proto(controller)[name] as object, http: Reflect.getMetadata(METHOD_METADATA, proto(controller)[name] as object) as number | undefined }))
    .filter((h) => h.http !== undefined);
const route = (controller: Ctor, name: string) => {
  const fn = proto(controller)[name] as object;
  return { skipped: Reflect.getMetadata(SKIP, fn) === true, limit: Reflect.getMetadata(LIMIT, fn) as number | undefined };
};

describe('política de límite del catálogo (metadatos de las rutas reales)', () => {
  it('imágenes, menú, fichas y lecturas por id quedan sin límite', () => {
    expect(route(FilesController, 'serve').skipped).toBe(true);
    expect(route(PublicCategoriesController, 'findMenu').skipped).toBe(true);
    expect(route(PublicProductsController, 'detail').skipped).toBe(true);
    expect(route(PublicProductDetailController, 'findByIdOrSlug').skipped).toBe(true);
    expect(route(StorefrontController, 'product').skipped).toBe(true);
    expect(route(StorefrontController, 'settings').skipped).toBe(true);
    expect(route(ProductsController, 'findOne').skipped).toBe(true);
  });

  it('listados y búsquedas conservan un límite alto (300 por minuto), no ninguno', () => {
    for (const [controller, name] of [
      [PublicProductsController, 'search'],
      [PublicCatalogKeySpecFacetsController, 'facets'],
      [StorefrontController, 'products'],
      [ProductsController, 'findAll'],
      [ProductsController, 'findTrending'],
    ] as const) {
      expect({ route: `${controller.name}.${name}`, ...route(controller, name) }).toEqual({
        route: `${controller.name}.${name}`,
        skipped: false,
        limit: CATALOG_SEARCH_LIMIT.limit,
      });
    }
  });

  it('todas las lecturas de categorías, subcategorías y marcas quedan sin límite', () => {
    for (const controller of [CategoriesController, SubcategoriesController, BrandsController]) {
      const gets = handlers(controller).filter((h) => h.http === RequestMethod.GET);
      expect(gets.length).toBeGreaterThan(0);
      for (const h of gets) expect({ route: `${controller.name}.${h.name}`, skipped: Reflect.getMetadata(SKIP, h.fn) }).toEqual({ route: `${controller.name}.${h.name}`, skipped: true });
    }
  });

  it('ninguna ruta que escribe queda exenta ni con límite relajado', () => {
    for (const controller of [ProductsController, CategoriesController, SubcategoriesController, BrandsController, FilesController, PublicProductsController, StorefrontController, AuthController]) {
      for (const h of handlers(controller).filter((x) => x.http !== RequestMethod.GET)) {
        const label = `${controller.name}.${h.name}`;
        expect({ label, skipped: Reflect.getMetadata(SKIP, h.fn) === true }).toEqual({ label, skipped: false });
        const limit = Reflect.getMetadata(LIMIT, h.fn) as number | undefined;
        expect({ label, relaxed: limit !== undefined && limit >= CATALOG_SEARCH_LIMIT.limit }).toEqual({ label, relaxed: false });
      }
    }
  });

  it('el inicio de sesión conserva su límite estricto', () => {
    expect(Reflect.getMetadata(LIMIT, (AuthController.prototype as unknown as Record<string, object>)['login'])).toBe(5);
  });
});

// ---- Comportamiento real con ThrottlerGuard (límite global 20/min) ----

@Controller('t')
class ProbeController {
  @Get('read') @CatalogRead() read() { return { ok: true }; }
  @Get('search') @CatalogSearch() search() { return { ok: true }; }
  @Get('plain') plain() { return { ok: true }; }
  @Post('write') write() { return { ok: true }; }
}

async function bootProbe(trustProxy?: string): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 20 }] })],
    controllers: [ProbeController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  if (trustProxy !== undefined) applyTrustProxy(app, trustProxy);
  await app.init();
  return app;
}

const burst = async (app: INestApplication, method: 'get' | 'post', path: string, count: number, ip?: string) => {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) {
    const req = request(app.getHttpServer())[method](path);
    if (ip) req.set('X-Forwarded-For', ip);
    statuses.push((await req).status);
  }
  return statuses;
};
const ok = (statuses: number[]) => statuses.every((s) => s === 200 || s === 201);

describe('límite de solicitudes: ráfagas', () => {
  let app: NestExpressApplication;
  afterEach(async () => { await app?.close(); });

  it('60 lecturas exentas devuelven solo 200; la ruta común se corta en la 21 con 429', async () => {
    app = await bootProbe('');
    expect(ok(await burst(app, 'get', '/t/read', 60))).toBe(true);
    const plain = await burst(app, 'get', '/t/plain', 22);
    expect(plain.filter((s) => s === 200)).toHaveLength(20);
    expect(plain.slice(20)).toEqual([429, 429]);
  });

  it('la búsqueda tiene un límite alto: 60 seguidas pasan, la 301 no', async () => {
    app = await bootProbe('');
    expect(ok(await burst(app, 'get', '/t/search', 60))).toBe(true);
    const more = await burst(app, 'get', '/t/search', 241);
    expect(more.filter((s) => s === 200)).toHaveLength(240);
    expect(more[240]).toBe(429);
  });

  it('las rutas que escriben siguen limitadas', async () => {
    app = await bootProbe('');
    const writes = await burst(app, 'post', '/t/write', 22);
    expect(writes.filter((s) => s === 201)).toHaveLength(20);
    expect(writes.slice(20)).toEqual([429, 429]);
  });
});

describe('IP del cliente detrás de nginx (trust proxy)', () => {
  let app: NestExpressApplication;
  afterEach(async () => { await app?.close(); });

  it('con trust proxy cada visitante tiene su propio contador y no se puede suplantar con la cabecera', async () => {
    app = await bootProbe(''); // valor por defecto: se confía en redes privadas
    const a = await burst(app, 'get', '/t/plain', 21, '203.0.113.10');
    expect(a.filter((s) => s === 200)).toHaveLength(20);
    expect(a[20]).toBe(429);
    // otro visitante no se ve afectado
    expect(ok(await burst(app, 'get', '/t/plain', 5, '203.0.113.11'))).toBe(true);
    // escribir otra IP a la izquierda no reinicia el contador del visitante real (el último valor lo pone nginx)
    expect((await burst(app, 'get', '/t/plain', 1, '198.51.100.7, 203.0.113.10'))[0]).toBe(429);
  });

  it('sin trust proxy (el comportamiento anterior) todos los visitantes comparten un solo contador', async () => {
    app = await bootProbe(); // sin applyTrustProxy
    await burst(app, 'get', '/t/plain', 20, '203.0.113.10');
    expect((await burst(app, 'get', '/t/plain', 1, '203.0.113.99'))[0]).toBe(429);
  });
});
