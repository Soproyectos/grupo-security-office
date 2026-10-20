import { Prisma } from '@prisma/client';
import { COP_MAXIMUM, CopPriceError, isCopCurrency, normalizeCopPrice } from './cop-policy';

/**
 * IMP-03 — política COP única (límite + redondeo HALF_UP + validación común).
 * Los casos siguen la acceptance de la ficha: 0.49, 0.50, negativos, límite y
 * desbordamiento tras redondear.
 */
describe('normalizeCopPrice (IMP-03)', () => {
  it('redondea HALF_UP a pesos enteros y reporta el valor recibido', () => {
    expect(normalizeCopPrice(123456.49)).toEqual({ raw: '123456.49', rounded: '123456', wasRounded: true });
    expect(normalizeCopPrice(123456.5)).toEqual({ raw: '123456.5', rounded: '123457', wasRounded: true });
  });

  it('acepta enteros sin marcarlos como redondeados', () => {
    expect(normalizeCopPrice(1500000)).toEqual({ raw: '1500000', rounded: '1500000', wasRounded: false });
  });

  it('interpreta texto exacto (nunca parseFloat) y redondea con Decimal', () => {
    expect(normalizeCopPrice('200000').rounded).toBe('200000');
    expect(normalizeCopPrice('100.5').rounded).toBe('101');
    expect(normalizeCopPrice('123.456').rounded).toBe('123');
    expect(normalizeCopPrice(new Prisma.Decimal('999.5')).rounded).toBe('1000');
  });

  it('0.50 se acepta y termina en 1 (acceptance 2)', () => {
    expect(normalizeCopPrice(0.5)).toEqual({ raw: '0.5', rounded: '1', wasRounded: true });
  });

  it.each([0, 0.49])('rechaza %s porque redondea a cero (acceptance 2)', (value) => {
    expect(() => normalizeCopPrice(value)).toThrow(CopPriceError);
    try {
      normalizeCopPrice(value);
    } catch (error) {
      expect((error as CopPriceError).code).toBe('NOT_POSITIVE');
    }
  });

  it.each([-1, -0.5, -5000])('rechaza el precio negativo %s (acceptance 2)', (value) => {
    expect(() => normalizeCopPrice(value)).toThrow(CopPriceError);
  });

  it('acepta justo el límite y rechaza el desbordamiento tras redondear (acceptance 2)', () => {
    expect(normalizeCopPrice(9999999999).rounded).toBe('9999999999');
    expect(normalizeCopPrice(9999999999.4).rounded).toBe('9999999999');
    expect(() => normalizeCopPrice(9999999999.5)).toThrow(CopPriceError);
    expect(() => normalizeCopPrice(10000000000)).toThrow(CopPriceError);
    try {
      normalizeCopPrice(9999999999.5);
    } catch (error) {
      expect((error as CopPriceError).code).toBe('OUT_OF_RANGE');
    }
  });

  it.each([NaN, Infinity, -Infinity, 'abc', '', null, undefined, {}])('rechaza valores no finitos/no numéricos %s', (value) => {
    expect(() => normalizeCopPrice(value as never)).toThrow(CopPriceError);
  });

  it('el límite es único y de 10 dígitos enteros (coherente con Decimal(12,2))', () => {
    expect(COP_MAXIMUM.toFixed()).toBe('9999999999');
  });
});

describe('isCopCurrency', () => {
  it('reconoce COP y no impone la política a otras monedas', () => {
    expect(isCopCurrency('COP')).toBe(true);
    expect(isCopCurrency('usd')).toBe(false);
    expect(isCopCurrency(undefined)).toBe(false);
    expect(isCopCurrency(null)).toBe(false);
  });
});
