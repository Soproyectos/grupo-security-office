import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

export const PORTAL_COOKIE = 'customer_access_token';

@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
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
      this.prisma.portalAccount.findUnique({ where: { id: payload.sub } }),
      this.prisma.portalSession.findUnique({ where: { jti: payload.jti } }),
    ]);
    if (!account || account.state !== 'ACTIVE' || !session || session.accountId !== account.id || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Sesión de cliente finalizada');
    }
    req.portalAccount = { id: account.id, email: account.email, type: account.type, customerId: account.customerId, jti: payload.jti };
    return true;
  }
}
