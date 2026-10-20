import { plainToInstance } from 'class-transformer';
import { IsNumber, IsOptional, IsString, validate } from 'class-validator';
import { IsCopPrice, RoundCopPrice } from './cop-price.validator';

class CopPriceFixture {
  @IsNumber()
  @RoundCopPrice()
  @IsCopPrice()
  value: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

async function inspect(payload: Record<string, unknown>) {
  const dto = plainToInstance(CopPriceFixture, payload);
  const errors = await validate(dto);
  return { dto, errors };
}

/** IMP-03 — el borde HTTP comparte política COP con la plantilla. */
describe('IsCopPrice / RoundCopPrice', () => {
  it('redondea HALF_UP a entero COP antes de validar', async () => {
    const { dto, errors } = await inspect({ value: 1500000.49, currency: 'COP' });
    expect(errors).toHaveLength(0);
    expect(dto.value).toBe(1500000);

    const half = await inspect({ value: 1500000.5, currency: 'COP' });
    expect(half.dto.value).toBe(1500001);
  });

  it('con moneda COP por defecto redondea aunque no se envíe currency', async () => {
    const { dto, errors } = await inspect({ value: 100.6 });
    expect(errors).toHaveLength(0);
    expect(dto.value).toBe(101);
  });

  it('acepta 0.50 (termina en 1) y rechaza 0.49 (termina en 0)', async () => {
    expect((await inspect({ value: 0.5 })).errors).toHaveLength(0);
    expect((await inspect({ value: 0.49 })).errors).toHaveLength(1);
  });

  it.each([0, -1, -5000])('rechaza el valor no positivo %s', async (value) => {
    expect((await inspect({ value })).errors).toHaveLength(1);
  });

  it('acepta el límite y rechaza el desbordamiento tras redondear', async () => {
    expect((await inspect({ value: 9999999999 })).errors).toHaveLength(0);
    expect((await inspect({ value: 9999999999.5 })).errors).toHaveLength(1);
  });

  it('no impone la precisión COP a otra moneda', async () => {
    const { dto, errors } = await inspect({ value: 123.45, currency: 'USD' });
    expect(errors).toHaveLength(0);
    expect(dto.value).toBe(123.45);
  });
});
