import { evaluatePortalRequestRules, isPortalEmailRegistered } from './portal-auth.rules';

const signUp = (over: Record<string, unknown> = {}) => ({
  name: 'Ana Perez', email: 'ana@acme.co', password: 'Tr0ub4dor&Zebra!x', acceptPrivacy: true, ...over,
});

describe('evaluatePortalRequestRules', () => {
  it('allows a valid sign-up', () => {
    expect(evaluatePortalRequestRules('/sign-up/email', signUp())).toBeNull();
  });
  it.each([undefined, false, 'true', 1, null])('rejects sign-up when acceptPrivacy is %p', (value) => {
    expect(evaluatePortalRequestRules('/sign-up/email', signUp({ acceptPrivacy: value })))
      .toEqual({ code: 'PRIVACY_NOT_ACCEPTED', message: 'Debes aceptar la política de tratamiento de datos' });
  });
  it('rejects weak sign-up passwords with WEAK_PASSWORD', () => {
    const v = evaluatePortalRequestRules('/sign-up/email', signUp({ password: 'short' }));
    expect(v?.code).toBe('WEAK_PASSWORD');
    expect(v?.message).toContain('La contraseña no cumple los requisitos');
  });
  it('rejects a password containing the name on sign-up', () => {
    expect(evaluatePortalRequestRules('/sign-up/email', signUp({ password: 'Perez-9Xk!qwertyU' }))?.code).toBe('WEAK_PASSWORD');
  });
  it('checks newPassword on reset and change (shape rules only)', () => {
    expect(evaluatePortalRequestRules('/reset-password', { newPassword: 'weak' })?.code).toBe('WEAK_PASSWORD');
    expect(evaluatePortalRequestRules('/change-password', { newPassword: 'weak' })?.code).toBe('WEAK_PASSWORD');
    expect(evaluatePortalRequestRules('/reset-password', { newPassword: 'Tr0ub4dor&Zebra!x' })).toBeNull();
  });
  it('does not require privacy on other paths', () => {
    expect(evaluatePortalRequestRules('/sign-in/email', { email: 'a@b.co', password: 'x' })).toBeNull();
    expect(evaluatePortalRequestRules('/reset-password', { newPassword: 'Tr0ub4dor&Zebra!x' })).toBeNull();
    expect(evaluatePortalRequestRules(undefined, undefined)).toBeNull();
  });
  it('rejects an already registered email after privacy and before password rules', () => {
    const v = evaluatePortalRequestRules('/sign-up/email', signUp({ password: 'short' }), true);
    expect(v).toEqual({ code: 'EMAIL_ALREADY_REGISTERED', message: 'Este correo ya está registrado. Inicia sesión o recupera tu contraseña.' });
    expect(evaluatePortalRequestRules('/sign-up/email', signUp({ acceptPrivacy: false }), true)?.code).toBe('PRIVACY_NOT_ACCEPTED');
  });
});

describe('isPortalEmailRegistered', () => {
  const db = (authUser: unknown, account: unknown) => ({
    portalAuthUser: { findFirst: jest.fn().mockResolvedValue(authUser) },
    portalAccount: { findFirst: jest.fn().mockResolvedValue(account) },
  });
  it('finds an email in portalAuthUser (trimmed, lowercased)', async () => {
    const prisma = db({ id: 'u1' }, null);
    expect(await isPortalEmailRegistered(prisma, '  ANA@Acme.co ')).toBe(true);
    expect(prisma.portalAuthUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: 'ana@acme.co', mode: 'insensitive' } } }));
  });
  it('finds an email in a legacy PortalAccount without authUserId', async () => {
    expect(await isPortalEmailRegistered(db(null, { id: 'a1' }), 'ana@acme.co')).toBe(true);
  });
  it('lets a new email through', async () => {
    expect(await isPortalEmailRegistered(db(null, null), 'nuevo@acme.co')).toBe(false);
    expect(await isPortalEmailRegistered(db(null, null), undefined)).toBe(false);
  });
});
