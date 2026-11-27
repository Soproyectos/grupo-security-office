jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';

const prisma: any = {
  portalAccount: { findUnique: jest.fn(), update: jest.fn() },
  portalAuthSession: { deleteMany: jest.fn() },
  portalSession: { updateMany: jest.fn() },
  $transaction: jest.fn((op: any) => op(prisma)),
};
const config: any = { get: jest.fn() };
const audit: any = { log: jest.fn() };
const ADMIN = { userId: 'admin1', roles: ['Super Admin'] };
// The scope rules have their own spec (portal-account-access.service.spec.ts); here the person always reaches the account.
const access: any = { assertAccount: jest.fn().mockResolvedValue({}), requireScope: jest.fn().mockResolvedValue('global'), readWhere: jest.fn().mockResolvedValue({}) };

describe('CustomerPortalService account rules', () => {
  let service: CustomerPortalService;
  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation(() => undefined);
    service = new CustomerPortalService(prisma, {} as any, config, audit, undefined, access);
  });

  describe('updateProfile', () => {
    it('requires acceptPrivacy when the account has not accepted yet', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'a1', privacyAcceptedAt: null });
      await expect(service.updateProfile('a1', { companyName: 'ACME' } as any)).rejects.toMatchObject({
        response: { code: 'PRIVACY_NOT_ACCEPTED', message: 'Debes aceptar la política de tratamiento de datos' },
      });
      expect(prisma.portalAccount.update).not.toHaveBeenCalled();
    });
    it('stores consent with the server-decided version and never touches type, tier or state', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'a1', privacyAcceptedAt: null });
      config.get.mockImplementation((k: string) => (k === 'PRIVACY_POLICY_VERSION' ? 'v-test' : undefined));
      prisma.portalAccount.update.mockImplementation(async ({ data }: any) => ({ id: 'a1', email: 'a@b.co', type: 'FINAL_CUSTOMER', contactName: 'Ana', tier: null, companyName: data.companyName, documentId: data.documentId ?? null, phone: data.phone ?? null, privacyAcceptedAt: data.privacyAcceptedAt, deletionRequestedAt: null }));
      const result = await service.updateProfile('a1', { companyName: '  ACME  ', documentId: '900123', phone: '3001234567', acceptPrivacy: true } as any);
      const data = prisma.portalAccount.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ companyName: 'ACME', documentId: '900123', phone: '3001234567', privacyVersion: 'v-test' });
      expect(data.privacyAcceptedAt).toBeInstanceOf(Date);
      for (const forbidden of ['type', 'tierId', 'tier', 'state']) expect(data).not.toHaveProperty(forbidden);
      expect(result.account.profileComplete).toBe(true);
    });
    it('keeps the original consent when already accepted', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'a1', privacyAcceptedAt: new Date('2026-01-01') });
      prisma.portalAccount.update.mockResolvedValue({ id: 'a1', companyName: 'ACME', privacyAcceptedAt: new Date('2026-01-01') });
      await service.updateProfile('a1', { companyName: 'ACME', acceptPrivacy: true } as any);
      const data = prisma.portalAccount.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('privacyAcceptedAt');
      expect(data).not.toHaveProperty('privacyVersion');
    });
  });

  describe('requestDeletion', () => {
    it('sets the date once and audits; repeating returns the same date without writing', async () => {
      prisma.portalAccount.findUnique.mockResolvedValueOnce({ id: 'a1', deletionRequestedAt: null });
      const first = await service.requestDeletion('a1');
      expect(prisma.portalAccount.update).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ entity: 'PortalAccount', entityId: 'a1' }));
      prisma.portalAccount.findUnique.mockResolvedValueOnce({ id: 'a1', deletionRequestedAt: first.deletionRequestedAt });
      const second = await service.requestDeletion('a1');
      expect(second.deletionRequestedAt).toBe(first.deletionRequestedAt);
      expect(prisma.portalAccount.update).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('suspend / reactivate', () => {
    it('suspends an ACTIVE account, deletes Better Auth sessions, revokes legacy ones and audits', async () => {
      prisma.portalAccount.findUnique.mockResolvedValue({ id: 'a1', state: 'ACTIVE', authUserId: 'u1' });
      const result = await service.suspend('a1', ' fraude ', ADMIN);
      expect(prisma.portalAccount.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { state: 'SUSPENDED' } });
      expect(prisma.portalAuthSession.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
      expect(prisma.portalSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { accountId: 'a1', revokedAt: null } }));
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin1', action: 'suspend', newValues: { state: 'SUSPENDED', reason: 'fraude' } }));
      expect(result).toEqual({ id: 'a1', state: 'SUSPENDED' });
    });
    it('suspend errors: 404, already suspended, not active', async () => {
      prisma.portalAccount.findUnique.mockResolvedValueOnce(null);
      await expect(service.suspend('x', 'motivo', ADMIN)).rejects.toBeInstanceOf(NotFoundException);
      prisma.portalAccount.findUnique.mockResolvedValueOnce({ id: 'a1', state: 'SUSPENDED' });
      await expect(service.suspend('a1', 'motivo', ADMIN)).rejects.toThrow('La cuenta ya está suspendida');
      prisma.portalAccount.findUnique.mockResolvedValueOnce({ id: 'a1', state: 'PENDING' });
      await expect(service.suspend('a1', 'motivo', ADMIN)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.portalAuthSession.deleteMany).not.toHaveBeenCalled();
    });
    it('reactivates only from SUSPENDED', async () => {
      prisma.portalAccount.findUnique.mockResolvedValueOnce({ id: 'a1', state: 'ACTIVE' });
      await expect(service.reactivate('a1', ADMIN)).rejects.toThrow('Solo se pueden reactivar cuentas suspendidas');
      prisma.portalAccount.findUnique.mockResolvedValueOnce({ id: 'a1', state: 'SUSPENDED' });
      expect(await service.reactivate('a1', ADMIN)).toEqual({ id: 'a1', state: 'ACTIVE' });
      expect(prisma.portalAccount.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { state: 'ACTIVE' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'reactivate' }));
    });
  });
});

