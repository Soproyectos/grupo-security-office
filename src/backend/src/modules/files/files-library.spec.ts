import { ServiceUnavailableException } from '@nestjs/common';
import { FilesService } from './files.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { LibraryAuditService } from '../library-audit/library-audit.service';

describe('files dedicated ownership and write boundary', () => {
  let library: any;
  let client: any;
  let audit: any;
  let files: FilesService;
  let legacy: any;
  const bytes = Buffer.from('synthetic-file');
  beforeEach(() => {
    client = {
      uploadedFile: { create: jest.fn().mockResolvedValue({ id: 'f1', detectedKind: 'UNKNOWN' }), findUnique: jest.fn(), delete: jest.fn().mockResolvedValue({}), updateMany: jest.fn() },
      productImage: { count: jest.fn().mockResolvedValue(0) }, productCatalogResource: { count: jest.fn().mockResolvedValue(0) },
      brand: { count: jest.fn().mockResolvedValue(0) }, product: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]),
    };
    const active = new WeakSet<object>();
    library = { config: { mode: 'dedicated' }, client, assertWritesAllowed: jest.fn(), ownsTransaction: (tx: object) => active.has(tx),
      writeTransaction: jest.fn(async (work) => { active.add(client); try { return await work(client); } finally { active.delete(client); } }) };
    audit = { append: jest.fn() };
    legacy = { uploadedFile: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() } };
    files = new FilesService(legacy as PrismaService, undefined, library as BibliotecaPrismaService, audit as LibraryAuditService);
  });
  it('stores bytes/metadata/event in library only', async () => {
    await files.store(bytes, 'image/png', { actor: { id: 'actor', name: 'Fixture' } });
    expect(client.uploadedFile.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ data: new Uint8Array(bytes), sizeBytes: bytes.length, visibility: 'PUBLIC', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }) }));
    expect(audit.append).toHaveBeenCalledWith(client, expect.objectContaining({ action: 'FILE_ADDED', actor: { id: 'actor', name: 'Fixture' } }));
    expect(legacy.uploadedFile.create).not.toHaveBeenCalled();
  });
  it('rejects an operational/foreign transaction before any write', async () => {
    await expect(files.store(bytes, 'image/png', { tx: legacy })).rejects.toMatchObject({ response: { code: 'LIBRARY_FOREIGN_TRANSACTION' } });
    expect(client.uploadedFile.create).not.toHaveBeenCalled();
    expect(legacy.uploadedFile.create).not.toHaveBeenCalled();
  });
  it('accepts only an active transaction owned by the facade', async () => {
    await library.writeTransaction(async (tx: any) => files.store(bytes, 'image/png', { tx }));
    await expect(files.store(bytes, 'image/png', { tx: client })).rejects.toMatchObject({ response: { code: 'LIBRARY_FOREIGN_TRANSACTION' } });
    expect(client.uploadedFile.create).toHaveBeenCalledTimes(1);
  });
  it('reads only selected library and returns actual Buffer bytes', async () => {
    client.uploadedFile.findUnique.mockResolvedValue({ data: new Uint8Array(bytes), mimeType: 'image/png' });
    const result = await files.get('f1');
    expect(Buffer.isBuffer(result?.data)).toBe(true);
    expect(result?.data).toEqual(bytes);
    expect(legacy.uploadedFile.findUnique).not.toHaveBeenCalled();
  });
  it.each(['brand', 'product'])('retains bytes referenced by %s logo/catalog image', async (owner) => {
    client[owner].count.mockResolvedValue(1);
    expect(await files.release('/api/files/f1')).toEqual({ deleted: false, retainedReason: 'referenced' });
    expect(client.uploadedFile.delete).not.toHaveBeenCalled();
    expect(audit.append).toHaveBeenCalledWith(client, expect.objectContaining({ action: 'FILE_RETAINED' }));
  });
  it('only P2025 means not found; unexpected deletion errors propagate', async () => {
    client.uploadedFile.delete.mockRejectedValueOnce({ code: 'P2025' });
    expect(await files.release('/api/files/f1')).toEqual({ deleted: false, retainedReason: 'not-found' });
    client.uploadedFile.delete.mockRejectedValueOnce(new Error('synthetic storage failure'));
    await expect(files.release('/api/files/f1')).rejects.toThrow('synthetic storage failure');
  });
  it('audit failure propagates through the same enclosing write transaction', async () => {
    audit.append.mockRejectedValue(new Error('synthetic audit failure'));
    await expect(files.store(bytes, 'image/png')).rejects.toThrow('synthetic audit failure');
    expect(library.writeTransaction).toHaveBeenCalledTimes(1);
  });
  it('freeze rejects mutations while keeping reads available', async () => {
    library.assertWritesAllowed.mockImplementation(() => { throw new ServiceUnavailableException({ code: 'LIBRARY_WRITES_FROZEN' }); });
    await expect(files.store(bytes, 'image/png')).rejects.toMatchObject({ response: { code: 'LIBRARY_WRITES_FROZEN' } });
    expect(client.uploadedFile.create).not.toHaveBeenCalled();
    client.uploadedFile.findUnique.mockResolvedValue(null);
    await expect(files.get('missing')).resolves.toBeNull();
  });
});
