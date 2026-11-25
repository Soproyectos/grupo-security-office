import { ensurePortalAccount, ensurePortalAccountSafe } from './portal-account-sync';

const makePrisma = () => ({
  portalAccount: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
});
const user = { id: 'u1', email: ' Ana@Test.CO ', name: 'Ana', emailVerified: false, companyName: 'ACME', documentId: '1', phone: '2' };

describe('ensurePortalAccount', () => {
  it('creates ACTIVE FINAL_CUSTOMER without tier, even if INSTALLER was requested', async () => {
    const p = makePrisma();
    p.portalAccount.findUnique.mockResolvedValue(null);
    p.portalAccount.create.mockResolvedValue({ id: 'a1' });
    await ensurePortalAccount(p, { ...user, type: 'INSTALLER' } as any);
    const data = p.portalAccount.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: 'ana@test.co', state: 'ACTIVE', type: 'FINAL_CUSTOMER', authUserId: 'u1', companyName: 'ACME', passwordHash: '!better-auth' });
    expect(data.tierId).toBeUndefined();
  });
  it('uses placeholder when company is empty', async () => {
    const p = makePrisma();
    p.portalAccount.findUnique.mockResolvedValue(null);
    p.portalAccount.create.mockResolvedValue({ id: 'a1' });
    await ensurePortalAccount(p, { ...user, companyName: '' });
    expect(p.portalAccount.create.mock.calls[0][0].data.companyName).toBe('(sin empresa)');
  });
  it('stores consent date and the server version only when sign-up consent is passed', async () => {
    const p = makePrisma();
    p.portalAccount.findUnique.mockResolvedValue(null);
    p.portalAccount.create.mockResolvedValue({ id: 'a1' });
    await ensurePortalAccount(p, user, { privacyVersion: 'v1' });
    const data = p.portalAccount.create.mock.calls[0][0].data;
    expect(data.privacyVersion).toBe('v1');
    expect(data.privacyAcceptedAt).toBeInstanceOf(Date);
    await ensurePortalAccount(p, { ...user, id: 'u2' });
    const google = p.portalAccount.create.mock.calls[1][0].data;
    expect(google.privacyAcceptedAt).toBeUndefined();
    expect(google.privacyVersion).toBeUndefined();
  });
  it('is idempotent', async () => {
    const p = makePrisma();
    p.portalAccount.findUnique.mockResolvedValueOnce({ id: 'a1' });
    expect(await ensurePortalAccount(p, user)).toBe('a1');
    expect(p.portalAccount.create).not.toHaveBeenCalled();
  });
  it('links legacy account only with verified email', async () => {
    const p = makePrisma();
    p.portalAccount.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'old', authUserId: null });
    expect(await ensurePortalAccount(p, user)).toBeNull();
    expect(p.portalAccount.update).not.toHaveBeenCalled();
    p.portalAccount.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'old', authUserId: null });
    p.portalAccount.update.mockResolvedValue({ id: 'old' });
    expect(await ensurePortalAccount(p, { ...user, emailVerified: true })).toBe('old');
    expect(p.portalAccount.update).toHaveBeenCalledWith(expect.objectContaining({ data: { authUserId: 'u1' } }));
  });
  it('safe variant never throws', async () => {
    const p = makePrisma();
    p.portalAccount.findUnique.mockRejectedValue({ code: 'P2003' });
    expect(await ensurePortalAccountSafe(p, user)).toBeNull();
  });
});
