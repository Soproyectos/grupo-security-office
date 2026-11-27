import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { PortalAuthGuard, PORTAL_COOKIE, RequireApprovedPortalAccount } from './portal-auth.guard';

/**
 * PORTAL-03: los tokens del portal y del panel interno son dominios
 * distintos. Este spec instancia el guard real con un JwtService de prueba
 * y un PrismaService mockeado; no depende del módulo de testing (que tendría
 * un circular dependency con el propio guard).
 */
describe('PortalAuthGuard', () => {
  let jwt: JwtService;
  let guard: PortalAuthGuard;
  let prisma: any;

  beforeAll(() => {
    jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } });
    prisma = {
      portalAccount: { findUnique: jest.fn() },
      portalSession: { findUnique: jest.fn() },
    };
    guard = new PortalAuthGuard(jwt, prisma, undefined, new Reflector());
  });

  const buildContext = (opts: { cookie?: string; authHeader?: string }) => {
    const req: any = { cookies: opts.cookie ? { [PORTAL_COOKIE]: opts.cookie } : {}, headers: {} };
    if (opts.authHeader) req.headers.authorization = opts.authHeader;
    return { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => () => undefined, getClass: () => class {} } as any;
  };

  const setAccount = (account: any) => { prisma.portalAccount.findUnique.mockResolvedValue(account); };
  const setSession = (session: any) => { prisma.portalSession.findUnique.mockResolvedValue(session); };

  beforeEach(() => { jest.clearAllMocks(); });

  it('acepta un JWT de cliente con scope customer_portal', async () => {
    const token = jwt.sign({ sub: 'acc-1', jti: 'jti-1', scope: 'customer_portal' });
    setAccount({ id: 'acc-1', state: 'ACTIVE' });
    setSession({ accountId: 'acc-1', revokedAt: null, expiresAt: new Date(Date.now() + 3600_000) });
    const ctx = buildContext({ cookie: token });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rechaza un JWT interno (scope distinto) como sessión de cliente', async () => {
    const token = jwt.sign({ sub: 'staff-1', jti: 'jti-staff', scope: 'internal' });
    setAccount(null);
    setSession(null);
    const ctx = buildContext({ authHeader: `Bearer ${token}` });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(prisma.portalAccount.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza un JWT sin scope (token de otro dominio)', async () => {
    const token = jwt.sign({ sub: 'acc-1', jti: 'jti-2' });
    setAccount(null);
    setSession(null);
    const ctx = buildContext({ cookie: token });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una sessión revocada aunque el JWT siga vigente', async () => {
    const token = jwt.sign({ sub: 'acc-1', jti: 'jti-rev', scope: 'customer_portal' });
    setAccount({ id: 'acc-1', state: 'ACTIVE' });
    setSession({ accountId: 'acc-1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) });
    const ctx = buildContext({ cookie: token });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una sessión expirada', async () => {
    const token = jwt.sign({ sub: 'acc-1', jti: 'jti-exp', scope: 'customer_portal' });
    setAccount({ id: 'acc-1', state: 'ACTIVE' });
    setSession({ accountId: 'acc-1', revokedAt: null, expiresAt: new Date(Date.now() - 1000) });
    const ctx = buildContext({ cookie: token });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it.each(['REJECTED', 'SUSPENDED'])('rechaza cuando la cuenta está %s', async (state) => {
    const token = jwt.sign({ sub: 'acc-x', jti: 'jti-x', scope: 'customer_portal' });
    setAccount({ id: 'acc-x', state });
    setSession({ accountId: 'acc-x', revokedAt: null, expiresAt: new Date(Date.now() + 3600_000) });
    const ctx = buildContext({ cookie: token });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('deja entrar a una cuenta PENDING (para ver su perfil) y expone su estado', async () => {
    const token = jwt.sign({ sub: 'acc-pending', jti: 'jti-pend', scope: 'customer_portal' });
    setAccount({ id: 'acc-pending', state: 'PENDING', city: '05001', customerId: null, customer: null });
    setSession({ accountId: 'acc-pending', revokedAt: null, expiresAt: new Date(Date.now() + 3600_000) });
    const req: any = { cookies: { [PORTAL_COOKIE]: token }, headers: {} };
    await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }), getHandler: () => () => undefined, getClass: () => class {} } as any)).resolves.toBe(true);
    expect(req.portalAccount).toMatchObject({ id: 'acc-pending', state: 'PENDING', city: '05001', tierId: null, tier: null });
  });

  describe('@RequireApprovedPortalAccount', () => {
    class Routes {
      @RequireApprovedPortalAccount() priced() { return 1; }
      open() { return 2; }
    }
    const run = async (handler: Function, state: string) => {
      const token = jwt.sign({ sub: 'acc-1', jti: 'jti-r', scope: 'customer_portal' });
      setAccount({ id: 'acc-1', state, customerId: null, customer: null });
      setSession({ accountId: 'acc-1', revokedAt: null, expiresAt: new Date(Date.now() + 3600_000) });
      const req: any = { cookies: { [PORTAL_COOKIE]: token }, headers: {} };
      const withReflector = new PortalAuthGuard(jwt, prisma, undefined, new Reflector());
      return withReflector.canActivate({ switchToHttp: () => ({ getRequest: () => req }), getHandler: () => handler, getClass: () => Routes } as any);
    };
    it('a PENDING account is denied on a marked route with 403 ACCOUNT_PENDING', async () => {
      const error: any = await run(Routes.prototype.priced, 'PENDING').catch((e) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toEqual({ code: 'ACCOUNT_PENDING', message: 'Tu cuenta está en revisión' });
    });
    it('a PENDING account still gets through on unmarked routes (its own profile)', async () => {
      await expect(run(Routes.prototype.open, 'PENDING')).resolves.toBe(true);
    });
    it('an ACTIVE account passes marked routes', async () => {
      await expect(run(Routes.prototype.priced, 'ACTIVE')).resolves.toBe(true);
    });
  });

  it('la tarifa es la de la empresa: tierId y tier salen del cliente vinculado', async () => {
    const token = jwt.sign({ sub: 'acc-1', jti: 'jti-t', scope: 'customer_portal' });
    setAccount({ id: 'acc-1', state: 'ACTIVE', tierId: 'old-account-tier', customerId: 'c1', customer: { id: 'c1', portalTierId: 'gold', portalTier: { id: 'gold', name: 'Oro', isActive: true } } });
    setSession({ accountId: 'acc-1', revokedAt: null, expiresAt: new Date(Date.now() + 3600_000) });
    const req: any = { cookies: { [PORTAL_COOKIE]: token }, headers: {} };
    await guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }), getHandler: () => () => undefined, getClass: () => class {} } as any);
    expect(req.portalAccount).toMatchObject({ customerId: 'c1', tierId: 'gold', tier: { id: 'gold', name: 'Oro', isActive: true } });
  });

  it('rechaza un token malformado sin lanzar', async () => {
    setAccount(null);
    setSession(null);
    const ctx = buildContext({ cookie: 'not-a-jwt' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});