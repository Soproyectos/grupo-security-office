import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductSheetService, normalizeSheet, slugifyKey } from './product-sheet.service';
import { UpdateProductSheetDto } from './dto/product-sheet.dto';

const PRODUCT_ID = '69ba44ee-7081-475b-8f00-b3220364bee5';

const baseInput = (over: Record<string, unknown> = {}): UpdateProductSheetDto =>
  ({
    name: 'DVR AcuSense 4 canales',
    slug: 'ids-e04hqhi-d',
    published: true,
    status: 'ACTIVE',
    brand: 'Hikvision',
    model: 'iDS-E04HQHI-D',
    badges: ['Destacado'],
    highlights: ['Tecnología eSSD'],
    features: [{ label: 'AcuSense', icon: 'person' }],
    availableModels: ['iDS-E04HQHI-D'],
    imageUrl: null,
    imageAlt: null,
    specsDisclaimer: 'Pruebas en entorno controlado',
    firmwareNote: 'Actualizar al firmware más reciente',
    specGroups: [
      {
        title: 'Video y audio',
        items: [
          { label: 'Canales', value: '4' },
          { label: 'Resolución', value: '1080p' },
        ],
      },
    ],
    resources: [
      {
        kind: 'DATASHEET',
        title: 'Ficha técnica',
        language: 'es',
        url: 'https://example.com/ds.pdf',
        requiresLicense: false,
      },
      {
        kind: 'FIRMWARE',
        title: 'Firmware V4.75',
        language: 'en',
        url: '/api/files/fw-1',
        version: 'V4.75',
        region: 'Europa',
        requiresLicense: true,
      },
    ],
    ...over,
  }) as UpdateProductSheetDto;

