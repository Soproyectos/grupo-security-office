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
  let grants: { grantsForUser: jest.Mock };
  let service: QuotesService;

  const adminCtx = { userId: 'admin-1', roles: ['Super Admin'] };
  const operadorCtx = { userId: 'op-1', roles: ['Operador'] };
  /** Misma identidad que el controller arma (jti aporta la sesión viva). */
  const operadorCtxJti = { ...operadorCtx, jti: 'jti-op-1' };

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
    grants = { grantsForUser: jest.fn().mockResolvedValue([
      'customers:read', 'quotes:read', 'quotes:create', 'quotes:edit', 'quotes:status', 'quotes:discount',
    ].map((actionId) => ({ sourceId: 'test', actionId, scope: 'own' }))) };
    // $transaction con callback: ejecuta sobre el mismo mock (patrón del codebase).
    prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
    service = new QuotesService(
      prisma as any,
      acl as any,
      hierarchy as any,
      audit as any,
      grants as any,
    );

    // Defaults: quote encontrada con sus relaciones para findOne.
    prisma.quote.findUnique.mockResolvedValue(baseQuote);
    prisma.quote.findUniqueOrThrow.mockResolvedValue(baseQuote);
  });

  // ---------- Totales y snapshot ----------

  it('crea una cotización y agrega un ítem con precio vigente: totales correctos', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust-1', isActive: true, ownerId: 'op-1' });
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
    grants.grantsForUser.mockResolvedValue([
      { sourceId: 'team-read', actionId: 'quotes:read', scope: 'team' },
    ]);
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

  it('un Operador con quotes:status y alcance propio puede cerrar como ganada', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      ...baseQuote,
      status: 'enviada',
    });
    await service.updateStatus('q1', { status: 'ganada' }, operadorCtx);
    expect(prisma.quote.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'q1' }, data: expect.objectContaining({ status: 'ganada' }),
    }));
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
  describe('personal seller quotes', () => {
    const seller = { userId: 'seller-1', roles: ['Vendedor'] };

    it('scopes rows and totals to the seller without expanding to a team', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['seller-1', 'other-seller']);
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.quote.count.mockResolvedValue(0);
      await service.findAll({}, seller);
      const where = prisma.quote.findMany.mock.calls[0][0].where;
      expect(where.AND).toContainEqual({ ownerId: 'seller-1' });
      expect(prisma.quote.count).toHaveBeenCalledWith({ where });
      expect(hierarchy.getSubordinateIds).not.toHaveBeenCalled();
    });

    it('cannot open or modify another seller quote by ID', async () => {
      prisma.quote.findUnique.mockResolvedValue({ ...baseQuote, ownerId: 'other-seller' });
      await expect(service.findOne('q1', seller)).rejects.toThrow(NotFoundException);
      await expect(service.updateItem('q1', 'item-1', { quantity: 2 }, seller))
        .rejects.toThrow(NotFoundException);
      expect(prisma.quoteItem.update).not.toHaveBeenCalled();
    });

    it('cannot quote for a customer outside their portfolio', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'other', isActive: true, ownerId: 'other-seller' });
      await expect(service.create({ customerId: 'other', listaId: 'lista-1' }, seller))
        .rejects.toThrow(NotFoundException);
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });

    it('can create a quote for an owned customer using an authorized list', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'mine', isActive: true, ownerId: seller.userId });
      prisma.quote.findFirst.mockResolvedValue(null);
      prisma.quote.findUnique.mockResolvedValue(null);
      prisma.quote.create.mockResolvedValue({ ...baseQuote, ownerId: seller.userId });
      await service.create({ customerId: 'mine', listaId: 'lista-1' }, seller);
      expect(acl.assertListaAccess).toHaveBeenCalledWith('lista-1', seller, 'view_prices');
      expect(prisma.quote.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ owner: { connect: { id: seller.userId } } }),
      }));
    });
  });

  // ================= COM-03 · Aceptación 1 =================
  // «Editar cantidad no introduce descuento nuevo no autorizado ni borra
  //  descuento previo autorizado.» (ficha, textual)
  describe('COM-03 · cantidades separadas de descuentos', () => {
    const storedItem = {
      id: 'item-1',
      quoteId: 'q1',
      unitPrice: 1000,
      quantity: 3,
      discountPct: 10,
    };

    beforeEach(() => {
      prisma.quoteItem.findUnique.mockResolvedValue({ ...storedItem });
      prisma.quoteItem.update.mockResolvedValue({});
      prisma.quote.findUniqueOrThrow.mockResolvedValue({
        ...baseQuote,
        items: [{ lineTotal: 2700 }],
      });
    });

    it('editar SOLO quantity → 200 con discountPct/unitPrice/quantity previos intactos', async () => {
      await service.updateItem('q1', 'item-1', { quantity: 5 }, operadorCtx);

      expect(prisma.quoteItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        // lineTotal = 1000 * 5 * (1 - 10/100) = 4500 → el descuento PREVIO se conserva
        data: { quantity: 5, discountPct: 10, lineTotal: 4500 },
      });
      const written = prisma.quoteItem.update.mock.calls[0][0].data;
      expect(written.unitPrice).toBeUndefined();
      expect(written.priceCapturedAt).toBeUndefined();
    });

    it('payload mixto { quantity, discountPct } → 400 SIN escritura parcial (ni la cantidad)', async () => {
      const err: any = await service
        .updateItem('q1', 'item-1', { quantity: 5, discountPct: '20' }, operadorCtx)
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('discount-not-allowed-in-general-edit');
      expect(prisma.quoteItem.update).not.toHaveBeenCalled();
      expect(prisma.quote.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('alta de ítem con discountPct en rango → 400 (el descuento se aplica en la operación dedicada)', async () => {
      const err: any = await service
        .addItem('q1', { productId: 'p1', quantity: 1, discountPct: '10' }, operadorCtx)
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('discount-not-allowed-in-add');
      expect(prisma.quoteItem.create).not.toHaveBeenCalled();
    });

    it('PATCH .../discount SIN quotes:discount → 403 y sin escritura', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's1', actionId: 'quotes:read', scope: 'own' },
        { sourceId: 's1', actionId: 'quotes:edit', scope: 'own' },
      ]);

      const err: any = await service
        .updateItemDiscount('q1', 'item-1', { discountPct: '25' }, operadorCtxJti)
        .catch((e) => e);

      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.message).toContain('quotes:discount');
      expect(prisma.quoteItem.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('PATCH .../discount CON quotes:discount → 200: aplica el descuento y conserva la cantidad', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's1', actionId: 'quotes:read', scope: 'own' },
        { sourceId: 's1', actionId: 'quotes:edit', scope: 'own' },
        { sourceId: 's1', actionId: 'quotes:discount', scope: 'own' },
      ]);

      await service.updateItemDiscount('q1', 'item-1', { discountPct: '15' }, operadorCtxJti);

      const written = prisma.quoteItem.update.mock.calls[0][0];
      expect(written.where).toEqual({ id: 'item-1' });
      expect(written.data.discountPct).toBe(15);
      expect(written.data.quantity).toBeUndefined(); // la cantidad no se toca
      // lineTotal = 1000 * 3 * (1 - 15/100) = 2550 con la cantidad CONSERVADA
      expect(written.data.lineTotal).toBe(2550);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'discount_change',
          entity: 'QuoteItem',
          entityId: 'item-1',
          oldValues: { discountPct: 10 },
          newValues: { discountPct: 15 },
        }),
      );
    });

    it('PATCH .../discount fuera de 0-100 → 400 antes de escribir', async () => {
      grants.grantsForUser.mockResolvedValue([
        { sourceId: 's1', actionId: 'quotes:read', scope: 'own' },
        { sourceId: 's1', actionId: 'quotes:edit', scope: 'own' },
        { sourceId: 's1', actionId: 'quotes:discount', scope: 'own' },
      ]);

      await expect(
        service.updateItemDiscount('q1', 'item-1', { discountPct: '101' }, operadorCtxJti),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateItemDiscount('q1', 'item-1', { discountPct: '-1' }, operadorCtxJti),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.quoteItem.update).not.toHaveBeenCalled();
    });

    it('PATCH .../discount sobre cotización ajena → 404 sin revelar existencia', async () => {
      hierarchy.getSubordinateIds.mockResolvedValue(['op-1']);
      prisma.quote.findUnique.mockResolvedValue({ ...baseQuote, ownerId: 'op-otro' });

      await expect(
        service.updateItemDiscount('q1', 'item-1', { discountPct: '10' }, operadorCtxJti),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.quoteItem.update).not.toHaveBeenCalled();
    });
  });

  // ================= COM-03 · Aceptación 2 =================
  // «Producto/tarifa ajeno se rechaza.» (ficha, textual)
  describe('COM-03 · producto/tarifa ajeno se rechaza', () => {
    it('producto de Lista sin nivel view_prices → 403 y ninguna fila creada', async () => {
      acl.assertProductAccess.mockRejectedValue(
        new ForbiddenException('No tienes permisos suficientes sobre esta Lista'),
      );

      await expect(
        service.addItem('q1', { productId: 'p-ajeno', quantity: 1 }, operadorCtx),
      ).rejects.toThrow(ForbiddenException);
      expect(acl.assertProductAccess).toHaveBeenCalledWith(
        'p-ajeno',
        operadorCtx,
        'view_prices',
      );
      expect(prisma.quoteItem.create).not.toHaveBeenCalled();
    });

    it('producto inexistente o de Lista no autorizada → 404 (no revela existencia)', async () => {
      acl.assertProductAccess.mockRejectedValue(new NotFoundException('Producto no encontrado'));

      await expect(
        service.addItem('q1', { productId: 'p-no-existe', quantity: 1 }, operadorCtx),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.quoteItem.create).not.toHaveBeenCalled();
    });

    it('producto propio con view_prices → crea la línea con snapshot de precio vigente', async () => {
      prisma.quoteItem.findFirst.mockResolvedValue(null);
      prisma.price.findMany.mockResolvedValue([
        {
          id: 'price-1',
          productId: 'p-propio',
          priceListId: 'pl-1',
          value: 800,
          currency: 'COP',
          validFrom: null,
          validUntil: null,
          updatedAt: new Date(),
        },
      ]);
      prisma.product.findUnique.mockResolvedValue({
        id: 'p-propio',
        sku: 'SKU-PROPIO',
        name: 'Producto propio',
      });
      prisma.quoteItem.create.mockResolvedValue({});
      prisma.quote.findUniqueOrThrow.mockResolvedValue({ ...baseQuote, items: [] });

      await service.addItem('q1', { productId: 'p-propio', quantity: 2 }, operadorCtx);

      expect(prisma.quoteItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unitPrice: 800, quantity: 2, discountPct: 0 }),
        }),
      );
    });

    it('cotización sin tarifa (priceListId) → 409 y ninguna fila creada', async () => {
      prisma.quote.findUnique.mockResolvedValue({ ...baseQuote, priceListId: null });

      await expect(
        service.addItem('q1', { productId: 'p1', quantity: 1 }, operadorCtx),
      ).rejects.toThrow(ConflictException);
      expect(prisma.quoteItem.create).not.toHaveBeenCalled();
    });
  });

  // ================= COM-03 · Aceptación 3 =================
  // «Ganada conserva pedido interno idempotente sin contar factura inexistente.»
  describe('COM-03 · ganada idempotente sin factura fantasma', () => {
    it('segunda transición a ganada → 409 y NO se crea un segundo pedido', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        ...baseQuote,
        status: 'ganada',
        closedAt: new Date(),
      });

      const err: any = await service
        .updateStatus('q1', { status: 'ganada' }, adminCtx)
        .catch((e) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.message).toMatch(/No se puede pasar de ganada a ganada/);
      expect(prisma.salesOrder.create).not.toHaveBeenCalled();
      expect(prisma.quote.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('el pedido interno nace SIN externalInvoiceNumber (no es una factura)', async () => {
      prisma.quote.findUnique
        .mockResolvedValueOnce({ ...baseQuote, status: 'enviada', validUntil: null, total: 500 })
        .mockResolvedValue({ ...baseQuote, status: 'ganada', closedAt: new Date() });
      prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
      prisma.quote.update.mockResolvedValue({});
      prisma.customer.findUnique.mockResolvedValue({ id: 'cust-1', status: 'CLIENTE' });
      prisma.salesOrder.findFirst.mockResolvedValue({ code: 'SO-0001' });
      prisma.salesOrder.findUnique.mockResolvedValue(null);
      prisma.salesOrder.create.mockResolvedValue({ id: 'so-1' });

      // Un vendedor con quotes:status y alcance propio puede cerrar la venta.
      await service.updateStatus('q1', { status: 'ganada' }, operadorCtx);

      const payload = prisma.salesOrder.create.mock.calls[0][0].data;
      // Sin referencia de factura: Prisma deja el campo en null y el dashboard
      // solo cuenta `externalInvoiceNumber: { not: null }` (dashboard.service.ts:152).
      expect(payload).not.toHaveProperty('externalInvoiceNumber');
      expect(payload).not.toHaveProperty('externalInvoiceDate');
      expect(payload).toMatchObject({
        quote: { connect: { id: 'q1' } },
        total: 500,
      });
    });

    it('una sola ganada concurrente que choca con P2002 → 409 sin segundo pedido', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({
        ...baseQuote,
        status: 'negociacion',
        validUntil: null,
      });
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

      const err: any = await service
        .updateStatus('q1', { status: 'ganada' }, adminCtx)
        .catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.message).toBe('Ya existe un pedido para esta cotización');
      // La transacción revirtió: el estado de la cotización no avanzó.
      expect(prisma.quote.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ganada' }) }),
      );
      expect(audit.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'status_change' }),
      );
    });
  });

});
