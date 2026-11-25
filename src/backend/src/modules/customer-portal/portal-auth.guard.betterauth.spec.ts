import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PortalAuthGuard } from './portal-auth.guard';

describe('PortalAuthGuard with Better Auth', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  let prisma: any;
  let portalAuth: any;
  const ctx = (req: any) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;
  const baUser = { id: 'u1', email: 'a@b.co', emailVerified: false };

  beforeEach(() => {
    prisma = { portalAccount: { findUnique: jest.fn(), create: jest.fn() }, portalSession: { findUnique: jest.fn() } };
    portalAuth = { getSession: jest.fn() };
  });

  it('accepts an ACTIVE Better Auth session and sets req.portalAccount', async () => {
    portalAuth.getSession.mockResolvedValue({ user: baUser, session: { id: 's1' } });
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'a1', email: 'a@b.co', type: 'FINAL_CUSTOMER', state: 'ACTIVE', tier: null, tierId: null });
    const req: any = { headers: {}, cookies: {} };
    expect(await new PortalAuthGuard(jwt, prisma, portalAuth).canActivate(ctx(req))).toBe(true);
    expect(req.portalAccount).toMatchObject({ id: 'a1', jti: 's1', tier: null });
  });
  it('exposes profile fields on req.portalAccount', async () => {
    portalAuth.getSession.mockResolvedValue({ user: baUser, session: { id: 's1' } });
    const when = new Date();
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'a1', email: 'a@b.co', type: 'FINAL_CUSTOMER', state: 'ACTIVE', tier: null, documentId: '9', phone: '3001234567', privacyAcceptedAt: when, deletionRequestedAt: null });
    const req: any = { headers: {}, cookies: {} };
    await new PortalAuthGuard(jwt, prisma, portalAuth).canActivate(ctx(req));
    expect(req.portalAccount).toMatchObject({ documentId: '9', phone: '3001234567', privacyAcceptedAt: when, deletionRequestedAt: null });
  });
  it('derives hasPassword and linkedProviders from the SAME account query, without exposing hash or tokens', async () => {
    portalAuth.getSession.mockResolvedValue({ user: baUser, session: { id: 's1' } });
    prisma.portalAccount.findUnique.mockResolvedValue({
      id: 'a1', state: 'ACTIVE', authUserId: 'u1', tier: null,
      authUser: { accounts: [{ providerId: 'google', password: null }, { providerId: 'credential', password: 'secret-hash' }] },
    });
    const req: any = { headers: {}, cookies: {} };
    await new PortalAuthGuard(jwt, prisma, portalAuth).canActivate(ctx(req));
    expect(req.portalAccount).toMatchObject({ hasPassword: true, linkedProviders: ['google', 'credential'] });
    expect(JSON.stringify(req.portalAccount)).not.toContain('secret-hash');
    expect(req.portalAccount).not.toHaveProperty('authUser');
    expect(prisma.portalAccount.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.portalAccount.findUnique.mock.calls[0][0].include.authUser).toEqual({ select: { accounts: { select: { providerId: true, password: true } } } });
  });
  it('a Google account without credential gets hasPassword false', async () => {
    portalAuth.getSession.mockResolvedValue({ user: baUser, session: { id: 's1' } });
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'a1', state: 'ACTIVE', authUserId: 'u1', authUser: { accounts: [{ providerId: 'google', password: null }] } });
    const req: any = { headers: {}, cookies: {} };
    await new PortalAuthGuard(jwt, prisma, portalAuth).canActivate(ctx(req));
    expect(req.portalAccount).toMatchObject({ hasPassword: false, linkedProviders: ['google'] });
  });
  it('rejects SUSPENDED accounts', async () => {
    portalAuth.getSession.mockResolvedValue({ user: baUser, session: { id: 's1' } });
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'a1', state: 'SUSPENDED' });
    await expect(new PortalAuthGuard(jwt, prisma, portalAuth).canActivate(ctx({ headers: {}, cookies: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it.each(['PENDING', 'REJECTED'])('rejects %s accounts', async (state) => {
    portalAuth.getSession.mockResolvedValue({ user: baUser, session: { id: 's1' } });
    prisma.portalAccount.findUnique.mockResolvedValue({ id: 'a1', state });
    await expect(new PortalAuthGuard(jwt, prisma, portalAuth).canActivate(ctx({ headers: {}, cookies: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('falls back to legacy flow without BA session (no token -> 401)', async () => {
    portalAuth.getSession.mockResolvedValue(null);
    await expect(new PortalAuthGuard(jwt, prisma, portalAuth).canActivate(ctx({ headers: {}, cookies: {} }))).rejects.toThrow('Sesión de cliente requerida');
  });
  it('treats a failing BA session lookup as no session', async () => {
    portalAuth.getSession.mockRejectedValue(new Error('bad'));
    await expect(new PortalAuthGuard(jwt, prisma, portalAuth).canActivate(ctx({ headers: {}, cookies: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.portalAccount.findUnique).not.toHaveBeenCalled();
  });
  it('creates the missing PortalAccount lazily on first access', async () => {
    portalAuth.getSession.mockResolvedValue({ user: { ...baUser, companyName: 'X' }, session: { id: 's1' } });
    prisma.portalAccount.findUnique
      .mockResolvedValueOnce(null) // by authUserId
      .mockResolvedValueOnce(null) // ensure: mine
      .mockResolvedValueOnce(null) // ensure: legacy
      .mockResolvedValueOnce({ id: 'a9', state: 'ACTIVE', type: 'FINAL_CUSTOMER', tier: null });
    prisma.portalAccount.create.mockResolvedValue({ id: 'a9' });
    const req: any = { headers: {}, cookies: {} };
    expect(await new PortalAuthGuard(jwt, prisma, portalAuth).canActivate(ctx(req))).toBe(true);
    expect(req.portalAccount.id).toBe('a9');
  });
});
