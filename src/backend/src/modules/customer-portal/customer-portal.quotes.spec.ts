import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CustomerPortalService } from './customer-portal.service';

const prisma: any = {
  customer: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  product: { findMany: jest.fn() },
  price: { findMany: jest.fn() },
  portalTier: { findUnique: jest.fn() },
  portalPriceListMapping: { findUnique: jest.fn() },
  priceList: { findMany: jest.fn() },
  quote: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  $queryRaw: jest.fn(),
  quoteStatusEvent: { create: jest.fn() },
  $transaction: jest.fn((operation) => operation(prisma)),
};
const audit: any = { log: jest.fn() };
const notifications: any = { create: jest.fn().mockResolvedValue({}) };

const ACCOUNT = {
  id: 'pa-1', state: 'ACTIVE', type: 'FINAL_CUSTOMER', customerId: 'c-1', advisorId: 'adv-1', tierId: null,
  contactName: 'Ana', companyName: 'Acme',
} as any;

describe('CustomerPortalService · customer quotes', () => {
  let service: CustomerPortalService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((operation: any) => operation(prisma));
    notifications.create.mockResolvedValue({});
    service = new CustomerPortalService(prisma, {} as any, { get: jest.fn() } as any, audit, undefined, undefined, undefined, notifications);
    // Happy-path defaults: active company, active advisor, general tariff, both products published.
    prisma.customer.findUnique.mockResolvedValue({ id: 'c-1', isActive: true, ownerId: 'adv-1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'adv-1', isActive: true });
    prisma.portalPriceListMapping.findUnique.mockResolvedValue({ type: 'FINAL_CUSTOMER', priceListId: 'pl-1' });
    prisma.priceList.findMany.mockResolvedValue([{ id: 'pl-1', isActive: true }]);
    const published = [{ id: 'p1', sku: 'SKU-1', name: 'Cámara' }, { id: 'p2', sku: 'SKU-2', name: 'Sensor' }];
    prisma.product.findMany.mockImplementation(async ({ where }: any) => published.filter((p) => where.id.in.includes(p.id)));
    prisma.price.findMany.mockResolvedValue([{ id: 'price-1', productId: 'p1', value: 1000, currency: 'COP' }]);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.quote.count.mockResolvedValue(0);
    prisma.quote.findUnique.mockResolvedValue(null);
    prisma.quote.create.mockImplementation(async ({ data }: any) => ({ id: 'q-new', code: data.code, total: data.total, currency: 'COP' }));
  });

  describe('createCustomerQuote', () => {
    it('sends the quote: enviada, advisor as owner, company tariff, merged duplicates, event and notice', async () => {
      const result = await service.createCustomerQuote(ACCOUNT, {
        items: [{ productId: 'p1', quantity: 2 }, { productId: 'p1', quantity: 3 }, { productId: 'p2', quantity: 1 }],
        notes: '  Entrega en bodega  ',
      });

      const data = prisma.quote.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        code: 'COT-0001', customerId: 'c-1', ownerId: 'adv-1', priceListId: 'pl-1', portalAccountId: 'pa-1',
        status: 'enviada', issuedAt: expect.any(Date), notes: 'Entrega en bodega',
        subtotal: 5000, taxAmount: 798.32, total: 5000,
      });
      expect(data).not.toHaveProperty('listaId');
      expect(data.items.create).toHaveLength(2);
      expect(data.items.create[0]).toMatchObject({ productId: 'p1', priceId: 'price-1', unitPrice: 1000, quantity: 5, lineTotal: 5000, sku: 'SKU-1', position: 1 });
      // The product without a current price is "por confirmar": never invented, outside the totals.
      expect(data.items.create[1]).toMatchObject({ productId: 'p2', priceId: null, unitPrice: null, quantity: 1, lineTotal: 0, position: 2 });
      expect(prisma.quoteStatusEvent.create).toHaveBeenCalledWith({
        data: { quoteId: 'q-new', fromStatus: null, toStatus: 'enviada', portalAccountId: 'pa-1' },
      });
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'adv-1', type: 'QUOTE_STATUS_CHANGED', data: expect.objectContaining({ quoteId: 'q-new' }),
      }));
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', entity: 'Quote', entityId: 'q-new' }));
      expect(result).toEqual({ id: 'q-new', code: 'COT-0001', status: 'enviada', total: 5000, currency: 'COP', itemCount: 2, hasPendingPrices: true });
    });

    it('falls back to the company owner when the account has no advisor', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'c-1', isActive: true, ownerId: 'owner-9' });
      prisma.user.findUnique.mockResolvedValue({ id: 'owner-9', isActive: true });
      await service.createCustomerQuote({ ...ACCOUNT, advisorId: null }, { items: [{ productId: 'p1', quantity: 1 }] });
      expect(prisma.quote.create.mock.calls[0][0].data.ownerId).toBe('owner-9');
    });

    it('uses the tier price list and, with no tariff at all, every line is "por confirmar"', async () => {
      prisma.portalTier.findUnique.mockResolvedValue({ id: 't1', isActive: true, priceListId: 'pl-tier' });
      prisma.priceList.findMany.mockResolvedValue([{ id: 'pl-tier', isActive: true }]);
      await service.createCustomerQuote({ ...ACCOUNT, tierId: 't1' }, { items: [{ productId: 'p1', quantity: 1 }] });
      expect(prisma.price.findMany.mock.calls[0][0].where.priceListId).toBe('pl-tier');

      prisma.portalPriceListMapping.findUnique.mockResolvedValue(null);
      prisma.price.findMany.mockClear();
      prisma.quote.create.mockClear();
      const result = await service.createCustomerQuote(ACCOUNT, { items: [{ productId: 'p1', quantity: 2 }] });
      expect(prisma.price.findMany).not.toHaveBeenCalled();
      const data = prisma.quote.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ priceListId: null, subtotal: 0, total: 0 });
      expect(data.items.create[0]).toMatchObject({ unitPrice: null, lineTotal: 0 });
      expect(result.hasPendingPrices).toBe(true);
    });

    it.each([
      ['a pending account', { state: 'PENDING' }, /no está activa/],
      ['an account not linked to a company', { customerId: null }, /vinculada a una empresa/],
    ])('refuses %s with 409 and writes nothing', async (_name, patch, message) => {
      await expect(service.createCustomerQuote({ ...ACCOUNT, ...patch }, { items: [{ productId: 'p1', quantity: 1 }] }))
        .rejects.toThrow(ConflictException);
      await expect(service.createCustomerQuote({ ...ACCOUNT, ...patch }, { items: [{ productId: 'p1', quantity: 1 }] }))
        .rejects.toThrow(message);
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });

    it('refuses with 409 when there is no advisor (account nor company) or the advisor is inactive', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'c-1', isActive: true, ownerId: null });
      await expect(service.createCustomerQuote({ ...ACCOUNT, advisorId: null }, { items: [{ productId: 'p1', quantity: 1 }] }))
        .rejects.toThrow(/asesor/);

      prisma.user.findUnique.mockResolvedValue({ id: 'adv-1', isActive: false });
      await expect(service.createCustomerQuote(ACCOUNT, { items: [{ productId: 'p1', quantity: 1 }] }))
        .rejects.toThrow(ConflictException);
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });

    it('refuses an inactive company', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'c-1', isActive: false, ownerId: 'adv-1' });
      await expect(service.createCustomerQuote(ACCOUNT, { items: [{ productId: 'p1', quantity: 1 }] })).rejects.toThrow(ConflictException);
    });

    it('refuses products that are not in the published catalog and filters by publication', async () => {
      prisma.product.findMany.mockResolvedValue([{ id: 'p1', sku: 'SKU-1', name: 'Cámara' }]);
      await expect(service.createCustomerQuote(ACCOUNT, { items: [{ productId: 'p1', quantity: 1 }, { productId: 'hidden', quantity: 1 }] }))
        .rejects.toThrow(BadRequestException);
      expect(prisma.product.findMany.mock.calls[0][0].where).toMatchObject({
        lifecycleStatus: 'PUBLISHED', isActive: true, isVisible: true, category: { isActive: true }, brand: { isActive: true },
      });
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });

    it('enforces 100 distinct products and 9999 units per product after merging', async () => {
      const many = Array.from({ length: 101 }, (_, i) => ({ productId: `p${i}`, quantity: 1 }));
      await expect(service.createCustomerQuote(ACCOUNT, { items: many })).rejects.toThrow(/100 productos/);
      await expect(service.createCustomerQuote(ACCOUNT, { items: [{ productId: 'p1', quantity: 9000 }, { productId: 'p1', quantity: 1000 }] }))
        .rejects.toThrow(/9999/);
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });

    it('caps open quotes per person at 20 (409) and counts only open, unexpired ones', async () => {
      prisma.quote.count.mockResolvedValue(20);
      await expect(service.createCustomerQuote(ACCOUNT, { items: [{ productId: 'p1', quantity: 1 }] })).rejects.toThrow(/20 cotizaciones abiertas/);
      expect(prisma.quote.count.mock.calls[0][0].where).toMatchObject({ portalAccountId: 'pa-1', status: { in: ['enviada', 'negociacion'] } });
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });

    it('rejects totals above the maximum with 400 before writing', async () => {
      prisma.price.findMany.mockResolvedValue([{ id: 'price-1', productId: 'p1', value: 999_999_999, currency: 'COP' }]);
      await expect(service.createCustomerQuote(ACCOUNT, { items: [{ productId: 'p1', quantity: 9999 }] })).rejects.toThrow(/máximo permitido/);
      expect(prisma.quote.create).not.toHaveBeenCalled();
    });

    it('retries on a code clash and gives up with 409', async () => {
      const { Prisma } = await import('@prisma/client');
      const clash = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5', meta: { target: ['code'] } } as any);
      prisma.quote.create.mockRejectedValue(clash());
      await expect(service.createCustomerQuote(ACCOUNT, { items: [{ productId: 'p1', quantity: 1 }] })).rejects.toThrow(/Intenta de nuevo/);
      expect(prisma.quote.create).toHaveBeenCalledTimes(3);
    });

    it('a notification failure never breaks the sent quote', async () => {
      notifications.create.mockRejectedValue(new Error('down'));
      await expect(service.createCustomerQuote(ACCOUNT, { items: [{ productId: 'p1', quantity: 1 }] })).resolves.toMatchObject({ id: 'q-new' });
    });
  });

  describe('listCustomerQuotes / getCustomerQuote', () => {
    it('lists only the caller own quotes with item count and pending-price flag', async () => {
      prisma.quote.findMany.mockResolvedValue([{
        id: 'q1', code: 'COT-0001', status: 'enviada', validUntil: null, createdAt: new Date('2026-11-01'), issuedAt: new Date('2026-11-01'),
        total: '1190.00', currency: 'COP', items: [{ unitPrice: '1000.00' }, { unitPrice: null }],
      }]);
      const result = await service.listCustomerQuotes('pa-1');
      expect(prisma.quote.findMany.mock.calls[0][0].where).toEqual({ portalAccountId: 'pa-1' });
      expect(result).toEqual([expect.objectContaining({ id: 'q1', total: 1190, itemCount: 2, hasPendingPrices: true })]);
    });

    it('reports an expired open quote as vencida', async () => {
      prisma.quote.findMany.mockResolvedValue([{
        id: 'q1', code: 'COT-0001', status: 'enviada', validUntil: new Date('2020-01-01'), createdAt: new Date(), issuedAt: null,
        total: 0, currency: 'COP', items: [],
      }]);
      expect((await service.listCustomerQuotes('pa-1'))[0].status).toBe('vencida');
    });

    it('detail is own-only: another person quote is a 404', async () => {
      prisma.quote.findFirst.mockResolvedValue(null);
      await expect(service.getCustomerQuote('pa-1', 'q-other')).rejects.toThrow(NotFoundException);
      expect(prisma.quote.findFirst.mock.calls[0][0].where).toEqual({ id: 'q-other', portalAccountId: 'pa-1' });
    });

    it('detail returns lines, totals and a history that never exposes staff identity', async () => {
      prisma.quote.findFirst.mockResolvedValue({
        id: 'q1', code: 'COT-0001', status: 'negociacion', createdAt: new Date('2026-11-01'), issuedAt: new Date('2026-11-01'),
        validUntil: null, notes: null, currency: 'COP', subtotal: '1000.00', taxRate: '19.00', taxAmount: '190.00', total: '1190.00',
        owner: { name: 'Olga Asesora' },
        items: [
          { id: 'i1', sku: 'S1', name: 'Cámara', quantity: 1, currency: 'COP', unitPrice: '1000.00', lineTotal: '1000.00' },
          { id: 'i2', sku: 'S2', name: 'Sensor', quantity: 2, currency: 'COP', unitPrice: null, lineTotal: '0.00' },
        ],
        statusEvents: [
          { fromStatus: null, toStatus: 'enviada', createdAt: new Date('2026-11-01'), portalAccountId: 'pa-1', userId: null, note: null },
          { fromStatus: 'enviada', toStatus: 'negociacion', createdAt: new Date('2026-11-02'), portalAccountId: null, userId: 'staff-7', note: 'interno' },
        ],
      });
      const detail = await service.getCustomerQuote('pa-1', 'q1');
      expect(detail.items[1]).toMatchObject({ unitPrice: null, lineTotal: 0 });
      expect(detail.hasPendingPrices).toBe(true);
      expect(detail.total).toBe(1190);
      expect(detail.advisor).toEqual({ name: 'Olga Asesora' });
      expect(detail.history.map((e) => e.actor)).toEqual(['Tú', 'Tu asesor']);
      expect(JSON.stringify(detail)).not.toMatch(/staff-7|interno/);
    });
  });
});
