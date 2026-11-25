import { verifyPortalPassword } from './portal-auth.hash';

export const CURRENT_PASSWORD_INVALID_MESSAGE = 'La contraseña actual no es correcta';
export const EMAIL_MANAGED_BY_GOOGLE_MESSAGE = 'Tu correo viene de tu cuenta de Google y no se puede cambiar aquí';
export const EMAIL_CHANGE_FAILED_MESSAGE = 'No pudimos cambiar el correo. Prueba con otro.';
export const EMAIL_CHANGED_NOTICE_SUBJECT = 'Cambiamos el correo de tu cuenta';

export interface EmailChangeViolation {
  code: 'CURRENT_PASSWORD_INVALID' | 'EMAIL_MANAGED_BY_GOOGLE' | 'EMAIL_CHANGE_FAILED';
  message: string;
}

/**
 * Extra rules for POST /change-email (the library itself never asks for the password).
 * Order: no credential account (Google) -> wrong/missing current password -> legacy account owns the new email.
 * An email that already belongs to another Better Auth user is NOT rejected here: the library answers a
 * generic 200 without sending anything, which must not change (no account enumeration).
 */
export async function evaluateEmailChangeRequest(
  prisma: any,
  userId: string,
  body: unknown,
  verify: typeof verifyPortalPassword = verifyPortalPassword,
): Promise<EmailChangeViolation | null> {
  const data = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const credential = await prisma.portalAuthAccount.findFirst({
    where: { userId, providerId: 'credential' },
    select: { password: true },
  });
  if (!credential?.password) return { code: 'EMAIL_MANAGED_BY_GOOGLE', message: EMAIL_MANAGED_BY_GOOGLE_MESSAGE };

  const currentPassword = typeof data.currentPassword === 'string' ? data.currentPassword : '';
  if (!currentPassword || currentPassword.length > 128 || !(await verify({ hash: credential.password, password: currentPassword }))) {
    return { code: 'CURRENT_PASSWORD_INVALID', message: CURRENT_PASSWORD_INVALID_MESSAGE };
  }

  const newEmail = typeof data.newEmail === 'string' ? data.newEmail.trim().toLowerCase() : '';
  if (newEmail) {
    const legacy = await prisma.portalAccount.findFirst({
      where: { email: { equals: newEmail, mode: 'insensitive' }, authUserId: null },
      select: { id: true },
    });
    if (legacy) return { code: 'EMAIL_CHANGE_FAILED', message: EMAIL_CHANGE_FAILED_MESSAGE };
  }
  return null;
}

export interface EmailChange {
  userId: string;
  previousEmail: string;
  newEmail: string;
}

/**
 * Reads the previous/new email from the verification link being consumed. Only GET /verify-email applies the
 * change; the library already verified the signed token before updating the user, so the payload can be trusted.
 */
export function readEmailChange(ctx: { path?: string; query?: { token?: unknown } } | undefined, user: { id: string; email: string }): EmailChange | null {
  if (ctx?.path !== '/verify-email' || typeof ctx.query?.token !== 'string') return null;
  try {
    const payload = JSON.parse(Buffer.from(ctx.query.token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
      email?: unknown; updateTo?: unknown; userId?: unknown;
    };
    if (typeof payload.email !== 'string' || typeof payload.updateTo !== 'string' || payload.userId !== user.id) return null;
    const newEmail = user.email.trim().toLowerCase();
    if (payload.updateTo.trim().toLowerCase() !== newEmail) return null;
    const previousEmail = payload.email.trim().toLowerCase();
    return previousEmail === newEmail ? null : { userId: user.id, previousEmail, newEmail };
  } catch {
    return null;
  }
}

/** Copies the new email to PortalAccount. Never throws: a clash is logged (without the address). */
export async function syncPortalAccountEmail(prisma: any, change: EmailChange, warn: (message: string) => void): Promise<void> {
  try {
    await prisma.portalAccount.updateMany({ where: { authUserId: change.userId }, data: { email: change.newEmail } });
  } catch (error) {
    warn(`No se pudo copiar el correo nuevo a la cuenta del portal (${(error as { code?: string })?.code ?? 'error'})`);
  }
}

export function buildEmailChangedNotice(newEmail: string): { subject: string; text: string } {
  return {
    subject: EMAIL_CHANGED_NOTICE_SUBJECT,
    text: `Tu correo de acceso a Grupo Security ahora es ${newEmail}.
Si no fuiste tú, recupera tu cuenta o contacta a tu asesor.`,
  };
}

/** Best effort: tells the OLD address about the change. Never throws. */
export async function notifyPreviousEmail(
  send: (to: string, subject: string, text: string) => Promise<void>,
  change: EmailChange,
  warn: (message: string) => void,
): Promise<void> {
  try {
    const { subject, text } = buildEmailChangedNotice(change.newEmail);
    await send(change.previousEmail, subject, text);
  } catch {
    warn('No se pudo enviar el aviso de cambio de correo al correo anterior');
  }
}
