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
  catalogManufacturerRefs: [],
  catalogInternalNotes: null,
  sheetVersion: 0,
  catalogSpecGroups: [],
  catalogResources: [],
  ...over,
});

const fullGrants = () => ({
  grantsForUser: jest.fn().mockResolvedValue([
    { sourceId: 's-r', actionId: 'products:read', scope: 'global' },
    { sourceId: 's-w', actionId: 'products:write', scope: 'global' },
    { sourceId: 's-n', actionId: 'products:notes', scope: 'global' },
  ]),
});

function build(grants?: { grantsForUser: jest.Mock }, revisions?: { markPendingFromLive: jest.Mock }) {
  // ENMIENDA 2026-10-18: sin concesiones ya no se permite por rol; el harness
  // por defecto otorga las concesiones completas (camino 'grant' estricto).
  grants = grants ?? fullGrants();
  const tx = {
    product: { update: jest.fn().mockResolvedValue({}) },
    productCatalogSpecGroup: { deleteMany: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({}) },
    productCatalogResource: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
    // CAT-04 (D4): marcado de archivos con licencia dentro de la transacción.
    uploadedFile: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    product: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    lista: { findUnique: jest.fn().mockResolvedValue({ id: 'lista-1', deletionStatus: null }) },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const acl = { assertProductAccess: jest.fn().mockResolvedValue({ listaId: 'lista-1' }) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ProductSheetService(
    prisma as never,
    acl as never,
    audit as never,
    (grants as never) ?? undefined,
    (revisions as never) ?? undefined,
  );
  return { service, prisma, tx, acl, audit, grants, revisions };
}

/** Concesiones vigentes (CAT-03 §4): activan la capa de acciones del catálogo.
 * Incluye la dependencia (`products:read`) porque BASE-02 §5.3 no la hereda. */
const grantsOf = (actionIds: string[]) => ({
  grantsForUser: jest.fn().mockResolvedValue(
    actionIds.map((actionId, index) => ({ sourceId: `src-${index}`, actionId, scope: 'global' })),
  ),
});

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
    const loadCall = prisma.product.findUnique.mock.calls.find(([arg]: [{ include?: unknown }]) => arg.include);
    expect(loadCall[0].include.catalogSpecGroups.orderBy).toEqual({ position: 'asc' });
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
    // 1st call: ownership/ACL select in authorizeProduct; 2nd: load(before); 3rd: reload(after).
    prisma.product.findUnique.mockResolvedValueOnce(before).mockResolvedValueOnce(before).mockResolvedValueOnce(after);

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

describe('CAT-03 · control de concurrencia de la ficha (H2, OCC)', () => {
  it('409 expone la versión vigente y no escribe nada cuando expectedVersion está atrasada', async () => {
    const { service, prisma, audit } = build();
    prisma.product.findUnique.mockResolvedValue(productRow({ sheetVersion: 3 }));

    await expect(service.update(PRODUCT_ID, baseInput({ expectedVersion: 2 }), ctx)).rejects.toMatchObject({
      response: {
        code: 'sheet-version-conflict',
        currentVersion: 3,
        feedback: ['sheet-version-conflict: la versión vigente de la ficha es 3'],
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('escribe e incrementa la versión cuando expectedVersion coincide', async () => {
    const { service, prisma, tx } = build();
    prisma.product.findUnique.mockResolvedValue(productRow({ sheetVersion: 3 }));

    await service.update(PRODUCT_ID, baseInput({ expectedVersion: 3 }), ctx);

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID },
      data: expect.objectContaining({ sheetVersion: { increment: 1 } }),
    });
  });

  it('sigue aceptando guardados sin expectedVersion (clientes previos)', async () => {
    const { service, prisma, tx } = build();
    prisma.product.findUnique.mockResolvedValue(productRow({ sheetVersion: 7 }));

    await service.update(PRODUCT_ID, baseInput(), ctx);

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID },
      data: expect.objectContaining({ sheetVersion: { increment: 1 } }),
    });
  });
});

describe('CAT-03 · notas internas (H1), identificadores (H4) y acciones (H3)', () => {
  it('get devuelve la versión vigente; las notas solo con products:notes', async () => {
    const row = productRow({ sheetVersion: 4, catalogInternalNotes: 'Privada', catalogManufacturerRefs: ['PN-9'] });

    const legacy = build(); // sin concesiones → capa ACL/rol (D5)
    legacy.prisma.product.findUnique.mockResolvedValue(row);
    const legacyView = await legacy.service.get(PRODUCT_ID, ctx);
    expect(legacyView).toMatchObject({ version: 4, internalNotes: 'Privada', manufacturerRefs: ['PN-9'], canSeeInternalNotes: true });

    const allowed = build(grantsOf(['products:read', 'products:notes']));
    allowed.prisma.product.findUnique.mockResolvedValue(row);
    const allowedView = await allowed.service.get(PRODUCT_ID, ctx);
    expect(allowedView.internalNotes).toBe('Privada');
    expect(allowedView.canSeeInternalNotes).toBe(true);

    const denied = build(grantsOf(['products:read']));
    denied.prisma.product.findUnique.mockResolvedValue(row);
    const deniedView = await denied.service.get(PRODUCT_ID, ctx);
    expect(deniedView.internalNotes).toBeNull();
    // La UI honesta: el flag dice que NO puede ver/editar notas (aunque no
    // existieran — null por sí solo no distingue).
    expect(deniedView.canSeeInternalNotes).toBe(false);
    expect(deniedView.version).toBe(4);
    expect(deniedView.manufacturerRefs).toEqual(['PN-9']);
  });

  it('ENMIENDA 2026-10-18: sin concesiones un rol normal es 403; Super Admin es la unica excepcion', async () => {
    const { service, prisma } = build(grantsOf([]));
    prisma.product.findUnique.mockResolvedValue(productRow());
    await expect(service.get(PRODUCT_ID, ctx)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update(PRODUCT_ID, baseInput(), ctx)).rejects.toBeInstanceOf(ForbiddenException);
    const sa = { userId: 'u-1', roles: ['Super Admin'] };
    const view = await service.get(PRODUCT_ID, sa);
    expect(view.internalNotes).toBe(productRow().catalogInternalNotes);
  });

  it('ENMIENDA: retirar la ultima concesion (misma identidad) deniega la siguiente peticion', async () => {
    const g = grantsOf(['products:read', 'products:write', 'products:notes']);
    const { service, prisma, tx } = build(g);
    prisma.product.findUnique.mockResolvedValue(productRow());
    await service.update(PRODUCT_ID, baseInput({ internalNotes: 'ok' }), ctx);
    expect(tx.product.update).toHaveBeenCalled();
    g.grantsForUser.mockResolvedValue([]); // revocacion total; mismo JWT
    tx.product.update.mockClear();
    await expect(service.update(PRODUCT_ID, baseInput(), ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('sin concesiones (legado derogado) — super admin con cero grants escribe por excepcion explicita', async () => {
    const { service, prisma, tx } = build(grantsOf([]));
    prisma.product.findUnique.mockResolvedValue(productRow());

    // Excepcion EXPLICITA de Super Admin (unica via sin concesiones).
    await service.update(PRODUCT_ID, baseInput({ internalNotes: '  Nota interna  ' }), { userId: 'u-1', roles: ['Super Admin'] });

    expect(tx.product.update.mock.calls[0][0].data.catalogInternalNotes).toBe('Nota interna');
  });

  it('con concesiones pero sin products:notes conserva las notas y no las devuelve (ni en auditoría)', async () => {
    const { service, prisma, tx, audit } = build(grantsOf(['products:read', 'products:write']));
    prisma.product.findUnique.mockResolvedValue(productRow({ catalogInternalNotes: 'Secreta vigente' }));

    const view = await service.update(PRODUCT_ID, baseInput({ internalNotes: 'Intento de cambio' }), ctx);

    expect(tx.product.update.mock.calls[0][0].data.catalogInternalNotes).toBe('Secreta vigente');
    expect(view.internalNotes).toBeNull();
    const entry = audit.log.mock.calls[0][0];
    expect(entry.newValues.internalNotes).toBeNull();
    expect(entry.oldValues.internalNotes).toBeNull();
  });

  it('con products:notes escribe y devuelve las notas', async () => {
    const { service, prisma, tx } = build(grantsOf(['products:read', 'products:write', 'products:notes']));
    prisma.product
      .findUnique
      .mockResolvedValueOnce(productRow())
      .mockResolvedValueOnce(productRow())
      .mockResolvedValueOnce(productRow({ catalogInternalNotes: 'Nota interna' }));

    const view = await service.update(PRODUCT_ID, baseInput({ internalNotes: 'Nota interna' }), ctx);

    expect(tx.product.update.mock.calls[0][0].data.catalogInternalNotes).toBe('Nota interna');
    expect(view.internalNotes).toBe('Nota interna');
  });

  it('con products:notes, omitir el campo CONSERVA las notas vigentes (omitir ≠ borrar)', async () => {
    const { service, prisma, tx } = build(grantsOf(['products:read', 'products:write', 'products:notes']));
    prisma.product.findUnique.mockResolvedValue(productRow({ catalogInternalNotes: 'Vigente' }));

    await service.update(PRODUCT_ID, baseInput(), ctx);

    expect(tx.product.update.mock.calls[0][0].data.catalogInternalNotes).toBe('Vigente');
  });

  it('con products:notes, null explícito SÍ borra las notas', async () => {
    const { service, prisma, tx } = build(grantsOf(['products:read', 'products:write', 'products:notes']));
    prisma.product.findUnique.mockResolvedValue(productRow({ catalogInternalNotes: 'Vigente' }));

    await service.update(PRODUCT_ID, baseInput({ internalNotes: null }), ctx);

    expect(tx.product.update.mock.calls[0][0].data.catalogInternalNotes).toBeNull();
  });

  it('CAT-03 H5: guardar la ficha marca revisión pendiente (mecanismo CAT-02, regla 5)', async () => {
    const revisions = { markPendingFromLive: jest.fn().mockResolvedValue({ id: 'rev-1' }) };
    const { service, prisma, audit } = build(undefined, revisions);
    prisma.product.findUnique.mockResolvedValue(productRow());

    await service.update(PRODUCT_ID, baseInput(), ctx);

    // Primero la escritura/auditoría; la marca de pendiente no publica nada.
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(revisions.markPendingFromLive).toHaveBeenCalledWith(PRODUCT_ID);
  });

  it('CAT-03 H5: un 409 de OCC NO marca revisión pendiente (no hubo cambio)', async () => {
    const revisions = { markPendingFromLive: jest.fn().mockResolvedValue({ id: 'rev-1' }) };
    const { service, prisma } = build(undefined, revisions);
    prisma.product.findUnique.mockResolvedValue(productRow({ sheetVersion: 2 }));

    await expect(service.update(PRODUCT_ID, baseInput({ expectedVersion: 1 }), ctx)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(revisions.markPendingFromLive).not.toHaveBeenCalled();
  });

  it('CAT-03 H5: sin el servicio de revisiones (construcción de 3/4 args) sigue guardando', async () => {
    const { service, prisma, tx } = build();
    prisma.product.findUnique.mockResolvedValue(productRow());

    await service.update(PRODUCT_ID, baseInput(), ctx);

    expect(tx.product.update).toHaveBeenCalled();
  });

  it('guarda y devuelve los identificadores del fabricante (H4), deduplicados', async () => {
    const { service, prisma, tx } = build();
    prisma.product
      .findUnique
      .mockResolvedValueOnce(productRow())
      .mockResolvedValueOnce(productRow())
      .mockResolvedValueOnce(productRow({ catalogManufacturerRefs: ['PN-123', 'EAN-456'] }));

    const view = await service.update(PRODUCT_ID, baseInput({ manufacturerRefs: ['PN-123', 'EAN-456', 'PN-123'] }), ctx);

    expect(tx.product.update.mock.calls[0][0].data.catalogManufacturerRefs).toEqual(['PN-123', 'EAN-456']);
    expect(view.manufacturerRefs).toEqual(['PN-123', 'EAN-456']);
  });

  it('update 403 sin products:write cuando el usuario tiene concesiones (y no escribe)', async () => {
    const { service, prisma, acl, audit } = build(grantsOf(['products:read']));
    prisma.product.findUnique.mockResolvedValue(productRow());

    await expect(service.update(PRODUCT_ID, baseInput(), ctx)).rejects.toBeInstanceOf(ForbiddenException);

    expect(acl.assertProductAccess).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('get 403 sin products:read cuando el usuario tiene concesiones de otra acción', async () => {
    const { service, prisma } = build(grantsOf(['products:write']));
    prisma.product.findUnique.mockResolvedValue(productRow());

    await expect(service.get(PRODUCT_ID, ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('CAT-04 · recursos con licencia como medio privado (D4)', () => {
  it('recurso con licencia marca su archivo PRIVATE con dueño; el que la pierde vuelve a PUBLIC', async () => {
    const { service, prisma, tx } = build();
    prisma.product.findUnique.mockResolvedValue(productRow());
    // f-1 queda con licencia; f-2 estaba PRIVATE y ya no tiene licencia.
    tx.uploadedFile.findMany.mockResolvedValue([{ id: 'f-2' }]);

    const licensed = {
      kind: 'DATASHEET' as const,
      title: 'DS',
      language: 'es',
      url: '/api/files/f-1',
      fileName: null,
      version: null,
      region: null,
      requiresLicense: true,
    };
    await service.update(PRODUCT_ID, baseInput({ resources: [licensed] }), ctx);

    expect(tx.uploadedFile.updateMany).toHaveBeenCalledWith({
      where: { id: 'f-1', OR: [{ ownerProductId: null }, { ownerProductId: PRODUCT_ID }] },
      data: { visibility: 'PRIVATE', ownerProductId: PRODUCT_ID },
    });
    expect(tx.uploadedFile.update).toHaveBeenCalledWith({ where: { id: 'f-2' }, data: { visibility: 'PUBLIC' } });
  });

  it('URL externo con licencia jamás toca el almacén propio (solo /api/files/…)', async () => {
    const { service, prisma, tx } = build();
    prisma.product.findUnique.mockResolvedValue(productRow());
    tx.uploadedFile.findMany.mockResolvedValue([]);

    await service.update(
      PRODUCT_ID,
      baseInput({
        resources: [
          { kind: 'FIRMWARE' as const, title: 'FW', language: 'es', url: 'https://externo.test/fw.bin', fileName: null, version: null, region: null, requiresLicense: true },
        ],
      }),
      ctx,
    );

    expect(tx.uploadedFile.updateMany).not.toHaveBeenCalled();
  });
});
