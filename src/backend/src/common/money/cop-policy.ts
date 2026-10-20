import { Prisma } from '@prisma/client';

/**
 * IMP-03 — Política de precios COP única para carga (plantilla/preview), edición
 * manual por API y edición inline de ficha. Regla del proyecto: «COP final
 * entero con Decimal y HALF_UP; no migrar históricos ni imponer precisión COP a
 * USD» (CONTEXTO, diseño de importación :94-98).
 *
 * Se apoya en `Prisma.Decimal` (decimal.js): representación exacta, nunca
 * `parseFloat`/`toFixed` sobre binario para validar o comparar dinero.
 */

export const COP_CURRENCY = 'COP';

/** Versión de la política de precios COP (IMP-03/IMP-04): versiona la revisión. */
export const COP_POLICY_VERSION = 'cop-2026-10-17';

/**
 * Límite operativo único: 10 dígitos enteros, coherente con `Decimal(12,2)`.
 * Se aplica DESPUÉS de redondear (un valor que desborda al redondear se rechaza).
 */
export const COP_MAXIMUM = new Prisma.Decimal('9999999999');

export type CopPriceErrorCode = 'NOT_FINITE' | 'NOT_POSITIVE' | 'OUT_OF_RANGE';

/** Error de dominio de la política COP; quien la consume lo mapea a su capa (400/issue). */
export class CopPriceError extends Error {
  constructor(readonly code: CopPriceErrorCode, message: string) {
    super(message);
    this.name = 'CopPriceError';
  }
}

export interface NormalizedCopPrice {
  /** Valor recibido, normalizado a texto exacto (p. ej. '123456.49'). */
  raw: string;
  /** Precio COP final entero (p. ej. '123456'). */
  rounded: string;
  /** true si el entero difiere del recibido (hubo redondeo HALF_UP). */
  wasRounded: boolean;
}

/** ¿La moneda efectiva es COP? (otras monedas conservan su precisión). */
export function isCopCurrency(currency?: string | null): boolean {
  return currency === COP_CURRENCY;
}

/** Moneda efectiva de un precio: la del DTO/tarifa o COP por defecto. */
export function resolvePriceCurrency(dtoCurrency?: string | null, fallback?: string | null): string {
  return dtoCurrency ?? fallback ?? COP_CURRENCY;
}

function toDecimal(input: string | number | Prisma.Decimal): Prisma.Decimal {
  if (input instanceof Prisma.Decimal) return input;
  try {
    return new Prisma.Decimal(input as string | number);
  } catch {
    throw new CopPriceError('NOT_FINITE', `El precio recibido no es un número válido: ${String(input)}.`);
  }
}

/**
 * Normaliza un precio COP: exige finito, `> 0`, no redondea a cero y dentro del
 * límite tras el redondeo HALF_UP a pesos enteros.
 */
export function normalizeCopPrice(input: string | number | Prisma.Decimal): NormalizedCopPrice {
  const value = toDecimal(input);
  if (!value.isFinite()) {
    throw new CopPriceError('NOT_FINITE', `El precio recibido no es un número válido: ${String(input)}.`);
  }
  const rounded = value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  if (!value.isPositive() || value.isZero() || rounded.isZero()) {
    throw new CopPriceError('NOT_POSITIVE', 'El precio debe ser mayor que cero y terminar en un valor entero distinto de cero.');
  }
  if (rounded.greaterThan(COP_MAXIMUM)) {
    throw new CopPriceError(
      'OUT_OF_RANGE',
      `El precio supera el límite permitido (${COP_MAXIMUM.toFixed()}) después de redondearlo.`,
    );
  }
  return { raw: value.toFixed(), rounded: rounded.toFixed(0), wasRounded: !value.equals(rounded) };
}

/** Convierte un `CopPriceError` en su mensaje legible (mismo texto del error). */
export function copPriceErrorMessage(error: unknown): string | undefined {
  return error instanceof CopPriceError ? error.message : undefined;
}
