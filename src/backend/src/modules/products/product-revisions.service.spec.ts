/**
 * CAT-02 backend-borradores — borradores versionados con OCC
 * (ficha acceptance: «Editar no cambia publicado; dos editores no se pisan.»)
 *
 * RED observado: `./product-revisions.service` aún no existe.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductRevisionsService } from './product-revisions.service';

describe('ProductRevisionsService — borradores versionados', () => {
  let prisma: any;
  let acl: { assertProductAccess: jest.Mock; isListasAdmin: jest.Mock };
  let service: ProductRevisionsService;
  const ctx = { userId: 'u-1', roles: ['Admin Comercial'] };

  const publishedRev = {
    id: 'rev-pub',
    productId: 'p-1',
    status: 'PUBLICADA',
    version: 1,
    content: { name: 'Publicado', sku: 'SKU-1' },
    notes: null,
    publishedAt: new Date('2026-10-01T00:00:00Z'),
  };

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
      productImage: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      // CAT-04 (D2): buildMediaSnapshot lee también los recursos de ficha.
      productCatalogResource: { findMany: jest.fn().mockResolvedValue([]) },
      productRevision: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };
    prisma.product.findUnique.mockResolvedValue({ id: 'p-1', listaId: 'L1', sku: 'SKU-1' });
    acl = {
      assertProductAccess: jest.fn().mockResolvedValue(undefined),
      isListasAdmin: jest.fn().mockReturnValue(true),
    };
    // Strict access model: without grants every action is denied, so the harness grants both.
    const grants = {
      grantsForUser: jest.fn().mockResolvedValue([
        { sourceId: 's-r', actionId: 'products:read', scope: 'global' },
        { sourceId: 's-w', actionId: 'products:write', scope: 'global' },
      ]),
    };
    service = new ProductRevisionsService(prisma, acl as any, grants as any);
  });

  it('guardar borrador crea la revisión SIN_REVISAR v1 y NO toca el producto (activos protegidos)', async () => {
    prisma.productRevision.findFirst.mockResolvedValue(null); // no hay draft previo
    prisma.productRevision.create.mockResolvedValue({
      id: 'rev-1', productId: 'p-1', status: 'SIN_REVISAR', version: 1,
      content: { name: 'Nuevo nombre' }, notes: 'cambio menor',
    });
    const result = await service.saveDraft(
      'p-1',
      { content: { name: 'Nuevo nombre' }, notes: 'cambio menor' },
      ctx,
    );
    // Producto intacto: ni update ni delete sobre product/productImage
    expect(prisma.product.update).not.toHaveBeenCalled();
    // La revisión PUBLICADA no se modifica
    expect(prisma.productRevision.update).not.toHaveBeenCalled();
    expect(prisma.productRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'p-1',
          status: 'SIN_REVISAR',
          version: 1,
          createdById: 'u-1',
        }),
      }),
    );
    expect(result.version).toBe(1);
  });

  it('reeditar actualiza el borrador y sube la versión sin tocar la PUBLICADA', async () => {
    const draft = { id: 'rev-d', productId: 'p-1', status: 'SIN_REVISAR', version: 2, content: {}, notes: null };
    prisma.productRevision.findFirst.mockResolvedValue(draft); // ya hay borrador
    prisma.productRevision.findMany.mockResolvedValue([draft, publishedRev]); // latest = v2 del borrador
    prisma.productRevision.update.mockResolvedValue({ ...draft, version: 3, content: { name: 'v3' } });
    const result = await service.saveDraft('p-1', { content: { name: 'v3' }, expectedVersion: 2 }, ctx);
    expect(prisma.productRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rev-d' },
        // CAT-04 (D2): el contenido lleva además las listas de medios del
        // servidor (images/catalogResources), por eso se usa objectContaining.
        data: expect.objectContaining({ version: 3, content: expect.objectContaining({ name: 'v3' }) }),
      }),
    );
    expect(prisma.productRevision.create).not.toHaveBeenCalled();
    expect(result.version).toBe(3);
    // Nunca se escribe sobre la PUBLICADA
    const updateCalls = prisma.productRevision.update.mock.calls.map((c: any[]) => c[0]?.where?.id);
    expect(updateCalls).not.toContain('rev-pub');
  });

  it('dos editores no se pisan: expectedVersion viejo → 409 y el contenido del ganador se conserva', async () => {
    const draft = { id: 'rev-d', productId: 'p-1', status: 'SIN_REVISAR', version: 3, content: { name: 'del editor A' } };
    prisma.productRevision.findFirst.mockResolvedValue(draft);
    prisma.productRevision.findMany.mockResolvedValue([draft, publishedRev]); // latest v3
    await expect(
      service.saveDraft('p-1', { content: { name: 'del editor B' }, expectedVersion: 2 }, ctx),
    ).rejects.toThrow(ConflictException);
    expect(prisma.productRevision.update).not.toHaveBeenCalled();
    expect(prisma.productRevision.create).not.toHaveBeenCalled();
  });

  it('expectedVersion ausente: la última versión gana (optimista opcional, documentado)', async () => {
    prisma.productRevision.findFirst.mockResolvedValue(null);
    prisma.productRevision.findMany.mockResolvedValue([publishedRev]);
    prisma.productRevision.create.mockResolvedValue({ id: 'r2', version: 2 });
    await service.saveDraft('p-1', { content: { name: 'sin base' } }, ctx);
    expect(prisma.productRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 2 }) }),
    );
  });

  it('producto inexistente → 404 sin escrituras', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.saveDraft('missing', { content: {} }, ctx)).rejects.toThrow(NotFoundException);
    expect(prisma.productRevision.create).not.toHaveBeenCalled();
    expect(prisma.productRevision.update).not.toHaveBeenCalled();
  });

  it('lista de revisiones ordenada descendente sin el contenido pesado', async () => {
    prisma.productRevision.findMany.mockResolvedValue([
      { id: 'r2', version: 2, status: 'SIN_REVISAR', notes: null, publishedAt: null, createdAt: new Date('2026-10-05T00:00:00Z') },
      { id: 'r1', version: 1, status: 'PUBLICADA', notes: null, publishedAt: new Date('2026-10-01T00:00:00Z'), createdAt: new Date('2026-10-01T00:00:00Z') },
    ]);
    const rows = await service.listRevisions('p-1', ctx);
    expect(rows.map((r: any) => r.version)).toEqual([2, 1]);
    expect(rows[0]).not.toHaveProperty('content');
    expect(prisma.productRevision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.not.objectContaining({ content: true }) }),
    );
  });

  it('ACL: la escritura del borrador exige acceso de edición al producto', async () => {
    prisma.productRevision.findFirst.mockResolvedValue(null);
    prisma.productRevision.findMany.mockResolvedValue([]);
    prisma.productRevision.create.mockResolvedValue({ id: 'r1', version: 1 });
    await service.saveDraft('p-1', { content: {} }, ctx);
    expect(acl.assertProductAccess).toHaveBeenCalledWith('p-1', ctx, 'edit_products');
  });
});

// ─── CAT-02 backend-alternativas — edición legacy enruta a revisión pendiente ───
describe('ProductRevisionsService.markPendingFromLive (rutas legacy)', () => {
  it('marca REVISION_PENDIENTE con el contenido vivo SIN tocar la PUBLICADA (RED: método ausente)', async () => {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p-1', sku: 'SKU-V', name: 'Vivo', description: 'd', technicalSpecs: null, documents: null,
          catalogName: 'CatV', catalogModel: null, catalogBrand: null,
          categoryId: 'c1', brandId: 'b1', listaId: 'L1', updatedAt: new Date('2026-10-16T00:00:00Z'),
        }),
      },
      productRevision: {
        findMany: jest.fn().mockResolvedValue([
          { version: 3 }, // PUBLICADA v3 + un borrador v2 → latest 3
        ]),
        create: jest.fn().mockResolvedValue({ id: 'rev-p', status: 'REVISION_PENDIENTE', version: 4 }),
        update: jest.fn(),
      },
      // CAT-04 (D2): buildMediaSnapshot foto imágenes y recursos vivos.
      productImage: { findMany: jest.fn().mockResolvedValue([{ id: 'i1', url: '/api/files/i1', alt: null, isPrimary: true, type: 'PRINCIPAL', sortOrder: 0 }]) },
      productCatalogResource: { findMany: jest.fn().mockResolvedValue([{ id: 'r1', kind: 'DATASHEET', title: 'DS', language: 'es', url: '/api/files/r1', fileName: null, version: null, region: null, requiresLicense: false, position: 0 }]) },
    } as any;
    const service = new ProductRevisionsService(prisma, { assertProductAccess: jest.fn() } as any);
    const rev = await service.markPendingFromLive('p-1');
    expect(prisma.productRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productId: 'p-1', status: 'REVISION_PENDIENTE', version: 4 }),
      }),
    );
    const created = prisma.productRevision.create.mock.calls[0][0].data;
    expect(created.content).toMatchObject({ name: 'Vivo', sku: 'SKU-V', catalogName: 'CatV' });
    // CAT-04 (D2): el snapshot legacy también foto los medios vivos.
    expect(created.content).toMatchObject({
      images: [{ id: 'i1', url: '/api/files/i1' }],
      catalogResources: [{ id: 'r1', url: '/api/files/r1' }],
    });
    expect(String(created.notes)).toContain('legacy');
    // jamás escribe sobre revisiones existentes
    expect(prisma.productRevision.update).not.toHaveBeenCalled();
    expect(rev.status).toBe('REVISION_PENDIENTE');
  });

  it('producto inexistente → null sin escrituras', async () => {
    const prisma = {
      product: { findUnique: jest.fn().mockResolvedValue(null) },
      productRevision: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    } as any;
    const service = new ProductRevisionsService(prisma, { assertProductAccess: jest.fn() } as any);
    await expect(service.markPendingFromLive('missing')).resolves.toBeNull();
    expect(prisma.productRevision.create).not.toHaveBeenCalled();
  });
});
