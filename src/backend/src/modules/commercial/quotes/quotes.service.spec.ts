import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { createPrismaMock } from '../../../__test__/mocks/prisma.mock';

describe('QuotesService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let acl: {
    isListasAdmin: jest.Mock;
    assertListaAccess: jest.Mock;
    assertProductAccess: jest.Mock;
  };
  let hierarchy: { getSubordinateIds: jest.Mock };
  let audit: { log: jest.Mock };
  let service: QuotesService;

  const adminCtx = { userId: 'admin-1', roles: ['Super Admin'] };
  const operadorCtx = { userId: 'op-1', roles: ['Operador'] };

  const baseQuote = {
    id: 'q1',
    code: 'COT-0001',
    customerId: 'cust-1',
    ownerId: 'op-1',
    listaId: 'lista-1',
    priceListId: 'pl-1',
    status: 'borrador',
    currency: 'COP',
    subtotal: 0,
    discount: 0,
    taxRate: 19,
    taxAmount: 0,
    total: 0,
    validUntil: null,
    issuedAt: null,
    closedAt: null,
    items: [],
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    acl = {
      isListasAdmin: jest.fn().mockReturnValue(false),
      assertListaAccess: jest.fn().mockResolvedValue({}),
      assertProductAccess: jest.fn().mockResolvedValue({ listaId: 'lista-1' }),
    };
    hierarchy = { getSubordinateIds: jest.fn().mockResolvedValue(['op-1']) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    // $transaction con callback: ejecuta sobre el mismo mock (patrón del codebase).
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    service = new QuotesService(
      prisma as any,
      acl as any,
      hierarchy as any,
      audit as any,
    );

    // Defaults: quote encontrada con sus relaciones para findOne.
    prisma.quote.findUnique.mockResolvedValue(baseQuote);
    prisma.quote.findUniqueOrThrow.mockResolvedValue(baseQuote);
  });

  // ---------- Totales y snapshot ----------

  it('crea una cotización y agrega un ítem con precio vigente: totales correctos', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust-1', isActive: true });
    prisma.quote.findFirst.mockResolvedValue(null);
    prisma.quote.findUnique
      .mockResolvedValueOnce(null) // chequeo de código duplicado en create
      .mockResolvedValue(baseQuote);
    prisma.quote.create.mockResolvedValue(baseQuote);

    await service.create(
      { customerId: 'cust-1', listaId: 'lista-1', priceListId: 'pl-1' },
      operadorCtx,
    );
    expect(prisma.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'COT-0001' }),
      }),
    );

    // --- agregar ítem con precio vigente ---
    prisma.quoteItem.findFirst.mockResolvedValue(null); // nextPosition → 1
    prisma.price.findMany.mockResolvedValue([
      {
        id: 'price-1',
        productId: 'p1',
        priceListId: 'pl-1',
        value: 1000,
        currency: 'COP',
        validFrom: null,
        validUntil: null,
        updatedAt: new Date(),
      },
    ]);
    prisma.product.findUnique.mockResolvedValue({
      id: 'p1',
      sku: 'SKU-1',
      name: 'Cámara',
    });
    prisma.quoteItem.create.mockResolvedValue({});

    // recalculateTotals: quote con el ítem ya persistido
    prisma.quote.findUniqueOrThrow.mockResolvedValueOnce({
      ...baseQuote,
      items: [{ lineTotal: 10000 }],
    });

    await service.addItem('q1', { productId: 'p1', quantity: 10 }, operadorCtx);

    // lineTotal = 1000 * 10 = 10000
    expect(prisma.quoteItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitPrice: 1000,
          product: { connect: { id: 'p1' } },
          price: { connect: { id: 'price-1' } },
          quantity: 10,
          lineTotal: 10000,
        }),
      }),
    );
    // subtotal=10000, tax = 1900, total = 11900
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'q1' },
        data: { subtotal: 10000, taxAmount: 1900, total: 11900 },
      }),
    );
  });

  it('ítem sin precio vigente → 409 citando el SKU, nunca precio 0', async () => {
    prisma.price.findMany.mockResolvedValue([
      {
        id: 'price-0',
        productId: 'p1',
        priceListId: 'pl-1',
        value: 500,
        validFrom: null,
        validUntil: new Date('2020-01-01'), // vencido
        updatedAt: new Date(),
      },
    ]);
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', sku: 'SKU-NO-P' });

    await expect(
      service.addItem('q1', { productId: 'p1', quantity: 1 }, operadorCtx),
    ).rejects.toThrow(ConflictException);
    await expect(
      service.addItem('q1', { productId: 'p1', quantity: 1 }, operadorCtx),
    ).rejects.toThrow(/SKU-NO-P/);
    expect(prisma.quoteItem.create).not.toHaveBeenCalled();
  });

  it('discountPct fuera de 0-100 al agregar ítem → 400, nunca lineTotal negativo', async () => {
    prisma.price.findMany.mockResolvedValue([
      {
        id: 'price-1',
        productId: 'p1',
        priceListId: 'pl-1',
        value: 1000,
        currency: 'COP',
        validFrom: null,
        validUntil: null,
        updatedAt: new Date(),
      },
    ]);
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', sku: 'SKU-1', name: 'Prod' });

    await expect(
      service.addItem('q1', { productId: 'p1', quantity: 1, discountPct: '150' }, operadorCtx),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.addItem('q1', { productId: 'p1', quantity: 1, discountPct: '-10' }, operadorCtx),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.quoteItem.create).not.toHaveBeenCalled();
  });

  it('discountPct fuera de 0-100 al editar ítem → 400', async () => {
    prisma.quoteItem.findUnique.mockResolvedValue({
      id: 'item-1',
      quoteId: 'q1',
      unitPrice: 1000,
      quantity: 1,
      discountPct: 0,
    });

    await expect(
      service.updateItem('q1', 'item-1', { discountPct: '101' }, operadorCtx),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.quoteItem.update).not.toHaveBeenCalled();
  });

  it('cambiar el Price original DESPUÉS de agregar el ítem NO cambia QuoteItem.unitPrice (snapshot)', async () => {
    prisma.quoteItem.findFirst.mockResolvedValue(null);
    prisma.price.findMany.mockResolvedValue([
      {
        id: 'price-1',
        productId: 'p1',
        priceListId: 'pl-1',
        value: 1000,
        currency: 'COP',
        validFrom: null,
        validUntil: null,
        updatedAt: new Date(),
      },
    ]);
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', sku: 'S1', name: 'N1' });
    prisma.quoteItem.create.mockResolvedValue({ id: 'i1' });
    prisma.quote.findUniqueOrThrow.mockResolvedValueOnce({
      ...baseQuote,
      items: [{ lineTotal: 1000 }],
    });

    await service.addItem('q1', { productId: 'p1', quantity: 1 }, operadorCtx);

    // Capturamos el snapshot guardado...
    const created = prisma.quoteItem.create.mock.calls[0][0].data;
    expect(created.unitPrice).toBe(1000);

    // ... y el precio fuente "cambia" después (updatePrice in-place en Price).
    // Recalcular totales (updateItem) usa SIEMPRE QuoteItem.unitPrice (1000),
    // nunca vuelve a leer Price.
    prisma.quoteItem.findUnique.mockResolvedValue({
      id: 'i1',
      quoteId: 'q1',
      unitPrice: 1000,
      quantity: 1,
      discountPct: 0,
    });
    prisma.quoteItem.update.mockResolvedValue({});
    prisma.quote.findUniqueOrThrow.mockResolvedValueOnce({
      ...baseQuote,
      items: [{ lineTotal: 2000 }],
    });
    prisma.price.findMany.mockResolvedValue([
      {
        id: 'price-1',
        productId: 'p1',
        priceListId: 'pl-1',
        value: 9999, // precio subió
        validFrom: null,
        validUntil: null,
        updatedAt: new Date(),
      },
    ]);

    await service.updateItem('q1', 'i1', { quantity: 2 }, operadorCtx);

    // lineTotal se calcula con el snapshot congelado (1000*2), no con 9999.
    expect(prisma.quoteItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lineTotal: 2000 }),
      }),
    );
    expect(prisma.price.findMany).toHaveBeenCalledTimes(1); // nunca se re-lee en update
  });

  // ---------- Máquina de estados ----------

  it('transición a ganada convierte cliente LEAD → CLIENTE con convertedAt en la misma transacción', async () => {
    prisma.quote.findUnique
      .mockResolvedValueOnce({ ...baseQuote, status: 'enviada', validUntil: null }) // findOne
      .mockResolvedValueOnce({
        ...baseQuote,
        status: 'ganada',
        closedAt: new Date(),
      }); // findOne final del updateStatus
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.quote.update.mockResolvedValue({});
    prisma.customer.findUnique.mockResolvedValue({
      id: 'cust-1',
      status: 'LEAD',
    });
    prisma.customer.update.mockResolvedValue({
      id: 'cust-1',
      status: 'CLIENTE',
    });

    await service.updateStatus('q1', { status: 'ganada' }, adminCtx);
    acl.isListasAdmin.mockReturnValue(true);

    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cust-1' },
        data: { status: 'CLIENTE', convertedAt: expect.any(Date) },
      }),
    );
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ganada',
          closedAt: expect.any(Date),
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'status_change',
        entity: 'Quote',
      }),
    );
  });

  it('transición a ganada crea SalesOrder 1:1 con código secuencial SO (issue #24)', async () => {
    prisma.quote.findUnique
      .mockResolvedValueOnce({
        ...baseQuote,
        status: 'enviada',
        validUntil: null,
        total: 1234.56,
      }) // findOne del updateStatus
      .mockResolvedValueOnce({ ...baseQuote, status: 'ganada', closedAt: new Date() }); // findOne final
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.quote.update.mockResolvedValue({});
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust-1', status: 'CLIENTE' });
    prisma.salesOrder.findFirst.mockResolvedValue({ code: 'SO-0007' });
    prisma.salesOrder.findUnique.mockResolvedValue(null);
    prisma.salesOrder.create.mockResolvedValue({ id: 'so-1', code: 'SO-0008' });

    await service.updateStatus('q1', { status: 'ganada' }, adminCtx);

    expect(prisma.salesOrder.create).toHaveBeenCalledWith({
      data: {
        code: 'SO-0008',
        quote: { connect: { id: 'q1' } },
        customer: { connect: { id: 'cust-1' } },
        owner: { connect: { id: 'op-1' } },
        total: 1234.56,
        currency: 'COP',
      },
    });
  });

  it('NO crea SalesOrder cuando la transición no es a ganada', async () => {
    prisma.quote.findUnique
      .mockResolvedValueOnce({ ...baseQuote, status: 'enviada', validUntil: null })
      .mockResolvedValueOnce({ ...baseQuote, status: 'perdida', closedAt: new Date() });
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.quote.update.mockResolvedValue({});

    await service.updateStatus(
      'q1',
      { status: 'perdida', lostReason: 'precio' },
      adminCtx,
    );

    expect(prisma.salesOrder.create).not.toHaveBeenCalled();
  });

  it('409 controlado cuando SalesOrder.create choca con P2002 (quoteId único, carrera a ganada)', async () => {
    prisma.quote.findUnique.mockResolvedValueOnce({
      ...baseQuote,
      status: 'enviada',
      validUntil: null,
    }); // findOne del updateStatus (el throw ocurre antes del findOne final)
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.quote.update.mockResolvedValue({});
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust-1', status: 'CLIENTE' });

    const p2002 = new (await import('@prisma/client')).Prisma
      .PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['quoteId'] },
      } as any);
    prisma.salesOrder.create.mockRejectedValue(p2002);

    const error = await service
      .updateStatus('q1', { status: 'ganada' }, adminCtx)
      .then(() => {
        throw new Error('expected updateStatus to throw');
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe('Ya existe un pedido para esta cotización');
    // El error crudo de Prisma no debe filtrarse ni en mensaje ni en identidad.
    expect(error).not.toBe(p2002);
    expect(error.message).not.toMatch(/Unique constraint|Prisma/i);
  });

  it('no permite transición inválida (borrador → ganada)', async () => {
    prisma.quote.findUnique.mockResolvedValue({ ...baseQuote, status: 'borrador' });
    await expect(
      service.updateStatus('q1', { status: 'ganada' }, adminCtx),
    ).rejects.toThrow(/No se puede pasar/);
  });

  // ---------- Scoping por jerarquía ----------

  it('un comercial no puede leer la cotización de otro comercial no subordinado (404)', async () => {
    hierarchy.getSubordinateIds.mockResolvedValue(['op-1']);
    prisma.quote.findUnique.mockResolvedValue({
      ...baseQuote,
      ownerId: 'op-otro',
    });

    await expect(service.findOne('q1', operadorCtx)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('Super Admin ve todas las cotizaciones sin filtro; supervisor ve solo las de sus subordinados', async () => {
    // Admin
    acl.isListasAdmin.mockReturnValue(true);
    prisma.quote.findMany.mockResolvedValue([]);
    prisma.quote.count.mockResolvedValue(0);

    await service.findAll({}, adminCtx);
    expect(hierarchy.getSubordinateIds).not.toHaveBeenCalled();
    expect(prisma.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );

    // Supervisor: filtro por ownerId in [self + subordinados]
    jest.clearAllMocks();
    acl.isListasAdmin.mockReturnValue(false);
    const supCtx = { userId: 'sup-1', roles: ['Supervisor'] };
    hierarchy.getSubordinateIds.mockResolvedValue(['sup-1', 'op-1', 'op-2']);
    prisma.quote.findMany.mockResolvedValue([]);
    prisma.quote.count.mockResolvedValue(0);

    await service.findAll({}, supCtx);
    expect(prisma.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ ownerId: { in: ['sup-1', 'op-1', 'op-2'] } }],
        },
      }),
    );
  });

  it('un Operador no puede cerrar como ganada (rol no permitido)', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      ...baseQuote,
      status: 'enviada',
    });
    await expect(
      service.updateStatus('q1', { status: 'ganada' }, operadorCtx),
    ).rejects.toThrow(ForbiddenException);
  });

  it('estado efectivo "vencida" al leer cuando validUntil ya pasó', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      ...baseQuote,
      status: 'enviada',
      validUntil: new Date('2020-01-01'),
    });
    const result = await service.findOne('q1', adminCtx);
    expect(result.status).toBe('vencida');
    // no persiste el cambio
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });
});
