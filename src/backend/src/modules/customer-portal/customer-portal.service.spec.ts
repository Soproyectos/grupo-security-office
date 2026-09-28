jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CustomerPortalService } from './customer-portal.service';

const prisma: any = {
  portalAccount: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  portalSession: { create: jest.fn(), updateMany: jest.fn() },
  portalPriceListMapping: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
  product: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  price: { findMany: jest.fn(), findFirst: jest.fn() },
  priceList: { findUnique: jest.fn() },
  customer: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
};
const jwt: any = { sign: jest.fn(() => 'portal-token') };
const config: any = { get: jest.fn((_key: string, fallback?: unknown) => fallback) };
const audit: any = { log: jest.fn() };

const REGISTER_DTO = {
  email: 'SALES@ACME.CO', password: 'long-password-12', contactName: 'Ana',
  companyName: 'Acme', documentId: '900123456', type: 'FINAL_CUSTOMER',
} as any;

describe('CustomerPortalService', () => {
  let service: CustomerPortalService;
  beforeEach(() => { jest.clearAllMocks(); service = new CustomerPortalService(prisma, jwt, config, audit); });

  // ---------- Registro ----------

  it('registra una cuenta PENDING normalizada, sin crear usuario interno', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue(null);
    prisma.customer.findFirst.mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hash');
    prisma.portalAccount.create.mockResolvedValue({ id: 'p1', state: 'PENDING' });

    const result = await service.register(REGISTER_DTO);

    expect(prisma.portalAccount.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'sales@acme.co', passwordHash: 'hash', documentId: '900123456', type: 'FINAL_CUSTOMER' }),
    }));
    expect(result.state).toBe('PENDING');
  });

  it('enlaza el Customer existente cuando el NIT coincide y sigue PENDING', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue(null);
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' });
    (bcrypt.hash as jest.Mock).mockResolvedValue('hash');
    prisma.portalAccount.create.mockResolvedValue({ id: 'p1', state: 'PENDING' });

    const result = await service.register(REGISTER_DTO);

    expect(prisma.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { email: { equals: 'sales@acme.co', mode: 'insensitive' } },
          { documentId: { equals: '900123456' } },
        ]),
      }),
    }));
    expect(prisma.portalAccount.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ customerId: 'cust-1' }),
    }));
    expect(result.state).toBe('PENDING');
    expect(result.matchedCustomerId).toBe('cust-1');
  });

  it('rechaza con 409 un correo ya registrado en el portal', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1' });
    await expect(service.register(REGISTER_DTO)).rejects.toThrow(ConflictException);
  });

  // ---------- Login ----------

  it('cuenta PENDING con contraseña correcta recibe 403 explícito, no 401', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', passwordHash: 'hash', state: 'PENDING' });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await expect(service.login('sales@acme.co', 'password', {})).rejects.toThrow(ForbiddenException);
  });

  it('cuenta REJECTED con contraseña correcta recibe 403', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', passwordHash: 'hash', state: 'REJECTED' });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await expect(service.login('sales@acme.co', 'password', {})).rejects.toThrow(ForbiddenException);
  });

  it('contraseña incorrecta recibe 401 genérico aunque la cuenta exista', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', passwordHash: 'hash', state: 'ACTIVE' });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(service.login('sales@acme.co', 'wrong', {})).rejects.toThrow(UnauthorizedException);
  });

  it('cuenta inexistente recibe 401 genérico (anti-enumeración, hash de descarte)', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue(null);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(service.login('ghost@acme.co', 'password', {})).rejects.toThrow(UnauthorizedException);
    expect(bcrypt.compare).toHaveBeenCalledWith('password', expect.stringContaining('$2b$12$'));
  });

  it('login de cuenta ACTIVE funciona sin depender de la tarifa configurada', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', email: 'sales@acme.co', passwordHash: 'hash', state: 'ACTIVE', type: 'INSTALLER' });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    prisma.portalSession.create.mockResolvedValue({});
    // Sin mapping configurado: el login NO se bloquea (el catálogo lo valida).

    const result = await service.login('sales@acme.co', 'password', {});

    expect(prisma.portalSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accountId: 'p1' }),
    }));
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'p1', scope: 'customer_portal' }),
      expect.objectContaining({ expiresIn: '8h' }),
    );
    expect(result.account).toEqual({ id: 'p1', email: 'sales@acme.co', type: 'INSTALLER' });
  });

  // ---------- Catálogo ----------

  it('el catálogo público no expone precios', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 'product-1', sku: 'SKU-1', name: 'Camera', description: null, category: { name: 'Video', slug: 'video' }, brand: { name: 'Acme', slug: 'acme' }, images: [] }]);
    prisma.product.count.mockResolvedValue(1);
    const result = await service.getCatalog({ page: 1, pageSize: 24 });
    expect(result.data[0]).not.toHaveProperty('price');
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('el catálogo del cliente exige mapping activo para el tipo', async () => {
    prisma.portalPriceListMapping.findUnique.mockResolvedValue(null);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);
    await expect(service.getCatalog({ page: 1, pageSize: 24 }, 'INSTALLER' as any)).rejects.toThrow(BadRequestException);
  });

  it('el catálogo del cliente resuelve el precio por tipo en una consulta batch', async () => {
    prisma.portalPriceListMapping.findUnique.mockResolvedValue({ priceListId: 'pl-1', priceList: { isActive: true } });
    prisma.product.findMany.mockResolvedValue([
      { id: 'product-1', sku: 'SKU-1', name: 'Camera', description: null, category: { name: 'Video', slug: 'video' }, brand: { name: 'Acme', slug: 'acme' }, images: [] },
      { id: 'product-2', sku: 'SKU-2', name: 'Sensor', description: null, category: { name: 'Video', slug: 'video' }, brand: { name: 'Acme', slug: 'acme' }, images: [] },
    ]);
    prisma.product.count.mockResolvedValue(2);
    prisma.price.findMany.mockResolvedValue([
      { productId: 'product-1', value: { toString: () => '150000.00' }, currency: 'COP' },
    ]);

    const result = await service.getCatalog({ page: 1, pageSize: 24 }, 'FINAL_CUSTOMER' as any);

    expect(prisma.price.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.price.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ priceListId: 'pl-1', productId: { in: ['product-1', 'product-2'] } }),
    }));
    expect(result.data[0].price).toEqual({ value: '150000.00', currency: 'COP' });
    expect(result.data[1].price).toBeNull();
  });

  // ---------- Aprobación / rechazo ----------

  it('no aprueba una cuenta sin tarifa activa para su tipo', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'PENDING', type: 'INSTALLER' });
    prisma.portalPriceListMapping.findUnique.mockResolvedValue(null);
    await expect(service.approve('p1', {}, 'staff-1')).rejects.toThrow(BadRequestException);
  });

  it('aprobar reutiliza el Customer enlazado por coincidencia de NIT/email', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'PENDING', type: 'INSTALLER', customerId: 'cust-1' });
    prisma.portalPriceListMapping.findUnique.mockResolvedValue({ priceListId: 'pl-1', priceList: { isActive: true } });
    prisma.portalAccount.update.mockResolvedValue({ id: 'p1', state: 'ACTIVE', type: 'INSTALLER' });

    const result = await service.approve('p1', {}, 'staff-1');

    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.portalAccount.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ state: 'ACTIVE', customerId: 'cust-1' }),
    }));
    expect(result.customerId).toBe('cust-1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve', entity: 'PortalAccount' }));
  });

  it('aprobar sin coincidencia crea un Customer con código CL-#### y documentType NIT', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'PENDING', type: 'FINAL_CUSTOMER', customerId: null, companyName: 'Acme', documentId: '900123456', email: 'sales@acme.co', phone: null });
    prisma.portalPriceListMapping.findUnique.mockResolvedValue({ priceListId: 'pl-1', priceList: { isActive: true } });
    prisma.customer.findFirst.mockResolvedValue({ code: 'CL-0007' });
    prisma.customer.findUnique.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'cust-new' });
    prisma.portalAccount.update.mockResolvedValue({ id: 'p1', state: 'ACTIVE', type: 'FINAL_CUSTOMER' });

    const result = await service.approve('p1', {}, 'staff-1');

    expect(prisma.customer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ code: 'CL-0008', documentType: 'NIT', status: 'CLIENTE', source: 'WEB' }),
    }));
    expect(result.customerId).toBe('cust-new');
  });

  it('rechazar exige PENDING y registra el motivo con auditoría', async () => {
    prisma.portalAccount.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.reject('p1', { reason: 'Datos incompletos' }, 'staff-1');
    expect(prisma.portalAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1', state: 'PENDING' },
      data: expect.objectContaining({ state: 'REJECTED', rejectionReason: 'Datos incompletos' }),
    }));
    expect(result.state).toBe('REJECTED');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'reject', entity: 'PortalAccount' }));
  });

  it('rechazar una cuenta ya revisada lanza 409', async () => {
    prisma.portalAccount.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reject('p1', { reason: 'x'.repeat(10) }, 'staff-1')).rejects.toThrow(ConflictException);
  });
});
