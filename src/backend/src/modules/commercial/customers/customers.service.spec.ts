import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { createPrismaMock } from '../../../__test__/mocks/prisma.mock';

describe('CustomersService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let acl: { isListasAdmin: jest.Mock };
  let hierarchy: { getSubordinateIds: jest.Mock };
  let audit: { log: jest.Mock };
  let service: CustomersService;

  const adminCtx = { userId: 'admin-1', roles: ['Super Admin'] };
  const operadorCtx = { userId: 'op-1', roles: ['Operador'] };

  beforeEach(() => {
    prisma = createPrismaMock();
    acl = { isListasAdmin: jest.fn().mockReturnValue(false) };
    hierarchy = { getSubordinateIds: jest.fn().mockResolvedValue([]) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new CustomersService(
      prisma as any,
      acl as any,
      hierarchy as any,
      audit as any,
    );
  });

  // ---------- CRUD básico ----------

  it('crea un lead con código secuencial CL-####, ownerId = creador y audita', async () => {
    prisma.customer.findFirst.mockResolvedValue({ code: 'CL-0007' });
    prisma.customer.findUnique.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({
      id: 'c1',
      code: 'CL-0008',
      name: 'Acme',
      status: 'LEAD',
      ownerId: 'op-1',
    });

    const result = await service.create({ name: 'Acme' }, operadorCtx);

    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'CL-0008',
        name: 'Acme',
        status: 'LEAD',
        owner: { connect: { id: 'op-1' } },
        createdBy: { connect: { id: 'op-1' } },
      }),
    });
    expect(result.code).toBe('CL-0008');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', entity: 'Customer', entityId: 'c1' }),
    );
  });

  it('empieza en CL-0001 cuando no hay códigos previos', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.findUnique.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'c1', code: 'CL-0001' });

    await service.create({ name: 'Primero' }, operadorCtx);

    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'CL-0001' }),
    });
  });

  it('findOne devuelve el cliente para un admin', async () => {
    acl.isListasAdmin.mockReturnValue(true);
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, ownerId: 'otro' });

    const result = await service.findOne('c1', adminCtx);

    expect(result.id).toBe('c1');
    expect(hierarchy.getSubordinateIds).not.toHaveBeenCalled();
  });

  it('soft delete marca isActive=false y audita', async () => {
    acl.isListasAdmin.mockReturnValue(true);
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1',
      isActive: true,
      code: 'CL-0001',
      name: 'X',
      status: 'LEAD',
      ownerId: 'op-1',
    });
    prisma.customer.update.mockResolvedValue({});

    await service.remove('c1', adminCtx);

    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { isActive: false },
    });
    expect(prisma.customer.delete).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', entity: 'Customer', entityId: 'c1' }),
    );
  });

  // ---------- Scoping ----------

  it('admin lista sin filtro de ownerId (ve todos)', async () => {
    acl.isListasAdmin.mockReturnValue(true);
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);

    await service.findAll({}, adminCtx);

    const where = prisma.customer.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('ownerId');
    expect(hierarchy.getSubordinateIds).not.toHaveBeenCalled();
  });

  it('usuario normal solo ve clientes de su cartera y la de sus subordinados', async () => {
    hierarchy.getSubordinateIds.mockResolvedValue(['op-1', 'op-2']);
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);

    await service.findAll({}, operadorCtx);

    expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('op-1', { includeSelf: true });
    const where = prisma.customer.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ ownerId: { in: ['op-1', 'op-2'] } });
  });

  it('findOne devuelve 404 si el cliente está fuera del scope del usuario', async () => {
    hierarchy.getSubordinateIds.mockResolvedValue(['op-1']);
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, ownerId: 'ajeno' });

    await expect(service.findOne('c1', operadorCtx)).rejects.toThrow(NotFoundException);
  });

  // ---------- Unicidad de documento ----------

  it('permite crear dos leads sin documento (sin conflicto de unicidad)', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.findUnique.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'c2', code: 'CL-0001' });

    await service.create({ name: 'Lead sin doc A' }, operadorCtx);
    prisma.customer.create.mockResolvedValue({ id: 'c3', code: 'CL-0002' });
    await service.create({ name: 'Lead sin doc B' }, operadorCtx);

    expect(prisma.customer.create).toHaveBeenCalledTimes(2);
    expect(
      prisma.customer.create.mock.calls.every(
        ([arg]) => arg.data.documentType === null && arg.data.documentId === null,
      ),
    ).toBe(true);
  });

  it('409 al crear con documento duplicado (P2002 en documentType/documentId)', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.findUnique.mockResolvedValue(null);
    const p2002 = new (await import('@prisma/client')).Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['documentType', 'documentId'] },
      } as any,
    );
    prisma.customer.create.mockRejectedValue(p2002);

    await expect(
      service.create({ name: 'Duplicado', documentType: 'NIT', documentId: '123' }, operadorCtx),
    ).rejects.toThrow(ConflictException);
  });

  // ---------- Conversión manual ----------

  it('convert cambia status a CLIENTE y setea convertedAt', async () => {
    acl.isListasAdmin.mockReturnValue(true);
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, status: 'LEAD' });
    prisma.customer.update.mockResolvedValue({ id: 'c1', status: 'CLIENTE', convertedAt: new Date() });

    const result = await service.convert('c1', adminCtx);

    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: 'CLIENTE', convertedAt: expect.any(Date) }),
    });
    expect(result.status).toBe('CLIENTE');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'convert', entity: 'Customer', entityId: 'c1' }),
    );
  });

  it('convert falla con 409 si el registro no está en LEAD', async () => {
    acl.isListasAdmin.mockReturnValue(true);
    prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, status: 'CLIENTE' });

    await expect(service.convert('c1', adminCtx)).rejects.toThrow(ConflictException);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });
  describe('personal seller portfolio', () => {
    const seller = { userId: 'seller-1', roles: ['Vendedor'] };

    it('scopes both rows and totals to the seller even if they have subordinates', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['seller-1', 'other-seller']);
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);
      await service.findAll({}, seller);
      const where = prisma.customer.findMany.mock.calls[0][0].where;
      expect(where.AND).toContainEqual({ ownerId: { in: ['seller-1'] } });
      expect(prisma.customer.count).toHaveBeenCalledWith({ where });
      expect(hierarchy.getSubordinateIds).not.toHaveBeenCalled();
    });

    it('does not reveal another seller customer by ID', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'other', isActive: true, ownerId: 'other-seller' });
      await expect(service.findOne('other', seller)).rejects.toThrow(NotFoundException);
    });

    it('can read an owned customer', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'mine', isActive: true, ownerId: seller.userId });
      await expect(service.findOne('mine', seller)).resolves.toMatchObject({ id: 'mine' });
    });

    it('cannot create a customer for a different owner', async () => {
      await expect(service.create({ name: 'Demo', ownerId: 'other-seller' }, seller))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it.each(['other-seller', null])('cannot transfer or unassign a customer to %s', async ownerId => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'mine', isActive: true, ownerId: seller.userId });
      await expect(service.update('mine', { ownerId }, seller)).rejects.toThrow(ForbiddenException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
  });

});
