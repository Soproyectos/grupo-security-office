import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AclService } from '../../common/acl/acl.service';
import { BibliotecaPrismaService } from '../../prisma/biblioteca-prisma.service';
import { LibraryAuditService } from '../library-audit/library-audit.service';
import { LibraryReviewService } from './library-review.service';

describe('LibraryReviewService', () => {
  const ctx = { userId: 'actor-fixture', name: 'Actor fixture', roles: ['Admin Comercial'] };
  const input = { gapKey: 'datasheet', status: 'NO_ENCONTRADO', severity: 'AVISO', expectedOpenId: null };
  const evidenceInput = { fieldKey: 'catalog_name', level: 'VERIFICADO', sourceKind: 'FABRICANTE', sourceUrl: 'https://example.invalid/source', expectedId: null };
  let service: LibraryReviewService;
  let tx: any;
  let library: any;
  let acl: any;
  let audit: any;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'p' }]),
      productGap: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'gap-new', status: input.status, severity: 'AVISO' }), update: jest.fn() },
      fieldEvidence: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), delete: jest.fn(), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'e-new', ...data })) },
    };
    library = { config: { mode: 'dedicated' }, client: tx, writeTransaction: jest.fn((work) => work(tx)) };
    acl = { assertProductAccess: jest.fn().mockResolvedValue({ listaId: 'l' }) };
    audit = { append: jest.fn().mockResolvedValue({}) };
    service = new LibraryReviewService(library as BibliotecaPrismaService, acl as AclService, audit as LibraryAuditService);
  });

  it('legacy does not query absent tables or grant access', async () => {
    library.config.mode = 'legacy';
    await expect(service.review('p', ctx)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(acl.assertProductAccess).not.toHaveBeenCalled();
    expect(tx.productGap.findMany).not.toHaveBeenCalled();
  });
  it('read obeys ACL and omits costs', async () => {
    const result = await service.review('p', ctx);
    expect(acl.assertProductAccess).toHaveBeenCalledWith('p', ctx, 'view');
    expect(result).toEqual({ productId: 'p', gaps: [], evidence: [] });
  });
  it('denied/revoked ACL reads no library details', async () => {
    acl.assertProductAccess.mockRejectedValue(new NotFoundException());
    await expect(service.review('p', ctx)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.productGap.findMany).not.toHaveBeenCalled();
  });
  it('records an explicit missing document with actor and same transaction', async () => {
    await service.recordGap('p', input, ctx);
    expect(acl.assertProductAccess).toHaveBeenCalledWith('p', ctx, 'edit_products');
    expect(tx.productGap.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productId: 'p', status: 'NO_ENCONTRADO', severity: 'AVISO', setByActorId: ctx.userId }) });
    expect(audit.append).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'PRODUCT_GAP_RECORDED', actor: { id: ctx.userId, name: ctx.name } }));
  });
  it.each(['datasheet', 'manual', 'firmware'])('%s cannot become a publication blocker', async (gapKey) => {
    await expect(service.recordGap('p', { ...input, gapKey, severity: 'BLOQUEA' }, ctx)).rejects.toBeInstanceOf(BadRequestException);
    expect(library.writeTransaction).not.toHaveBeenCalled();
  });
  it('NO_APLICA requires an explicit reason without changing NO_ENCONTRADO', async () => {
    await expect(service.recordGap('p', { ...input, status: 'NO_APLICA', reason: ' ' }, ctx)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.productGap.update).not.toHaveBeenCalled();
  });
  it('requires a comparison token', async () => {
    await expect(service.recordGap('p', { ...input, expectedOpenId: undefined } as any, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('a stale gap version does not close or overwrite another change', async () => {
    tx.productGap.findFirst.mockResolvedValue({ id: 'concurrent' });
    await expect(service.recordGap('p', input, ctx)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.productGap.update).not.toHaveBeenCalled();
    expect(tx.productGap.create).not.toHaveBeenCalled();
  });
  it('retains previous gap rows as resolved history', async () => {
    tx.productGap.findFirst.mockResolvedValue({ id: 'prior' });
    await service.recordGap('p', { ...input, expectedOpenId: 'prior' }, ctx);
    expect(tx.productGap.update).toHaveBeenCalledWith({ where: { id: 'prior' }, data: { resolvedAt: expect.any(Date) } });
  });
  it('an absent or concurrently resolved gap cannot be resolved again', async () => {
    await expect(service.resolveGap('p', 'old', ctx)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.productGap.update).not.toHaveBeenCalled();
  });
  it('manufacturer verification and inference require their supporting information', async () => {
    await expect(service.recordEvidence('p', { ...evidenceInput, sourceUrl: '' }, ctx)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.recordEvidence('p', { ...evidenceInput, level: 'INFERIDO' }, ctx)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.fieldEvidence.create).not.toHaveBeenCalled();
  });
  it.each(['file:///secret', 'https://user:pass@example.invalid/source', 'invalid'])('rejects unsafe source %s', async (sourceUrl) => {
    await expect(service.recordEvidence('p', { ...evidenceInput, sourceUrl }, ctx)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('stale evidence cannot overwrite a concurrent review', async () => {
    tx.fieldEvidence.findUnique.mockResolvedValue({ id: 'concurrent' });
    await expect(service.recordEvidence('p', evidenceInput, ctx)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.fieldEvidence.delete).not.toHaveBeenCalled();
  });
  it('replaces evidence atomically while auditing previous source and conflict', async () => {
    tx.fieldEvidence.findUnique.mockResolvedValue({ id: 'e-old', level: 'INFERIDO', sourceKind: 'MANUAL', sourceUrl: null, reason: 'Fixture', valueHash: null });
    await service.recordEvidence('p', { ...evidenceInput, level: 'CONTRADICTORIO', expectedId: 'e-old' }, ctx);
    expect(tx.fieldEvidence.delete).toHaveBeenCalledWith({ where: { id: 'e-old' } });
    expect(audit.append).toHaveBeenCalledWith(tx, expect.objectContaining({ summary: expect.objectContaining({ before: expect.objectContaining({ id: 'e-old', reason: 'Fixture' }), after: expect.objectContaining({ level: 'CONTRADICTORIO' }) }) }));
  });
  it('propagates audit failure to its enclosing transaction', async () => {
    audit.append.mockRejectedValue(new Error('synthetic audit failure'));
    await expect(service.recordGap('p', input, ctx)).rejects.toThrow('synthetic audit failure');
    expect(library.writeTransaction).toHaveBeenCalledTimes(1);
  });
});
