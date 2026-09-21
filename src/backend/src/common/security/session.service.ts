import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export type RevokeReason =
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'ADMIN_REVOKE'
  | 'ROTATED';

/**
 * Sesiones revocables (S.4 del hardening).
 *
 * Problema que resuelve: un JWT es válido hasta que expira, por definición. Con
 * 8 horas de vigencia y sin registro, un token robado seguía sirviendo durante
 * el resto de su vida y no había forma de cortar una sesión concreta ni de
 * cerrar sesión en otros dispositivos.
 *
 * Ahora el token lleva un `jti` que apunta a una fila aquí, y `jwt.strategy`
 * comprueba que siga viva. **No añade coste de red**: la estrategia ya consultaba
 * la BD en cada petición para validar `isActive`; ambas comprobaciones viajan en
 * la misma consulta.
 */
@Injectable()
export class SessionService {
  constructor(private prisma: PrismaService) {}

  async create(params: {
    userId: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string> {
    const jti = randomUUID();

    await this.prisma.session.create({
      data: {
        jti,
        userId: params.userId,
        expiresAt: params.expiresAt,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });

    return jti;
  }

  /**
   * ¿Sigue viva esta sesión? Se usa en cada petición autenticada.
   *
   * Un `jti` ausente significa un token emitido antes de esta fase: se rechaza,
   * de modo que al desplegar todos vuelven a autenticarse una vez.
   */
  async isActive(jti: string | undefined): Promise<boolean> {
    if (!jti) return false;

    const session = await this.prisma.session.findUnique({
      where: { jti },
      select: { revokedAt: true, expiresAt: true },
    });

    if (!session) return false;
    if (session.revokedAt) return false;

    return session.expiresAt > new Date();
  }

  /** Marca la última actividad. Se llama de forma no bloqueante. */
  async touch(jti: string): Promise<void> {
    await this.prisma.session
      .update({ where: { jti }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  async revoke(jti: string, reason: RevokeReason): Promise<void> {
    await this.prisma.session
      .updateMany({
        where: { jti, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: reason },
      })
      .catch(() => undefined);
  }

  /**
   * Revoca todas las sesiones de un usuario, opcionalmente conservando una.
   * Se invoca al cambiar la contraseña y desde la administración de usuarios.
   */
  async revokeAllForUser(
    userId: string,
    reason: RevokeReason,
    exceptJti?: string,
  ): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptJti && { jti: { not: exceptJti } }),
      },
      data: { revokedAt: new Date(), revokeReason: reason },
    });

    return count;
  }

  /** Sesiones vivas de un usuario, para la pantalla "Sesiones activas". */
  async listActive(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        jti: true,
        ipAddress: true,
        userAgent: true,
        lastSeenAt: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  }

  /**
   * Borra sesiones caducadas hace más de 30 días. La tabla es de auditoría a
   * corto plazo, no un archivo histórico.
   */
  async pruneExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);

    const { count } = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });

    return count;
  }
}