const productRow = (over: Record<string, unknown> = {}) => ({
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

function build() {
  const tx = {
    product: { update: jest.fn().mockResolvedValue({}) },
    productCatalogSpecGroup: { deleteMany: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({}) },
    productCatalogResource: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    product: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    lista: { findUnique: jest.fn().mockResolvedValue({ id: 'lista-1', deletionStatus: null }) },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const acl = { assertProductAccess: jest.fn().mockResolvedValue({ listaId: 'lista-1' }) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ProductSheetService(prisma as never, acl as never, audit as never);
  return { service, prisma, tx, acl, audit };
}

const ctx = { userId: 'user-1', roles: ['Admin Comercial'] };

describe('slugifyKey', () => {
  it('drops accents, lowercases and dash-separates', () => {
    expect(slugifyKey('Protección perimetral')).toBe('proteccion-perimetral');
    expect(slugifyKey('  Video & Audio!! ')).toBe('video-audio');
  });
});

describe('normalizeSheet', () => {
  it('trims text, drops blank list entries and de-duplicates badges and models', () => {
    const out = normalizeSheet(
      baseInput({
        name: '  Nombre  ',
        brand: '   ',
        badges: [' Nuevo ', 'Nuevo', ''],
        highlights: ['  a ', '', 'b'],
        availableModels: ['X1', ' X1 ', 'X2'],
      }),
    );
    expect(out.name).toBe('Nombre');
    expect(out.brand).toBeNull();
    expect(out.badges).toEqual(['Nuevo']);
    expect(out.highlights).toEqual(['a', 'b']);
    expect(out.availableModels).toEqual(['X1', 'X2']);
  });

  it('derives stable unique keys for feature ids and spec group keys', () => {
    const out = normalizeSheet(
      baseInput({
        features: [
          { label: 'AcuSense', icon: 'person' },
          { label: 'AcuSense', icon: 'shield' },
          { id: 'custom-id', label: 'Otro', icon: 'chip' },
        ],
        specGroups: [
          { title: 'Video', items: [] },
          { title: 'Video', items: [] },
          { key: 'keep-me', title: 'Red', items: [] },
        ],
      }),
    );
    expect(out.features.map((f) => f.id)).toEqual(['acusense', 'acusense-2', 'custom-id']);
    expect(out.specGroups.map((g) => g.key)).toEqual(['video', 'video-2', 'keep-me']);
  });

  it('requires a slug to publish and rejects UUID-shaped slugs', () => {
    expect(() => normalizeSheet(baseInput({ slug: null, published: true }))).toThrow(BadRequestException);
    expect(() => normalizeSheet(baseInput({ slug: PRODUCT_ID }))).toThrow(BadRequestException);
    expect(normalizeSheet(baseInput({ slug: null, published: false })).slug).toBeNull();
  });

  it('rejects entries that are blank after trimming', () => {
    expect(() => normalizeSheet(baseInput({ features: [{ label: '   ', icon: 'chip' }] }))).toThrow(BadRequestException);
    expect(() => normalizeSheet(baseInput({ specGroups: [{ title: ' ', items: [] }] }))).toThrow(BadRequestException);
    expect(() =>
      normalizeSheet(baseInput({ specGroups: [{ title: 'G', items: [{ label: 'a', value: '  ' }] }] })),
    ).toThrow(BadRequestException);
  });

  it('lowercases the language and maps blank optional resource fields to null', () => {
    const out = normalizeSheet(
      baseInput({
        resources: [
          { kind: 'MANUAL', title: ' Manual ', language: 'ES', url: ' https://x.test/m.pdf ', version: '', requiresLicense: false },
        ],
      }),
    );
    expect(out.resources[0]).toEqual({
      kind: 'MANUAL',
      title: 'Manual',
      language: 'es',
      url: 'https://x.test/m.pdf',
      fileName: null,
      version: null,
      region: null,
      requiresLicense: false,
    });
  });
});

describe('UpdateProductSheetDto validation', () => {
  const errorsFor = async (over: Record<string, unknown>) =>
    validate(plainToInstance(UpdateProductSheetDto, { ...baseInput(), ...over }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('accepts a valid sheet', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it.each(['Has Spaces', 'UPPER', '-lead', 'a_b', 'x'.repeat(129)])('rejects slug %j', async (slug) => {
    const errors = await errorsFor({ slug });
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });

  it('rejects an icon that is not in the allowed set', async () => {
    const errors = await errorsFor({ features: [{ label: 'X', icon: 'rocket' }] });
    expect(errors.some((e) => e.property === 'features')).toBe(true);
  });

  it.each(['javascript:alert(1)', 'ftp://host/file', '//evil.test/x', 'data:text/html,hi', 'not a url', '/etc/passwd'])(
    'rejects resource url %j',
    async (url) => {
      const errors = await errorsFor({
        resources: [{ kind: 'MANUAL', title: 'M', language: 'es', url, requiresLicense: false }],
      });
      expect(errors.some((e) => e.property === 'resources')).toBe(true);
    },
  );

  it.each(['https://example.com/a.pdf', 'http://example.com/a.pdf', '/api/files/abc'])('accepts resource url %j', async (url) => {
    const errors = await errorsFor({
      resources: [{ kind: 'MANUAL', title: 'M', language: 'es', url, requiresLicense: false }],
    });
    expect(errors).toEqual([]);
  });

  it('rejects unknown resource kinds, bad languages and unknown properties', async () => {
    const bad = await errorsFor({
      resources: [{ kind: 'VIDEO', title: 'M', language: 'español', url: 'https://x.test', requiresLicense: false }],
    });
    expect(bad.some((e) => e.property === 'resources')).toBe(true);
    const extra = await errorsFor({ isVisible: true });
    expect(extra.some((e) => e.property === 'isVisible')).toBe(true);
  });

  it('requires published and status', async () => {
    const errors = await errorsFor({ published: undefined, status: 'WHATEVER' });
    expect(errors.map((e) => e.property).sort()).toEqual(['published', 'status']);
  });
});

describe('ProductSheetService.get', () => {
  it('maps catalog columns, ordered groups and resources', async () => {
    const { service, prisma, acl } = build();
    prisma.product.findUnique.mockResolvedValue(
      productRow({
        catalogName: 'Ficha',
        catalogSlug: 'slug-1',
        catalogPublished: true,
        catalogFeatures: [{ id: 'a', label: 'A', icon: 'chip' }],
        catalogSpecGroups: [{ key: 'video', title: 'Video', items: [{ label: 'Canales', value: '4' }] }],
        catalogResources: [
          { id: 'r1', kind: 'FIRMWARE', title: 'FW', language: 'en', url: '/api/files/1', fileName: null, version: 'V1', region: null, requiresLicense: true },
        ],
      }),
    );

    const sheet = await service.get(PRODUCT_ID, ctx);

    expect(acl.assertProductAccess).toHaveBeenCalledWith(PRODUCT_ID, ctx, 'view');
    expect(sheet).toMatchObject({
      productId: PRODUCT_ID,
      productName: 'DVR curado',
      name: 'Ficha',
      slug: 'slug-1',
      published: true,
      features: [{ id: 'a', label: 'A', icon: 'chip' }],
      specGroups: [{ key: 'video', title: 'Video', items: [{ label: 'Canales', value: '4' }] }],
    });
    expect(sheet.resources[0]).toMatchObject({ kind: 'FIRMWARE', requiresLicense: true, version: 'V1' });
    // Orders by position, items included: reuses the public detail include.
    expect(prisma.product.findUnique.mock.calls[0][0].include.catalogSpecGroups.orderBy).toEqual({ position: 'asc' });
  });

  it('404s for an unknown product', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.get('nope', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProductSheetService.update', () => {
  it('replaces the product columns, spec groups (with ordered items) and resources in ONE transaction', async () => {
    const { service, prisma, tx } = build();
    prisma.product.findUnique.mockResolvedValue(productRow());

    await service.update(PRODUCT_ID, baseInput(), ctx);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID },
      data: expect.objectContaining({
        catalogName: 'DVR AcuSense 4 canales',
        catalogSlug: 'ids-e04hqhi-d',
        catalogPublished: true,
        catalogStatus: 'ACTIVE',
        catalogBrand: 'Hikvision',
        catalogModel: 'iDS-E04HQHI-D',
        catalogBadges: ['Destacado'],
        catalogFeatures: [{ id: 'acusense', label: 'AcuSense', icon: 'person' }],
      }),
    });
    // Identity is never written from the sheet.
    const data = tx.product.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('name');
    expect(data).not.toHaveProperty('sku');
    expect(data).not.toHaveProperty('nameSource');

    expect(tx.productCatalogSpecGroup.deleteMany).toHaveBeenCalledWith({ where: { productId: PRODUCT_ID } });
    expect(tx.productCatalogSpecGroup.create).toHaveBeenCalledTimes(1);
    expect(tx.productCatalogSpecGroup.create).toHaveBeenCalledWith({
      data: {
        productId: PRODUCT_ID,
        key: 'video-y-audio',
        title: 'Video y audio',
        position: 0,
        items: {
          create: [
            { label: 'Canales', value: '4', position: 0 },
            { label: 'Resolución', value: '1080p', position: 1 },
          ],
        },
      },
    });

    expect(tx.productCatalogResource.deleteMany).toHaveBeenCalledWith({ where: { productId: PRODUCT_ID } });
    const { data: resources } = tx.productCatalogResource.createMany.mock.calls[0][0];
    expect(resources.map((r: any) => [r.position, r.kind, r.requiresLicense])).toEqual([
      [0, 'DATASHEET', false],
      [1, 'FIRMWARE', true],
    ]);
    expect(resources.every((r: any) => r.productId === PRODUCT_ID)).toBe(true);
  });

  it('deletes everything when groups and resources are emptied (no createMany with no rows)', async () => {
    const { service, prisma, tx } = build();
    prisma.product.findUnique.mockResolvedValue(productRow());

    await service.update(PRODUCT_ID, baseInput({ specGroups: [], resources: [] }), ctx);

    expect(tx.productCatalogSpecGroup.deleteMany).toHaveBeenCalled();
    expect(tx.productCatalogSpecGroup.create).not.toHaveBeenCalled();
    expect(tx.productCatalogResource.deleteMany).toHaveBeenCalled();
    expect(tx.productCatalogResource.createMany).not.toHaveBeenCalled();
  });

  it('enforces edit_products on the product and surfaces the ACL denial without writing', async () => {
    const { service, prisma, acl, audit } = build();
    prisma.product.findUnique.mockResolvedValue(productRow());
    acl.assertProductAccess.mockRejectedValue(new ForbiddenException('Acceso restringido'));

    await expect(service.update(PRODUCT_ID, baseInput(), ctx)).rejects.toBeInstanceOf(ForbiddenException);

    expect(acl.assertProductAccess).toHaveBeenCalledWith(PRODUCT_ID, ctx, 'edit_products');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('409s when another product already uses the slug (and writes nothing)', async () => {
    const { service, prisma, audit } = build();
    prisma.product.findUnique.mockResolvedValue(productRow());
    prisma.product.findFirst.mockResolvedValue({ id: 'other-product' });

    await expect(service.update(PRODUCT_ID, baseInput(), ctx)).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { catalogSlug: 'ids-e04hqhi-d', NOT: { id: PRODUCT_ID } },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('maps a unique-violation race inside the transaction to 409', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(productRow());
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(service.update(PRODUCT_ID, baseInput(), ctx)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not look up slug conflicts when the slug is cleared', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(productRow());

    await service.update(PRODUCT_ID, baseInput({ slug: null, published: false }), ctx);

    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it('refuses edits while the Lista is pending deletion', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(productRow());
    prisma.lista.findUnique.mockResolvedValue({ id: 'lista-1', deletionStatus: 'PENDING_DELETION' });

    await expect(service.update(PRODUCT_ID, baseInput(), ctx)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes an audit entry (entity Product, action update_sheet) with before and after', async () => {
    const { service, prisma, audit } = build();
    const before = productRow({ catalogName: 'Antes', catalogBadges: ['Viejo'] });
    const after = productRow({ catalogName: 'DVR AcuSense 4 canales', catalogSlug: 'ids-e04hqhi-d', catalogBadges: ['Destacado'] });
    prisma.product.findUnique.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

    const result = await service.update(PRODUCT_ID, baseInput(), ctx);

    expect(result.name).toBe('DVR AcuSense 4 canales');
    expect(audit.log).toHaveBeenCalledTimes(1);
    const entry = audit.log.mock.calls[0][0];
    expect(entry).toMatchObject({ userId: 'user-1', action: 'update_sheet', entity: 'Product', entityId: PRODUCT_ID });
    expect(entry.oldValues).toMatchObject({ name: 'Antes', badges: ['Viejo'] });
    expect(entry.newValues).toMatchObject({ name: 'DVR AcuSense 4 canales', badges: ['Destacado'] });
    expect(entry.newValues).not.toHaveProperty('updatedAt');
  });

  it('404s for an unknown product before touching anything', async () => {
    const { service, prisma, acl } = build();
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.update('nope', baseInput(), ctx)).rejects.toBeInstanceOf(NotFoundException);
    expect(acl.assertProductAccess).not.toHaveBeenCalled();
  });
});
