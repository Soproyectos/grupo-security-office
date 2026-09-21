import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Escalones de bloqueo por cuenta. Se evalúan de mayor a menor: gana el primero
 * cuyo umbral se alcanza.
 *
 * `lockMinutes: null` significa bloqueo indefinido — sólo lo levanta otro
 * Super Admin desde la administración de usuarios.
 */
const LOCKOUT_TIERS: Array<{ failures: number; lockMinutes: number | null }> = [
  { failures: 15, lockMinutes: null },
  { failures: 10, lockMinutes: 60 },
  { failures: 5, lockMinutes: 15 },
];

/**
 * Ventana en la que se cuentan los fallos. Fuera de ella, los intentos viejos
 * dejan de sumar: un error de tecleo de hace tres días no debe acercar a nadie
 * al bloqueo.
 */
const FAILURE_WINDOW_MINUTES = 60 * 24;

export interface LockoutStatus {
  locked: boolean;
  /** `null` con `locked: true` significa bloqueo indefinido. */
  until: Date | null;
  recentFailures: number;
}

/**
 * Bloqueo progresivo de cuentas y registro de intentos (S.3 del hardening).
 *
 * Por qué no basta el ThrottlerGuard: `@nestjs/throttler` limita por IP. Un
 * atacante con una botnet, o que espere 13 segundos entre intentos, nunca toca
 * ese techo. El bloqueo aquí cuenta fallos **por cuenta**, así que la defensa no
 * depende del origen del tráfico.
 */
@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);

  constructor(private prisma: PrismaService) {}

  private windowStart(): Date {
    return new Date(Date.now() - FAILURE_WINDOW_MINUTES * 60_000);
  }

  /**
   * ¿Está la cuenta bloqueada ahora mismo?
   *
   * Se cuentan los fallos posteriores al último acceso correcto: un login
   * exitoso limpia el contador sin borrar el historial de auditoría.
   */
  async getStatus(email: string): Promise<LockoutStatus> {
    const normalized = email.toLowerCase();

    const lastSuccess = await this.prisma.loginAttempt.findFirst({
      where: { email: normalized, success: true },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const since =
      lastSuccess && lastSuccess.createdAt > this.windowStart()
        ? lastSuccess.createdAt
        : this.windowStart();

    const failures = await this.prisma.loginAttempt.findMany({
      where: { email: normalized, success: false, createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const count = failures.length;
    const tier = LOCKOUT_TIERS.find((t) => count >= t.failures);

    if (!tier) {
      return { locked: false, until: null, recentFailures: count };
    }

    if (tier.lockMinutes === null) {
      return { locked: true, until: null, recentFailures: count };
    }

    // El bloqueo corre desde el fallo que lo disparó, no desde ahora: de lo
    // contrario un atacante podría mantener la cuenta bloqueada indefinidamente
    // reintentando (denegación de servicio contra el titular legítimo).
    const trigger = failures[0].createdAt;
    const until = new Date(trigger.getTime() + tier.lockMinutes * 60_000);

    return {
      locked: until > new Date(),
      until,
      recentFailures: count,
    };
  }

  /** Registra un intento. Nunca lanza: un fallo de auditoría no debe tumbar el login. */
  async record(params: {
    email: string;
    success: boolean;
    userId?: string | null;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await this.prisma.loginAttempt.create({
        data: {
          email: params.email.toLowerCase(),
          success: params.success,
          userId: params.userId ?? null,
          reason: params.reason,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo registrar el intento de login: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Levanta el bloqueo de una cuenta marcando los fallos como superados.
   * Sólo debe invocarse desde una acción administrativa auditada.
   */
  async unlock(email: string): Promise<number> {
    const { count } = await this.prisma.loginAttempt.deleteMany({
      where: { email: email.toLowerCase(), success: false },
    });
    return count;
  }
}
