export const PLACEHOLDER_COMPANY = '(sin empresa)';

interface ProfileSource {
  companyName?: string | null;
  privacyAcceptedAt?: Date | null;
  authUserId?: string | null;
  hasPassword?: boolean;
}

/** Sign-in methods a portal account can show; nothing else (no hashes, no tokens) is ever exposed. */
const KNOWN_PROVIDERS = ['credential', 'google'];

/** Derives `hasPassword` and `linkedProviders` from the Better Auth account rows (only a boolean and provider names leave). */
export function deriveAuthMethods(authUser?: { accounts?: { providerId: string; password?: string | null }[] } | null) {
  const rows = authUser?.accounts ?? [];
  const hasPassword = rows.some((a) => a.providerId === 'credential' && !!a.password);
  const linkedProviders = [...new Set(rows.map((a) => a.providerId).filter((p) => KNOWN_PROVIDERS.includes(p)))];
  return { hasPassword, linkedProviders };
}

/** Complete = privacy accepted and a real company. A password is optional (Google sign-up must be quick). */
export function isProfileComplete(account: ProfileSource): boolean {
  const company = (account.companyName ?? '').trim();
  return !!account.privacyAcceptedAt && company !== '' && company !== PLACEHOLDER_COMPANY;
}

/** Shape returned by GET /auth/me and PATCH /auth/me/profile (the guard attaches the raw fields). */
export function portalAccountView(account: any) {
  const methods = account.authUser
    ? deriveAuthMethods(account.authUser)
    : { hasPassword: account.hasPassword === true, linkedProviders: (account.linkedProviders ?? []) as string[] };
  return {
    id: account.id,
    email: account.email,
    type: account.type,
    contactName: account.contactName,
    companyName: account.companyName,
    tier: account.tier ?? null,
    documentId: account.documentId ?? null,
    phone: account.phone ?? null,
    privacyAcceptedAt: account.privacyAcceptedAt ?? null,
    deletionRequestedAt: account.deletionRequestedAt ?? null,
    hasPassword: methods.hasPassword,
    linkedProviders: methods.linkedProviders,
    profileComplete: isProfileComplete({ ...account, hasPassword: methods.hasPassword }),
  };
}
