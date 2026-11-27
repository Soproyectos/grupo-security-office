import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SalesOrdersService } from './sales-orders.service';
import { createPrismaMock } from '../../../__test__/mocks/prisma.mock';

describe('SalesOrdersService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let hierarchy: { getSubordinateIds: jest.Mock };
  let audit: { log: jest.Mock };
  let grants: { grantsForUser: jest.Mock };
  let service: SalesOrdersService;

  const adminCtx = { userId: 'admin-1', roles: ['Super Admin'] };
  // Sin cargo especial: todo lo que puede hacer viene de las acciones asignadas.
  const operadorCtx = { userId: 'op-1', roles: ['Operador'] };
  const grant = (actionId: string, scope: string) => ({ sourceId: 's1', actionId, scope });
  const teamGrants = [grant('salesOrders:read', 'team'), grant('salesOrders:invoice', 'team')];

  beforeEach(() => {
    prisma = createPrismaMock();
    hierarchy = {
      getSubordinateIds: jest.fn().mockImplementation(async (_id: string, opts?: { includeSelf?: boolean }) =>
        opts?.includeSelf ? ['op-1', 'sub-1'] : ['sub-1']),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    grants = { grantsForUser: jest.fn().mockResolvedValue(teamGrants) };
    service = new SalesOrdersService(
      prisma as any,
      hierarchy as any,
      audit as any,
      grants as any,
    );
  });

  it('findAll aplica scope de jerarquía (self + subordinados) con la acción en alcance de equipo', async () => {
    prisma.salesOrder.findMany.mockResolvedValue([]);
    prisma.salesOrder.count.mockResolvedValue(0);

    await service.findAll({}, operadorCtx);

    expect(hierarchy.getSubordinateIds).toHaveBeenCalledWith('op-1', {
      includeSelf: true,
    });
    expect(prisma.salesOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ ownerId: { in: ['op-1', 'sub-1'] } }] },
      }),
    );
  });

  it('findAll con alcance propio solo ve los pedidos de la persona', async () => {
    grants.grantsForUser.mockResolvedValue([grant('salesOrders:read', 'own')]);
    prisma.salesOrder.findMany.mockResolvedValue([]);
    prisma.salesOrder.count.mockResolvedValue(0);

    await service.findAll({}, operadorCtx);

    expect(prisma.salesOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ ownerId: { in: ['op-1'] } }] } }),
    );
  });

  it('findAll sin filtro de scope con la acción en alcance global', async () => {
    grants.grantsForUser.mockResolvedValue([grant('salesOrders:read', 'global')]);
    prisma.salesOrder.findMany.mockResolvedValue([]);
    prisma.salesOrder.count.mockResolvedValue(0);

    await service.findAll({}, operadorCtx);

    expect(prisma.salesOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('findAll sin filtro de scope para Super Admin, aunque no tenga concesiones', async () => {
    grants.grantsForUser.mockResolvedValue([]);
    prisma.salesOrder.findMany.mockResolvedValue([]);
    prisma.salesOrder.count.mockResolvedValue(0);

    await service.findAll({}, adminCtx);

    expect(hierarchy.getSubordinateIds).not.toHaveBeenCalled();
    expect(prisma.salesOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('findAll y findOne sin la acción salesOrders:read responden 403 (el cargo no basta)', async () => {
    grants.grantsForUser.mockResolvedValue([grant('quotes:read', 'global')]);
    const ctx = { userId: 'op-1', roles: ['Admin Comercial', 'Supervisor'] };

    await expect(service.findAll({}, ctx)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.findOne('so-1', ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.salesOrder.findMany).not.toHaveBeenCalled();
  });

  it('updateInvoice sin salesOrders:invoice responde 403 aunque pueda leer, y no persiste', async () => {
    grants.grantsForUser.mockResolvedValue([grant('salesOrders:read', 'global')]);

    await expect(
      service.updateInvoice('so-1', { externalInvoiceNumber: 'FE-1' }, operadorCtx),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.salesOrder.update).not.toHaveBeenCalled();
  });

  it('updateInvoice: salesOrders:invoice sin salesOrders:read (dependencia) responde 403', async () => {
    grants.grantsForUser.mockResolvedValue([grant('salesOrders:invoice', 'global')]);

    await expect(
      service.updateInvoice('so-1', { externalInvoiceNumber: 'FE-1' }, operadorCtx),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.salesOrder.update).not.toHaveBeenCalled();
  });

  it('updateInvoice: el alcance de facturar limita los pedidos (leer global, facturar propio)', async () => {
    grants.grantsForUser.mockResolvedValue([
      grant('salesOrders:read', 'global'),
      grant('salesOrders:invoice', 'own'),
    ]);
    prisma.salesOrder.findUnique.mockResolvedValue({ id: 'so-1', ownerId: 'otro-owner' });

    await expect(
      service.updateInvoice('so-1', { externalInvoiceNumber: 'FE-1' }, operadorCtx),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.salesOrder.update).not.toHaveBeenCalled();
  });

  it('updateInvoice: Super Admin registra la factura sin concesiones', async () => {
    grants.grantsForUser.mockResolvedValue([]);
    prisma.salesOrder.findUnique.mockResolvedValue({
      id: 'so-1',
      ownerId: 'otro-owner',
      externalInvoiceNumber: null,
      externalInvoiceDate: null,
    });
    prisma.salesOrder.update.mockResolvedValue({ id: 'so-1', externalInvoiceNumber: 'FE-9', externalInvoiceDate: null });

    await service.updateInvoice('so-1', { externalInvoiceNumber: 'FE-9' }, adminCtx);

    expect(prisma.salesOrder.update).toHaveBeenCalledWith({
      where: { id: 'so-1' },
      data: { externalInvoiceNumber: 'FE-9' },
    });
  });

  it('findOne fuera de scope lanza NotFoundException (404, no 403)', async () => {
    prisma.salesOrder.findUnique.mockResolvedValue({
      id: 'so-1',
      ownerId: 'otro-owner',
    });

    await expect(service.findOne('so-1', operadorCtx)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updateInvoice fuera de scope lanza NotFoundException y no persiste', async () => {
    prisma.salesOrder.findUnique.mockResolvedValue({
      id: 'so-1',
      ownerId: 'otro-owner',
    });

    await expect(
      service.updateInvoice(
        'so-1',
        { externalInvoiceNumber: 'FE-1' },
        operadorCtx,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.salesOrder.update).not.toHaveBeenCalled();
  });

  it('updateInvoice persiste SOLO externalInvoiceNumber/externalInvoiceDate', async () => {
    prisma.salesOrder.findUnique.mockResolvedValue({
      id: 'so-1',
      ownerId: 'op-1',
      externalInvoiceNumber: null,
      externalInvoiceDate: null,
    });
    prisma.salesOrder.update.mockResolvedValue({
      id: 'so-1',
      externalInvoiceNumber: 'FE-100',
      externalInvoiceDate: new Date('2026-09-15T00:00:00.000Z'),
    });

    await service.updateInvoice(
      'so-1',
      {
        externalInvoiceNumber: 'FE-100',
      } as any,
      operadorCtx,
    );

    expect(prisma.salesOrder.update).toHaveBeenCalledWith({
      where: { id: 'so-1' },
      data: { externalInvoiceNumber: 'FE-100' },
    });
  });

  it('updateInvoice audita como action=update entity=SalesOrder (patrón Customers)', async () => {
    prisma.salesOrder.findUnique.mockResolvedValue({
      id: 'so-1',
      ownerId: 'op-1',
      externalInvoiceNumber: null,
      externalInvoiceDate: null,
    });
    prisma.salesOrder.update.mockResolvedValue({
      id: 'so-1',
      externalInvoiceNumber: 'FE-100',
      externalInvoiceDate: new Date('2026-09-15T00:00:00.000Z'),
    });

    await service.updateInvoice(
      'so-1',
      { externalInvoiceNumber: 'FE-100', externalInvoiceDate: '2026-09-15T00:00:00.000Z' },
      operadorCtx,
    );

    // La fecha ISO llega como string y se persiste como Date (patrón Customer).
    const updateArg = prisma.salesOrder.update.mock.calls[0][0];
    expect(updateArg.data.externalInvoiceDate).toBeInstanceOf(Date);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'op-1',
        action: 'update',
        entity: 'SalesOrder',
        entityId: 'so-1',
      }),
    );
  });

  it('DTO: acepta externalInvoiceDate como string ISO 8601 y rechaza formatos inválidos', async () => {
    const { validate } = await import('class-validator');
    const { UpdateSalesOrderInvoiceDto } = await import(
      './dto/update-sales-order-invoice.dto'
    );

    const ok = Object.assign(new UpdateSalesOrderInvoiceDto(), {
      externalInvoiceNumber: 'FE-100',
      externalInvoiceDate: '2026-09-15T00:00:00.000Z',
    });
    expect(await validate(ok)).toHaveLength(0);

    const bad = Object.assign(new UpdateSalesOrderInvoiceDto(), {
      externalInvoiceDate: '15/09/2026',
    });
    expect((await validate(bad)).length).toBeGreaterThan(0);
  });
});
