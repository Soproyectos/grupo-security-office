import 'reflect-metadata';
import { CanActivate, ExecutionContext, ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessAssignmentsService } from '../../../common/security/access-assignments.service';
import * as request from 'supertest';
import { AclService } from '../../../common/acl/acl.service';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { HttpExceptionFilter } from '../../../common/filters/http-exception.filter';
import { TransformInterceptor } from '../../../common/interceptors/transform.interceptor';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ProductSheetController } from './product-sheet.controller';
import { ProductSheetService } from './product-sheet.service';

/**
 * HTTP contract of the admin sheet endpoints: real controller, real service, real
 * RolesGuard and the same global ValidationPipe as `main.ts`. Only Prisma, the ACL
 * and the audit sink are fakes. Auth is simulated through the `x-test-roles` header.
 */

const PRODUCT_ID = '69ba44ee-7081-475b-8f00-b3220364bee5';

class HeaderAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const roles = req.headers['x-test-roles'];
    if (!roles) return false;
    req.user = { sub: 'user-1', roles: String(roles).split(',') };
    return true;
  }
}

const row = (over: Record<string, unknown> = {}) => ({
  id: PRODUCT_ID,
  sku: 'IDS-E04HQHI-D',
  name: 'DVR curado',
  listaId: 'lista-1',
  updatedAt: new Date('2026-10-02T12:00:00Z'),
  catalogName: null,
  catalogSlug: null,
  catalogPublished: false,
  catalogStatus: 'ACTIVE',
  catalogBrand: null,
  catalogModel: null,
  catalogBadges: [],
  catalogHighlights: [],
  catalogFeatures: [],
  catalogAvailableModels: [],
  catalogImageUrl: null,
  catalogImageAlt: null,
  catalogSpecsDisclaimer: null,
  catalogFirmwareNote: null,
  catalogSpecGroups: [],
  catalogResources: [],
  ...over,
});

const validBody = () => ({
  name: 'DVR AcuSense',
  slug: 'ids-e04hqhi-d',
  published: true,
  status: 'ACTIVE',
  brand: 'Hikvision',
  model: 'iDS-E04HQHI-D',
  badges: ['Destacado'],
  highlights: ['eSSD'],
  features: [{ label: 'AcuSense', icon: 'person' }],
  availableModels: ['iDS-E04HQHI-D'],
  specsDisclaimer: null,
  firmwareNote: null,
  specGroups: [{ title: 'Video', items: [{ label: 'Canales', value: '4' }] }],
  resources: [{ kind: 'MANUAL', title: 'Manual', language: 'es', url: 'https://x.test/m.pdf', requiresLicense: false }],
});

