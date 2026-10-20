import { Transform } from 'class-transformer';
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { COP_CURRENCY, isCopCurrency, normalizeCopPrice } from './cop-policy';

/** Moneda efectiva para validar/redondear: la del DTO o COP por defecto (igual que la escritura). */
function currencyOf(container: unknown): string {
  const currency = (container as { currency?: string } | undefined)?.currency;
  return currency ?? COP_CURRENCY;
}

function isValidPrice(raw: unknown, currency: string): boolean {
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return false;
  // Otras monedas conservan su precisión: no se les impone el límite COP.
  if (!isCopCurrency(currency)) return true;
  try {
    normalizeCopPrice(raw as number);
    return true;
  } catch {
    return false;
  }
}

/**
 * IMP-03 — valida que el `value` sea un precio admisible: finito y `> 0`; si la
 * moneda efectiva es COP, además exige el límite único `COP_MAXIMUM` **tras**
 * redondear (misma política que `readPriceTemplate`).
 */
export function IsCopPrice(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCopPrice',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          return isValidPrice(value, currencyOf(args.object));
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} debe ser un precio válido: mayor que cero y, en pesos, dentro del límite después de redondear.`;
        },
      },
    });
  };
}

/**
 * IMP-03 — redondea el `value` a pesos COP enteros (HALF_UP) cuando la moneda
 * efectiva es COP o no se especifica (el servidor usa COP por defecto). Otras
 * monedas pasan sin cambios. Se apoya en `Decimal` exacto, no en `parseFloat`.
 */
export function RoundCopPrice(): PropertyDecorator {
  return Transform(({ value, obj }) => {
    if (!isCopCurrency(currencyOf(obj))) return value;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return value;
    try {
      return Number(normalizeCopPrice(value as number).rounded);
    } catch {
      // Deja el valor original para que `@IsCopPrice` produzca el 400 con su mensaje.
      return value;
    }
  });
}
