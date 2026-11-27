import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalAuthService } from './portal-auth/portal-auth.service';
import { ensurePortalAccountSafe } from './portal-auth/portal-account-sync';
import { deriveAuthMethods, PORTAL_ACCOUNT_INCLUDE } from './portal-profile';

export const PORTAL_COOKIE = 'customer_access_token';

export const REQUIRE_APPROVED_KEY = 'portal:require-approved';

/** Marks a priced route: a PENDING account (still in review) is denied with 403 ACCOUNT_PENDING. Read by PortalAuthGuard. */
export const RequireApprovedPortalAccount = () => SetMetadata(REQUIRE_APPROVED_KEY, true);

/** Session states that may sign in: PENDING accounts see their own profile (and nothing priced); the controller denies prices. */
const SESSION_STATES = ['ACTIVE', 'PENDING'];

/**
 * What the controller needs from the account. The tariff is the COMPANY's: it comes from the linked customer
 * (`tierId` / `tier`) or, failing that, the tier set on the account itself; with neither there are no prices.
 */
function sessionAccount(account: any, jti: string | undefined) {
  return {
    id: account.id, email: account.email, type: account.type, state: account.state, customerId: account.customerId, authUserId: account.authUserId,
    contactName: account.contactName, companyName: account.companyName, city: account.city, advisorId: account.advisorId, createdAt: account.createdAt,
    // Effective tariff: the linked customer's own tier wins; otherwise the tier set directly on the account.
    tierId: account.customer?.portalTierId ?? account.tierId ?? null, tier: account.customer?.portalTier ?? account.tier ?? null,
    // Minimal company view so /auth/me can tell whether the account can send quotes (canQuote).
    customer: account.customer ? { id: account.customer.id, isActive: account.customer.isActive, ownerId: account.customer.ownerId } : null,
    advisorName: account.advisor?.name ?? account.customer?.owner?.name ?? null,
    documentId: account.documentId, phone: account.phone, privacyAcceptedAt: account.privacyAcceptedAt, deletionRequestedAt: account.deletionRequestedAt,
    ...deriveAuthMethods(account.authUser), jti,
  };
}

@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Optional() private readonly portalAuth?: PortalAuthService,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    await this.authenticate(req);
    // Fail closed: without a Reflector the route marker cannot be read, so a PENDING account is denied everywhere.
    const required = this.reflector
      ? this.reflector.getAllAndOverride<boolean>(REQUIRE_APPROVED_KEY, [context.getHandler(), context.getClass()])
      : true;
    if (required && req.portalAccount?.state === 'PENDING') {
      throw new ForbiddenException({ code: 'ACCOUNT_PENDING', message: 'Tu cuenta está en revisión' });
    }
    return true;
  }

  private async authenticate(req: any): Promise<true> {
    if (await this.authenticateWithBetterAuth(req)) return true;
    const token = req.cookies?.[PORTAL_COOKIE]
      ?? (typeof req.headers?.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : undefined);
    if (!token) throw new UnauthorizedException('Sesión de cliente requerida');

    let payload: { sub?: string; jti?: string; scope?: string };
    try { payload = this.jwt.verify(token); } catch { throw new UnauthorizedException('Sesión de cliente inválida'); }
    if (payload.scope !== 'customer_portal' || !payload.sub || !payload.jti) {
      throw new UnauthorizedException('Sesión de cliente inválida');
    }

    const [account, session] = await Promise.all([
      this.prisma.portalAccount.findUnique({ where: { id: payload.sub }, include:PORTAL_ACCOUNT_INCLUDE }),
      this.prisma.portalSession.findUnique({ where: { jti: payload.jti } }),
    ]);
    if (!account || !SESSION_STATES.includes(account.state) || !session || session.accountId !== account.id || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Sesión de cliente finalizada');
    }
    req.portalAccount = sessionAccount(account, payload.jti);
    return true;
  }

  /** Better Auth session first; returns false when there is none (legacy flow continues). */
  private async authenticateWithBetterAuth(req: any): Promise<boolean> {
    if (!this.portalAuth) return false;
    let session: any;
    try { session = await this.portalAuth.getSession(req.headers); } catch { return false; }
    if (!session?.user?.id) return false;

    const include = PORTAL_ACCOUNT_INCLUDE;
    let account = await this.prisma.portalAccount.findUnique({ where: { authUserId: session.user.id }, include });
    if (!account) {
      const id = await ensurePortalAccountSafe(this.prisma, session.user);
      if (id) account = await this.prisma.portalAccount.findUnique({ where: { id }, include });
    }
    if (!account || !SESSION_STATES.includes(account.state)) throw new UnauthorizedException('Sesión de cliente finalizada');
    req.portalAccount = sessionAccount(account, session.session?.id);
    return true;
  }
}
