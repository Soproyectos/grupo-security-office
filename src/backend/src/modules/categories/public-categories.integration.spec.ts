import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { PublicCategoriesController } from './public-categories.controller';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

describe('PublicCategoriesController', () => {
  let app: INestApplication;
  const categoriesService = {
    findMenu: jest.fn(),
  };
  const menu = [
    {
      id: 'root',
      name: 'CCTV',
      slug: 'cctv',
      imageUrl: '/images/categories/cctv.svg',
      iconUrl: '/images/categories/cctv.svg',
      isFeatured: true,
      sortOrder: 0,
      children: [],
    },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    categoriesService.findMenu.mockResolvedValue({ data: menu });

    const moduleFixture = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60000, limit: 20 }],
        }),
      ],
      controllers: [PublicCategoriesController],
      providers: [
        { provide: CategoriesService, useValue: categoriesService },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves the menu without a JWT', async () => {
    await request(app.getHttpServer())
      .get('/api/public/categories/menu')
      .expect(200);

    expect(categoriesService.findMenu).toHaveBeenCalledTimes(1);
  });

  it('returns the service response as { data: [...] }', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/public/categories/menu')
      .expect(200);

    expect(response.body).toEqual({ data: menu });
  });

  it('returns 429 on the 61st request in the throttle window', async () => {
    for (let requestNumber = 0; requestNumber < 60; requestNumber += 1) {
      await request(app.getHttpServer())
        .get('/api/public/categories/menu')
        .expect(200);
    }

    await request(app.getHttpServer())
      .get('/api/public/categories/menu')
      .expect(429);
  }, 15000);

  it('rejects javascript URLs in category media DTOs', async () => {
    const createDto = plainToInstance(CreateCategoryDto, {
      name: 'Categoría',
      slug: 'categoria',
      imageUrl: 'javascript:alert(1)',
    });
    const updateDto = plainToInstance(UpdateCategoryDto, {
      iconUrl: 'data:image/svg+xml,<svg></svg>',
    });

    const [createErrors, updateErrors] = await Promise.all([validate(createDto), validate(updateDto)]);

    expect(createErrors.some((error) => error.property === 'imageUrl')).toBe(true);
    expect(updateErrors.some((error) => error.property === 'iconUrl')).toBe(true);
  });
});
