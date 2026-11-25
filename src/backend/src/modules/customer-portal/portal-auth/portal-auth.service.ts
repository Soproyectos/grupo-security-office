import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorefrontMailService } from '../../storefront/storefront-mail.service';
import { hashPortalPassword, verifyPortalPassword } from './portal-auth.hash';
import { ensurePortalAccountSafe } from './portal-account-sync';
import { DEFAULT_PRIVACY_POLICY_VERSION, evaluatePortalRequestRules, isPortalEmailRegistered } from './portal-auth.rules';
import { mapSetPasswordError } from './portal-auth.set-password';
import { evaluateEmailChangeRequest, notifyPreviousEmail, readEmailChange, syncPortalAccountEmail } from './portal-auth.email-change';

// better-auth is ESM-only and this backend is CommonJS: require() works on
// Node >= 20.19 / >= 22.12 (see handoff). Loaded in the constructor so unit
// tests that mock this service never load it.
/* eslint-disable @typescript-eslint/no-require-imports */
const loadBetterAuth = () => ({
  ...(require('better-auth') as { betterAuth: (o: unknown) => any }),
  ...(require('better-auth/adapters/prisma') as { prismaAdapter: (...a: unknown[]) => unknown }),
  ...(require('better-auth/api') as {
    APIError: new (status: string, body: { message: string; code?: string }) => Error;
    createAuthMiddleware: (handler: (ctx: any) => Promise<void>) => unknown;
    getSessionFromCtx: (ctx: any) => Promise<{ user?: { id: string } } | null>;
  }),
  ...(require('better-auth/plugins') as { captcha: (o: unknown) => unknown; haveIBeenPwned: (o: unknown) => unknown; isPasswordCompromised: (password: string) => Promise<boolean> }),
  ...(require('better-auth/node') as { toNodeHandler: (a: unknown) => any; fromNodeHeaders: (h: unknown) => Headers }),
});

const PWNED_MESSAGE = 'Esa contraseña apareció en filtraciones de datos. Elige otra.';

