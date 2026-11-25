import { evaluateEmailChangeRequest, notifyPreviousEmail, readEmailChange, syncPortalAccountEmail } from './portal-auth.email-change';
import { hashPortalPassword } from './portal-auth.hash';

const body = (over: Record<string, unknown> = {}) => ({ newEmail: 'Nuevo@Acme.co', currentPassword: 'Tr0ub4dor&Zebra!x', ...over });

describe('evaluateEmailChangeRequest', () => {
  const build = (credential: unknown, legacy: unknown = null) => ({
    portalAuthAccount: { findFirst: jest.fn().mockResolvedValue(credential) },
    portalAccount: { findFirst: jest.fn().mockResolvedValue(legacy) },
  });
  let hash: string;
  beforeAll(async () => { hash = await hashPortalPassword('Tr0ub4dor&Zebra!x'); });

  it('rejects a missing current password', async () => {
    const v = await evaluateEmailChangeRequest(build({ password: hash }), 'u1', body({ currentPassword: undefined }));
    expect(v).toEqual({ code: 'CURRENT_PASSWORD_INVALID', message: 'La contraseña actual no es correcta' });
  });
  it('rejects a wrong current password', async () => {
    expect((await evaluateEmailChangeRequest(build({ password: hash }), 'u1', body({ currentPassword: 'otra-clave-123' })))?.code).toBe('CURRENT_PASSWORD_INVALID');
  });
  it('rejects accounts without a password (Google)', async () => {
    const v = await evaluateEmailChangeRequest(build(null), 'u1', body());
    expect(v).toEqual({ code: 'EMAIL_MANAGED_BY_GOOGLE', message: 'Tu correo viene de tu cuenta de Google y no se puede cambiar aquí' });
    expect((await evaluateEmailChangeRequest(build({ password: null }), 'u1', body()))?.code).toBe('EMAIL_MANAGED_BY_GOOGLE');
  });
  it('rejects an email owned by a legacy PortalAccount (no authUserId)', async () => {
    const prisma = build({ password: hash }, { id: 'a1' });
    const v = await evaluateEmailChangeRequest(prisma, 'u1', body());
    expect(v).toEqual({ code: 'EMAIL_CHANGE_FAILED', message: 'No pudimos cambiar el correo. Prueba con otro.' });
    expect(prisma.portalAccount.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: { equals: 'nuevo@acme.co', mode: 'insensitive' }, authUserId: null },
    }));
  });
  it('lets the happy path through', async () => {
    expect(await evaluateEmailChangeRequest(build({ password: hash }), 'u1', body())).toBeNull();
  });
});

describe('readEmailChange', () => {
  const token = (payload: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
  const user = { id: 'u1', email: 'nuevo@acme.co' };
  it('reads previous and new email from a change-email link', () => {
    expect(readEmailChange({ path: '/verify-email', query: { token: token({ email: 'Viejo@acme.co', updateTo: 'nuevo@acme.co', userId: 'u1' }) } }, user))
      .toEqual({ userId: 'u1', previousEmail: 'viejo@acme.co', newEmail: 'nuevo@acme.co' });
  });
  it('ignores other paths, plain verification links, other users and garbage', () => {
    expect(readEmailChange({ path: '/sign-in/email' }, user)).toBeNull();
    expect(readEmailChange({ path: '/verify-email', query: { token: token({ email: 'a@b.co', userId: 'u1' }) } }, user)).toBeNull();
    expect(readEmailChange({ path: '/verify-email', query: { token: token({ email: 'a@b.co', updateTo: 'nuevo@acme.co', userId: 'u2' }) } }, user)).toBeNull();
    expect(readEmailChange({ path: '/verify-email', query: { token: 'basura' } }, user)).toBeNull();
  });
});

describe('syncPortalAccountEmail', () => {
  const change = { userId: 'u1', previousEmail: 'viejo@acme.co', newEmail: 'nuevo@acme.co' };
  it('updates PortalAccount.email by authUserId', async () => {
    const prisma = { portalAccount: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await syncPortalAccountEmail(prisma, change, jest.fn());
    expect(prisma.portalAccount.updateMany).toHaveBeenCalledWith({ where: { authUserId: 'u1' }, data: { email: 'nuevo@acme.co' } });
  });
  it('warns without the email and does not throw on a unique clash', async () => {
    const prisma = { portalAccount: { updateMany: jest.fn().mockRejectedValue(Object.assign(new Error('dup nuevo@acme.co'), { code: 'P2002' })) } };
    const warn = jest.fn();
    await expect(syncPortalAccountEmail(prisma, change, warn)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('P2002');
    expect(warn.mock.calls[0][0]).not.toContain('acme.co');
  });
});

describe('notifyPreviousEmail', () => {
  const change = { userId: 'u1', previousEmail: 'viejo@acme.co', newEmail: 'nuevo@acme.co' };
  it('sends the notice to the previous address, with the new one in the text and no links', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    await notifyPreviousEmail(send, change, jest.fn());
    const [to, subject, text] = send.mock.calls[0];
    expect(to).toBe('viejo@acme.co');
    expect(subject).toBe('Cambiamos el correo de tu cuenta');
    expect(text).toContain('nuevo@acme.co');
    expect(text).not.toMatch(/https?:\/\//);
  });
  it('never throws when delivery fails', async () => {
    const warn = jest.fn();
    await expect(notifyPreviousEmail(jest.fn().mockRejectedValue(new Error('smtp')), change, warn)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
