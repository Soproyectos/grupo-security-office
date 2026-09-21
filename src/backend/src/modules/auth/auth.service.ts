import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { AccountLockoutService } from '../../common/security/account-lockout.service';
import { MfaService } from '../../common/security/mfa.service';
import { SessionService } from '../../common/security/session.service';

/**
 * Mensaje único para credenciales incorrectas, usuario inexistente y cuenta
 * inactiva. Distinguirlos permitiría enumerar qué correos existen en el sistema.
 */
const GENERIC_AUTH_ERROR = 'Credenciales inválidas';

/**
 * Hash de descarte con el que se compara cuando el usuario no existe.
 * Sin esto, un correo inexistente responde mucho más rápido que uno real (no se
 * ejecuta bcrypt), y esa diferencia de tiempo basta para enumerar cuentas.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7ROU8.4uWxTPoqkbnk1k1ZfMCTPQmPu';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
}

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

/** Resultado del primer paso del login. */
export type LoginStepResult =
  | { status: 'COMPLETE'; token: string; user: AuthenticatedUser; expiresAt: Date }
  | { status: 'MFA_REQUIRED'; challengeToken: string }
  | { status: 'MFA_ENROLLMENT_REQUIRED'; challengeToken: string };

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private lockout: AccountLockoutService,
    private mfa: MfaService,
    private sessions: SessionService,
  ) {}

  /** Duración de la sesión según privilegio: las cuentas potentes viven menos. */
  private sessionHours(roles: string[]): number {
    return this.mfa.isRequiredForRoles(roles)
      ? this.config.get<number>('SESSION_HOURS_PRIVILEGED', 2)
      : this.config.get<number>('SESSION_HOURS', 8);
  }

  private buildIdentity(user: {
    id: string;
    email: string;
    name: string;
    roles: { role: { name: string; permissions: { permission: string }[] } }[];
  }): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map((ur) => ur.role.name),
      permissions: [
        ...new Set(
          user.roles.flatMap((ur) =>
            ur.role.permissions.map((rp) => rp.permission),
          ),
        ),
      ],
    };
  }

  /**
   * Paso 1: credenciales. No emite sesión si la cuenta exige segundo factor;
   * en ese caso devuelve un token de desafío de vida corta.
   */
  async login(
    email: string,
    password: string,
    meta: RequestMeta = {},
  ): Promise<LoginStepResult> {
    const normalized = email.toLowerCase();

    const status = await this.lockout.getStatus(normalized);
    if (status.locked) {
      await this.lockout.record({
        email: normalized,
        success: false,
        reason: 'LOCKED',
        ...meta,
      });

      throw new ForbiddenException(
        status.until
          ? `Cuenta bloqueada temporalmente. Reintente después de ${status.until.toLocaleTimeString('es-CO')}.`
          : 'Cuenta bloqueada. Contacte a un administrador.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      include: {
        roles: { include: { role: { include: { permissions: true } } } },
      },
    });

    // Se ejecuta bcrypt también cuando el usuario no existe, para que el tiempo
    // de respuesta no revele si el correo está registrado.
    const passwordOk = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_HASH,
    );

    if (!user || !user.isActive || !passwordOk) {
      await this.lockout.record({
        email: normalized,
        success: false,
        userId: user?.id,
        reason: !user
          ? 'UNKNOWN_EMAIL'
          : !user.isActive
            ? 'INACTIVE'
            : 'BAD_PASSWORD',
        ...meta,
      });

      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    const identity = this.buildIdentity(user);
    const mfaState = await this.mfa.getState(user.id);

    if (mfaState.enabled) {
      return {
        status: 'MFA_REQUIRED',
        challengeToken: this.signChallenge(user.id, 'mfa'),
      };
    }

    // Un rol privilegiado sin segundo factor sólo puede ir a enrolarlo.
    if (this.mfa.isRequiredForRoles(identity.roles)) {
      return {
        status: 'MFA_ENROLLMENT_REQUIRED',
        challengeToken: this.signChallenge(user.id, 'mfa-enroll'),
      };
    }

    return this.issueSession(identity, meta);
  }

  /** Paso 2: código TOTP o de respaldo. */
  async verifyMfa(
    challengeToken: string,
    code: string,
    meta: RequestMeta = {},
  ): Promise<LoginStepResult> {
    const userId = this.consumeChallenge(challengeToken, 'mfa');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: true } } } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    if (!(await this.mfa.verify(userId, code))) {
      await this.lockout.record({
        email: user.email,
        success: false,
        userId,
        reason: 'BAD_MFA',
        ...meta,
      });

      throw new UnauthorizedException('Código de verificación inválido.');
    }

    return this.issueSession(this.buildIdentity(user), meta);
  }

  /** Emite la cookie de sesión definitiva y registra el acceso. */
  private async issueSession(
    identity: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<LoginStepResult> {
    const hours = this.sessionHours(identity.roles);
    const expiresAt = new Date(Date.now() + hours * 3_600_000);

    const jti = await this.sessions.create({
      userId: identity.id,
      expiresAt,
      ...meta,
    });

    const token = this.jwtService.sign(
      {
        sub: identity.id,
        email: identity.email,
        name: identity.name,
        roles: identity.roles,
        permissions: identity.permissions,
        jti,
      },
      { expiresIn: `${hours}h` },
    );

    await this.lockout.record({
      email: identity.email,
      success: true,
      userId: identity.id,
      ...meta,
    });

    return { status: 'COMPLETE', token, user: identity, expiresAt };
  }

  /**
   * Token de desafío intermedio. Sólo sirve para completar el paso pendiente y
   * lleva `scope`, de modo que un token de enrolamiento no pueda usarse como si
   * ya se hubiera verificado el segundo factor.
   *
   * Las dos vidas son distintas a propósito:
   *  - `mfa` (5 min): quien ya tiene la app sólo necesita leer un código.
   *  - `mfa-enroll` (15 min): el primer enrolamiento puede exigir instalar la
   *    aplicación de autenticación, crear una cuenta y volver. Con 5 minutos el
   *    token expiraría a medias y habría que reiniciar el proceso.
   *
   * La ventana más larga no debilita nada relevante: el token ya exige conocer
   * la contraseña, y por sí solo no da acceso a la API (`jwt.strategy` rechaza
   * cualquier token con `scope`).
   */
  private signChallenge(userId: string, scope: 'mfa' | 'mfa-enroll'): string {
    const expiresIn = scope === 'mfa-enroll' ? '15m' : '5m';

    return this.jwtService.sign({ sub: userId, scope }, { expiresIn });
  }

  consumeChallenge(token: string, expectedScope: 'mfa' | 'mfa-enroll'): string {
    let payload: { sub?: string; scope?: string };

    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('La verificación expiró. Inicie sesión de nuevo.');
    }

    if (payload.scope !== expectedScope || !payload.sub) {
      throw new UnauthorizedException('Token de verificación inválido.');
    }

    return payload.sub;
  }

  /** Completa el enrolamiento obligatorio y entrega la sesión definitiva. */
  async completeEnrollment(
    challengeToken: string,
    code: string,
    meta: RequestMeta = {},
  ): Promise<{ result: LoginStepResult; backupCodes: string[] }> {
    const userId = this.consumeChallenge(challengeToken, 'mfa-enroll');
    const backupCodes = await this.mfa.confirmEnrollment(userId, code);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: true } } } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(GENERIC_AUTH_ERROR);
    }

    return {
      result: await this.issueSession(this.buildIdentity(user), meta),
      backupCodes,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: true } } } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return this.buildIdentity(user);
  }

  async logout(jti: string | undefined): Promise<void> {
    if (jti) await this.sessions.revoke(jti, 'LOGOUT');
  }
}