@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);
  readonly auth: any;
  private readonly lib: ReturnType<typeof loadBetterAuth>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mail: StorefrontMailService,
  ) {
    const env = (key: string) => this.config.get<string>(key) || undefined;
    const isProd = env('NODE_ENV') === 'production';
    const secret = env('BETTER_AUTH_SECRET');
    if (!secret && isProd) throw new Error('BETTER_AUTH_SECRET es obligatoria en producción');
    if (!secret) this.logger.warn('BETTER_AUTH_SECRET no definida: usando un secreto temporal (las sesiones se pierden al reiniciar)');
    const publicUrl = env('PORTAL_AUTH_URL') || env('STOREFRONT_URL');
    if (!publicUrl && isProd) throw new Error('PORTAL_AUTH_URL es obligatoria en producción (URL pública de la web)');
    const baseURL = publicUrl || 'http://localhost:3000';
    const origins = [...(env('CORS_ORIGIN') ?? '').split(','), baseURL].map((o) => o.trim()).filter(Boolean);
    const turnstileSecret = env('TURNSTILE_SECRET_KEY');
    if (!turnstileSecret && isProd) throw new Error('TURNSTILE_SECRET_KEY es obligatoria en producción');
    if (!turnstileSecret) this.logger.warn('TURNSTILE_SECRET_KEY no definida: captcha desactivado (solo permitido fuera de producción)');
    const googleId = env('GOOGLE_CLIENT_ID');
    const googleSecret = env('GOOGLE_CLIENT_SECRET');
    const sessionHours = Number(env('PORTAL_SESSION_HOURS')) || 8;
    this.lib = loadBetterAuth();
    const { betterAuth, prismaAdapter, APIError, createAuthMiddleware, getSessionFromCtx, captcha, haveIBeenPwned } = this.lib;
    const privacyVersion = env('PRIVACY_POLICY_VERSION') || DEFAULT_PRIVACY_POLICY_VERSION;
    const db = this.prisma;

    this.auth = betterAuth({
      baseURL,
      basePath: '/api/portal-auth',
      secret: secret ?? randomUUID() + randomUUID(),
      trustedOrigins: [...new Set(origins)],
      database: prismaAdapter(db, { provider: 'postgresql', transaction: true }),
      user: {
        modelName: 'portalAuthUser',
        // No sendChangeEmailConfirmation: with a verified email the library sends the link ONLY to the new address.
        changeEmail: { enabled: true },
        additionalFields: {
          companyName: { type: 'string', required: false, defaultValue: '', input: true },
          type: { type: 'string', required: false, defaultValue: 'FINAL_CUSTOMER', input: false },
          documentId: { type: 'string', required: false, input: true },
          phone: { type: 'string', required: false, input: true },
        },
      },
      session: { modelName: 'portalAuthSession', expiresIn: sessionHours * 3600 },
      account: {
        modelName: 'portalAuthAccount',
        encryptOAuthTokens: true,
        accountLinking: {
          enabled: true,
          trustedProviders: [],
          requireLocalEmailVerified: true,
          disableImplicitLinking: false,
          allowDifferentEmails: false,
          updateUserInfoOnLink: false,
        },
      },
      verification: { modelName: 'portalAuthVerification', storeIdentifier: 'hashed' },
      hooks: {
        before: createAuthMiddleware(async (ctx: { path?: string; body?: unknown }) => {
          // Runs before Better Auth's generic duplicate handling, so the page can say the email exists.
          const emailExists = ctx.path === '/sign-up/email'
            ? await isPortalEmailRegistered(db, (ctx.body as { email?: unknown } | undefined)?.email)
            : false;
          const violation = evaluatePortalRequestRules(ctx.path, ctx.body, emailExists);
          if (violation) {
            throw new APIError(violation.code === 'EMAIL_ALREADY_REGISTERED' ? 'CONFLICT' : 'BAD_REQUEST', { message: violation.message, code: violation.code });
          }
          if (ctx.path === '/change-email') {
            // Without a session the library answers 401 by itself.
            const session = await getSessionFromCtx(ctx);
            if (session?.user?.id) {
              const rejected = await evaluateEmailChangeRequest(db, session.user.id, ctx.body);
              if (rejected) throw new APIError('BAD_REQUEST', { message: rejected.message, code: rejected.code });
            }
          }
        }),
      },
      plugins: [
        ...(turnstileSecret
          ? [captcha({
              provider: 'cloudflare-turnstile',
              secretKey: turnstileSecret,
              endpoints: ['/sign-up/email', '/sign-in/email', '/request-password-reset'],
            })]
          : []),
        haveIBeenPwned({ customPasswordCompromisedMessage: PWNED_MESSAGE }),
      ],
      ...(googleId && googleSecret
        ? { socialProviders: { google: { clientId: googleId, clientSecret: googleSecret, disableDefaultScope: false } } }
        : {}),
      advanced: {
        cookiePrefix: 'gs_portal',
        useSecureCookies: isProd,
        defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: isProd },
        database: { generateId: () => randomUUID() },
        ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
      },
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 12,
        maxPasswordLength: 128,
        autoSignIn: true,
        requireEmailVerification: true,
        resetPasswordTokenExpiresIn: 3600,
        revokeSessionsOnPasswordReset: true,
        password: { hash: hashPortalPassword, verify: verifyPortalPassword },
        sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
          await this.sendLinkEmail(user.email, url, isProd, 'Restablece tu contraseña de Grupo Security',
            'Recibimos una solicitud para restablecer tu contraseña. Abre este enlace (vale 1 hora):');
        },
      },
      emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: true,
        autoSignInAfterVerification: true,
        expiresIn: 3600,
        sendVerificationEmail: async ({ user, url }: { user: { email: string }; url: string }) => {
          await this.sendLinkEmail(user.email, url, isProd, 'Confirma tu correo en Grupo Security',
            'Gracias por crear tu cuenta. Confirma tu correo con este enlace (vale 1 hora):');
        },
      },
      databaseHooks: {
        user: {
          create: {
            before: async (user: Record<string, unknown>, ctx?: { path?: string }) => {
              if (ctx?.path === '/sign-up/email' && !String(user.companyName ?? '').trim()) {
                throw new APIError('BAD_REQUEST', { message: 'Indica el nombre de tu empresa' });
              }
              return { data: { ...user, type: 'FINAL_CUSTOMER', email: String(user.email).trim().toLowerCase() } };
            },
            after: async (user: any, ctx?: { path?: string; body?: { acceptPrivacy?: unknown } }) => {
              // The policy version comes from the server; Google sign-ups carry no consent (null).
              const accepted = ctx?.path === '/sign-up/email' && ctx.body?.acceptPrivacy === true;
              await ensurePortalAccountSafe(db, user, accepted ? { privacyVersion } : {});
            },
          },
          update: {
            after: async (user: any, ctx?: { path?: string; query?: { token?: unknown } }) => {
              // Runs when the new-email link is opened: keep PortalAccount.email in step and warn the old address.
              const change = user?.id && user?.email ? readEmailChange(ctx, user) : null;
              if (!change) return;
              const warn = (m: string) => this.logger.warn(m);
              await syncPortalAccountEmail(db, change, warn);
              await notifyPreviousEmail(
                (to, subject, text) => this.deliver(to, subject, text, isProd, `Aviso: ${text.replace(/\n/g, ' ')}`),
                change,
                warn,
              );
            },
          },
        },
      },
      rateLimit: {
        enabled: true,
        window: 60,
        max: 100,
        storage: 'memory',
        customRules: {
          '/sign-in/email': { window: 60, max: 30 },
          '/sign-up/email': { window: 60, max: 10 },
          '/request-password-reset': { window: 60, max: 5 },
          '/reset-password': { window: 60, max: 10 },
          '/change-password': { window: 60, max: 5 },
          '/change-email': { window: 60, max: 5 },
          '/link-social': { window: 60, max: 10 },
        },
      },
    });
  }

  /** Express handler for /api/portal-auth/* (mounted before body parsers). */
  get handler() {
    return this.lib.toNodeHandler(this.auth);
  }

  async getSession(headers: unknown) {
    return this.auth.api.getSession({ headers: this.lib.fromNodeHeaders(headers) });
  }

  /**
   * Creates the first password of the signed-in user (Better Auth server-only setPassword: it refuses when a
   * password already exists). The session comes from the request headers. Errors are mapped to Spanish HTTP errors.
   */
  async setPassword(headers: unknown, newPassword: string): Promise<void> {
    // setPassword is a server-only endpoint without a path, so the haveIBeenPwned plugin hook never runs for it: check here.
    // Only the first 5 characters of the SHA-1 hash leave the server. If the check cannot run, nothing is created (fail closed).
    let compromised: boolean;
    try { compromised = await this.lib.isPasswordCompromised(newPassword); } catch (error) { throw mapSetPasswordError(error); }
    if (compromised) throw new BadRequestException({ code: 'WEAK_PASSWORD', message: PWNED_MESSAGE });
    try {
      await this.auth.api.setPassword({ body: { newPassword }, headers: this.lib.fromNodeHeaders(headers) });
    } catch (error) {
      throw mapSetPasswordError(error);
    }
  }

  private async sendLinkEmail(to: string, url: string, isProd: boolean, subject: string, intro: string) {
    const text = `${intro}
${url}

Si no fuiste tú, ignora este correo.`;
    await this.deliver(to, subject, text, isProd, `Enlace: ${url}`);
  }

  private async deliver(to: string, subject: string, text: string, isProd: boolean, devLine: string) {
    if (this.mail.configured) {
      await this.mail.send(to, subject, text);
      return;
    }
    // Never write links to disk/console in production.
    if (isProd) throw new Error('SMTP no configurado');
    // Local development only: simulated mailbox.
    const dir = join(process.cwd(), 'outbox');
    mkdirSync(dir, { recursive: true });
    const body = `Para: ${to}
Asunto: ${subject}
${devLine}
`;
    writeFileSync(join(dir, 'ultimo-correo.txt'), body);
    this.logger.log(`[correo simulado]
${body}`);
  }
}
