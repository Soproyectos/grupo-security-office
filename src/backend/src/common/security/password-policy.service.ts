import { Injectable, BadRequestException } from '@nestjs/common';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as zxcvbnCommon from '@zxcvbn-ts/language-common';
import * as zxcvbnEs from '@zxcvbn-ts/language-es-es';

/**
 * Términos del negocio que un atacante probaría primero. zxcvbn los trata como
 * palabras de diccionario, de modo que "GrupoSecurity2026!" deja de puntuar como
 * contraseña fuerte pese a su longitud y variedad de caracteres.
 */
const BUSINESS_TERMS = [
  'grupo',
  'security',
  'gruposecurity',
  'seguridad',
  'admin',
  'administrador',
  'compras',
  'supervisor',
  'comercial',
  'vendedor',
  'operador',
  'consulta',
  'gruposecurity.co',
  'colombia',
  'bogota',
];

/** Puntuación mínima de zxcvbn (0-4) exigida a un usuario normal. */
export const MIN_SCORE_DEFAULT = 3;

/**
 * Puntuación mínima para cuentas privilegiadas. Un Super Admin controla la
 * visibilidad de datos de toda la organización: se le exige el máximo.
 */
export const MIN_SCORE_PRIVILEGED = 4;

/** Longitud mínima absoluta, independiente de la puntuación. */
export const MIN_LENGTH = 12;

/**
 * Longitud máxima. bcrypt trunca silenciosamente a 72 bytes: aceptar más daría
 * una falsa sensación de seguridad y haría que dos contraseñas distintas con el
 * mismo prefijo fueran equivalentes.
 */
export const MAX_LENGTH = 72;

export interface PasswordCheckResult {
  valid: boolean;
  score: number;
  /** Mensajes accionables para mostrar al usuario. */
  feedback: string[];
}

/**
 * Valida la fuerza real de una contraseña (S.1 del hardening).
 *
 * Contexto: la política anterior era `@MinLength(8)`, que acepta 'admin123' y
 * '12345678'. La longitud por sí sola no mide nada: zxcvbn estima cuántos
 * intentos costaría adivinarla, considerando diccionarios, patrones de teclado,
 * fechas, repeticiones y sustituciones tipo "a"→"@".
 */
@Injectable()
export class PasswordPolicyService {
  private readonly zxcvbn: ZxcvbnFactory;

  constructor() {
    this.zxcvbn = new ZxcvbnFactory({
      // Los diccionarios se consultan como una sola lista ordenada por frecuencia.
      dictionary: {
        ...zxcvbnCommon.dictionary,
        ...zxcvbnEs.dictionary,
        userInputs: BUSINESS_TERMS,
      },
      graphs: zxcvbnCommon.adjacencyGraphs,
      translations: zxcvbnEs.translations,
      // Detecta sustituciones por cercanía ("Segurid4d" ≈ "seguridad").
      useLevenshteinDistance: true,
    });
  }

  /**
   * Evalúa una contraseña sin lanzar excepción. Útil para el medidor en vivo.
   *
   * @param userInputs datos del propio usuario (correo, nombre) que no deben
   *   aparecer en su contraseña. zxcvbn los penaliza como diccionario personal.
   */
  check(
    password: string,
    opts: { privileged?: boolean; userInputs?: string[] } = {},
  ): PasswordCheckResult {
    const minScore = opts.privileged ? MIN_SCORE_PRIVILEGED : MIN_SCORE_DEFAULT;
    const feedback: string[] = [];

    if (password.length < MIN_LENGTH) {
      feedback.push(`Debe tener al menos ${MIN_LENGTH} caracteres.`);
    }

    if (password.length > MAX_LENGTH) {
      feedback.push(`No puede superar los ${MAX_LENGTH} caracteres.`);
    }

    const extraInputs = (opts.userInputs ?? [])
      .filter(Boolean)
      .flatMap((input) => [input, ...input.split(/[\s@._-]+/)])
      .filter((token) => token.length > 2);

    const result = this.zxcvbn.check(password, extraInputs);

    if (result.score < minScore) {
      const warning = result.feedback.warning;
      if (warning) feedback.push(warning);
      feedback.push(...result.feedback.suggestions);

      if (feedback.length === 0) {
        feedback.push(
          'Es demasiado predecible. Combine palabras no relacionadas entre sí.',
        );
      }
    }

    const lengthOk =
      password.length >= MIN_LENGTH && password.length <= MAX_LENGTH;

    return {
      valid: lengthOk && result.score >= minScore,
      score: result.score,
      feedback,
    };
  }

  /**
   * Igual que `check`, pero lanza `BadRequestException` si no cumple.
   * Es la puerta que deben usar los servicios antes de hashear.
   */
  assert(
    password: string,
    opts: { privileged?: boolean; userInputs?: string[] } = {},
  ): void {
    const result = this.check(password, opts);

    if (!result.valid) {
      throw new BadRequestException({
        message: 'La contraseña no cumple la política de seguridad.',
        score: result.score,
        feedback: result.feedback,
      });
    }
  }
}
