import { AuditService } from './audit.service';

describe('AuditService — writes', () => {
  const hierarchy = { getSubordinateIds: jest.fn() };
  const prisma = { auditLog: { create: jest.fn().mockResolvedValue({ id: 'a1' }) } };
  const service = new AuditService(prisma as any, hierarchy as any);

  beforeEach(() => prisma.auditLog.create.mockClear());

  it('log keeps its previous shape and omits productId when not given', async () => {
    await service.log({ userId: 'u1', action: 'create', entity: 'Product', entityId: 'p1' });
    const { data } = prisma.auditLog.create.mock.calls[0][0];
    expect(data).toMatchObject({ userId: 'u1', action: 'create', entity: 'Product', entityId: 'p1' });
    expect('productId' in data).toBe(false);
    expect('result' in data).toBe(false);
  });

  it('log writes productId and result when given', async () => {
    await service.log({ action: 'update', entity: 'Price', entityId: 'x', productId: 'p1', result: 'SUCCESS' });
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ productId: 'p1', result: 'SUCCESS' });
  });

  it('logTx writes through the transaction client, not the service client', async () => {
    const tx = { auditLog: { create: jest.fn().mockResolvedValue({ id: 'a2' }) } };
    const out = await service.logTx(tx as any, { action: 'price-import-apply', entity: 'Product', entityId: 'p1', productId: 'p1', newValues: { a: 1 } });
    expect(out).toEqual({ id: 'a2' });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productId: 'p1', newValues: { a: 1 } }) });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
