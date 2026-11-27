import { CITY_REQUIRED_FROM, deriveAuthMethods, isProfileComplete, portalAccountView } from './portal-profile';

const NOW = new Date('2026-11-20T10:00:00Z');

describe('profileComplete', () => {
  it('is true only with accepted policy and a real company', () => {
    expect(isProfileComplete({ companyName: 'ACME', privacyAcceptedAt: NOW })).toBe(true);
    expect(isProfileComplete({ companyName: 'ACME', privacyAcceptedAt: null })).toBe(false);
    expect(isProfileComplete({ companyName: '(sin empresa)', privacyAcceptedAt: NOW })).toBe(false);
    expect(isProfileComplete({ companyName: '   ', privacyAcceptedAt: NOW })).toBe(false);
    expect(isProfileComplete({ companyName: '', privacyAcceptedAt: NOW })).toBe(false);
  });
  it('exposes the /me shape with the new fields', () => {
    const view = portalAccountView({ id: 'a1', email: 'a@b.co', type: 'FINAL_CUSTOMER', contactName: 'Ana', companyName: 'ACME', tier: null, documentId: '123', phone: '3001234567', privacyAcceptedAt: NOW, deletionRequestedAt: null, passwordHash: 'secret' });
    expect(view).toEqual({ id: 'a1', email: 'a@b.co', type: 'FINAL_CUSTOMER', state: null, city: null, contactName: 'Ana', companyName: 'ACME', tier: null, documentId: '123', phone: '3001234567', privacyAcceptedAt: NOW, deletionRequestedAt: null, hasPassword: false, linkedProviders: [], profileComplete: true, canQuote: false, advisor: null });
  });
  it('canQuote needs an approved, complete account linked to an active company with an advisor', () => {
    const ready = { companyName: 'ACME', privacyAcceptedAt: NOW, state: 'ACTIVE', advisorId: 'u1', customer: { id: 'c1', isActive: true, ownerId: 'u1' } };
    expect(portalAccountView(ready).canQuote).toBe(true);
    expect(portalAccountView({ ...ready, advisorId: null }).canQuote).toBe(true);
    expect(portalAccountView({ ...ready, advisorId: null, customer: { ...ready.customer, ownerId: null } }).canQuote).toBe(false);
    expect(portalAccountView({ ...ready, state: 'PENDING' }).canQuote).toBe(false);
    expect(portalAccountView({ ...ready, customer: null }).canQuote).toBe(false);
    expect(portalAccountView({ ...ready, customer: { ...ready.customer, isActive: false } }).canQuote).toBe(false);
    expect(portalAccountView({ ...ready, companyName: '(sin empresa)' }).canQuote).toBe(false);
  });
  it('shows only the advisor name: own advisor first, then the company owner, never ids', () => {
    const base = { companyName: 'ACME', privacyAcceptedAt: NOW, state: 'ACTIVE', advisorId: 'u1', customer: { id: 'c1', isActive: true, ownerId: 'u2', owner: { name: 'Dueño' } } };
    expect(portalAccountView({ ...base, advisor: { name: 'Asesor' } }).advisor).toEqual({ name: 'Asesor' });
    expect(portalAccountView({ ...base, advisorName: 'Asesor' }).advisor).toEqual({ name: 'Asesor' });
    expect(portalAccountView(base).advisor).toEqual({ name: 'Dueño' });
    expect(portalAccountView({ ...base, customer: null }).advisor).toBeNull();
  });
  it('requires a city only for accounts created from the cutoff on; older accounts keep working', () => {
    const base = { companyName: 'ACME', privacyAcceptedAt: NOW };
    const before = new Date(CITY_REQUIRED_FROM.getTime() - 1000);
    const after = new Date(CITY_REQUIRED_FROM.getTime() + 1000);
    expect(isProfileComplete({ ...base, createdAt: before, city: null })).toBe(true);
    expect(isProfileComplete({ ...base, createdAt: after, city: null })).toBe(false);
    expect(isProfileComplete({ ...base, createdAt: after, city: '05001' })).toBe(true);
    expect(isProfileComplete({ ...base, createdAt: CITY_REQUIRED_FROM, city: null })).toBe(false);
  });
  it('shows the state and the resolved city', () => {
    const view = portalAccountView({ id: 'a1', email: 'a@b.co', companyName: 'ACME', privacyAcceptedAt: NOW, state: 'PENDING', city: '11001', createdAt: new Date('2026-12-01') });
    expect(view).toMatchObject({ state: 'PENDING', city: { code: '11001', name: 'Bogotá, D.C.', department: 'Bogotá, D.C.' }, profileComplete: true });
    expect(portalAccountView({ id: 'a1', email: 'a@b.co', companyName: 'ACME', privacyAcceptedAt: NOW, createdAt: new Date('2026-12-01') })).toMatchObject({ city: null, profileComplete: false });
  });
  it('does not depend on a password: Better Auth accounts without one are complete with company and privacy', () => {
    const base = { companyName: 'ACME', privacyAcceptedAt: NOW };
    expect(isProfileComplete({ ...base, authUserId: 'au1', hasPassword: false })).toBe(true);
    expect(isProfileComplete({ ...base, authUserId: 'au1' })).toBe(true);
    expect(isProfileComplete({ ...base, authUserId: 'au1', hasPassword: true })).toBe(true);
    expect(isProfileComplete({ ...base, authUserId: null, hasPassword: false })).toBe(true); // legacy
    expect(isProfileComplete({ companyName: 'ACME', privacyAcceptedAt: null, authUserId: 'au1', hasPassword: true })).toBe(false);
    expect(isProfileComplete({ companyName: '(sin empresa)', privacyAcceptedAt: NOW, authUserId: 'au1', hasPassword: true })).toBe(false);
  });
  it('derives hasPassword and linkedProviders without leaking hashes or tokens', () => {
    const authUser = { accounts: [{ providerId: 'google', password: null }, { providerId: 'credential', password: 'scrypt-hash-secret' }, { providerId: 'google', password: null }, { providerId: 'github', password: null }] };
    expect(deriveAuthMethods(authUser)).toEqual({ hasPassword: true, linkedProviders: ['google', 'credential'] });
    expect(deriveAuthMethods({ accounts: [{ providerId: 'google', password: null }] })).toEqual({ hasPassword: false, linkedProviders: ['google'] });
    expect(deriveAuthMethods({ accounts: [{ providerId: 'credential', password: null }] }).hasPassword).toBe(false);
    expect(deriveAuthMethods(null)).toEqual({ hasPassword: false, linkedProviders: [] });
    const view = portalAccountView({ id: 'a1', email: 'a@b.co', companyName: 'ACME', privacyAcceptedAt: NOW, authUserId: 'au1', authUser });
    expect(JSON.stringify(view)).not.toContain('scrypt-hash-secret');
    expect(view).toMatchObject({ hasPassword: true, linkedProviders: ['google', 'credential'], profileComplete: true });
    expect(view).not.toHaveProperty('authUser');
  });
  it('a Google account without password is complete when it has company and privacy', () => {
    const google = { id: 'a1', email: 'a@b.co', companyName: 'ACME', privacyAcceptedAt: NOW, authUserId: 'au1', authUser: { accounts: [{ providerId: 'google', password: null }] } };
    expect(portalAccountView(google)).toMatchObject({ hasPassword: false, profileComplete: true });
    expect(portalAccountView({ ...google, authUser: { accounts: [...google.authUser.accounts, { providerId: 'credential', password: 'h' }] } })).toMatchObject({ hasPassword: true, profileComplete: true });
    expect(portalAccountView({ ...google, companyName: '(sin empresa)' }).profileComplete).toBe(false);
  });
});
