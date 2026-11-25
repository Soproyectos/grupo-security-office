jest.mock('./portal-auth/portal-auth.hash', () => ({ verifyPortalPassword: jest.fn() }));
import { verifyPortalPassword } from './portal-auth/portal-auth.hash';

import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { mapSetPasswordError } from './portal-auth/portal-auth.set-password';
import { CustomerPortalService } from './customer-portal.service';
import { CustomerPortalController } from './customer-portal.controller';

const prisma: any = {
  portalAuthAccount: { findFirst: jest.fn() },
  portalAccount: { delete: jest.fn() },
  portalAuthUser: { delete: jest.fn() },
  $transaction: jest.fn((op) => op(prisma)),
};
const audit: any = { log: jest.fn() };
const owner = { id: 'acc-1', email: 'Ana@Acme.co', authUserId: 'au-1' };

describe('CustomerPortalService self-service deletion', () => {
  let service: CustomerPortalService;
  beforeEach(() => {
    jest.resetAllMocks();
    (verifyPortalPassword as jest.Mock).mockImplementation(async ({ hash, password }: any) => hash === `h:${password}`);
    prisma.$transaction.mockImplementation((op: any) => op(prisma));
    service = new CustomerPortalService(prisma, {} as any, { get: jest.fn() } as any, audit, {} as any);
  });

  it('hasPassword: true with credential, false without it or without authUserId', async () => {
    prisma.portalAuthAccount.findFirst.mockResolvedValueOnce({ id: 'c1' });
    expect(await service.hasPassword('au-1')).toBe(true);
    prisma.portalAuthAccount.findFirst.mockResolvedValueOnce(null);
    expect(await service.hasPassword('au-1')).toBe(false);
    expect(await service.hasPassword(null)).toBe(false);
    expect(prisma.portalAuthAccount.findFirst).toHaveBeenCalledTimes(2);
  });

  it('deletes account then auth user in one transaction with a correct password; audit has no PII', async () => {
    prisma.portalAuthAccount.findFirst.mockResolvedValue({ password: 'h:Correcta-123' });
    const order: string[] = [];
    prisma.portalAccount.delete.mockImplementation(async () => { order.push('account'); });
    prisma.portalAuthUser.delete.mockImplementation(async () => { order.push('authUser'); });
    expect(await service.deleteOwnAccount(owner, { password: 'Correcta-123' })).toEqual({ deleted: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['account', 'authUser']);
    expect(prisma.portalAccount.delete).toHaveBeenCalledWith({ where: { id: 'acc-1' } });
    expect(prisma.portalAuthUser.delete).toHaveBeenCalledWith({ where: { id: 'au-1' } });
    expect(audit.log).toHaveBeenCalledWith({ action: 'delete', entity: 'PortalAccount', entityId: 'acc-1' });
    expect(JSON.stringify(audit.log.mock.calls)).not.toMatch(/acme|ana@/i);
  });

  it.each([{ password: 'mala' }, {}])('wrong or missing password -> 400 and nothing deleted (%j)', async (dto) => {
    prisma.portalAuthAccount.findFirst.mockResolvedValue({ password: 'h:Correcta-123' });
    const err = await service.deleteOwnAccount(owner, dto).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toEqual({ code: 'DELETE_CONFIRMATION_INVALID', message: 'La contraseña no es correcta' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.portalAccount.delete).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('Google account (no password): confirmEmail matches ignoring case', async () => {
    prisma.portalAuthAccount.findFirst.mockResolvedValue(null);
    expect(await service.deleteOwnAccount(owner, { confirmEmail: ' ANA@acme.CO ' })).toEqual({ deleted: true });
    expect(prisma.portalAuthUser.delete).toHaveBeenCalled();
  });

  it.each([{ confirmEmail: 'otro@acme.co' }, {}, { confirmEmail: '  ' }, { password: 'x' }])('Google account: wrong confirmation -> 400 (%j)', async (dto) => {
    prisma.portalAuthAccount.findFirst.mockResolvedValue(null);
    const err = await service.deleteOwnAccount(owner, dto).catch((e) => e);
    expect(err.getResponse()).toEqual({ code: 'DELETE_CONFIRMATION_INVALID', message: 'El correo escrito no coincide con el de tu cuenta' });
    expect(prisma.portalAccount.delete).not.toHaveBeenCalled();
  });

  it('legacy account without authUserId is confirmed by email and only deletes PortalAccount', async () => {
    await service.deleteOwnAccount({ id: 'acc-2', email: 'a@b.co', authUserId: null }, { confirmEmail: 'a@b.co' });
    expect(prisma.portalAuthAccount.findFirst).not.toHaveBeenCalled();
    expect(prisma.portalAuthUser.delete).not.toHaveBeenCalled();
    expect(prisma.portalAccount.delete).toHaveBeenCalledWith({ where: { id: 'acc-2' } });
  });

  it('maps a restrictive FK error to 409 instead of 500', async () => {
    prisma.portalAuthAccount.findFirst.mockResolvedValue(null);
    prisma.portalAccount.delete.mockRejectedValue({ code: 'P2003' });
    await expect(service.deleteOwnAccount(owner, { confirmEmail: 'ana@acme.co' })).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('CustomerPortalService first password (Google accounts)', () => {
  let service: CustomerPortalService;
  const google = { id: 'acc-1', email: 'anaperez@acme.co', contactName: 'Ana Perez', authUserId: 'au-1', hasPassword: false };
  const strong = 'Qv8#rLn2$Xwk-Pj5';
  beforeEach(() => {
    jest.resetAllMocks();
    service = new CustomerPortalService(prisma, {} as any, { get: jest.fn() } as any, audit, {} as any);
  });

  it('creates the password for a Google account, audits without personal data, returns {hasPassword:true}', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    expect(await service.createOwnPassword(google, strong, create)).toEqual({ hasPassword: true });
    expect(create).toHaveBeenCalledWith(strong);
    expect(audit.log).toHaveBeenCalledWith({ action: 'set-password', entity: 'PortalAccount', entityId: 'acc-1' });
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain(strong);
  });
  it('already has a password -> 400 PASSWORD_ALREADY_SET, nothing is created', async () => {
    const create = jest.fn();
    await expect(service.createOwnPassword({ ...google, hasPassword: true }, strong, create)).rejects.toMatchObject({ response: { code: 'PASSWORD_ALREADY_SET', message: 'Tu cuenta ya tiene contraseña. Puedes cambiarla en Mis datos.' } });
    expect(create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
  it('legacy account without authUserId -> 400 PASSWORD_NOT_AVAILABLE', async () => {
    const create = jest.fn();
    await expect(service.createOwnPassword({ ...google, authUserId: null }, strong, create)).rejects.toMatchObject({ response: { code: 'PASSWORD_NOT_AVAILABLE', message: 'Esta cuenta no puede crear contraseña aquí' } });
    expect(create).not.toHaveBeenCalled();
  });
  it.each([['short', 'Ab1!x'], ['no symbol', 'Abcdefghijk1m'], ['has the email', 'Xanaperez-9!Zq-w'], ['has the name', 'Perez-Clave-9xZq!w'], ['repeats', 'Abcd1!zzzzQwerty']])('weak password (%s) -> 400 WEAK_PASSWORD in Spanish', async (_n, pwd) => {
    const create = jest.fn();
    await expect(service.createOwnPassword(google, pwd, create)).rejects.toMatchObject({ response: { code: 'WEAK_PASSWORD' } });
    await expect(service.createOwnPassword(google, pwd, create)).rejects.toMatchObject({ response: { message: expect.stringContaining('La contraseña no cumple los requisitos') } });
    expect(create).not.toHaveBeenCalled();
  });
  it('does not audit when Better Auth refuses', async () => {
    const create = jest.fn().mockRejectedValue(new BadRequestException({ code: 'PASSWORD_ALREADY_SET', message: 'x' }));
    await expect(service.createOwnPassword(google, strong, create)).rejects.toBeInstanceOf(BadRequestException);
    expect(audit.log).not.toHaveBeenCalled();
  });
  it('controller acts only on the session owner and calls setPassword with the request headers', async () => {
    const portal: any = { createOwnPassword: jest.fn(async (_o: any, pwd: string, create: any) => { await create(pwd); return { hasPassword: true }; }) };
    const portalAuth: any = { setPassword: jest.fn().mockResolvedValue(undefined) };
    const controller = new CustomerPortalController(portal, { get: jest.fn() } as any, portalAuth);
    const req: any = { headers: { cookie: 'c=1' }, portalAccount: { id: 'acc-1', authUserId: 'au-1' } };
    expect(await controller.createPassword({ newPassword: strong, id: 'otro', authUserId: 'otro' } as any, req)).toEqual({ hasPassword: true });
    expect(portal.createOwnPassword).toHaveBeenCalledWith(req.portalAccount, strong, expect.any(Function));
    expect(portalAuth.setPassword).toHaveBeenCalledWith(req.headers, strong);
  });
  it('deleteOwnAccount skips the credential lookup when the guard already knows there is no password', async () => {
    prisma.portalAccount.delete.mockResolvedValue({});
    prisma.portalAuthUser.delete.mockResolvedValue({});
    prisma.$transaction.mockImplementation((op: any) => op(prisma));
    await service.deleteOwnAccount({ ...owner, hasPassword: false }, { confirmEmail: 'ana@acme.co' });
    expect(prisma.portalAuthAccount.findFirst).not.toHaveBeenCalled();
  });
});

describe('mapSetPasswordError', () => {
  it('maps Better Auth errors to Spanish HTTP errors', () => {
    const api = (statusCode: number, code?: string, message = 'm') => ({ statusCode, body: { code, message } });
    expect(mapSetPasswordError(api(400, 'PASSWORD_ALREADY_SET'))).toMatchObject({ response: { code: 'PASSWORD_ALREADY_SET' } });
    expect(mapSetPasswordError(api(401))).toBeInstanceOf(UnauthorizedException);
    expect(mapSetPasswordError(api(500, undefined, 'Failed to check password'))).toMatchObject({ response: { code: 'PASSWORD_CHECK_UNAVAILABLE' } });
  });
});

describe('CustomerPortalController self-service deletion', () => {
  it('uses the session owner, never an id from the body, and /me exposes hasPassword', async () => {
    const portal: any = { deleteOwnAccount: jest.fn().mockResolvedValue({ deleted: true }), hasPassword: jest.fn() };
    const controller = new CustomerPortalController(portal, { get: jest.fn() } as any);
    const req: any = { portalAccount: { id: 'acc-1', email: 'a@b.co', authUserId: 'au-1', hasPassword: true, linkedProviders: ['credential'] } };
    await controller.deleteOwnAccount({ password: 'x', id: 'otro', accountId: 'otro' } as any, req);
    expect(portal.deleteOwnAccount).toHaveBeenCalledWith(req.portalAccount, expect.any(Object));
    const me: any = await controller.me(req);
    expect(me.account.hasPassword).toBe(true);
    expect(me.account.linkedProviders).toEqual(['credential']);
    expect(portal.hasPassword).not.toHaveBeenCalled(); // derived by the guard, no extra query
  });
});
