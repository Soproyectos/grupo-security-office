import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, el tamaño recomendado para GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Cifra y descifra los secretos TOTP en reposo.
 *
 * Por qué cifrar y no hashear: un secreto TOTP debe recuperarse en claro para
 * calcular el código esperado, así que un hash no sirve. Guardarlo en claro
 * significaría que quien lea la base de datos puede generar los códigos de
 * cualquier usuario — es decir, el segundo factor dejaría de ser un segundo
 * factor frente a una filtración de BD.
 *
 * AES-256-GCM aporta además autenticación: un secreto manipulado en la BD falla
 * al descifrar en vez de producir códigos silenciosamente incorrectos.
 */
@Injectable()
export class MfaCryptoService implements OnModuleInit {
  private readonly logger = new Logger(MfaCryptoService.name);
  private key!: Buffer;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>('MFA_ENCRYPTION_KEY');

    if (!raw) {
      throw new Error(
        'MFA_ENCRYPTION_KEY es obligatoria para habilitar MFA. ' +
          'Genere una con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      );
    }

    // Se acepta base64 (32 bytes) o cualquier cadena larga, derivando la clave
    // con SHA-256 para obtener siempre los 256 bits que exige AES-256.
    const decoded = Buffer.from(raw, 'base64');
    this.key =
      decoded.length === 32 ? decoded : createHash('sha256').update(raw).digest();

    if (raw.length < 32) {
      this.logger.warn(
        'MFA_ENCRYPTION_KEY es corta. Use 32 bytes aleatorios en base64.',
      );
    }
  }

  /** Devuelve `iv:authTag:ciphertext`, todo en base64. */
  encrypt(plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);

    return [
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(':');

    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Secreto MFA con formato inválido');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

/**
 * Compara dos cadenas en tiempo constante.
 *
 * Una comparación normal (`===`) sale en el primer carácter distinto, y esa
 * diferencia de microsegundos permite deducir el valor correcto carácter a
 * carácter. Se usa para códigos TOTP y de respaldo.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  // timingSafeEqual exige la misma longitud; comparar longitudes no filtra nada
  // útil aquí porque el formato de los códigos es público y fijo.
  if (bufA.length !== bufB.length) return false;

  return timingSafeEqual(bufA, bufB);
}

export { AUTH_TAG_LENGTH };
