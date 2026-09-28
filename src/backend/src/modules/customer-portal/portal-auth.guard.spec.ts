import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PortalAuthGuard, PORTAL_COOKIE } from './portal-auth.guard';

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
    guard = new PortalAuthGuard(jwt, prisma);
  });

  const buildContext = (opts: { cookie?: string; authHeader?: string }) => {
    const req: any = { cookies: opts.cookie ? { [PORTAL_COOKIE]: opts.cookie } : {}, headers: {} };
    if (opts.authHeader) req.headers.authorization = opts.authHeader;
    return { switchToHttp: () => ({ getRequest: () => req }) } as any;
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

  it('rechaza cuando la cuenta no está ACTIVE (PENDING/REJECTED)', async () => {
    const token = jwt.sign({ sub: 'acc-pending', jti: 'jti-pend', scope: 'customer_portal' });
    setAccount({ id: 'acc-pending', state: 'PENDING' });
    setSession({ accountId: 'acc-pending', revokedAt: null, expiresAt: new Date(Date.now() + 3600_000) });
    const ctx = buildContext({ cookie: token });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza un token malformado sin lanzar', async () => {
    setAccount(null);
    setSession(null);
    const ctx = buildContext({ cookie: 'not-a-jwt' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});