import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from '../../common/security/session.service';
import { isConcessionPermission } from '../../common/security/user-permissions.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private sessions: SessionService,
    config: ConfigService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_SECRET environment variable is required — set it in .env',
      );
    }
    super({
      jwtFromRequest: (req: any) => {
        if (req?.cookies?.access_token) {
          return req.cookies.access_token;
        }

        const cookieHeader = req?.headers?.cookie;
        if (cookieHeader) {
          const match = cookieHeader.match(/(?:^|;\s*)access_token=([^;]*)/);
          if (match) return decodeURIComponent(match[1]);
        }

        const authHeader = req?.headers?.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          return authHeader.substring(7);
        }

        return null;
      },
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    // Un token de desafio (scope 'mfa' / 'mfa-enroll') NO es una sesion: sirve
    // solo para completar el segundo paso del login. Sin esta comprobacion,
    // bastaria la contrasena para acceder a la API saltandose el segundo factor.
    if (payload.scope) {
      throw new UnauthorizedException('Token de verificacion, no de sesion');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        isActive: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }
    // Roles de autorización siempre vivos: el JWT solo prueba identidad y
    // sesión. Un rol revocado deja de activar guards en esta misma petición.
    const roles = (user.roles ?? []).map((entry: { role: { name: string } }) => entry.role.name);

    // Sesion revocable (S.4): revocar una sesion la corta en la peticion
    // siguiente, sin esperar a que el JWT expire.
    if (!(await this.sessions.isActive(payload.jti))) {
      throw new UnauthorizedException('Sesion finalizada. Inicie sesion de nuevo.');
    }

    // D3 — revalidación de concesiones por petición (BASE-04 §7.2b): un JWT
    // no es autoridad para packs de dashboard. Si el token reclama alguna
    // concesión (dashboard:pack:/dashboard:block:), se exige que siga vigente
    // en el servidor (UserPermission GRANT o permiso de rol); si fue retirada,
    // el token viejo se rechaza con 401 sin cerrar la sesión del servidor
    // (COM-01: revocar concesión ≠ matar sesión).
    const claims = Array.isArray(payload.permissions) ? payload.permissions : [];
    const claimed = claims.filter(
      (permission: unknown): permission is string =>
        typeof permission === 'string' && isConcessionPermission(permission),
    );
    if (claimed.length > 0) {
      const [granted, fromRoles] = await Promise.all([
        this.prisma.userPermission.findMany({
          where: { userId: payload.sub, effect: 'GRANT' },
          select: { permission: true },
        }),
        roles.length
          ? this.prisma.rolePermission.findMany({
              where: { role: { name: { in: roles } } },
              select: { permission: true },
            })
          : Promise.resolve([]),
      ]);
      const live = new Set([
        ...(granted ?? []).map((row) => row.permission),
        ...(fromRoles ?? []).map((row) => row.permission),
      ]);
      const stale = claimed.filter((permission) => !live.has(permission));
      if (stale.length > 0) {
        throw new UnauthorizedException(
          `Concesiones retiradas del servidor (${stale.join(', ')}). Vuelva a iniciar sesión.`,
        );
      }
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      roles,
      permissions: payload.permissions,
      jti: payload.jti,
    };
  }
}
