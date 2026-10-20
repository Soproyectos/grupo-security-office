import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HierarchyService } from '../hierarchy/hierarchy.service';
import { AccessIdentity } from './data-scope';

/**
 * Usuario ya autenticado por Passport (jwt.strategy) — el ÚNICO origen de
 * identidad para la administración de concesiones (BASE-04 §3 regla (c),
 * §7.3 caso 7.3). El cuerpo, la query y las cabeceras de la petición jamás
 * aportan userId, roles ni scope.
 */
export interface PassportSessionUser {
  readonly sub: string;
  readonly email?: string;
  readonly name?: string;
  readonly roles?: string[];
  readonly permissions?: string[];
  readonly jti?: string;
}

/**
 * Identidad administrativa efectiva construida en el servidor por petición.
 *
 * Combina lo verificado en Passport (`sub`/`jti`) con el estado FRESHO de la
 * BD: usuario activo, sesión viva (revocable S.4) y jerarquía actual del
 * equipo. `superAdmin` se toma de los roles de la BD, no del token: un JWT
 * viejo que aún declara Super Admin no sobrevive a un retiro de rol.
 */
@Injectable()
export class LiveAdminIdentityService {
  constructor(
    private prisma: PrismaService,
    private hierarchy: HierarchyService,
  ) {}

  async fromRequest(request: { user?: PassportSessionUser } | undefined): Promise<AccessIdentity> {
    const passportUser = request?.user;
    if (!passportUser || typeof passportUser.sub !== 'string' || passportUser.sub.trim() === '') {
      throw new UnauthorizedException(
        'Identidad no encontrada: la petición carece de usuario autenticado (Passport)',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: passportUser.sub },
      select: {
        id: true,
        isActive: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    if (!passportUser.jti) {
      throw new UnauthorizedException('Sesión finalizada. Inicie sesion de nuevo.');
    }

    const session = await this.prisma.session.findUnique({
      where: { jti: passportUser.jti },
      select: { userId: true, revokedAt: true, expiresAt: true },
    });

    // Mismas reglas que SessionService.isActive + pertenencia de la sesión.
    const sessionValid =
      !!session &&
      session.userId === user.id &&
      !session.revokedAt &&
      session.expiresAt > new Date();

    if (!sessionValid) {
      throw new UnauthorizedException('Sesión finalizada. Inicie sesion de nuevo.');
    }

    const roleNames = user.roles.map((entry) => entry.role.name);

    return {
      userId: user.id,
      jti: passportUser.jti,
      verified: true,
      active: true,
      sessionValid: true,
      sessionUserId: session.userId,
      superAdmin: roleNames.includes('Super Admin'),
      teamOwnerIds: await this.hierarchy.getSubordinateIds(user.id),
    };
  }
}
