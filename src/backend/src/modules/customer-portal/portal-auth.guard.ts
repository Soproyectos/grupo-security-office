import { CanActivate, ExecutionContext, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalAuthService } from './portal-auth/portal-auth.service';
import { ensurePortalAccountSafe } from './portal-auth/portal-account-sync';
import { deriveAuthMethods } from './portal-profile';

export const PORTAL_COOKIE = 'customer_access_token';

/** One query brings the tier and the sign-in methods (provider names and whether a password exists; never the hash). */
const PORTAL_ACCOUNT_INCLUDE = {
  tier: { select: { id: true, name: true, isActive: true } },
  authUser: { select: { accounts: { select: { providerId: true, password: true } } } },
};

@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Optional() private readonly portalAuth?: PortalAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
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
    if (!account || account.state !== 'ACTIVE' || !session || session.accountId !== account.id || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Sesión de cliente finalizada');
    }
    req.portalAccount = { id: account.id, email: account.email, type: account.type, customerId: account.customerId, authUserId: account.authUserId, contactName:account.contactName, companyName:account.companyName, tierId:account.tierId, tier:account.tier, documentId:account.documentId, phone:account.phone, privacyAcceptedAt:account.privacyAcceptedAt, deletionRequestedAt:account.deletionRequestedAt, ...deriveAuthMethods((account as any).authUser), jti: payload.jti };
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
    if (!account || account.state !== 'ACTIVE') throw new UnauthorizedException('Sesión de cliente finalizada');
    req.portalAccount = { id: account.id, email: account.email, type: account.type, customerId: account.customerId, authUserId: account.authUserId, contactName: account.contactName, companyName: account.companyName, tierId: account.tierId, tier: account.tier, documentId: account.documentId, phone: account.phone, privacyAcceptedAt: account.privacyAcceptedAt, deletionRequestedAt: account.deletionRequestedAt, ...deriveAuthMethods((account as any).authUser), jti: session.session?.id };
    return true;
  }
}
