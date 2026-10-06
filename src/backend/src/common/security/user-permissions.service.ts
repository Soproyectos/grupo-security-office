import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';
import {
  DASHBOARD_PACKS,
  dashboardPackPermission,
} from './dashboard-permissions';

/**
 * Prefijo de los permisos que pueden concederse por usuario.
 *
 * Deliberadamente acotado al dashboard: la pantalla de concesiones reparte
 * **visibilidad**, no capacidades. Permitir conceder `users:manage` o
 * `listas:delete` por esta vía convertiría un control pensado para "que vea el
 * panel de ventas" en una puerta trasera de escalada de privilegios.
 *
 * Excepción consciente: `storefront:`. `storefront:read` sí es visibilidad,
 * pero `storefront:write` es una capacidad —editar los teléfonos, el correo y
 * los horarios que la tienda pública muestra—, así que no encaja en la regla de
 * arriba. Se admite porque no amplía quién puede hacer qué:
 *
 * 1. Sólo la concede Super Admin: `GET` y `PUT /users/:id/dashboard-permissions`
 *    exigen `@Roles('Super Admin')`. Y como Super Admin ya podía concederla
 *    por rol (`PUT /roles/:id`), abrir este prefijo no le da poder nuevo: sólo
 *    un atajo para dársela a una persona concreta sin tocar el resto del rol.
 * 2. Queda auditada: `replaceForUser` registra el antes y el después en
 *    `AuditLog` con la acción `grant-dashboard-permissions`, así que siempre
 *    consta quién decidió esto y sobre qué conjunto anterior.
 * 3. El alcance ya está acotado en su propio sitio: el endpoint de escritura
 *    sigue exigiendo `@Permissions('storefront:write')` y el de lectura
 *    `storefront:read`, así que la concesión no salta ningún control.
 */
const GRANTABLE_PREFIXES = ['dashboard:pack:', 'dashboard:block:', 'storefront:'];

export interface GrantedPermission {
  permission: string;
  effect: string;
  reason: string | null;
  grantedById: string | null;
  createdAt: Date;
}

@Injectable()
export class UserPermissionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private assertGrantable(permission: string): void {
    if (!GRANTABLE_PREFIXES.some((p) => permission.startsWith(p))) {
      throw new BadRequestException(
        `Sólo pueden concederse permisos de dashboard o de configuración de tienda. Recibido: "${permission}".`,
      );
    }

    if (permission.startsWith('dashboard:pack:')) {
      const pack = permission.slice('dashboard:pack:'.length);

      if (!DASHBOARD_PACKS.includes(pack as never)) {
        throw new BadRequestException(`El paquete "${pack}" no existe.`);
      }
    }
  }

  /** Concesiones vigentes de un usuario. */
  async listForUser(userId: string): Promise<GrantedPermission[]> {
    return this.prisma.userPermission.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        permission: true,
        effect: true,
        reason: true,
        grantedById: true,
        createdAt: true,
      },
    });
  }

  /**
   * Permisos efectivos añadidos por concesión individual, ya expandidos.
   *
   * Un paquete se expande a sí mismo y no a sus bloques: el compositor del
   * frontend hace la expansión, porque es quien conoce el catálogo. Mantener
   * los 48 bloques duplicados aquí obligaría a sincronizarlos a mano.
   */
  async effectivePermissionsFor(userId: string): Promise<string[]> {
    const grants = await this.prisma.userPermission.findMany({
      where: { userId, effect: 'GRANT' },
      select: { permission: true },
    });

    return grants.map((g) => g.permission);
  }

  /**
   * Reemplaza el conjunto de concesiones de un usuario por el indicado.
   *
   * Se sustituye en bloque en vez de aplicar diferencias porque la pantalla
   * envía el estado completo de las casillas: calcular altas y bajas en el
   * cliente abriría la puerta a que una pantalla desactualizada reviva
   * concesiones ya retiradas.
   */
  async replaceForUser(
    userId: string,
    permissions: string[],
    actorId: string,
    reason?: string,
  ): Promise<GrantedPermission[]> {
    const unique = [...new Set(permissions)];
    unique.forEach((p) => this.assertGrantable(p));

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) throw new BadRequestException('Usuario no encontrado.');

    const previous = await this.listForUser(userId);

    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId } }),
      this.prisma.userPermission.createMany({
        data: unique.map((permission) => ({
          userId,
          permission,
          effect: 'GRANT',
          grantedById: actorId,
          reason,
        })),
      }),
    ]);

    // Toda concesión queda auditada: es una decisión sobre qué datos ve una
    // persona, y sin rastro nadie podría responder después "¿quién le dio esto?".
    await this.audit.log({
      userId: actorId,
      action: 'grant-dashboard-permissions',
      entity: 'UserPermission',
      entityId: userId,
      oldValues: { permissions: previous.map((p) => p.permission) },
      newValues: { permissions: unique, reason },
      result: 'SUCCESS',
    });

    return this.listForUser(userId);
  }

  /** Catálogo de paquetes concedibles, para poblar la pantalla. */
  availablePacks(): Array<{ id: string; permission: string }> {
    return DASHBOARD_PACKS.map((id) => ({
      id,
      permission: dashboardPackPermission(id),
    }));
  }
}
