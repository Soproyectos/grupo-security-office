/**
 * CAT-04 `backend-activos` — subida verificada y retención de bytes.
 * Cubre: atómico store+asociación (D5), tipo REAL por firma (G1), DOCUMENT
 * con dueño, FIRMWARE diferido con motivo (E1), `deleteImage` que conserva
 * los bytes referenciados (D3) y la acción `products:write` con D5 (§4).
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProductsService } from './products.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF_BYTES = Buffer.from('%PDF-1.7 fake body');

const file = (over: Record<string, unknown> = {}) =>
  ({ buffer: PNG, mimetype: 'image/png', originalname: 'foto.png', size: PNG.length, ...over }) as never;

const ctx = { userId: 'u-1', roles: ['Admin Comercial'] };

const fullGrants = () => ({
  grantsForUser: jest.fn().mockResolvedValue([
    { sourceId: 'g-r', actionId: 'products:read', scope: 'global' },
    { sourceId: 'g-w', actionId: 'products:write', scope: 'global' },
  ]),
});

function build(grants?: { grantsForUser: jest.Mock }) {
  // ENMIENDA 2026-10-18: sin concesiones el rol ya no autoriza; el harness
  // por defecto otorga write+read (los tests de negacion pasan grants explicito).
  grants = grants ?? fullGrants();
  const tx = {
    productImage: { updateMany: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({ id: 'img-1', url: '/api/files/f-1' }) },
  };
  const prisma = {
    product: { findUnique: jest.fn().mockResolvedValue({ id: 'p-1', listaId: null }) },
    productImage: { findUnique: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const acl = { assertProductAccess: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const files = {
    store: jest.fn().mockResolvedValue({ id: 'f-1', url: '/api/files/f-1', detectedKind: 'IMAGE' }),
    release: jest.fn().mockResolvedValue({ deleted: true }),
  };
  const service = new ProductsService(
    prisma as never,
    acl as never,
    audit as never,
    files as never,
    undefined,
    grants as never,
  );
  return { service, prisma, tx, acl, audit, files, grants };
}

describe('ProductsService.uploadImage (CAT-04 D5 + G1)', () => {
  it('guarda bytes y asociación en UNA transacción, con dueño y originalName', async () => {
    const { service, prisma, tx, files } = build();
    await service.uploadImage('p-1', file(), true, ctx);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const meta = files.store.mock.calls[0][2];
    expect(meta.tx).toBe(tx);
    expect(meta.ownerProductId).toBe('p-1');
    expect(meta.originalName).toBe('foto.png');
    // Siendo principal, primero se desmarca la anterior DENTRO del tx.
    expect(tx.productImage.updateMany).toHaveBeenCalledWith({ where: { productId: 'p-1', isPrimary: true }, data: { isPrimary: false } });
    expect(tx.productImage.create).toHaveBeenCalledWith({
      data: { productId: 'p-1', url: '/api/files/f-1', alt: 'foto.png', isPrimary: true, sortOrder: 0 },
    });
  });

  it('rechaza 400 asset-type-mismatch cuando el contenido real NO es imagen (aunque el MIME lo declare)', async () => {
    const { service, files } = build();
    await expect(
      service.uploadImage('p-1', file({ buffer: Buffer.from('%PDF-1.7'), mimetype: 'image/png' }), false, ctx),
    ).rejects.toThrow(BadRequestException);
    expect(files.store).not.toHaveBeenCalled();
    try {
      await service.uploadImage('p-1', file({ buffer: Buffer.from('%PDF-1.7'), mimetype: 'image/png' }), false, ctx);
    } catch (e) {
      const res = (e as BadRequestException).getResponse() as Record<string, unknown>;
      expect(res.code).toBe('asset-type-mismatch');
      expect((res.feedback as string[])[0]).toContain('asset-type-mismatch');
    }
  });

  it('con concesiones sin products:write → 403 antes de tocar el almacén (transición D5)', async () => {
    const grants = { grantsForUser: jest.fn().mockResolvedValue([{ sourceId: 's1', actionId: 'customers:read', scope: 'global' }]) };
    const { service, files } = build(grants);
    await expect(service.uploadImage('p-1', file(), false, ctx)).rejects.toThrow(ForbiddenException);
    expect(files.store).not.toHaveBeenCalled();
  });
});

describe('ProductsService.uploadAsset (CAT-04 D5)', () => {
  it('IMAGE delega en uploadImage', async () => {
    const { service } = build();
    const r = await service.uploadAsset('p-1', 'IMAGE', file(), ctx);
    expect(r).toMatchObject({ kind: 'IMAGE' });
  });

  it('DOCUMENT: PDF real guardado con dueño; devuelve URL y registro (size, sha256, tipo)', async () => {
    const { service, files } = build();
    files.store.mockResolvedValue({ id: 'f-9', url: '/api/files/f-9', detectedKind: 'PDF' });
    const r = await service.uploadAsset(
      'p-1',
      'DOCUMENT',
      file({ buffer: PDF_BYTES, mimetype: 'application/pdf', size: PDF_BYTES.length }),
      ctx,
    );
    expect(r).toMatchObject({
      kind: 'DOCUMENT',
      id: 'f-9',
      url: '/api/files/f-9',
      asset: { sizeBytes: PDF_BYTES.length, detectedKind: 'PDF' },
    });
    expect((r as { asset: { sha256: string } }).asset.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(files.store.mock.calls[0][2].ownerProductId).toBe('p-1');
  });

  it('DOCUMENT: imagen declarada como application/pdf → 400 asset-type-mismatch', async () => {
    const { service, files } = build();
    await expect(service.uploadAsset('p-1', 'DOCUMENT', file({ buffer: PNG, mimetype: 'application/pdf' }), ctx)).rejects.toThrow(
      BadRequestException,
    );
    expect(files.store).not.toHaveBeenCalled();
  });

  it('FIRMWARE: 400 con motivo explícito (alcance diferido E1 — insumo externo)', async () => {
    const { service, files } = build();
    try {
      await service.uploadAsset('p-1', 'FIRMWARE', file(), ctx);
      throw new Error('no lanzó');
    } catch (e) {
      const res = (e as BadRequestException).getResponse() as Record<string, unknown>;
      expect(res.code).toBe('firmware-upload-deferred');
      expect((res.feedback as string[])[0]).toContain('firmware-upload-deferred');
    }
    expect(files.store).not.toHaveBeenCalled();
  });

  it('excede 16MB → 400 (documentos)', async () => {
    const { service, files } = build();
    await expect(
      service.uploadAsset('p-1', 'DOCUMENT', file({ buffer: PDF_BYTES, mimetype: 'application/pdf', size: 17 * 1024 * 1024 }), ctx),
    ).rejects.toThrow(BadRequestException);
    expect(files.store).not.toHaveBeenCalled();
  });
});

describe('ProductsService.deleteImage (CAT-04 D3: retención de bytes)', () => {
  const img = { id: 'img-1', productId: 'p-1', url: '/api/files/f-1' };

  it('borra la fila y los bytes SOLO si no quedan referencias (release)', async () => {
    const { service, prisma, files } = build();
    prisma.productImage.findUnique.mockResolvedValue(img);
    files.release.mockResolvedValue({ deleted: true });

    const r = await service.deleteImage('img-1', ctx);

    expect(files.release).toHaveBeenCalledWith('/api/files/f-1', { userId: 'u-1', excludeImageId: 'img-1' });
    expect(prisma.productImage.delete).toHaveBeenCalledWith({ where: { id: 'img-1' } });
    expect(r).toEqual({ message: 'Imagen eliminada exitosamente', retained: false });
  });

  it('si una revisión u otro activo referencia el URL, la fila se borra pero los bytes SE RETIENEN (nunca rompe lo publicado)', async () => {
    const { service, prisma, files } = build();
    prisma.productImage.findUnique.mockResolvedValue(img);
    files.release.mockResolvedValue({ deleted: false, retainedReason: 'referenced' });

    const r = await service.deleteImage('img-1', ctx);

    expect(prisma.productImage.delete).toHaveBeenCalled();
    expect(r.retained).toBe(true);
    expect(r.message).toContain('se conservan');
  });
});
