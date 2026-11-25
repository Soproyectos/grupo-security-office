import * as bcrypt from 'bcrypt';
import { hashPortalPassword, verifyPortalPassword } from './portal-auth.hash';

describe('portal password hash', () => {
  it('hashes with sha256: prefix and verifies', async () => {
    const hash = await hashPortalPassword('una-clave-larga-123');
    expect(hash.startsWith('sha256:$2')).toBe(true);
    expect(await verifyPortalPassword({ hash, password: 'una-clave-larga-123' })).toBe(true);
    expect(await verifyPortalPassword({ hash, password: 'otra-clave-larga-1' })).toBe(false);
  });
  it('accepts plain bcrypt and rejects unknown formats', async () => {
    const plain = await bcrypt.hash('clave-plana-12345', 4);
    expect(await verifyPortalPassword({ hash: plain, password: 'clave-plana-12345' })).toBe(true);
    expect(await verifyPortalPassword({ hash: '!better-auth', password: 'x' })).toBe(false);
  });
});
