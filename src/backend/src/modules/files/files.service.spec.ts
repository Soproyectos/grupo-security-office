import { createPrismaMock } from '../../__test__/mocks/prisma.mock';

const mockPrisma = createPrismaMock();

jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => mockPrisma),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { FilesService } from './files.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('FilesService', () => {
  let service: FilesService;

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [FilesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  describe('store', () => {
    it('debe guardar los bytes con su registro de activos (CAT-04 D1) y devolver la URL', async () => {
      const bytes = Buffer.from('bytes');
      mockPrisma.uploadedFile.create.mockResolvedValue({ id: 'file-1', detectedKind: 'UNKNOWN' });

      const result = await service.store(bytes, 'image/png', { originalName: 'logo.png', ownerProductId: 'p-1' });

      expect(result).toEqual({ id: 'file-1', url: '/api/files/file-1', detectedKind: 'UNKNOWN' });
      const { data } = mockPrisma.uploadedFile.create.mock.calls[0][0];
      expect(data).toMatchObject({
        mimeType: 'image/png',
        sizeBytes: bytes.length,
        originalName: 'logo.png',
        ownerProductId: 'p-1',
        visibility: 'PUBLIC',
      });
      // sha256 hex de 'bytes' y detectedKind calculados SIEMPRE por el servidor.
      expect(data.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof data.detectedKind).toBe('string');
    });
  });

  describe('get', () => {
    it('debe devolver los bytes y el mimeType si el archivo existe', async () => {
      mockPrisma.uploadedFile.findUnique.mockResolvedValue({
        id: 'file-1',
        mimeType: 'image/png',
        data: Buffer.from('bytes'),
        createdAt: new Date(),
      });

      const result = await service.get('file-1');

      expect(result).toEqual({ data: Buffer.from('bytes'), mimeType: 'image/png' });
    });

    it('debe devolver null si el archivo no existe', async () => {
      mockPrisma.uploadedFile.findUnique.mockResolvedValue(null);

      const result = await service.get('no-existe');

      expect(result).toBeNull();
    });
  });

  describe('release (CAT-04 D3: no borra bytes referenciados)', () => {
    const zeroRefs = () => {
      mockPrisma.productImage.count.mockResolvedValue(0);
      mockPrisma.productCatalogResource.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValue([{ count: 0n }]);
    };

    it('debe borrar el archivo solo cuando NO queda ninguna referencia', async () => {
      zeroRefs();
      mockPrisma.uploadedFile.delete.mockResolvedValue({});

      const result = await service.release('/api/files/file-1');

      expect(result).toEqual({ deleted: true });
      expect(mockPrisma.uploadedFile.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
    });

    it('RETIENE los bytes si una imagen viva los referencia', async () => {
      zeroRefs();
      mockPrisma.productImage.count.mockResolvedValue(1);

      const result = await service.release('/api/files/file-1');

      expect(result.deleted).toBe(false);
      expect(result.retainedReason).toBe('referenced');
      expect(mockPrisma.uploadedFile.delete).not.toHaveBeenCalled();
    });

    it('RETIENE si el contenido de una revisión (histórica o pública) los referencia', async () => {
      zeroRefs();
      // Primera consulta = products (sin refs); segunda = revisions (1 ref).
      mockPrisma.$queryRaw.mockReset();
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ count: 0n }])
        .mockResolvedValueOnce([{ count: 1n }]);

      const result = await service.release('/api/files/file-1');

      expect(result.deleted).toBe(false);
      expect(mockPrisma.uploadedFile.delete).not.toHaveBeenCalled();
    });

    it('no debe hacer nada si la URL es externa (no gestionada por este almacén)', async () => {
      const result = await service.release('https://example.com/logo.png');
      expect(result.deleted).toBe(false);
      expect(result.retainedReason).toBe('external-url');
      expect(mockPrisma.uploadedFile.delete).not.toHaveBeenCalled();
    });

    it('no debe lanzar si el archivo ya no existe en BD', async () => {
      zeroRefs();
      mockPrisma.uploadedFile.delete.mockRejectedValue(new Error('Record not found'));

      await expect(service.release('/api/files/no-existe')).resolves.toEqual({ deleted: false, retainedReason: 'not-found' });
    });

    it('deleteByUrl conserva la firma antigua (delegación en release)', async () => {
      zeroRefs();
      mockPrisma.uploadedFile.delete.mockResolvedValue({});
      await expect(service.deleteByUrl('/api/files/file-1')).resolves.toBeUndefined();
      expect(mockPrisma.uploadedFile.delete).toHaveBeenCalled();
    });

    it('excludeImageId saca la propia fila del recuento (borrar SU imagen no se auto-retiene)', async () => {
      zeroRefs();
      mockPrisma.uploadedFile.delete.mockResolvedValue({});
      await service.release('/api/files/file-1', { excludeImageId: 'img-9' });
      expect(mockPrisma.productImage.count).toHaveBeenCalledWith({
        where: { url: '/api/files/file-1', id: { not: 'img-9' } },
      });
    });
  });
});