describe('ProductSheetController (HTTP)', () => {
  let app: INestApplication;
  let tx: any;
  let prisma: any;
  let acl: { assertProductAccess: jest.Mock };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    tx = {
      product: { update: jest.fn().mockResolvedValue({}) },
      productCatalogSpecGroup: { deleteMany: jest.fn(), create: jest.fn() },
      productCatalogResource: { deleteMany: jest.fn(), createMany: jest.fn() },
      // CAT-04 (D4): marcado de archivos con licencia dentro de la transacción.
      uploadedFile: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      product: { findUnique: jest.fn().mockResolvedValue(row()), findFirst: jest.fn().mockResolvedValue(null) },
      lista: { findUnique: jest.fn().mockResolvedValue({ id: 'lista-1', deletionStatus: null }) },
      $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
    };
    acl = { assertProductAccess: jest.fn().mockResolvedValue({ listaId: 'lista-1' }) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      controllers: [ProductSheetController],
      providers: [
      { provide: AccessAssignmentsService, useValue: { grantsForUser: jest.fn().mockResolvedValue([{ sourceId: 's-r', actionId: 'products:read', scope: 'global' }, { sourceId: 's-w', actionId: 'products:write', scope: 'global' }, { sourceId: 's-n', actionId: 'products:notes', scope: 'global' }]) } },
      ProductSheetService,
        RolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: AclService, useValue: acl },
        { provide: AuditService, useValue: audit },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(HeaderAuthGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const put = (body: unknown, roles = 'Admin Comercial') =>
    request(app.getHttpServer()).put(`/api/products/${PRODUCT_ID}/sheet`).set('x-test-roles', roles).send(body as object);

  it('PUT without credentials is rejected and nothing is written', async () => {
    const res = await request(app.getHttpServer()).put(`/api/products/${PRODUCT_ID}/sheet`).send(validBody());
    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['Operador', 'Consulta', 'Supervisor'])('PUT as %s is forbidden by role', async (role) => {
    const res = await put(validBody(), role);
    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it.each(['Operador', 'Consulta'])('GET as %s is forbidden by role', async (role) => {
    const res = await request(app.getHttpServer()).get(`/api/products/${PRODUCT_ID}/sheet`).set('x-test-roles', role);
    expect(res.status).toBe(403);
  });

  it.each(['Super Admin', 'Admin Comercial'])('PUT as %s saves, audits and returns the new sheet in the {data} envelope', async (role) => {
    prisma.product.findUnique
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ catalogName: 'DVR AcuSense', catalogSlug: 'ids-e04hqhi-d', catalogPublished: true }));

    const res = await put(validBody(), role);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ productId: PRODUCT_ID, name: 'DVR AcuSense', slug: 'ids-e04hqhi-d', published: true });
    expect(acl.assertProductAccess).toHaveBeenCalledWith(PRODUCT_ID, { userId: 'user-1', roles: [role] }, 'edit_products');
    expect(tx.productCatalogSpecGroup.create).toHaveBeenCalledTimes(1);
    expect(tx.productCatalogResource.createMany).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'update_sheet', entity: 'Product', entityId: PRODUCT_ID, userId: 'user-1' }));
  });

  it('PUT surfaces the ACL denial (403) when the user lacks edit_products on the Lista', async () => {
    acl.assertProductAccess.mockRejectedValue(new ForbiddenException('Acceso restringido a este producto'));
    const res = await put(validBody());
    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('PUT returns 409 when the slug belongs to another product', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'other' });
    const res = await put(validBody());
    expect(res.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid slug', { slug: 'Not A Slug' }],
    ['unknown icon', { features: [{ label: 'X', icon: 'rocket' }] }],
    ['javascript: url', { resources: [{ kind: 'MANUAL', title: 'M', language: 'es', url: 'javascript:alert(1)', requiresLicense: false }] }],
    ['unknown kind', { resources: [{ kind: 'VIDEO', title: 'M', language: 'es', url: 'https://x.test', requiresLicense: false }] }],
    ['unknown property', { isVisible: true }],
    ['missing published', { published: undefined }],
    ['published without slug', { slug: null, published: true }],
  ])('PUT with %s is a 400 and writes nothing', async (_label, patch) => {
    const res = await put({ ...validBody(), ...patch });
    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('PUT for an unknown product is a 404', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    const res = await put(validBody());
    expect(res.status).toBe(404);
  });

  it('GET returns the editable sheet', async () => {
    prisma.product.findUnique.mockResolvedValue(
      row({ catalogName: 'Ficha', catalogSpecGroups: [{ key: 'video', title: 'Video', items: [{ label: 'Canales', value: '4' }] }] }),
    );
    const res = await request(app.getHttpServer()).get(`/api/products/${PRODUCT_ID}/sheet`).set('x-test-roles', 'Admin Comercial');
    expect(res.status).toBe(200);
    expect(res.body.data.specGroups).toEqual([{ key: 'video', title: 'Video', items: [{ label: 'Canales', value: '4' }] }]);
    expect(acl.assertProductAccess).toHaveBeenCalledWith(PRODUCT_ID, expect.anything(), 'view');
  });
});
