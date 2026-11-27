import { findMunicipality } from '../../common/geo/municipalities';

export const PLACEHOLDER_COMPANY = '(sin empresa)';

/**
 * Accounts created before this instant (without a city) keep working: the city is only required to complete
 * the profile of accounts created from this moment on. Registration with a city shipped on 2026-11-26.
 */
export const CITY_REQUIRED_FROM = new Date('2026-11-26T00:00:00.000Z');

interface ProfileSource {
  companyName?: string | null;
  privacyAcceptedAt?: Date | null;
  authUserId?: string | null;
  hasPassword?: boolean;
  city?: string | null;
  createdAt?: Date | null;
}

/** What the account relations must bring so the view (and the guard) can show the company tariff. */
export const PORTAL_ACCOUNT_INCLUDE = {
  customer: { select: { id: true, isActive: true, ownerId: true, owner: { select: { name: true } }, portalTierId: true, portalTier: { select: { id: true, name: true, isActive: true } } } },
  advisor: { select: { name: true } },
  tier: { select: { id: true, name: true, isActive: true } },
  authUser: { select: { accounts: { select: { providerId: true, password: true } } } },
};

/** Sign-in methods a portal account can show; nothing else (no hashes, no tokens) is ever exposed. */
const KNOWN_PROVIDERS = ['credential', 'google'];

/** Derives `hasPassword` and `linkedProviders` from the Better Auth account rows (only a boolean and provider names leave). */
export function deriveAuthMethods(authUser?: { accounts?: { providerId: string; password?: string | null }[] } | null) {
  const rows = authUser?.accounts ?? [];
  const hasPassword = rows.some((a) => a.providerId === 'credential' && !!a.password);
  const linkedProviders = [...new Set(rows.map((a) => a.providerId).filter((p) => KNOWN_PROVIDERS.includes(p)))];
  return { hasPassword, linkedProviders };
}

/**
 * Complete = privacy accepted, a real company and, for accounts created from CITY_REQUIRED_FROM on, a city.
 * A password is optional (Google sign-up must be quick).
 */
export function isProfileComplete(account: ProfileSource): boolean {
  const company = (account.companyName ?? '').trim();
  const cityRequired = !!account.createdAt && new Date(account.createdAt) >= CITY_REQUIRED_FROM;
  return !!account.privacyAcceptedAt && company !== '' && company !== PLACEHOLDER_COMPANY && (!cityRequired || !!account.city);
}

/**
 * Whether the account can send quotes: approved, complete profile, linked to an active company and with an
 * advisor (its own or the company's). Only a hint for the UI; the quote endpoint re-checks everything.
 */
export function canSendQuotes(account: any, profileComplete: boolean): boolean {
  const customer = account.customer;
  const hasCompany = !!customer && customer.isActive !== false;
  const hasAdvisor = !!(account.advisorId ?? customer?.ownerId);
  return account.state === 'ACTIVE' && profileComplete && hasCompany && hasAdvisor;
}

/**
 * The advisor the customer can see: only the name (no id, e-mail or phone of staff). Same order the quote
 * endpoint uses: the account's own advisor first, then the owner of the company.
 */
function advisorView(account: any): { name: string } | null {
  const name = account.advisorName ?? account.advisor?.name ?? account.customer?.owner?.name ?? null;
  return name ? { name } : null;
}

/** Shape returned by GET /auth/me and PATCH /auth/me/profile (the guard attaches the raw fields). */
export function portalAccountView(account: any) {
  const methods = account.authUser
    ? deriveAuthMethods(account.authUser)
    : { hasPassword: account.hasPassword === true, linkedProviders: (account.linkedProviders ?? []) as string[] };
  const profileComplete = isProfileComplete({ ...account, hasPassword: methods.hasPassword });
  return {
    id: account.id,
    email: account.email,
    type: account.type,
    state: account.state ?? null,
    city: findMunicipality(account.city),
    contactName: account.contactName,
    companyName: account.companyName,
    tier: account.tier ?? null,
    documentId: account.documentId ?? null,
    phone: account.phone ?? null,
    privacyAcceptedAt: account.privacyAcceptedAt ?? null,
    deletionRequestedAt: account.deletionRequestedAt ?? null,
    hasPassword: methods.hasPassword,
    linkedProviders: methods.linkedProviders,
    profileComplete,
    canQuote: canSendQuotes(account, profileComplete),
    advisor: advisorView(account),
  };
}
