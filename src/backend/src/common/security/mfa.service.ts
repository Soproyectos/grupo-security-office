import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { MfaCryptoService, safeCompare } from './mfa-crypto.service';
import { BCRYPT_ROUNDS } from './password.constants';

/** Roles que no pueden operar sin segundo factor confirmado. */
export const MFA_REQUIRED_ROLES = ['Super Admin'];

const BACKUP_CODE_COUNT = 10;

export interface MfaEnrollment {
  /** Secreto en base32, por si el usuario no puede escanear el QR. */
  secret: string;
  /** Data URL PNG del código QR. */
  qrDataUrl: string;
  otpauthUrl: string;
}

/**
 * Segundo factor TOTP (S.2 del hardening).
 *
 * Decisiones:
 *  - `epochTolerance: 30` tolera un desfase de ±30 s entre el reloj del servidor
 *    y el del teléfono. Ampliarlo agranda proporcionalmente la ventana de un
 *    atacante que intercepte un código.
 *  - El secreto sólo se marca `enabled` tras verificar un código real, para no
 *    dejar a nadie fuera de su cuenta por haber activado un factor que su
 *    aplicación nunca llegó a registrar.
 *  - `lastCode` impide reutilizar el mismo código dentro de su ventana de 30 s
 *    (protección contra repetición si alguien lo observa).
 */
@Injectable()
export class MfaService {
  constructor(
    private prisma: PrismaService,
    private crypto: MfaCryptoService,
    private config: ConfigService,
  ) {}

  private issuer(): string {
    return this.config.get<string>('MFA_ISSUER') || 'Grupo Security';
  }

  /** ¿Este conjunto de roles obliga a tener MFA? */
  isRequiredForRoles(roles: string[]): boolean {
    return roles.some((role) => MFA_REQUIRED_ROLES.includes(role));
  }

  async getState(userId: string) {
    const mfa = await this.prisma.userMfa.findUnique({
      where: { userId },
      select: { enabled: true, confirmedAt: true },
    });

    return {
      enabled: mfa?.enabled ?? false,
      confirmedAt: mfa?.confirmedAt ?? null,
    };
  }

  /**
   * Devuelve el QR del enrolamiento pendiente, creándolo si no existía.
   *
   * Es idempotente a propósito: pedirlo varias veces entrega siempre el mismo
   * secreto mientras no se confirme (ver el comentario de abajo). Un segundo
   * factor ya activo no se toca: hay que desactivarlo explícitamente.
   */
  async startEnrollment(userId: string, email: string): Promise<MfaEnrollment> {
    const existing = await this.prisma.userMfa.findUnique({ where: { userId } });

    if (existing?.enabled) {
      throw new BadRequestException(
        'El segundo factor ya está activo. Desactívelo antes de volver a enrolarlo.',
      );
    }

    // Si hay un enrolamiento a medias, se REUTILIZA su secreto en vez de
    // generar otro.
    //
    // Motivo: el frontend pide el QR automáticamente en cada intento de login.
    // Generando uno nuevo cada vez, quien escaneara el código y luego recargara
    // la página se encontraba con que la entrada guardada en su aplicación de
    // autenticación ya no servía, sin ninguna explicación visible. Un secreto
    // sin confirmar no otorga acceso, así que conservarlo no debilita nada.
    if (existing) {
      const secret = this.crypto.decrypt(existing.secret);
      return this.buildEnrollment(secret, email);
    }

    const secret = generateSecret();

    await this.prisma.userMfa.create({
      data: { userId, secret: this.crypto.encrypt(secret), enabled: false },
    });

    return this.buildEnrollment(secret, email);
  }

  /** Arma el `otpauth://` y su QR para un secreto dado. */
  private async buildEnrollment(
    secret: string,
    email: string,
  ): Promise<MfaEnrollment> {
    const otpauthUrl = generateURI({
      strategy: 'totp',
      issuer: this.issuer(),
      label: email,
      secret,
    });

    return {
      secret,
      otpauthUrl,
      qrDataUrl: await QRCode.toDataURL(otpauthUrl, { width: 240, margin: 1 }),
    };
  }

  /**
   * Confirma el enrolamiento con un código válido y activa el segundo factor.
   * Devuelve los códigos de respaldo, que se muestran una única vez.
   */
  async confirmEnrollment(userId: string, code: string): Promise<string[]> {
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });

    if (!mfa) {
      throw new BadRequestException('No hay un enrolamiento en curso.');
    }

    if (!this.verifyTotp(this.crypto.decrypt(mfa.secret), code)) {
      throw new BadRequestException('El código no es válido. Verifique la hora del dispositivo.');
    }

    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(5).toString('hex').toUpperCase(),
    );

    await this.prisma.$transaction([
      this.prisma.mfaBackupCode.deleteMany({ where: { mfaId: mfa.id } }),
      this.prisma.userMfa.update({
        where: { id: mfa.id },
        data: { enabled: true, confirmedAt: new Date(), lastCode: code },
      }),
      this.prisma.mfaBackupCode.createMany({
        data: await Promise.all(
          codes.map(async (c) => ({
            mfaId: mfa.id,
            codeHash: await bcrypt.hash(c, BCRYPT_ROUNDS),
          })),
        ),
      }),
    ]);

    return codes;
  }

  /**
   * Verifica un código en el login. Acepta TOTP o, si no coincide, un código de
   * respaldo sin usar (que queda consumido).
   */
  async verify(userId: string, code: string): Promise<boolean> {
    const mfa = await this.prisma.userMfa.findUnique({
      where: { userId },
      include: { backupCodes: { where: { usedAt: null } } },
    });

    if (!mfa || !mfa.enabled) return false;

    // Rechaza la reutilización del mismo código dentro de su ventana de 30 s.
    if (mfa.lastCode && safeCompare(mfa.lastCode, code)) return false;

    if (this.verifyTotp(this.crypto.decrypt(mfa.secret), code)) {
      await this.prisma.userMfa.update({
        where: { id: mfa.id },
        data: { lastUsedAt: new Date(), lastCode: code },
      });
      return true;
    }

    for (const backup of mfa.backupCodes) {
      if (await bcrypt.compare(code, backup.codeHash)) {
        await this.prisma.mfaBackupCode.update({
          where: { id: backup.id },
          data: { usedAt: new Date() },
        });
        return true;
      }
    }

    return false;
  }

  private verifyTotp(secret: string, code: string): boolean {
    try {
      // `epochTolerance: 30` acepta la ventana anterior y la siguiente (±30 s),
      // para absorber el desfase de reloj entre el servidor y el teléfono.
      // Ampliarlo agranda en la misma proporción la ventana de un atacante que
      // llegue a interceptar un código.
      return verifySync({
        strategy: 'totp',
        secret,
        token: code,
        epochTolerance: 30,
      }).valid;
    } catch {
      return false;
    }
  }

  /**
   * Desactiva el segundo factor. Exige un código válido: sin esa comprobación,
   * cualquiera con la sesión abierta podría retirar la protección.
   */
  async disable(userId: string, code: string): Promise<void> {
    if (!(await this.verify(userId, code))) {
      throw new UnauthorizedException('Código inválido.');
    }

    await this.prisma.userMfa.delete({ where: { userId } });
  }

  /** Cuántos códigos de respaldo quedan sin usar. */
  async remainingBackupCodes(userId: string): Promise<number> {
    const mfa = await this.prisma.userMfa.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!mfa) return 0;

    return this.prisma.mfaBackupCode.count({
      where: { mfaId: mfa.id, usedAt: null },
    });
  }
}