describe('Customer prices profile gate', () => {
  const portal: any = { getCatalogPrices: jest.fn(() => ({ prices: [] })) };
  const controller = new CustomerPortalController(portal, { get: jest.fn() } as any);
  const incomplete: any = { portalAccount: { companyName: '(sin empresa)', privacyAcceptedAt: null, type: 'FINAL_CUSTOMER', tierId: null, customerId: 'c1' } };
  const res0: any = { setHeader: jest.fn() };

  it('prices answer 403 PROFILE_INCOMPLETE when the profile is incomplete', async () => {
    const error: any = await controller.customerPrices({ ids: ['p1'] } as any, incomplete, res0).catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toEqual({ code: 'PROFILE_INCOMPLETE', message: 'Completa tus datos para continuar' });
    expect(portal.getCatalogPrices).not.toHaveBeenCalled();
  });

  describe('company pricing', () => {
    const prices = jest.fn(() => ({ prices: [{ productId: 'p1' }] }));
    const pricedPortal: any = { getCatalogPrices: prices };
    const priced = new CustomerPortalController(pricedPortal, { get: jest.fn() } as any);
    const res: any = { setHeader: jest.fn() };
    const account = (over: any = {}) => ({ portalAccount: { companyName: 'ACME', privacyAcceptedAt: new Date(), type: 'FINAL_CUSTOMER', state: 'ACTIVE', customerId: 'c1', tierId: 'gold', ...over } }) as any;
    beforeEach(() => jest.clearAllMocks());

    it('prices use the company tier of the linked customer', async () => {
      await priced.customerPrices({ ids: ['p1'] } as any, account(), res);
      expect(prices).toHaveBeenCalledWith(['p1'], 'FINAL_CUSTOMER', 'gold');
    });
    it('an approved account without a linked customer still gets prices with its own tier', async () => {
      await priced.customerPrices({ ids: ['p1'] } as any, account({ customerId: null, tierId: 'gold' }), res);
      expect(prices).toHaveBeenCalledWith(['p1'], 'FINAL_CUSTOMER', 'gold');
    });
    it('without any tier the general tariff is asked for (tier null)', async () => {
      await priced.customerPrices({ ids: ['p1'] } as any, account({ customerId: null, tierId: null }), res);
      expect(prices).toHaveBeenCalledWith(['p1'], 'FINAL_CUSTOMER', null);
    });
  });
});
