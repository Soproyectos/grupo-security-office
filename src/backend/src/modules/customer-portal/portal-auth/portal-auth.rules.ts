import { validatePortalPassword, weakPasswordMessage } from './password-policy';

export const PRIVACY_NOT_ACCEPTED_MESSAGE = 'Debes aceptar la política de tratamiento de datos';
export const DEFAULT_PRIVACY_POLICY_VERSION = 'borrador-2026-11';

export const EMAIL_ALREADY_REGISTERED_MESSAGE = 'Este correo ya está registrado. Inicia sesión o recupera tu contraseña.';

export interface RuleViolation {
  code: 'PRIVACY_NOT_ACCEPTED' | 'EMAIL_ALREADY_REGISTERED' | 'WEAK_PASSWORD';
  message: string;
}

/**
 * Pure request rules evaluated by the Better Auth `hooks.before` hook.
 * Better Auth accepts unknown body fields (sign-up body is `.and(z.record(...))`)
 * and only copies declared additionalFields, so `acceptPrivacy` is ignored by
 * the user table without any extra declaration.
 */
export function evaluatePortalRequestRules(path: string | undefined, body: unknown, emailAlreadyRegistered = false): RuleViolation | null {
  const data = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (path === '/sign-up/email') {
    if (data.acceptPrivacy !== true) return { code: 'PRIVACY_NOT_ACCEPTED', message: PRIVACY_NOT_ACCEPTED_MESSAGE };
    if (emailAlreadyRegistered) return { code: 'EMAIL_ALREADY_REGISTERED', message: EMAIL_ALREADY_REGISTERED_MESSAGE };
    const failed = validatePortalPassword(String(data.password ?? ''), {
      email: typeof data.email === 'string' ? data.email : null,
      name: typeof data.name === 'string' ? data.name : null,
    });
    if (failed.length) return { code: 'WEAK_PASSWORD', message: weakPasswordMessage(failed) };
  }
  if (path === '/reset-password' || path === '/change-password') {
    // No email/name available here: only the shape rules apply.
    const failed = validatePortalPassword(String(data.newPassword ?? ''));
    if (failed.length) return { code: 'WEAK_PASSWORD', message: weakPasswordMessage(failed) };
  }
  return null;
}

/** True when the (trimmed, lowercased) email already exists in Better Auth users or in a legacy portal account. */
export async function isPortalEmailRegistered(prisma: any, rawEmail: unknown): Promise<boolean> {
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (!email) return false;
  const [authUser, account] = await Promise.all([
    prisma.portalAuthUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }),
    prisma.portalAccount.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } }),
  ]);
  return !!(authUser || account);
}
