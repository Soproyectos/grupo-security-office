import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const SUPER_ADMIN_ROLE = 'Super Admin';

/**
 * Número mínimo de Super Admin activos que debe conservar el sistema.
 *
 * Con uno solo, perder esa cuenta (baja del titular, contraseña olvidada,
 * dispositivo MFA extraviado) deja el sistema sin nadie capaz de administrar
 * roles ni desbloquear cuentas, y sin forma de recuperarlo desde la aplicación.
 */
export const MIN_ACTIVE_SUPER_ADMINS = 2;

/**
 * Salvaguardas de las cuentas privilegiadas (S.5 del hardening).
 *
 * Cubre tres formas de perder el control del sistema que no son ataques, sino
 * accidentes de administración:
 *  1. Quedarse sin Super Admin (break-glass).
 *  2. Que un Super Admin se degrade o desactive a sí mismo por error.
 *  3. Que alguien eleve su propio rol sin supervisión de un tercero.
 */
@Injectable()
export class PrivilegedAccountService {
  constructor(private prisma: PrismaService) {}

  async isSuperAdmin(userId: string): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: { userId, role: { name: SUPER_ADMIN_ROLE } },
    });

    return count > 0;
  }

  /** Super Admin activos, excluyendo opcionalmente a uno. */
  async countActiveSuperAdmins(exceptUserId?: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        isActive: true,
        ...(exceptUserId && { id: { not: exceptUserId } }),
        roles: { some: { role: { name: SUPER_ADMIN_ROLE } } },
      },
    });
  }

  /**
   * Un Super Admin no modifica su propio rol ni su propio estado.
   *
   * Sin esta regla, comprometer una sesión de Super Admin permitiría al atacante
   * consolidarse (degradar a los demás) sin que nadie pudiera revertirlo. Exigir
   * que sea *otro* Super Admin quien lo haga mantiene el control repartido.
   */
  assertNotSelfPrivilegeChange(actorId: string, targetId: string): void {
    if (actorId === targetId) {
      throw new ForbiddenException(
        'No puede modificar su propio rol ni su propio estado. ' +
          'Solicítelo a otro Super Admin.',
      );
    }
  }

  /**
   * Verifica que la operación no deje el sistema por debajo del mínimo de
   * Super Admin activos. Se invoca antes de desactivar, eliminar o quitar el rol.
   */
  async assertBreakGlass(targetUserId: string, operation: string): Promise<void> {
    if (!(await this.isSuperAdmin(targetUserId))) return;

    const remaining = await this.countActiveSuperAdmins(targetUserId);

    if (remaining < MIN_ACTIVE_SUPER_ADMINS - 1) {
      throw new ForbiddenException(
        `No se puede ${operation}: el sistema quedaría con ${remaining} Super Admin activo(s). ` +
          `Se exige un mínimo de ${MIN_ACTIVE_SUPER_ADMINS - 1} tras la operación. ` +
          'Designe otro Super Admin antes de continuar.',
      );
    }
  }

  /** ¿La lista de roles destino retira el rol Super Admin al usuario? */
  async willRemoveSuperAdmin(
    userId: string,
    newRoleIds: string[],
  ): Promise<boolean> {
    if (!(await this.isSuperAdmin(userId))) return false;

    const superAdminRole = await this.prisma.role.findUnique({
      where: { name: SUPER_ADMIN_ROLE },
      select: { id: true },
    });

    if (!superAdminRole) return false;

    return !newRoleIds.includes(superAdminRole.id);
  }
}
