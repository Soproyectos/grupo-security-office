import { Logger } from '@nestjs/common';

export const BETTER_AUTH_PASSWORD_MARKER = '!better-auth';
const logger = new Logger('PortalAuth');

export interface AuthUserLike {
  id: string;
  email: string;
  name?: string | null;
  emailVerified?: boolean | null;
  companyName?: string | null;
  documentId?: string | null;
  phone?: string | null;
}

/**
 * Creates (or links) the business PortalAccount for a Better Auth user.
 * - New accounts are ACTIVE, always FINAL_CUSTOMER and without tier: the
 *   requested type stays only in portal_auth_user.type so nobody can
 *   self-assign installer prices.
 * - A legacy account with the same email is linked ONLY when the email is
 *   verified (Google); otherwise nothing is overwritten.
 * Idempotent. Returns the PortalAccount id or null.
 */
export interface EnsureAccountOptions {
  /** Policy version accepted at sign-up. Decided by the server, never by the client. */
  privacyVersion?: string;
}

export async function ensurePortalAccount(prisma: any, user: AuthUserLike, options: EnsureAccountOptions = {}): Promise<string | null> {
  const email = user.email.trim().toLowerCase();
  const mine = await prisma.portalAccount.findUnique({ where: { authUserId: user.id }, select: { id: true } });
  if (mine) return mine.id;

  const legacy = await prisma.portalAccount.findUnique({ where: { email }, select: { id: true, authUserId: true } });
  if (legacy) {
    if (legacy.authUserId || !user.emailVerified) return null;
    const linked = await prisma.portalAccount.update({ where: { id: legacy.id }, data: { authUserId: user.id }, select: { id: true } });
    return linked.id;
  }

  const created = await prisma.portalAccount.create({
    data: {
      email,
      passwordHash: BETTER_AUTH_PASSWORD_MARKER,
      contactName: (user.name ?? '').trim() || email,
      companyName: (user.companyName ?? '').trim() || '(sin empresa)',
      documentId: user.documentId || null,
      phone: user.phone || null,
      type: 'FINAL_CUSTOMER',
      state: 'ACTIVE',
      authUserId: user.id,
      ...(options.privacyVersion ? { privacyAcceptedAt: new Date(), privacyVersion: options.privacyVersion } : {}),
    },
    select: { id: true },
  });
  return created.id;
}

/** Same as ensurePortalAccount but never throws (used inside the signup hook). */
export async function ensurePortalAccountSafe(prisma: any, user: AuthUserLike, options: EnsureAccountOptions = {}): Promise<string | null> {
  try {
    return await ensurePortalAccount(prisma, user, options);
  } catch (error) {
    logger.warn(`No se pudo crear la cuenta del portal ahora (${(error as { code?: string })?.code ?? 'error'}); se reintenta en el primer acceso`);
    return null;
  }
}
