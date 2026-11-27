import { createHash } from 'crypto';
jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CustomerPortalService, portalPricing } from './customer-portal.service';

const prisma: any = {
  portalAccount: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  portalTier: {findUnique:jest.fn(),findFirst:jest.fn(),findMany:jest.fn(),create:jest.fn(),update:jest.fn()},
  user: { findUnique: jest.fn() },
  $transaction: jest.fn((operation) => operation(prisma)),
  $queryRaw: jest.fn(),
  portalSession: { create: jest.fn(), updateMany: jest.fn() },
  portalPriceListMapping: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
  brand: { findMany: jest.fn().mockResolvedValue([]) },
  product: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  price: { findMany: jest.fn(), findFirst: jest.fn() },
  // La tarifa vive en la biblioteca y se resuelve por id (sin relación entre bases).
  priceList: { findUnique: jest.fn(), findMany: jest.fn(async ({ where }: any) => where.id.in.map((id: string) => ({ id, isActive: true, name: id, code: id, currency: 'COP' }))) },
  customer: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
};
const jwt: any = { sign: jest.fn(() => 'portal-token') };
const config: any = { get: jest.fn((_key: string, fallback?: unknown) => fallback) };
const audit: any = { log: jest.fn() };
const ADMIN = { userId: 'staff-1', roles: ['Super Admin'] };
// The scope rules have their own spec (portal-account-access.service.spec.ts); here the person always reaches the account.
const access: any = { assertAccount: jest.fn().mockResolvedValue({}), requireScope: jest.fn().mockResolvedValue('global'), readWhere: jest.fn().mockResolvedValue({}), teamIds: jest.fn(), assertCustomerLinkable: jest.fn().mockResolvedValue(undefined), ownerInScope: jest.fn().mockResolvedValue(true) };
const assignment: any = { assignForAccount: jest.fn().mockResolvedValue(null), canManage: jest.fn().mockResolvedValue(true) };
const notifications: any = { create: jest.fn().mockResolvedValue({}) };

describe('CustomerPortalService', () => {
  let service: CustomerPortalService;
  beforeEach(() => { jest.clearAllMocks(); service = new CustomerPortalService(prisma, jwt, config, audit, undefined, access, assignment, notifications); });

  // ---------- Login ----------

  it('cuenta PENDING con contraseña correcta recibe 403 explícito, no 401', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', passwordHash: 'hash', state: 'PENDING' });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await expect(service.login('sales@acme.co', 'password', {})).rejects.toThrow(ForbiddenException);
  });

  it('login con hash antiguo con prefijo sha256: compara el digest de la contraseña contra el hash sin prefijo', async () => {
    const digest = createHash('sha256').update('Clave-larga-de-prueba-9!').digest('hex');
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', passwordHash: 'sha256:stored-bcrypt', state: 'REJECTED' });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    await expect(service.login('sales@acme.co', 'Clave-larga-de-prueba-9!', {})).rejects.toThrow(ForbiddenException);
    expect(bcrypt.compare).toHaveBeenCalledWith(digest, 'stored-bcrypt');
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
    prisma.$queryRaw.mockResolvedValueOnce([{ passwordHash: 'hash' }]);
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

  it('rechaza el login si el hash verificado cambió antes de emitir la sesión', async () => {
    prisma.portalAccount.findUnique.mockResolvedValueOnce({ id: 'p1', passwordHash: 'old-hash', state: 'ACTIVE' });
    prisma.$queryRaw.mockResolvedValueOnce([{ passwordHash: 'new-hash' }]);
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

    await expect(service.login('sales@acme.co', 'old-password', {})).rejects.toThrow(UnauthorizedException);
    expect(prisma.portalSession.create).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  // ---------- Catálogo ----------

  it('los precios del cliente exigen mapping activo para el tipo (sin tarifa: lista vacía, sin leer precios)', async () => {
    prisma.portalPriceListMapping.findUnique.mockResolvedValue(null);
    await expect(service.getCatalogPrices(['product-1'], 'INSTALLER' as any)).resolves.toEqual({ prices: [] });
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });

  it('los precios del cliente se resuelven por tipo en una consulta batch', async () => {
    prisma.portalPriceListMapping.findUnique.mockResolvedValue({ priceListId: 'pl-1', priceList: { isActive: true } });
    prisma.product.findMany.mockResolvedValue([{ id: 'product-1' }, { id: 'product-2' }]);
    prisma.price.findMany.mockResolvedValue([
      { productId: 'product-1', value: { toString: () => '150000.00' }, currency: 'COP' },
    ]);

    const result = await service.getCatalogPrices(['product-1', 'product-2'], 'FINAL_CUSTOMER' as any);

    expect(prisma.price.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.price.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ priceListId: 'pl-1', productId: { in: ['product-1', 'product-2'] } }),
    }));
    expect(result.prices).toEqual([{ productId: 'product-1', value: '150000.00', currency: 'COP' }]);
  });

  // ---------- Aprobación / rechazo ----------

  it('no aprueba una cuenta sin tarifa activa para su tipo', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'PENDING', type: 'INSTALLER', advisorId: 'adv-1' });
    prisma.portalPriceListMapping.findUnique.mockResolvedValue(null);
    await expect(service.approve('p1', {}, ADMIN)).rejects.toThrow(BadRequestException);
  });

  it('aprobar reutiliza el Customer enlazado por coincidencia de NIT/email', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'PENDING', type: 'INSTALLER', customerId: 'cust-1', advisorId: 'adv-1' });
    prisma.customer.findUnique.mockResolvedValue({ id: 'cust-1', isActive: true, ownerId: 'adv-1' });
    prisma.portalPriceListMapping.findUnique.mockResolvedValue({ priceListId: 'pl-1', priceList: { isActive: true } });
    prisma.portalAccount.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.approve('p1', {}, ADMIN);

    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.portalAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1', state: 'PENDING' },
      data: expect.objectContaining({ state: 'ACTIVE', customerId: 'cust-1' }),
    }));
    expect(result.customerId).toBe('cust-1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve', entity: 'PortalAccount' }));
  });

  it('aprobar sin coincidencia crea un Customer con código CL-#### y documentType NIT', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'PENDING', type: 'FINAL_CUSTOMER', customerId: null, advisorId: 'adv-1', companyName: 'Acme', documentId: '900123456', email: 'sales@acme.co', phone: null });
    prisma.portalPriceListMapping.findUnique.mockResolvedValue({ priceListId: 'pl-1', priceList: { isActive: true } });
    prisma.customer.findFirst.mockResolvedValue({ code: 'CL-0007' });
    prisma.customer.findUnique.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'cust-new' });
    prisma.portalAccount.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.approve('p1', {}, ADMIN);

    expect(prisma.customer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ code: 'CL-0008', documentType: 'NIT', status: 'CLIENTE', source: 'WEB', ownerId: 'adv-1' }),
    }));
    expect(result.customerId).toBe('cust-new');
  });

  describe('aprobar busca antes al cliente que ya existe (NIT/correo)', () => {
    const pending = (over: Record<string, unknown> = {}) => ({ id: 'p1', state: 'PENDING', type: 'FINAL_CUSTOMER', customerId: null, advisorId: 'adv-1', companyName: 'Acme', documentId: '900.123.456-7', email: 'Ventas@Acme.co', phone: null, ...over });
    const hit = (over: Record<string, unknown> = {}) => ({ id: 'cust-9', name: 'Acme', ownerId: 'adv-2', isActive: true, documentId: '900123456', byDocument: true, byEmail: false, ...over });
    const values = () => prisma.$queryRaw.mock.calls[0].slice(1).flatMap((part: any) => (part && Array.isArray(part.values) ? part.values : [part]));
    beforeEach(() => {
      prisma.portalAccount.findUnique.mockResolvedValue(pending());
      prisma.portalPriceListMapping.findUnique.mockResolvedValue({ priceListId: 'pl-1', priceList: { isActive: true } });
      prisma.portalAccount.updateMany.mockResolvedValue({ count: 1 });
      prisma.customer.findFirst.mockResolvedValue({ code: 'CL-0007' });
      prisma.customer.findUnique.mockResolvedValue({ id: 'cust-9', isActive: true, ownerId: 'adv-2' });
      prisma.customer.create.mockResolvedValue({ id: 'cust-new' });
      prisma.$queryRaw.mockResolvedValue([]);
    });

    it('con un cliente que ya tiene ese NIT (escrito distinto) lo vincula y no crea otro; manda el asesor de la empresa', async () => {
      prisma.$queryRaw.mockResolvedValue([hit()]);
      const result = await service.approve('p1', {}, ADMIN);
      expect(values()).toEqual(expect.arrayContaining(['900123456', 'ventas@acme.co']));
      expect(prisma.customer.create).not.toHaveBeenCalled();
      expect(prisma.portalAccount.updateMany.mock.calls[0][0].data).toMatchObject({ state: 'ACTIVE', customerId: 'cust-9', advisorId: 'adv-2' });
      expect(result).toMatchObject({ customerId: 'cust-9', advisorId: 'adv-2' });
    });

    it('con un cliente que solo coincide por correo (y no tiene otro NIT) lo vincula', async () => {
      prisma.$queryRaw.mockResolvedValue([hit({ byDocument: false, byEmail: true, documentId: null })]);
      const result = await service.approve('p1', {}, ADMIN);
      expect(result.customerId).toBe('cust-9');
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('con dos coincidencias (NIT en uno, correo en otro) responde 409 CUSTOMER_AMBIGUOUS y deja la cuenta pendiente', async () => {
      prisma.$queryRaw.mockResolvedValue([hit(), hit({ id: 'cust-10', byDocument: false, byEmail: true })]);
      const error: any = await service.approve('p1', {}, ADMIN).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'CUSTOMER_AMBIGUOUS' });
      expect(prisma.customer.create).not.toHaveBeenCalled();
      expect(prisma.portalAccount.updateMany).not.toHaveBeenCalled();
    });

    it('si el correo es de un cliente con otro NIT no lo vincula: 409 CUSTOMER_AMBIGUOUS', async () => {
      prisma.$queryRaw.mockResolvedValue([hit({ byDocument: false, byEmail: true, documentId: '800111222' })]);
      await expect(service.approve('p1', {}, ADMIN)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CUSTOMER_AMBIGUOUS' }) });
      expect(prisma.portalAccount.updateMany).not.toHaveBeenCalled();
    });

    it('si el único cliente con ese NIT está desactivado responde 409 CUSTOMER_AMBIGUOUS', async () => {
      prisma.$queryRaw.mockResolvedValue([hit({ isActive: false })]);
      await expect(service.approve('p1', {}, ADMIN)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CUSTOMER_AMBIGUOUS' }) });
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('si el cliente encontrado está fuera del alcance de quien aprueba responde 409 CUSTOMER_OUT_OF_SCOPE sin revelar su nombre', async () => {
      prisma.$queryRaw.mockResolvedValue([hit({ name: 'Nombre Secreto' })]);
      access.assertCustomerLinkable.mockRejectedValueOnce(new ForbiddenException('Este cliente no está en tu alcance'));
      const error: any = await service.approve('p1', {}, { userId: 'v1', roles: [] }).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'CUSTOMER_OUT_OF_SCOPE' });
      expect(JSON.stringify(error.getResponse())).not.toContain('Nombre Secreto');
      expect(prisma.portalAccount.updateMany).not.toHaveBeenCalled();
    });

    it('sin coincidencia crea el cliente con NIT y correo normalizados', async () => {
      prisma.customer.findUnique.mockResolvedValue(null); // the next CL code is free
      const result = await service.approve('p1', {}, ADMIN);
      expect(prisma.customer.create.mock.calls[0][0].data).toMatchObject({ code: 'CL-0008', documentType: 'NIT', documentId: '900123456', email: 'ventas@acme.co', source: 'WEB', status: 'CLIENTE' });
      expect(result.customerId).toBe('cust-new');
    });

    it('un dígito de verificación equivocado en la cuenta web NO bloquea la aprobación: se ignora y se guarda la base', async () => {
      // 900123456 has verification digit 8 (hand-calculated); the account was registered with 7.
      prisma.portalAccount.findUnique.mockResolvedValue(pending({ documentId: '900.123.456-7' }));
      prisma.customer.findUnique.mockResolvedValue(null);
      const result = await service.approve('p1', {}, ADMIN);
      expect(result.customerId).toBe('cust-new');
      expect(prisma.customer.create.mock.calls[0][0].data).toMatchObject({ documentType: 'NIT', documentId: '900123456' });
    });

    it('un NIT de 10 dígitos cuyo último dígito es el DV calculado busca y crea con la base de 9 dígitos', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue(pending({ documentId: '9001234568' }));
      prisma.$queryRaw.mockResolvedValue([hit()]);
      const result = await service.approve('p1', {}, ADMIN);
      expect(values()).toEqual(expect.arrayContaining(['900123456']));
      expect(result.customerId).toBe('cust-9');
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('si otra persona creó el mismo NIT en medio (P2002) responde 409 CUSTOMER_DUPLICATE, no 500', async () => {
      prisma.customer.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5.22.0', meta: { target: ['documentType', 'documentId'] } } as any));
      const error: any = await service.approve('p1', {}, ADMIN).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({ code: 'CUSTOMER_DUPLICATE', field: 'documentId' });
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('un cliente elegido a mano no pasa por la búsqueda automática', async () => {
      await service.approve('p1', { customerId: 'cust-9' }, ADMIN);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  it('rechazar exige PENDING y registra el motivo con auditoría', async () => {
    prisma.portalAccount.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.reject('p1', { reason: 'Datos incompletos' }, ADMIN);
    expect(prisma.portalAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1', state: 'PENDING' },
      data: expect.objectContaining({ state: 'REJECTED', rejectionReason: 'Datos incompletos' }),
    }));
    expect(result.state).toBe('REJECTED');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'reject', entity: 'PortalAccount' }));
  });

  it('rechazar una cuenta ya revisada lanza 409', async () => {
    prisma.portalAccount.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reject('p1', { reason: 'x'.repeat(10) }, ADMIN)).rejects.toThrow(ConflictException);
  });
  it('without a configured tariff no price is read',async()=>{
    prisma.portalPriceListMapping.findUnique.mockResolvedValue(null);
    await expect(service.getCatalogPrices(['product-1'],'FINAL_CUSTOMER' as any)).resolves.toEqual({prices:[]});
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });
  it('an assigned custom tier determines pricing instead of a client-supplied category',async()=>{
    prisma.portalTier.findUnique.mockResolvedValue({id:'gold',isActive:true,priceListId:'gold-list',priceList:{isActive:true}});
    prisma.product.findMany.mockResolvedValue([{id:'product-1'}]);
    prisma.price.findMany.mockResolvedValue([]);
    await service.getCatalogPrices(['product-1'],'FINAL_CUSTOMER' as any,'gold');
    expect(prisma.price.findMany.mock.calls[0][0].where.priceListId).toBe('gold-list');
    expect(prisma.portalPriceListMapping.findUnique).not.toHaveBeenCalled();
  });
  it('an inactive custom tier cannot reveal its prices',async()=>{
    prisma.portalTier.findUnique.mockResolvedValue({isActive:false});
    await expect(service.getCatalogPrices(['product-1'],'FINAL_CUSTOMER' as any,'gold')).resolves.toEqual({prices:[]});
    expect(prisma.price.findMany).not.toHaveBeenCalled();
  });
  it('aprobar exige un asesor asignado (409) antes de activar', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'PENDING', type: 'FINAL_CUSTOMER', advisorId: null });
    await expect(service.approve('p1', {}, ADMIN)).rejects.toThrow('Asigna un asesor antes de activar');
    expect(prisma.portalAccount.updateMany).not.toHaveBeenCalled();
  });
  it('aprobar con un cliente de otro responsable deja a la cuenta con el asesor de la empresa', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'PENDING', type: 'FINAL_CUSTOMER', advisorId: 'adv-1' });
    prisma.portalPriceListMapping.findUnique.mockResolvedValue({ priceListId: 'pl-1', priceList: { isActive: true } });
    prisma.customer.findUnique.mockResolvedValue({ id: 'c9', isActive: true, ownerId: 'adv-2' });
    prisma.portalAccount.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.approve('p1', { customerId: 'c9' }, ADMIN);
    expect(prisma.portalAccount.updateMany.mock.calls[0][0].data).toMatchObject({ state: 'ACTIVE', customerId: 'c9', advisorId: 'adv-2' });
    expect(result.advisorId).toBe('adv-2');
  });
  it('aprobar con un cliente fuera del alcance de quien aprueba no cambia nada (403)', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'PENDING', type: 'FINAL_CUSTOMER', advisorId: 'adv-1' });
    prisma.portalPriceListMapping.findUnique.mockResolvedValue({ priceListId: 'pl-1', priceList: { isActive: true } });
    prisma.customer.findUnique.mockResolvedValue({ id: 'c9', isActive: true, ownerId: 'other' });
    access.assertCustomerLinkable.mockRejectedValueOnce(new ForbiddenException('Este cliente no está en tu alcance'));
    await expect(service.approve('p1', { customerId: 'c9' }, { userId: 'v1', roles: [] })).rejects.toThrow(ForbiddenException);
    expect(access.assertCustomerLinkable).toHaveBeenCalledWith({ userId: 'v1', roles: [] }, { id: 'c9', isActive: true, ownerId: 'other' });
    expect(prisma.portalAccount.updateMany).not.toHaveBeenCalled();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });
  it('aprobar es atómico: si otra revisión ganó (0 filas) responde 409 dentro de la transacción', async () => {
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'PENDING', type: 'FINAL_CUSTOMER', customerId: null, advisorId: 'adv-1', companyName: 'Acme', documentId: null, email: 'a@b.co', phone: null });
    prisma.portalPriceListMapping.findUnique.mockResolvedValue({ priceListId: 'pl-1', priceList: { isActive: true } });
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.findUnique.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue({ id: 'cust-new' });
    prisma.portalAccount.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approve('p1', {}, ADMIN)).rejects.toThrow('La cuenta ya fue revisada');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  describe('tarifa de la cuenta', () => {
    it('se puede asignar a una cuenta sin cliente vinculado y se guarda en la cuenta', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'PENDING', tierId: null, customerId: null, customer: null });
      prisma.portalTier.findUnique.mockResolvedValue({ isActive: true });
      prisma.portalAccount.update.mockResolvedValue({ id: 'p1', tierId: 'gold' });
      expect(await service.assignTier('p1', { tierId: 'gold' }, ADMIN)).toEqual({ id: 'p1', customerId: null, tierId: 'gold', priceListId: null, customerTierId: null, effectiveTierId: 'gold' });
      expect(prisma.portalAccount.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { tierId: 'gold' } });
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ entity: 'PortalAccount', entityId: 'p1', newValues: { tierId: 'gold' } }));
    });
    it('requires active tiers', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'ACTIVE', tierId: null, customerId: null, customer: null });
      prisma.portalTier.findUnique.mockResolvedValue({ isActive: false });
      await expect(service.assignTier('p1', { tierId: 'gold' }, ADMIN)).rejects.toThrow(BadRequestException);
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
    });
    it('si el cliente vinculado ya tiene su propia tarifa, esa prevalece (y se avisa cuál se aplica)', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'ACTIVE', tierId: null, customerId: 'c1', customer: { portalTierId: 'platinum' } });
      prisma.portalTier.findUnique.mockResolvedValue({ isActive: true });
      prisma.portalAccount.update.mockResolvedValue({ id: 'p1', tierId: 'gold' });
      expect(await service.assignTier('p1', { tierId: 'gold' }, ADMIN)).toMatchObject({ tierId: 'gold', customerTierId: 'platinum', effectiveTierId: 'platinum' });
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
    it('null devuelve la cuenta a la tarifa general', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'ACTIVE', tierId: 'gold', customerId: null, customer: null });
      prisma.portalAccount.update.mockResolvedValue({ id: 'p1', tierId: null });
      await service.assignTier('p1', { tierId: null }, ADMIN);
      expect(prisma.portalAccount.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { tierId: null } });
    });
    it('rechaza una solicitud rechazada', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', state: 'REJECTED', tierId: null, customerId: null, customer: null });
      await expect(service.assignTier('p1', { tierId: 'gold' }, ADMIN)).rejects.toThrow('rechazada');
    });
    it('sin tarifa ni escalafón en el cuerpo responde 400', async () => {
      await expect(service.assignTier('p1', {}, ADMIN)).rejects.toThrow(BadRequestException);
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
    });

    describe('al elegir una tarifa (lista de precios)', () => {
      const LIST = { id: 'pl-1', name: 'Instaladores', code: 'INST', currency: 'COP', isActive: true };
      beforeEach(() => {
        prisma.portalAccount.findUnique.mockReset().mockResolvedValue({ id: 'p1', state: 'ACTIVE', tierId: null, customerId: null, customer: null });
        prisma.portalAccount.update.mockReset().mockResolvedValue({ id: 'p1', tierId: 'tier-new' });
        prisma.priceList.findUnique.mockReset().mockResolvedValue(LIST);
        prisma.portalTier.findFirst.mockReset().mockResolvedValue(null);
        prisma.portalTier.create.mockReset().mockResolvedValue({ id: 'tier-new', name: 'Instaladores', priceListId: 'pl-1', isActive: true });
      });

      it('crea el escalafón de esa tarifa cuando no existe, lo audita y lo asigna a la cuenta', async () => {
        const result = await service.assignTier('p1', { priceListId: 'pl-1' }, ADMIN);
        expect(prisma.portalTier.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Instaladores', priceListId: 'pl-1', isActive: true }) });
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ userId: 'staff-1', action: 'create', entity: 'PortalTier', entityId: 'tier-new', newValues: { name: 'Instaladores', priceListId: 'pl-1', isActive: true } }));
        expect(prisma.portalAccount.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { tierId: 'tier-new' } });
        expect(result).toEqual({ id: 'p1', customerId: null, tierId: 'tier-new', priceListId: 'pl-1', customerTierId: null, effectiveTierId: 'tier-new' });
      });
      it('reutiliza el escalafón activo más antiguo de esa tarifa sin crear otro', async () => {
        prisma.portalTier.findFirst.mockResolvedValueOnce({ id: 'tier-old', name: 'Instaladores', priceListId: 'pl-1', isActive: true });
        prisma.portalAccount.update.mockResolvedValue({ id: 'p1', tierId: 'tier-old' });
        const result = await service.assignTier('p1', { priceListId: 'pl-1' }, ADMIN);
        expect(prisma.portalTier.findFirst).toHaveBeenCalledWith({ where: { priceListId: 'pl-1', isActive: true }, orderBy: { createdAt: 'asc' } });
        expect(prisma.portalTier.create).not.toHaveBeenCalled();
        expect(prisma.portalAccount.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { tierId: 'tier-old' } });
        expect(result).toMatchObject({ tierId: 'tier-old', priceListId: 'pl-1' });
      });
      it('si el nombre de la tarifa ya lo usa otro escalafón, agrega el código al nombre', async () => {
        prisma.portalTier.findFirst
          .mockResolvedValueOnce(null) // no tier for this list yet
          .mockResolvedValueOnce({ id: 'other', name: 'Instaladores' }) // name taken
          .mockResolvedValueOnce(null); // name with code is free
        await service.assignTier('p1', { priceListId: 'pl-1' }, ADMIN);
        expect(prisma.portalTier.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Instaladores (INST)' }) });
      });
      it('si otra persona creó el escalafón al mismo tiempo (P2002), reutiliza ese', async () => {
        prisma.portalTier.findFirst
          .mockResolvedValueOnce(null).mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'tier-raced', priceListId: 'pl-1', isActive: true });
        prisma.portalTier.create.mockRejectedValueOnce({ code: 'P2002' });
        prisma.portalAccount.update.mockResolvedValue({ id: 'p1', tierId: 'tier-raced' });
        expect(await service.assignTier('p1', { priceListId: 'pl-1' }, ADMIN)).toMatchObject({ tierId: 'tier-raced' });
      });
      it.each([
        ['inactiva', { ...LIST, isActive: false }],
        ['inexistente', null],
      ])('una tarifa %s responde 400 y no crea ni asigna nada', async (_label, list) => {
        prisma.priceList.findUnique.mockResolvedValue(list);
        await expect(service.assignTier('p1', { priceListId: 'pl-1' }, ADMIN)).rejects.toThrow('Selecciona una tarifa activa');
        expect(prisma.portalTier.create).not.toHaveBeenCalled();
        expect(prisma.portalAccount.update).not.toHaveBeenCalled();
      });
      it('tierId y priceListId juntos responden 400', async () => {
        await expect(service.assignTier('p1', { tierId: 'gold', priceListId: 'pl-1' }, ADMIN)).rejects.toThrow(BadRequestException);
        await expect(service.assignTier('p1', { tierId: null, priceListId: 'pl-1' }, ADMIN)).rejects.toThrow(BadRequestException);
        expect(prisma.portalTier.create).not.toHaveBeenCalled();
        expect(prisma.portalAccount.update).not.toHaveBeenCalled();
      });
      it('priceListId null (o tierId null) devuelve la cuenta a la tarifa general sin tocar escalafones', async () => {
        prisma.portalAccount.update.mockResolvedValue({ id: 'p1', tierId: null });
        const result = await service.assignTier('p1', { priceListId: null }, ADMIN);
        expect(prisma.portalAccount.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { tierId: null } });
        expect(prisma.priceList.findUnique).not.toHaveBeenCalled();
        expect(prisma.portalTier.create).not.toHaveBeenCalled();
        expect(result).toMatchObject({ tierId: null, priceListId: null, effectiveTierId: null });
      });
      it('crear el escalafón automático solo exige portalAccounts:manage sobre la cuenta (no portalTariffs:manage)', async () => {
        const person = { userId: 'v1', roles: ['Vendedor'] };
        await service.assignTier('p1', { priceListId: 'pl-1' }, person);
        expect(access.assertAccount).toHaveBeenCalledWith('portalAccounts:manage', person, 'p1');
        expect(prisma.portalTier.create).toHaveBeenCalled();
        expect(access.requireScope).not.toHaveBeenCalledWith('portalTariffs:manage', expect.anything());
      });
    });
    it('checks the scope of the person on that account first', async () => {
      access.assertAccount.mockRejectedValueOnce(new ForbiddenException('Esta cuenta no está en tu alcance'));
      await expect(service.assignTier('p1', { tierId: 'gold' }, { userId: 'v1', roles: [] })).rejects.toThrow(ForbiddenException);
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
    });
  });

  describe('portalPricing', () => {
    it('da precios con la tarifa de la cuenta aunque no tenga cliente vinculado', () => {
      expect(portalPricing({ type: 'FINAL_CUSTOMER', tierId: 'gold', customerId: null })).toEqual({ type: 'FINAL_CUSTOMER', tierId: 'gold' });
    });
    it('con cliente y sin nivel usa la tarifa general', () => {
      expect(portalPricing({ type: 'FINAL_CUSTOMER', tierId: null, customerId: 'c1' })).toEqual({ type: 'FINAL_CUSTOMER', tierId: null });
    });
    it('sin nivel y sin cliente se aplica la tarifa general', () => {
      expect(portalPricing({ type: 'FINAL_CUSTOMER', tierId: null, customerId: null })).toEqual({ type: 'FINAL_CUSTOMER', tierId: null });
    });
  });

  describe('vincular cliente: el asesor es de la empresa', () => {
    it('un cliente sin responsable toma el asesor de la cuenta como dueño', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', customerId: null, advisorId: 'adv-1' });
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, ownerId: null });
      prisma.portalAccount.update.mockResolvedValue({ id: 'p1', customerId: 'c1', advisorId: 'adv-1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'adv-1', name: 'Ana' });
      const result = await service.linkCustomer('p1', 'c1', ADMIN);
      expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { ownerId: 'adv-1' } });
      expect(prisma.portalAccount.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { customerId: 'c1', advisorId: 'adv-1' } });
      expect(result).toMatchObject({ customerId: 'c1', advisorId: 'adv-1', ownerAssigned: true, advisorChanged: false });
      expect(audit.log).toHaveBeenCalled();
    });
    it('si el cliente ya tiene otro responsable, la cuenta pasa a su asesor y se informa', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', customerId: null, advisorId: 'adv-1' });
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, ownerId: 'adv-2' });
      prisma.portalAccount.update.mockResolvedValue({ id: 'p1', customerId: 'c1', advisorId: 'adv-2' });
      prisma.user.findUnique.mockResolvedValue({ id: 'adv-2', name: 'Beto' });
      const result = await service.linkCustomer('p1', 'c1', ADMIN);
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(prisma.portalAccount.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { customerId: 'c1', advisorId: 'adv-2' } });
      expect(result).toMatchObject({ advisorId: 'adv-2', advisorChanged: true, ownerAssigned: false, advisor: { id: 'adv-2', name: 'Beto' } });
    });
    it('un cliente fuera del alcance de quien enlaza se rechaza antes de cambiar nada', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', customerId: null, advisorId: 'adv-1' });
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, ownerId: 'other' });
      access.assertCustomerLinkable.mockRejectedValueOnce(new ForbiddenException('Este cliente no está en tu alcance'));
      await expect(service.linkCustomer('p1', 'c1', { userId: 'v1', roles: [] })).rejects.toThrow(ForbiddenException);
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
    it('sin asesor en la cuenta y sin dueño en el cliente no inventa uno', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', customerId: null, advisorId: null });
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', isActive: true, ownerId: null });
      prisma.portalAccount.update.mockResolvedValue({ id: 'p1', customerId: 'c1', advisorId: null });
      const result = await service.linkCustomer('p1', 'c1', ADMIN);
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ advisorId: null, advisorChanged: false, advisor: null });
    });
    it('no enlaza con un cliente inexistente o inactivo, y permite desenlazar', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'p1', customerId: 'c1', advisorId: 'adv-1' });
      prisma.customer.findUnique.mockResolvedValue({ id: 'c2', isActive: false });
      await expect(service.linkCustomer('p1', 'c2', ADMIN)).rejects.toThrow('Cliente no encontrado');
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
      prisma.portalAccount.update.mockResolvedValue({ id: 'p1', customerId: null, advisorId: 'adv-1' });
      expect(await service.linkCustomer('p1', null, ADMIN)).toMatchObject({ id: 'p1', customerId: null });
    });
  });

  describe('reasignar asesor', () => {
    const account = { id: 'p1', advisorId: 'adv-1', customerId: 'c1', contactName: 'Ana', companyName: 'Acme', customer: { ownerId: 'adv-1' } };
    beforeEach(() => {
      prisma.portalAccount.findUnique.mockResolvedValue(account);
      prisma.user.findUnique.mockResolvedValue({ id: 'adv-2', name: 'Beto', isActive: true, roles: [] });
      prisma.portalAccount.updateMany.mockResolvedValue({ count: 2 });
      assignment.canManage.mockResolvedValue(true);
      access.requireScope.mockResolvedValue('global');
    });
    it('global: cambia la cuenta, el dueño del cliente y las demás cuentas de la empresa, y avisa al nuevo asesor', async () => {
      const result = await service.assignAdvisor('p1', { advisorId: 'adv-2' }, ADMIN);
      expect(access.assertAccount).toHaveBeenCalledWith('portalAccounts:assign', ADMIN, 'p1');
      expect(prisma.portalAccount.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { advisorId: 'adv-2' } });
      expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { ownerId: 'adv-2' } });
      expect(prisma.portalAccount.updateMany).toHaveBeenCalledWith({ where: { customerId: 'c1', id: { not: 'p1' } }, data: { advisorId: 'adv-2' } });
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'adv-2', type: 'LEAD_ASSIGNED' }));
      expect(result).toEqual({ id: 'p1', advisorId: 'adv-2', advisor: { id: 'adv-2', name: 'Beto' }, customerOwnerUpdated: true, accountsUpdated: 3 });
    });
    it('una cuenta sin cliente solo cambia su asesor', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ ...account, advisorId: null, customerId: null });
      const result = await service.assignAdvisor('p1', { advisorId: 'adv-2' }, ADMIN);
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ customerOwnerUpdated: false, accountsUpdated: 1 });
    });
    it('equipo: puede asignar a alguien de su equipo', async () => {
      access.requireScope.mockResolvedValue('team');
      access.teamIds.mockResolvedValue(['sup-1', 'adv-2', 'adv-1']);
      await service.assignAdvisor('p1', { advisorId: 'adv-2' }, { userId: 'sup-1', roles: [] });
      expect(prisma.portalAccount.update).toHaveBeenCalled();
    });
    it('equipo: no puede asignar a alguien fuera de su equipo', async () => {
      access.requireScope.mockResolvedValue('team');
      access.teamIds.mockResolvedValue(['sup-1']);
      await expect(service.assignAdvisor('p1', { advisorId: 'adv-2' }, { userId: 'sup-1', roles: [] })).rejects.toThrow('Solo puedes asignar a ti o a alguien de tu equipo');
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });
    it('equipo: una empresa de otro equipo no se puede mover (403) y no se toca nada', async () => {
      access.requireScope.mockResolvedValue('team');
      access.teamIds.mockResolvedValue(['sup-1', 'adv-2']);
      prisma.portalAccount.findUnique.mockResolvedValue({ ...account, customer: { ownerId: 'outsider' } });
      await expect(service.assignAdvisor('p1', { advisorId: 'adv-2' }, { userId: 'sup-1', roles: [] })).rejects.toThrow('Esta empresa pertenece a otro equipo');
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(prisma.portalAccount.updateMany).not.toHaveBeenCalled();
    });
    it('equipo: una empresa sin dueño sí se puede asignar', async () => {
      access.requireScope.mockResolvedValue('team');
      access.teamIds.mockResolvedValue(['sup-1', 'adv-2']);
      prisma.portalAccount.findUnique.mockResolvedValue({ ...account, customer: { ownerId: null } });
      await service.assignAdvisor('p1', { advisorId: 'adv-2' }, { userId: 'sup-1', roles: [] });
      expect(prisma.customer.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { ownerId: 'adv-2' } });
    });
    it('propio: solo puede pasarla a sí mismo o a alguien de su equipo', async () => {
      access.requireScope.mockResolvedValue('own');
      access.teamIds.mockResolvedValue(['adv-1']);
      await expect(service.assignAdvisor('p1', { advisorId: 'adv-2' }, { userId: 'adv-1', roles: [] })).rejects.toThrow('Solo puedes asignar a ti o a alguien de tu equipo');
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
      access.teamIds.mockResolvedValue(['adv-1', 'adv-2']);
      await service.assignAdvisor('p1', { advisorId: 'adv-2' }, { userId: 'adv-1', roles: [] });
      expect(prisma.portalAccount.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { advisorId: 'adv-2' } });
    });
    it('propio: una empresa cuyo dueño está fuera de su equipo no se puede mover', async () => {
      access.requireScope.mockResolvedValue('own');
      access.teamIds.mockResolvedValue(['adv-1', 'adv-2']);
      prisma.portalAccount.findUnique.mockResolvedValue({ ...account, advisorId: 'adv-1', customer: { ownerId: 'outsider' } });
      await expect(service.assignAdvisor('p1', { advisorId: 'adv-2' }, { userId: 'adv-1', roles: [] })).rejects.toThrow('Esta empresa pertenece a otro equipo');
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
    it('el asesor elegido debe poder gestionar cuentas del portal', async () => {
      assignment.canManage.mockResolvedValue(false);
      await expect(service.assignAdvisor('p1', { advisorId: 'adv-2' }, ADMIN)).rejects.toThrow('no tiene permiso para gestionar cuentas del portal');
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
    });
    it('un Super Admin como destino se evalúa como tal', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'adv-2', name: 'Root', isActive: true, roles: [{ role: { name: 'Super Admin' } }] });
      await service.assignAdvisor('p1', { advisorId: 'adv-2' }, ADMIN);
      expect(assignment.canManage).toHaveBeenCalledWith('adv-2', true);
    });
    it('rechaza un asesor inexistente o inactivo', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'adv-2', name: 'Beto', isActive: false });
      await expect(service.assignAdvisor('p1', { advisorId: 'adv-2' }, ADMIN)).rejects.toThrow('El asesor elegido no existe o está inactivo');
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
    });
    it('sin permiso sobre la cuenta no cambia nada', async () => {
      access.assertAccount.mockRejectedValueOnce(new ForbiddenException('Esta cuenta no está en tu alcance'));
      await expect(service.assignAdvisor('p1', { advisorId: 'adv-2' }, { userId: 'v1', roles: [] })).rejects.toThrow(ForbiddenException);
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
    });
    it('no avisa a quien se asigna a sí mismo', async () => {
      await service.assignAdvisor('p1', { advisorId: 'adv-2' }, { userId: 'adv-2', roles: [] });
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('perfil: ciudad y asignación automática', () => {
    it('guarda una ciudad válida y busca asesor cuando la cuenta no tiene', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'a1', privacyAcceptedAt: new Date() });
      prisma.portalAccount.update.mockResolvedValue({ id: 'a1', companyName: 'ACME', privacyAcceptedAt: new Date(), city: '05001', advisorId: null, createdAt: new Date('2026-12-01') });
      const result = await service.updateProfile('a1', { companyName: 'ACME', city: '05001' } as any);
      expect(prisma.portalAccount.update.mock.calls[0][0].data.city).toBe('05001');
      expect(assignment.assignForAccount).toHaveBeenCalledWith('a1');
      expect(result.account.city).toMatchObject({ code: '05001', name: 'Medellín' });
      expect(result.account.profileComplete).toBe(true);
    });
    it('rechaza una ciudad inválida sin guardar', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'a1', privacyAcceptedAt: new Date() });
      await expect(service.updateProfile('a1', { companyName: 'ACME', city: '12345' } as any)).rejects.toMatchObject({ response: { code: 'INVALID_CITY', message: 'Elige tu ciudad de la lista' } });
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
    });
    it('no vuelve a asignar si la cuenta ya tiene asesor', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'a1', privacyAcceptedAt: new Date() });
      prisma.portalAccount.update.mockResolvedValue({ id: 'a1', companyName: 'ACME', privacyAcceptedAt: new Date(), city: '05001', advisorId: 'adv-1' });
      await service.updateProfile('a1', { companyName: 'ACME', city: '05001' } as any);
      expect(assignment.assignForAccount).not.toHaveBeenCalled();
    });
  });

  describe('precios por lote para la vitrina', () => {
    it('devuelve el precio vigente de la tarifa del nivel solo de referencias publicadas', async () => {
      prisma.portalTier.findUnique.mockResolvedValue({ id: 'gold', isActive: true, priceListId: 'gold-list' });
      prisma.product.findMany.mockResolvedValue([{ id: 'p1' }]);
      prisma.price.findMany.mockResolvedValue([{ productId: 'p1', value: { toString: () => '289000' }, currency: 'COP' }]);
      const result = await service.getCatalogPrices(['p1', 'oculto'], 'FINAL_CUSTOMER' as any, 'gold');
      expect(result).toEqual({ prices: [{ productId: 'p1', value: '289000', currency: 'COP' }] });
      expect(prisma.product.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ id: { in: ['p1', 'oculto'] }, lifecycleStatus: 'PUBLISHED', isVisible: true }));
      expect(prisma.price.findMany.mock.calls[0][0].where.productId).toEqual({ in: ['p1'] });
      expect(prisma.price.findMany.mock.calls[0][0].where.priceListId).toBe('gold-list');
    });
    it('sin tarifa aplicable no inventa precios ni consulta la tabla de precios', async () => {
      prisma.portalPriceListMapping.findUnique.mockResolvedValue(null);
      expect(await service.getCatalogPrices(['p1'], 'FINAL_CUSTOMER' as any, null)).toEqual({ prices: [] });
      expect(prisma.price.findMany).not.toHaveBeenCalled();
    });
    it('un nivel inactivo no rompe la vitrina: no muestra precios', async () => {
      prisma.portalTier.findUnique.mockResolvedValue({ isActive: false });
      expect(await service.getCatalogPrices(['p1'], 'FINAL_CUSTOMER' as any, 'gold')).toEqual({ prices: [] });
      expect(prisma.price.findMany).not.toHaveBeenCalled();
    });
  });
});
